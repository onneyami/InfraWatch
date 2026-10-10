"""
Configuration for Ahova backend.
"""

import os
from pathlib import Path

# Base directory: backend/src/core -> backend/src
SRC_DIR = Path(__file__).resolve().parent
# backend/
BACKEND_DIR = SRC_DIR.parent

# Agents DB path: always backend/agents.db regardless of CWD
AGENTS_DB_PATH = os.getenv("AGENTS_DB_PATH", str(BACKEND_DIR / "agents.db"))
USERS_DB_PATH = os.getenv("USERS_DB_PATH", str(BACKEND_DIR / "users.db"))

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
    import logging
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
