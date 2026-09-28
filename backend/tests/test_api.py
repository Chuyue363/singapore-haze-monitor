from datetime import datetime, timezone

from app.api import create_app
from app.cleaning import clean_readings
from app.db import insert_readings


def test_health():
    client = create_app().test_client()
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json["status"] in {"ok", "degraded"}
    assert "database" in response.json


def test_latest_and_history():
    insert_readings(
        [
            {
                "region": "central",
                "reading_timestamp": datetime.now(timezone.utc).isoformat(),
                "updated_timestamp": datetime.now(timezone.utc).isoformat(),
                "psi_24h": 129,
                "pm25_1h": 159,
                "pm25_24h": 82,
                "source": "test",
            }
        ]
    )
    client = create_app().test_client()
    latest = client.get("/api/readings/latest")
    assert latest.status_code == 200
    assert {row["region"] for row in latest.json["data"]} == {"central"}
    assert len(client.get("/api/readings/history?region=central").json["data"]) >= 1


def test_cleaning_rejects_bad_region_and_deduplicates():
    valid = {
        "region": "Central",
        "reading_timestamp": "2026-09-29T01:00:00+08:00",
        "updated_timestamp": "2026-09-29T01:15:00+08:00",
        "psi_24h": 80,
        "pm25_1h": 50,
        "pm25_24h": 35,
        "source": "test",
    }
    cleaned, report = clean_readings([valid, valid, {**valid, "region": "moon"}])
    assert len(cleaned) == 1
    assert report["duplicates_removed"] == 1
    assert report["rejected"] == 1


def test_unknown_region_is_rejected():
    client = create_app().test_client()
    assert client.get("/api/readings/history?region=moon").status_code == 400
