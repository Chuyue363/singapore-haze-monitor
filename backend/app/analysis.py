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


def _features(values: list[float], index: int) -> list[float]:
    last3 = values[index - 3:index]
    trend = values[index - 1] - values[index - 3]
    return [1.0, values[index - 1], sum(last3) / 3, trend]


def regression_analysis(rows: list[dict], horizon: int = 3) -> dict:
    points = _series(rows)
    if len(points) < 20:
        return {
            "status": "insufficient_data",
            "required": 20,
            "available": len(points),
            "message": "At least 20 hourly observations are required for regression analysis.",
        }

    timestamps = [point[0] for point in points]
    values = [point[1] for point in points]
    x = np.array([_features(values, i) for i in range(3, len(values))], dtype=float)
    y = np.array(values[3:], dtype=float)

    split = max(10, int(len(y) * 0.8))
    split = min(split, len(y) - 1)
    beta_train, *_ = np.linalg.lstsq(x[:split], y[:split], rcond=None)
    predicted_test = x[split:] @ beta_train
    actual_test = y[split:]
    model_mae = float(np.mean(np.abs(predicted_test - actual_test)))
    naive_predictions = np.array(values[split + 2:-1], dtype=float)
    naive_mae = float(np.mean(np.abs(naive_predictions - actual_test)))

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
        "training_samples": len(y),
        "r_squared": round(r_squared, 3),
        "validation_mae": round(model_mae, 2),
        "naive_mae": round(naive_mae, 2),
        "beats_naive": model_mae < naive_mae,
        "forecast": forecasts,
        "warning": "Experimental statistical estimate, not an official NEA forecast or health advisory.",
    }
