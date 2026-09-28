from __future__ import annotations

from datetime import datetime

import requests

from .config import DATA_GOV_SG_API_KEY, DATA_GOV_SG_BASE_URL


class DataGovError(RuntimeError):
    """Raised when an official data.gov.sg request fails."""


def _get(path: str) -> dict:
    headers = {"x-api-key": DATA_GOV_SG_API_KEY} if DATA_GOV_SG_API_KEY else {}
    response = requests.get(f"{DATA_GOV_SG_BASE_URL}/{path}", headers=headers, timeout=15)
    response.raise_for_status()
    payload = response.json()
    if payload.get("code") != 0:
        raise DataGovError(payload.get("errorMsg") or "data.gov.sg returned an error")
    return payload["data"]


def fetch_latest() -> list[dict]:
    psi_data = _get("psi")
    pm25_data = _get("pm25")
    psi_item = psi_data["items"][0]
    pm25_item = pm25_data["items"][0]
    psi_readings = psi_item["readings"]
    pm25_readings = pm25_item["readings"]["pm25_one_hourly"]
    pm25_24h = psi_readings.get("pm25_twenty_four_hourly", {})
    rows = []
    for region in ("north", "south", "east", "west", "central"):
        rows.append(
            {
                "region": region,
                "reading_timestamp": psi_item["timestamp"],
                "updated_timestamp": psi_item["updatedTimestamp"],
                "psi_24h": psi_readings.get("psi_twenty_four_hourly", {}).get(region),
                "pm25_1h": pm25_readings.get(region),
                "pm25_24h": pm25_24h.get(region),
                "source": "NEA via data.gov.sg",
            }
        )
    return rows
