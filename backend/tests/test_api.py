from datetime import datetime, timedelta, timezone

from app.api import create_app
from app.cleaning import REGIONS, clean_readings
from app.db import insert_readings, latest_readings


def test_health():
    client = create_app().test_client()
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json["status"] == "degraded"
    assert response.json["missing_regions"] == list(REGIONS)
    assert "database" in response.json


def test_latest_and_history():
    timestamp = datetime.now(timezone.utc).isoformat()
    insert_readings([
        {
            "region": region,
            "reading_timestamp": timestamp,
            "updated_timestamp": timestamp,
            "psi_24h": 129,
            "pm25_1h": 159,
            "pm25_24h": 82,
            "source": "test",
        }
        for region in REGIONS
    ])
    client = create_app().test_client()
    latest = client.get("/api/readings/latest")
    assert latest.status_code == 200
    assert {row["region"] for row in latest.json["data"]} == set(REGIONS)
    assert latest.json["meta"]["regions_reporting"] == 5
    assert latest.json["meta"]["missing_regions"] == []
    assert len(client.get("/api/readings/history?region=central").json["data"]) >= 1


def test_latest_readings_keeps_each_region_most_recent_observation():
    newest = datetime.now(timezone.utc)
    rows = [
        {
            "region": region,
            "reading_timestamp": (newest - timedelta(minutes=index)).isoformat(),
            "updated_timestamp": newest.isoformat(),
            "psi_24h": 50 + index,
            "pm25_1h": 20 + index,
            "pm25_24h": 15 + index,
            "source": "test",
        }
        for index, region in enumerate(REGIONS)
    ]
    rows.append({
        **rows[-1],
        "reading_timestamp": (newest - timedelta(hours=2)).isoformat(),
        "pm25_1h": 999,
    })
    insert_readings(rows)

    rows = latest_readings()

    assert [row["region"] for row in rows] == list(REGIONS)
    assert len(rows) == 5
    assert rows[-1]["pm25_1h"] == 24


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


def test_cleaning_compares_regional_spikes_at_the_same_timestamp():
    first_timestamp = "2026-09-29T01:00:00+08:00"
    second_timestamp = "2026-09-29T02:00:00+08:00"

    def row(region: str, timestamp: str, pm25: float) -> dict:
        return {
            "region": region,
            "reading_timestamp": timestamp,
            "updated_timestamp": timestamp,
            "psi_24h": 80,
            "pm25_1h": pm25,
            "pm25_24h": 35,
            "source": "test",
        }

    raw = [
        row(region, first_timestamp, value)
        for region, value in zip(REGIONS, (50, 48, 52, 400, 49), strict=True)
    ] + [
        row(region, second_timestamp, value)
        for region, value in zip(REGIONS, (400, 410, 390, 405, 395), strict=True)
    ]

    cleaned, report = clean_readings(raw)
    flagged = [item for item in cleaned if item["quality_status"] == "review"]

    assert [(item["region"], item["reading_timestamp"]) for item in flagged] == [
        ("west", first_timestamp)
    ]
    assert report["review_flagged"] == 1


def test_unknown_region_is_rejected():
    client = create_app().test_client()
    assert client.get("/api/readings/history?region=moon").status_code == 400


def test_csv_export_has_auditable_fields():
    insert_readings([
        {
            "region": "central",
            "reading_timestamp": datetime.now(timezone.utc).isoformat(),
            "updated_timestamp": datetime.now(timezone.utc).isoformat(),
            "psi_24h": 80,
            "pm25_1h": 42,
            "pm25_24h": 30,
            "source": "test",
        }
    ])
    response = create_app().test_client().get("/api/readings/export.csv?region=central")
    body = response.get_data(as_text=True)

    assert response.status_code == 200
    assert response.mimetype == "text/csv"
    assert "quality_status" in body
    assert "central" in body
