from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parents[1]
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{ROOT / 'data' / 'haze_monitor.sqlite3'}")
DATA_GOV_SG_API_KEY = os.getenv("DATA_GOV_SG_API_KEY", "")
DATA_GOV_SG_BASE_URL = os.getenv(
    "DATA_GOV_SG_BASE_URL", "https://api-open.data.gov.sg/v2/real-time/api"
)
