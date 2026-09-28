from app.db import insert_readings
from app.nea_client import fetch_latest


if __name__ == "__main__":
    rows = fetch_latest()
    print(f"Inserted {insert_readings(rows)} new readings.")
