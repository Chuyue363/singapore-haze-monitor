from datetime import datetime, timedelta, timezone

from app import analysis
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
    assert result["validation_method"] == "Expanding-window walk-forward"
    assert result["initial_training_samples"] == 37
    assert result["validation_samples"] == 10


def test_walk_forward_validation_only_trains_on_prior_observations(monkeypatch):
    start = datetime(2026, 9, 1, tzinfo=timezone.utc)
    rows = [
        {
            "reading_timestamp": (start + timedelta(hours=index)).isoformat(),
            "pm25_1h": 20 + index * 0.2 + (index % 3),
        }
        for index in range(50)
    ]
    training_sizes = []
    original_lstsq = analysis.np.linalg.lstsq

    def tracked_lstsq(*args, **kwargs):
        training_sizes.append(len(args[0]))
        return original_lstsq(*args, **kwargs)

    monkeypatch.setattr(analysis.np.linalg, "lstsq", tracked_lstsq)

    result = regression_analysis(rows)

    assert result["validation_samples"] == 10
    assert training_sizes == list(range(37, 47)) + [47]


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
