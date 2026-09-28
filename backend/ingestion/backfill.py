from __future__ import annotations

import argparse
from datetime import date, timedelta

from app.cleaning import clean_readings
from app.db import insert_readings, record_ingestion
from app.nea_client import fetch_date


def backfill(days: int) -> dict:
    total = {"received": 0, "accepted": 0, "rejected": 0, "inserted": 0}
    for offset in range(max(1, min(days, 90)) - 1, -1, -1):
        day = date.today() - timedelta(days=offset)
        cleaned, report = clean_readings(fetch_date(day))
        inserted = insert_readings(cleaned)
        for key in ("received", "accepted", "rejected"):
            total[key] += report[key]
        total["inserted"] += inserted
        print(f"{day}: accepted {report['accepted']}, inserted {inserted}")
    record_ingestion(total, total["inserted"], message=f"Backfilled {days} day(s)")
    return total


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill official NEA readings")
    parser.add_argument("--days", type=int, default=7)
    args = parser.parse_args()
    print(backfill(args.days))
