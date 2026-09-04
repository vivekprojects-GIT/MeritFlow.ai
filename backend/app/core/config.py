from __future__ import annotations

import os
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT_DIR / "backend" / "data"
SQLITE_PATH = Path(os.getenv("COURSEAI_SQLITE_PATH", DATA_DIR / "courseai.sqlite"))

SESSION_COOKIE = "courseai_session"
SESSION_MS = 1000 * 60 * 60 * 24 * 30
JOIN_CODE_TTL_MS = 60_000
ADMIN_SIGNUP_CODE = os.getenv("ADMIN_SIGNUP_CODE", "LECTERN-ADMIN")

# DANGEROUS CONVENIENCES — both OFF unless explicitly switched on.
#
# DEV_ADOPT_SESSION maps ANY unrecognised session cookie onto one shared account.
# With it on, every visitor silently becomes the same user and therefore sees
# each other's courses: an authentication bypass and a data leak, not a
# convenience. It defaulted to ON, which is how one person's courses started
# showing up for everyone.
#
# DEV_PRO grants that account a paid subscription, so it must never be on by
# default either.
#
# Opt in per machine with COURSEAI_DEV_ADOPT_SESSION=1 / COURSEAI_DEV_PRO=1, and
# never in a deployed environment.
DEV_ADOPT_SESSION = os.getenv("COURSEAI_DEV_ADOPT_SESSION") == "1"
DEV_PRO = os.getenv("COURSEAI_DEV_PRO") == "1"
PYTHON_BACKEND_ORIGIN = os.getenv("PYTHON_BACKEND_ORIGIN", "http://127.0.0.1:8000")
