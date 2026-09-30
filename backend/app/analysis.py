from __future__ import annotations

from datetime import datetime, timedelta

import numpy as np


def _series(rows: list[dict]) -> list[tuple[datetime, float]]:
    unique: dict[str, float] = {}
    for row in rows:
        value = row.get("pm25_1h")
        timestamp = row.get("reading_timestamp")
        if value is not None and timestamp:
            unique[timestamp] = float(value)
    return sorted((datetime.fromisoformat(ts), value) for ts, value in unique.items())


def _latest_contiguous_segment(
    points: list[tuple[datetime, float]],
) -> tuple[list[tuple[datetime, float]], int]:
    if not points:
        return [], 0
    last_gap = 0
    gap_count = 0
    for index in range(1, len(points)):
        if points[index][0] - points[index - 1][0] != timedelta(hours=1):
            gap_count += 1
            last_gap = index
    return points[last_gap:], gap_count


def _features(values: list[float], index: int) -> list[float]:
    last3 = values[index - 3:index]
    trend = values[index - 1] - values[index - 3]
    return [1.0, values[index - 1], sum(last3) / 3, trend]


def _walk_forward_validation(
    x: np.ndarray,
    y: np.ndarray,
    values: list[float],
    initial_training_samples: int,
) -> tuple[float, float, int]:
    model_predictions: list[float] = []
    naive_predictions: list[float] = []
    actual_values: list[float] = []

    for test_index in range(initial_training_samples, len(y)):
        beta, *_ = np.linalg.lstsq(x[:test_index], y[:test_index], rcond=None)
        model_predictions.append(float(np.dot(x[test_index], beta)))
        naive_predictions.append(values[test_index + 2])
        actual_values.append(float(y[test_index]))

    actual = np.array(actual_values, dtype=float)
    model = np.array(model_predictions, dtype=float)
    naive = np.array(naive_predictions, dtype=float)
    model_mae = float(np.mean(np.abs(model - actual)))
    naive_mae = float(np.mean(np.abs(naive - actual)))
    return model_mae, naive_mae, len(actual_values)


def regression_analysis(rows: list[dict], horizon: int = 3) -> dict:
    all_points = _series(rows)
    points, gap_count = _latest_contiguous_segment(all_points)
    if len(points) < 20:
        return {
            "status": "insufficient_data",
            "required": 20,
            "available": len(points),
            "total_observations": len(all_points),
            "gap_count": gap_count,
            "message": "At least 20 consecutive hourly observations are required for regression analysis.",
        }

    timestamps = [point[0] for point in points]
    values = [point[1] for point in points]
    x = np.array([_features(values, i) for i in range(3, len(values))], dtype=float)
    y = np.array(values[3:], dtype=float)

    split = max(10, int(len(y) * 0.8))
    split = min(split, len(y) - 1)
    model_mae, naive_mae, validation_samples = _walk_forward_validation(
        x,
        y,
        values,
        split,
    )

    beta, *_ = np.linalg.lstsq(x, y, rcond=None)
    fitted = x @ beta
    residual = y - fitted
    ss_res = float(np.sum(residual ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    r_squared = 1 - ss_res / ss_tot if ss_tot else 0.0
    residual_std = float(np.std(residual))

    projected = values[:]
    forecasts = []
    last_time = timestamps[-1]
    for step in range(1, max(1, min(horizon, 12)) + 1):
        estimate = max(0.0, float(np.dot(_features(projected, len(projected)), beta)))
        projected.append(estimate)
        forecasts.append(
            {
                "timestamp": (last_time + timedelta(hours=step)).isoformat(),
                "pm25_1h": round(estimate, 1),
                "lower": round(max(0, estimate - 1.96 * residual_std), 1),
                "upper": round(estimate + 1.96 * residual_std, 1),
            }
        )

    return {
        "status": "ready",
        "method": "Autoregressive ordinary least squares",
        "features": ["previous hour", "three-hour mean", "three-hour trend"],
        "observations": len(points),
        "total_observations": len(all_points),
        "gap_count": gap_count,
        "training_samples": len(y),
        "initial_training_samples": split,
        "validation_samples": validation_samples,
        "validation_method": "Expanding-window walk-forward",
        "r_squared": round(r_squared, 3),
        "validation_mae": round(model_mae, 2),
        "naive_mae": round(naive_mae, 2),
        "beats_naive": model_mae < naive_mae,
        "forecast": forecasts,
        "warning": "Experimental statistical estimate, not an official NEA forecast or health advisory.",
    }
