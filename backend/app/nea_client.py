from __future__ import annotations

from datetime import date

import requests

from .config import DATA_GOV_SG_API_KEY, DATA_GOV_SG_BASE_URL


class DataGovError(RuntimeError):
    """Raised when an official data.gov.sg request fails."""


def _get(path: str, params: dict | None = None) -> dict:
    headers = {"x-api-key": DATA_GOV_SG_API_KEY} if DATA_GOV_SG_API_KEY else {}
    response = requests.get(
        f"{DATA_GOV_SG_BASE_URL}/{path}", headers=headers, params=params, timeout=20
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("code") != 0:
        raise DataGovError(payload.get("errorMsg") or "data.gov.sg returned an error")
    return payload["data"]


def _normalise_items(psi_items: list[dict], pm25_items: list[dict]) -> list[dict]:
    psi_by_timestamp = {item["timestamp"]: item for item in psi_items}
    pm25_by_timestamp = {item["timestamp"]: item for item in pm25_items}
    rows = []
    timestamps = sorted(set(psi_by_timestamp) | set(pm25_by_timestamp))
    for timestamp in timestamps:
        psi_item = psi_by_timestamp.get(timestamp, {})
        pm25_item = pm25_by_timestamp.get(timestamp, {})
        psi_readings = psi_item.get("readings", {})
        pm25_readings = pm25_item.get("readings", {}).get("pm25_one_hourly", {})
        updated = max(
            psi_item.get("updatedTimestamp", timestamp),
            pm25_item.get("updatedTimestamp", timestamp),
        )
        for region in ("north", "south", "east", "west", "central"):
            rows.append(
                {
                    "region": region,
                    "reading_timestamp": timestamp,
                    "updated_timestamp": updated,
                    "psi_24h": psi_readings.get("psi_twenty_four_hourly", {}).get(region),
                    "pm25_1h": pm25_readings.get(region),
                    "pm25_24h": psi_readings.get("pm25_twenty_four_hourly", {}).get(region),
                    "source": "NEA via data.gov.sg",
                }
            )
    return rows


def fetch_latest() -> list[dict]:
    return _normalise_items(_get("psi")["items"], _get("pm25")["items"])


def fetch_date(day: date | str) -> list[dict]:
    value = day.isoformat() if isinstance(day, date) else day
    return _normalise_items(
        _get("psi", {"date": value})["items"],
        _get("pm25", {"date": value})["items"],
    )
