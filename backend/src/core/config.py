"""
Configuration for Ahova backend.
"""

import logging
import os
import shutil
from pathlib import Path

# core/config.py -> core -> src -> backend
BACKEND_DIR = Path(__file__).resolve().parents[2]
# Where the databases lived before this was fixed: this file's grandparent was
# mistaken for `backend/`, so the SQLite files ended up in `backend/src/`.
_LEGACY_DB_DIR = BACKEND_DIR / "src"


def _resolve_db_path(env_var: str, filename: str) -> str:
    """Return the DB path: env override, else ``backend/<filename>``.

    One-time migration: if the DB only exists at the legacy location
    (``backend/src/``), move it to the correct place so existing accounts and
    agent registrations survive the path fix. Skipped when the path is overridden
    through the environment, or when both files exist (never overwrite data).
    """
    override = os.getenv(env_var)
    if override:
        return override

    target = BACKEND_DIR / filename
    legacy = _LEGACY_DB_DIR / filename
    if not target.exists() and legacy.exists():
        shutil.move(str(legacy), str(target))
        logging.getLogger(__name__).warning(
            "Moved %s from %s to %s (database path fix)", filename, legacy, target
        )
    elif target.exists() and legacy.exists():
        logging.getLogger(__name__).warning(
            "Both %s and %s exist; using %s. Remove the stale legacy file once checked.",
            legacy, target, target,
        )
    return str(target)


# Always backend/<name>.db regardless of CWD (overridable via env).
AGENTS_DB_PATH = _resolve_db_path("AGENTS_DB_PATH", "agents.db")
USERS_DB_PATH = _resolve_db_path("USERS_DB_PATH", "users.db")

# Dashboard API token: shared secret used by the browser dashboard (SPA) to read
# data from the API. This is a STOPGAP until real per-user authentication exists.
#
# Why this exists: agent tokens authenticate one specific agent to the backend.
# The browser dashboard is not an agent and has no agent identity, so it cannot
# obtain an agent token through any real flow. Without this, every GET endpoint
# protected in Ticket 1 is permanently unreachable from the UI.
#
# This token is embedded in the built frontend bundle and is therefore visible
# to anyone who opens browser devtools. It only prevents casual/anonymous access
# to the API, not a determined attacker. Replace with real user auth (JWT/session
# tied to a logged-in user) before onboarding external users.
DASHBOARD_API_TOKEN = os.getenv("DASHBOARD_API_TOKEN", "dev-dashboard-token-change-me")

if DASHBOARD_API_TOKEN == "dev-dashboard-token-change-me":
    logging.getLogger(__name__).warning(
        "DASHBOARD_API_TOKEN is not set - using an insecure development default. "
        "Set DASHBOARD_API_TOKEN in the environment before deploying anywhere "
        "reachable from outside localhost."
    )


class Settings:
    """Legacy settings kept for backwards compatibility."""
    APP_NAME: str = "Ahova"
    VERSION: str = "2.6.0"
    HOST: str = "0.0.0.0"
    PORT: int = 8000


settings = Settings()
