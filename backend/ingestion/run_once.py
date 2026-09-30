from app.cleaning import clean_readings
from app.db import insert_readings, record_ingestion
from app.nea_client import fetch_latest


if __name__ == "__main__":
    rows, report = clean_readings(fetch_latest())
    inserted = insert_readings(rows)
    record_ingestion(report, inserted)
    print(
        f"Accepted {report['accepted']} rows, inserted {inserted} new readings, "
        f"and flagged {report['review_flagged']} for review."
    )
