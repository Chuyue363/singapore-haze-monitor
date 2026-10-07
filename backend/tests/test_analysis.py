from datetime import datetime, timedelta, timezone

from app import analysis
from app.analysis import _relative_skill_percent, regression_analysis


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
    assert result["skill_percent"] > 0
    assert len(result["validation_periods"]) == 2
    assert sum(period["samples"] for period in result["validation_periods"]) == 10
    assert result["periods_beating_naive"] == sum(
        period["beats_naive"] for period in result["validation_periods"]
    )
    assert result["validation_periods"][0]["end"] < result["validation_periods"][1]["start"]
    assert [item["interval_samples"] for item in result["forecast"]] == [10, 9, 8]
    assert len({item["persistence_pm25_1h"] for item in result["forecast"]}) == 1
    assert all(item["interval_basis"] == "walk_forward_p90" for item in result["forecast"])
    assert all(item["lower"] <= item["pm25_1h"] <= item["upper"] for item in result["forecast"])


def test_relative_skill_uses_unrounded_errors():
    assert _relative_skill_percent(1.155, 1.8) == 35.8
    assert _relative_skill_percent(2, 1) == -100
    assert _relative_skill_percent(0, 0) is None


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


def test_regression_uses_residual_interval_when_validation_is_sparse():
    start = datetime(2026, 9, 1, tzinfo=timezone.utc)
    rows = [
        {
            "reading_timestamp": (start + timedelta(hours=index)).isoformat(),
            "pm25_1h": 20 + index + (index % 2),
        }
        for index in range(20)
    ]

    result = regression_analysis(rows, horizon=3)

    assert result["status"] == "ready"
    assert result["validation_samples"] == 4
    assert [item["interval_samples"] for item in result["forecast"]] == [4, 3, 2]
    assert all(item["interval_basis"] == "residual_fallback" for item in result["forecast"])


def test_regression_omits_relative_skill_when_persistence_is_perfect():
    start = datetime(2026, 9, 1, tzinfo=timezone.utc)
    rows = [
        {
            "reading_timestamp": (start + timedelta(hours=index)).isoformat(),
            "pm25_1h": 25,
        }
        for index in range(30)
    ]

    result = regression_analysis(rows)

    assert result["naive_mae"] == 0
    assert result["skill_percent"] is None


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


def test_regression_caps_chronological_validation_at_four_periods():
    start = datetime(2026, 9, 1, tzinfo=timezone.utc)
    rows = [
        {
            "reading_timestamp": (start + timedelta(hours=index)).isoformat(),
            "pm25_1h": 20 + index * 0.1 + index % 5,
        }
        for index in range(103)
    ]

    result = regression_analysis(rows)

    assert result["status"] == "ready"
    assert result["validation_samples"] == 20
    assert len(result["validation_periods"]) == 4
    assert [period["samples"] for period in result["validation_periods"]] == [5, 5, 5, 5]


def test_regression_bounds_explosive_forecasts_to_validated_pm25_range():
    start = datetime(2026, 9, 1, tzinfo=timezone.utc)
    rows = [
        {
            "reading_timestamp": (start + timedelta(hours=index)).isoformat(),
            "pm25_1h": 1000 + index * 50,
        }
        for index in range(20)
    ]

    result = regression_analysis(rows, horizon=3)

    assert result["status"] == "ready"
    assert result["forecast_bounds_pm25_1h"] == [0, 2000]
    assert result["forecast"][0]["pm25_1h"] == 2000
    assert all(
        0 <= item["lower"] <= item["pm25_1h"] <= item["upper"] <= 2000
        for item in result["forecast"]
    )
