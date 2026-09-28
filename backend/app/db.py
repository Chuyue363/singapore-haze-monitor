from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path

from .config import DATABASE_URL


def _sqlite_path() -> Path:
    if not DATABASE_URL.startswith("sqlite:///"):
        raise RuntimeError("The first local version supports sqlite; set DATABASE_URL to a sqlite path.")
    path = Path(DATABASE_URL.removeprefix("sqlite:///"))
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[1] / path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(_sqlite_path())
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS air_quality_readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                region TEXT NOT NULL,
                reading_timestamp TEXT NOT NULL,
                updated_timestamp TEXT NOT NULL,
                psi_24h REAL,
                pm25_1h REAL,
                pm25_24h REAL,
                source TEXT NOT NULL,
                UNIQUE(region, reading_timestamp, source)
            )
            """
        )


def insert_readings(rows: list[dict]) -> int:
    init_db()
    inserted = 0
    with connect() as connection:
        for row in rows:
            result = connection.execute(
                """
                INSERT OR IGNORE INTO air_quality_readings
                (region, reading_timestamp, updated_timestamp, psi_24h, pm25_1h, pm25_24h, source)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["region"],
                    row["reading_timestamp"],
                    row["updated_timestamp"],
                    row.get("psi_24h"),
                    row.get("pm25_1h"),
                    row.get("pm25_24h"),
                    row["source"],
                ),
            )
            inserted += result.rowcount
    return inserted


def latest_readings() -> list[dict]:
    init_db()
    with connect() as connection:
        rows = connection.execute(
            """
            SELECT region, reading_timestamp, updated_timestamp, psi_24h, pm25_1h, pm25_24h, source
            FROM air_quality_readings
            WHERE reading_timestamp = (SELECT MAX(reading_timestamp) FROM air_quality_readings)
            ORDER BY region
            """
        ).fetchall()
    return [dict(row) for row in rows]


def history(region: str | None = None, limit: int = 168) -> list[dict]:
    init_db()
    limit = max(1, min(limit, 1000))
    query = "SELECT * FROM air_quality_readings"
    params: list = []
    if region:
        query += " WHERE region = ?"
        params.append(region.lower())
    query += " ORDER BY reading_timestamp DESC LIMIT ?"
    params.append(limit)
    with connect() as connection:
        rows = connection.execute(query, params).fetchall()
    return [dict(row) for row in rows]
