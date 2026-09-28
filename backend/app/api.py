from __future__ import annotations

from flask import Flask, jsonify, request
from flask_cors import CORS

from .db import history, init_db, latest_readings


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)
    init_db()

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.get("/api/readings/latest")
    def latest():
        return jsonify({"data": latest_readings()})

    @app.get("/api/readings/history")
    def readings_history():
        region = request.args.get("region")
        limit = request.args.get("limit", default=168, type=int)
        return jsonify({"data": history(region=region, limit=limit)})

    return app
