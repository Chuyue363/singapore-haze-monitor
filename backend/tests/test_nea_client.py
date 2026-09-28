from app.nea_client import _normalise_items


def test_normalise_items_merges_official_metrics_by_timestamp():
    timestamp = "2026-09-29T01:00:00+08:00"
    psi = [{
        "timestamp": timestamp,
        "updatedTimestamp": "2026-09-29T01:05:00+08:00",
        "readings": {
            "psi_twenty_four_hourly": {"central": 80},
            "pm25_twenty_four_hourly": {"central": 35},
        },
    }]
    pm25 = [{
        "timestamp": timestamp,
        "updatedTimestamp": "2026-09-29T01:10:00+08:00",
        "readings": {"pm25_one_hourly": {"central": 42}},
    }]

    rows = _normalise_items(psi, pm25)
    central = next(row for row in rows if row["region"] == "central")

    assert central["psi_24h"] == 80
    assert central["pm25_1h"] == 42
    assert central["pm25_24h"] == 35
    assert central["updated_timestamp"] == "2026-09-29T01:10:00+08:00"
