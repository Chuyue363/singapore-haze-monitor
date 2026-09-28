from app.api import create_app
from app.db import insert_readings


def test_health():
    client = create_app().test_client()
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json == {"status": "ok"}


def test_latest_and_history():
    insert_readings(
        [
            {
                "region": "central",
                "reading_timestamp": "2026-09-29T01:00:00+08:00",
                "updated_timestamp": "2026-09-29T01:15:00+08:00",
                "psi_24h": 129,
                "pm25_1h": 159,
                "pm25_24h": 82,
                "source": "test",
            }
        ]
    )
    client = create_app().test_client()
    assert client.get("/api/readings/latest").json["data"][0]["region"] == "central"
    assert len(client.get("/api/readings/history?region=central").json["data"]) >= 1
