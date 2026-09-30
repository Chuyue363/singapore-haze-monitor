from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .config import DATABASE_URL


def _sqlite_path() -> Path:
    if not DATABASE_URL.startswith("sqlite:///"):
        raise RuntimeError("The current adapter supports SQLite database URLs only.")
    path = Path(DATABASE_URL.removeprefix("sqlite:///"))
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[1] / path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(_sqlite_path(), timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA foreign_keys=ON")
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
                quality_status TEXT NOT NULL DEFAULT 'valid',
                quality_notes TEXT NOT NULL DEFAULT '',
                ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(region, reading_timestamp, source)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS ingestion_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at TEXT NOT NULL,
                completed_at TEXT NOT NULL,
                status TEXT NOT NULL,
                received INTEGER NOT NULL DEFAULT 0,
                accepted INTEGER NOT NULL DEFAULT 0,
                rejected INTEGER NOT NULL DEFAULT 0,
                inserted INTEGER NOT NULL DEFAULT 0,
                message TEXT NOT NULL DEFAULT ''
            )
            """
        )
        columns = {row[1] for row in connection.execute("PRAGMA table_info(air_quality_readings)")}
        migrations = {
            "quality_status": "ALTER TABLE air_quality_readings ADD COLUMN quality_status TEXT NOT NULL DEFAULT 'valid'",
            "quality_notes": "ALTER TABLE air_quality_readings ADD COLUMN quality_notes TEXT NOT NULL DEFAULT ''",
            "ingested_at": "ALTER TABLE air_quality_readings ADD COLUMN ingested_at TEXT",
        }
        for name, statement in migrations.items():
            if name not in columns:
                connection.execute(statement)
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_readings_region_time ON air_quality_readings(region, reading_timestamp)"
        )


def insert_readings(rows: list[dict]) -> int:
    init_db()
    inserted = 0
    with connect() as connection:
        for row in rows:
            result = connection.execute(
                """
                INSERT OR IGNORE INTO air_quality_readings
                (region, reading_timestamp, updated_timestamp, psi_24h, pm25_1h, pm25_24h,
                 source, quality_status, quality_notes, ingested_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["region"], row["reading_timestamp"], row["updated_timestamp"],
                    row.get("psi_24h"), row.get("pm25_1h"), row.get("pm25_24h"),
                    row["source"], row.get("quality_status", "valid"),
                    row.get("quality_notes", ""), datetime.now(timezone.utc).isoformat(),
                ),
            )
            inserted += result.rowcount
    return inserted


def record_ingestion(report: dict, inserted: int, status: str = "success", message: str = "") -> None:
    init_db()
    now = datetime.now(timezone.utc).isoformat()
    with connect() as connection:
        connection.execute(
            """INSERT INTO ingestion_runs
            (started_at, completed_at, status, received, accepted, rejected, inserted, message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (now, now, status, report.get("received", 0), report.get("accepted", 0),
             report.get("rejected", 0), inserted, message),
        )


def latest_readings() -> list[dict]:
    init_db()
    with connect() as connection:
        rows = connection.execute(
            """WITH ranked AS (
                   SELECT region, reading_timestamp, updated_timestamp, psi_24h, pm25_1h,
                          pm25_24h, source, quality_status, quality_notes,
                          ROW_NUMBER() OVER (
                              PARTITION BY region
                              ORDER BY reading_timestamp DESC, updated_timestamp DESC, id DESC
                          ) AS recency_rank
                   FROM air_quality_readings
               )
               SELECT region, reading_timestamp, updated_timestamp, psi_24h, pm25_1h,
                      pm25_24h, source, quality_status, quality_notes
               FROM ranked
               WHERE recency_rank = 1
               ORDER BY CASE region WHEN 'north' THEN 1 WHEN 'south' THEN 2 WHEN 'east' THEN 3
                                    WHEN 'west' THEN 4 ELSE 5 END"""
        ).fetchall()
    return [dict(row) for row in rows]


def history(region: str | None = None, limit: int = 168) -> list[dict]:
    init_db()
    limit = max(1, min(limit, 5000))
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


def database_summary() -> dict:
    init_db()
    with connect() as connection:
        stats = connection.execute(
            """SELECT COUNT(*) AS rows, COUNT(DISTINCT reading_timestamp) AS timestamps,
                      MIN(reading_timestamp) AS first_timestamp, MAX(reading_timestamp) AS latest_timestamp,
                      SUM(CASE WHEN quality_status = 'review' THEN 1 ELSE 0 END) AS review_rows
               FROM air_quality_readings"""
        ).fetchone()
        last_run = connection.execute(
            "SELECT * FROM ingestion_runs ORDER BY id DESC LIMIT 1"
        ).fetchone()
    return {**dict(stats), "last_ingestion": dict(last_run) if last_run else None}
