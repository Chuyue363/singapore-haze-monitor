from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, Response, jsonify, request
from flask_cors import CORS

from .analysis import regression_analysis
from .cleaning import REGIONS, clean_readings
from .config import STALE_AFTER_MINUTES
from .db import (
    database_summary,
    history,
    init_db,
    insert_readings,
    latest_readings,
    record_ingestion,
)
from .nea_client import fetch_latest


def _age_minutes(timestamp: str | None) -> float | None:
    if not timestamp:
        return None
    observed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    return round((datetime.now(timezone.utc) - observed).total_seconds() / 60, 1)


def _freshness(rows: list[dict]) -> tuple[float | None, list[str]]:
    ages = [_age_minutes(row.get("reading_timestamp")) for row in rows]
    available_ages = [age for age in ages if age is not None]
    regions_present = {row.get("region") for row in rows}
    missing_regions = [region for region in REGIONS if region not in regions_present]
    return max(available_ages, default=None), missing_regions


def _refresh_if_stale(force: bool = False) -> tuple[list[dict], dict]:
    stored = latest_readings()
    age, missing_regions = _freshness(stored)
    should_refresh = (
        force
        or bool(missing_regions)
        or age is None
        or age > STALE_AFTER_MINUTES
    )
    refresh = {"attempted": False, "succeeded": False, "message": "Using stored readings."}
    if should_refresh:
        refresh["attempted"] = True
        try:
            cleaned, report = clean_readings(fetch_latest())
            inserted = insert_readings(cleaned)
            record_ingestion(report, inserted)
            stored = latest_readings()
            refresh.update({"succeeded": True, "inserted": inserted, "message": "Official readings refreshed."})
        except Exception as exc:  # keep serving the last known valid reading
            refresh["message"] = f"Live refresh unavailable; showing stored data. {type(exc).__name__}"
    return stored, refresh


def create_app() -> Flask:
    frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    app = Flask(__name__, static_folder=str(frontend_dist), static_url_path="")
    CORS(app)
    init_db()

    @app.after_request
    def cache_headers(response):
        if request.method == "GET":
            response.headers["Cache-Control"] = "public, max-age=60"
        return response

    @app.get("/api/health")
    def health():
        summary = database_summary()
        age, missing_regions = _freshness(latest_readings())
        healthy = age is not None and age <= STALE_AFTER_MINUTES * 2 and not missing_regions
        return jsonify({
            "status": "ok" if healthy else "degraded",
            "data_age_minutes": age,
            "missing_regions": missing_regions,
            "database": summary,
        })

    @app.get("/")
    def frontend():
        index = frontend_dist / "index.html"
        if index.exists():
            return app.send_static_file("index.html")
        return jsonify({
            "name": "Singapore Haze Monitor API",
            "status": "frontend_not_built",
            "health": "/api/health",
        })

    @app.get("/api/readings/latest")
    def latest():
        rows, refresh = _refresh_if_stale(force=request.args.get("refresh") == "true")
        age, missing_regions = _freshness(rows)
        return jsonify({
            "data": rows,
            "meta": {
                "data_age_minutes": age,
                "stale": age is None or age > STALE_AFTER_MINUTES or bool(missing_regions),
                "regions_reporting": len(REGIONS) - len(missing_regions),
                "missing_regions": missing_regions,
                "refresh": refresh,
                "source": "NEA via data.gov.sg",
            },
        })

    @app.get("/api/readings/history")
    def readings_history():
        region = request.args.get("region", "central").lower()
        if region not in REGIONS:
            return jsonify({"error": "Unknown region", "allowed": REGIONS}), 400
        limit = request.args.get("limit", default=168, type=int)
        return jsonify({"data": list(reversed(history(region=region, limit=limit))), "region": region})

    @app.get("/api/analysis/regression")
    def regression():
        region = request.args.get("region", "central").lower()
        if region not in REGIONS:
            return jsonify({"error": "Unknown region", "allowed": REGIONS}), 400
        horizon = request.args.get("horizon", default=3, type=int)
        rows = history(region=region, limit=1000)
        return jsonify({"region": region, "analysis": regression_analysis(rows, horizon=horizon)})

    @app.get("/api/readings/export.csv")
    def export_history():
        region = request.args.get("region", "central").lower()
        if region not in REGIONS:
            return jsonify({"error": "Unknown region", "allowed": REGIONS}), 400
        limit = request.args.get("limit", default=1000, type=int)
        rows = list(reversed(history(region=region, limit=limit)))
        columns = [
            "region", "reading_timestamp", "updated_timestamp", "psi_24h", "pm25_1h",
            "pm25_24h", "source", "quality_status", "quality_notes",
        ]
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename={region}-air-quality.csv"},
        )

    @app.get("/api/summary")
    def summary():
        rows = latest_readings()
        if not rows:
            rows, _ = _refresh_if_stale()
        highest = max(rows, key=lambda item: item.get("pm25_1h") or -1, default=None)
        return jsonify({
            "data": database_summary(),
            "current": {
                "highest_region": highest["region"] if highest else None,
                "highest_pm25_1h": highest.get("pm25_1h") if highest else None,
                "regions_reporting": len(rows),
            },
        })

    return app
