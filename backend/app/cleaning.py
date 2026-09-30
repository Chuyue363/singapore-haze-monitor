from __future__ import annotations

from datetime import datetime
from statistics import median

REGIONS = ("north", "south", "east", "west", "central")
NUMERIC_RANGES = {
    "psi_24h": (0, 1000),
    "pm25_1h": (0, 2000),
    "pm25_24h": (0, 2000),
}


def _timestamp(value: object, field: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be an ISO-8601 string")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError(f"{field} must include a timezone")
    return parsed.isoformat()


def _number(value: object, field: str) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError(f"{field} cannot be boolean")
    result = float(value)
    lower, upper = NUMERIC_RANGES[field]
    if not lower <= result <= upper:
        raise ValueError(f"{field} is outside the plausible range {lower}-{upper}")
    return result


def clean_readings(rows: list[dict]) -> tuple[list[dict], dict]:
    """Validate, normalise and annotate provider rows without hiding observations."""
    cleaned: list[dict] = []
    rejected: list[dict] = []
    seen: set[tuple[str, str, str]] = set()

    for raw in rows:
        try:
            region = str(raw["region"]).strip().lower()
            if region not in REGIONS:
                raise ValueError(f"unknown region: {region}")
            row = {
                "region": region,
                "reading_timestamp": _timestamp(raw["reading_timestamp"], "reading_timestamp"),
                "updated_timestamp": _timestamp(raw["updated_timestamp"], "updated_timestamp"),
                "psi_24h": _number(raw.get("psi_24h"), "psi_24h"),
                "pm25_1h": _number(raw.get("pm25_1h"), "pm25_1h"),
                "pm25_24h": _number(raw.get("pm25_24h"), "pm25_24h"),
                "source": str(raw.get("source") or "unknown").strip(),
                "quality_status": "valid",
                "quality_notes": "",
            }
            if all(row[field] is None for field in ("psi_24h", "pm25_1h", "pm25_24h")):
                raise ValueError("row contains no air-quality measurements")
            key = (row["region"], row["reading_timestamp"], row["source"])
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(row)
        except (KeyError, TypeError, ValueError) as exc:
            rejected.append({"reason": str(exc), "row": raw})

    rows_by_timestamp: dict[str, list[dict]] = {}
    for row in cleaned:
        rows_by_timestamp.setdefault(row["reading_timestamp"], []).append(row)

    for timestamp_rows in rows_by_timestamp.values():
        values = [row["pm25_1h"] for row in timestamp_rows if row["pm25_1h"] is not None]
        if len(values) >= 3:
            centre = median(values)
            for row in timestamp_rows:
                value = row["pm25_1h"]
                if value is not None and value > max(centre * 3, centre + 150):
                    row["quality_status"] = "review"
                    row["quality_notes"] = (
                        "Large same-timestamp cross-region deviation; retained as a possible real spike."
                    )

    review_flagged = sum(row["quality_status"] == "review" for row in cleaned)

    return cleaned, {
        "received": len(rows),
        "accepted": len(cleaned),
        "rejected": len(rejected),
        "duplicates_removed": len(rows) - len(cleaned) - len(rejected),
        "review_flagged": review_flagged,
        "rejections": rejected[:10],
    }
