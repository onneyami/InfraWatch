"""Test package setup.

Runs before any test module imports ``src``: force every database onto a throwaway
directory and a known auth configuration, so tests can never touch real data no matter
what is exported in the developer's shell.
"""

import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="ahova-tests-")
os.environ["AGENTS_DB_PATH"] = os.path.join(_TMP, "agents.db")
os.environ["USERS_DB_PATH"] = os.path.join(_TMP, "users.db")
os.environ["ENVIRONMENT"] = "dev"
os.environ.pop("ALLOW_REGISTRATION", None)
os.environ.pop("COOKIE_SECURE", None)
