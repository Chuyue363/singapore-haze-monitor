import os
import sys
import tempfile
from pathlib import Path

import pytest

TEST_DATABASE = Path(tempfile.gettempdir()) / "singapore-haze-monitor-tests.sqlite3"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DATABASE}"
os.environ["STALE_AFTER_MINUTES"] = "1000000"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture(autouse=True)
def reset_test_database():
    for suffix in ("", "-wal", "-shm"):
        Path(f"{TEST_DATABASE}{suffix}").unlink(missing_ok=True)
    yield
    for suffix in ("", "-wal", "-shm"):
        Path(f"{TEST_DATABASE}{suffix}").unlink(missing_ok=True)
