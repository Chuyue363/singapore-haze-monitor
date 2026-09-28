from datetime import datetime, timedelta, timezone

from app.analysis import regression_analysis


def test_regression_reports_insufficient_data():
    result = regression_analysis([])
    assert result["status"] == "insufficient_data"


def test_regression_builds_forecast():
    start = datetime(2026, 9, 1, tzinfo=timezone.utc)
    rows = [
        {
            "reading_timestamp": (start + timedelta(hours=index)).isoformat(),
            "pm25_1h": 20 + index * 0.5 + (index % 4),
        }
        for index in range(50)
    ]
    result = regression_analysis(rows, horizon=3)
    assert result["status"] == "ready"
    assert len(result["forecast"]) == 3
    assert result["validation_mae"] >= 0


def test_regression_does_not_bridge_hourly_gaps():
    start = datetime(2026, 9, 1, tzinfo=timezone.utc)
    rows = [
        {"reading_timestamp": (start + timedelta(hours=index)).isoformat(), "pm25_1h": 20 + index}
        for index in range(25)
    ]
    rows += [
        {"reading_timestamp": (start + timedelta(hours=30 + index)).isoformat(), "pm25_1h": 50 + index}
        for index in range(10)
    ]

    result = regression_analysis(rows)

    assert result["status"] == "insufficient_data"
    assert result["available"] == 10
    assert result["total_observations"] == 35
    assert result["gap_count"] == 1
