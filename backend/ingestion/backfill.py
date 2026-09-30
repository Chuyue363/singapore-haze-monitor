from __future__ import annotations

import argparse
import time
from datetime import date, timedelta

from app.cleaning import clean_readings
from app.db import insert_readings, record_ingestion
from app.nea_client import fetch_date


def backfill(days: int) -> dict:
    total = {
        "received": 0,
        "accepted": 0,
        "rejected": 0,
        "review_flagged": 0,
        "inserted": 0,
        "dates_completed": 0,
        "failed_dates": [],
    }
    for offset in range(max(1, min(days, 90)) - 1, -1, -1):
        day = date.today() - timedelta(days=offset)
        try:
            cleaned, report = clean_readings(fetch_date(day))
        except Exception as exc:
            total["failed_dates"].append({"date": day.isoformat(), "error": type(exc).__name__})
            print(f"{day}: failed ({type(exc).__name__}); continuing")
            time.sleep(2)
            continue
        inserted = insert_readings(cleaned)
        for key in ("received", "accepted", "rejected", "review_flagged"):
            total[key] += report[key]
        total["inserted"] += inserted
        total["dates_completed"] += 1
        print(
            f"{day}: accepted {report['accepted']}, inserted {inserted}, "
            f"flagged {report['review_flagged']} for review"
        )
        time.sleep(1)
    record_ingestion(
        total,
        total["inserted"],
        message=f"Backfilled {total['dates_completed']} of {days} requested day(s)",
    )
    return total


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill official NEA readings")
    parser.add_argument("--days", type=int, default=7)
    args = parser.parse_args()
    print(backfill(args.days))
