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

# ---------------------------------------------------------------------------
# Authentication
#
# The dashboard authenticates with a per-user session cookie (see user_auth.py and
# routers/auth_router.py). Agents authenticate with their own X-Agent-ID/X-Agent-Token
# pair and may only call the agent endpoints (see middleware.py).
# ---------------------------------------------------------------------------

ENVIRONMENT = os.getenv("ENVIRONMENT", "dev").lower()


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


SESSION_COOKIE_NAME = "ahova_session"

# Send the session cookie over HTTPS only. Defaults to on everywhere except
# ENVIRONMENT=dev, because browsers refuse Secure cookies on plain http (except
# localhost). Override explicitly with COOKIE_SECURE=true/false.
COOKIE_SECURE = _env_bool("COOKIE_SECURE", ENVIRONMENT != "dev")

# Self-service sign-up. The very first account can always be created (bootstrap);
# after that registration is closed unless this is true. Keep it off until data is
# scoped per owner: every signed-in user currently sees every agent and container.
ALLOW_REGISTRATION = _env_bool("ALLOW_REGISTRATION", False)

if os.getenv("DASHBOARD_API_TOKEN"):
    logging.getLogger(__name__).warning(
        "DASHBOARD_API_TOKEN is set but no longer used: the shared dashboard token was "
        "removed in favour of per-user sessions. Remove it from your environment."
    )


class Settings:
    """Legacy settings kept for backwards compatibility."""
    APP_NAME: str = "Ahova"
    VERSION: str = "2.6.0"
    HOST: str = "0.0.0.0"
    PORT: int = 8000


settings = Settings()
