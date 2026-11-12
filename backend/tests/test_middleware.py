"""Access-policy tests for src.middleware, using plain Starlette (no FastAPI needed)."""

import asyncio
import json
import sqlite3
import time
import unittest
from unittest import mock
from urllib.parse import urlsplit

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from starlette.routing import Route

from src import middleware as mw
from src.auth import auth_db
from src.core.config import SESSION_COOKIE_NAME
from src.user_auth import user_auth_db

ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]
CSRF = {"X-Requested-With": "XMLHttpRequest"}


async def _ok(request):
    user = getattr(request.state, "user", None)
    return JSONResponse({"ok": True, "user": user["username"] if user else None})


PATHS = [
    "/", "/docs", "/redoc", "/openapi.json",
    "/api/v1/health", "/api/v1/system",
    "/api/v1/auth/status", "/api/v1/auth/register", "/api/v1/auth/login",
    "/api/v1/auth/logout", "/api/v1/auth/me",
    "/api/v1/docker/metrics", "/api/v1/docker/images", "/api/v1/docker/cis/scan",
    "/api/v1/docker/cis/categories", "/api/v1/docker/simple",
    "/api/v1/docker/container/abc/stop", "/api/v1/docker/container/abc/logs/stream",
    "/api/v1/docker/image/scan", "/api/v1/processes", "/api/v1/process/1/stop",
    "/api/v1/metrics", "/api/v1/metrics/latest", "/api/v1/agents", "/api/v1/agents/register",
]
APP = Starlette(
    routes=[Route(p, _ok, methods=ALL_METHODS) for p in PATHS],
    middleware=[Middleware(BaseHTTPMiddleware, dispatch=mw.auth_middleware)],
)


def call(method, path, headers=None, cookie=None):
    """Drive the ASGI app once and return (status, headers dict, parsed JSON body)."""
    parts = urlsplit(path)
    raw_headers = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    if cookie:
        raw_headers.append((b"cookie", f"{SESSION_COOKIE_NAME}={cookie}".encode()))
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method,
        "path": parts.path, "raw_path": parts.path.encode(), "query_string": parts.query.encode(),
        "headers": raw_headers, "client": ("203.0.113.9", 5000), "server": ("test", 80),
        "scheme": "http", "root_path": "",
    }
    sent = []
    state = {"done": False}

    async def receive():
        if not state["done"]:
            state["done"] = True
            return {"type": "http.request", "body": b"", "more_body": False}
        await asyncio.sleep(3600)  # block until the app is finished with us

    async def send(message):
        sent.append(message)

    async def run():
        await APP(scope, receive, send)

    asyncio.run(asyncio.wait_for(run(), timeout=10))
    start = next(m for m in sent if m["type"] == "http.response.start")
    body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
    hdrs = {k.decode().lower(): v.decode() for k, v in start["headers"]}
    return start["status"], hdrs, json.loads(body or b"null")


def reset_db():
    with user_auth_db._connect() as conn:
        conn.execute("DELETE FROM sessions")
        conn.execute("DELETE FROM users")
    agents = auth_db._get_connection()
    agents.execute("DELETE FROM rate_limits")
    agents.execute("DELETE FROM agents")
    agents.commit()


class MiddlewareTestCase(unittest.TestCase):
    def setUp(self):
        reset_db()
        user = user_auth_db.register("alice", "alice@example.com", "correct-horse")
        self.user = user
        self.session = user_auth_db.create_session(user["id"])
        self.agent_id = "agent-test-1"
        self.agent_token = auth_db.create_agent(self.agent_id, "host", "10.0.0.1", "1.0", [])
        self.agent_headers = {"X-Agent-ID": self.agent_id, "X-Agent-Token": self.agent_token}


class ClassifyTests(unittest.TestCase):
    def test_policy_table(self):
        cases = [
            ("GET", "/", mw.PUBLIC),
            ("GET", "/docs", mw.PUBLIC),
            ("GET", "/api/v1/health", mw.PUBLIC),
            ("POST", "/api/v1/agents/register", mw.PUBLIC),
            ("GET", "/api/v1/agents/register", mw.USER),       # only POST is public
            ("POST", "/api/v1/auth/login", mw.PUBLIC),
            ("GET", "/api/v1/auth/status", mw.PUBLIC),
            ("POST", "/api/v1/metrics", mw.AGENT),
            ("GET", "/api/v1/metrics", mw.USER),               # only POST /metrics is agent-only
            ("GET", "/api/v1/metrics/latest", mw.USER),
            ("GET", "/api/v1/system", mw.USER),                # was public before
            ("GET", "/api/v1/docker/metrics", mw.USER),        # was public before
            ("GET", "/api/v1/docker/images", mw.USER),         # was public before
            ("GET", "/api/v1/docker/cis/scan", mw.USER),       # was public before
            ("POST", "/api/v1/docker/container/x/stop", mw.USER),
            ("GET", "/api/v1/health/", mw.USER),               # near-miss paths are denied
            ("GET", "/api/v1/", mw.USER),
            ("GET", "/api/v1/anything/new", mw.USER),          # unknown routes default to deny
        ]
        for method, path, expected in cases:
            with self.subTest(method=method, path=path):
                self.assertEqual(mw.classify(method, path), expected)


class AnonymousTests(MiddlewareTestCase):
    def test_every_protected_path_and_method_is_401_without_credentials(self):
        public = {"/", "/docs", "/redoc", "/openapi.json", "/api/v1/health", *mw.AUTH_PATHS}
        for path in PATHS:
            if path in public:
                continue
            for method in ALL_METHODS:
                if (method, path) in mw.AGENT_PUBLIC:
                    continue
                with self.subTest(method=method, path=path):
                    status, _, body = call(method, path)
                    self.assertEqual(status, 401, body)

    def test_public_paths_are_reachable(self):
        for path in ["/", "/docs", "/redoc", "/openapi.json", "/api/v1/health"]:
            with self.subTest(path=path):
                self.assertEqual(call("GET", path)[0], 200)
        for path in sorted(mw.AUTH_PATHS):
            with self.subTest(path=path):
                self.assertEqual(call("GET", path)[0], 200)  # reaches the handler
        self.assertEqual(call("POST", "/api/v1/agents/register")[0], 200)

    def test_previously_public_data_endpoints_now_require_login(self):
        for path in ["/api/v1/system", "/api/v1/docker/metrics", "/api/v1/docker/images",
                     "/api/v1/docker/cis/scan", "/api/v1/docker/cis/categories"]:
            with self.subTest(path=path):
                self.assertEqual(call("GET", path)[0], 401)

    def test_retired_dashboard_token_is_ignored_in_header_and_query(self):
        token = "dev-dashboard-token-change-me"
        self.assertEqual(call("GET", "/api/v1/system", {"X-Dashboard-Token": token})[0], 401)
        self.assertEqual(call("GET", f"/api/v1/docker/container/a/logs/stream?dashboard_token={token}")[0], 401)

    def test_bogus_expired_and_empty_cookies_are_401(self):
        self.assertEqual(call("GET", "/api/v1/system", cookie="not-a-session")[0], 401)
        conn = sqlite3.connect(user_auth_db.db_path)
        conn.execute("UPDATE sessions SET expires_at = ?", (time.time() - 5,))
        conn.commit()
        conn.close()
        self.assertEqual(call("GET", "/api/v1/system", cookie=self.session)[0], 401)


class UserSessionTests(MiddlewareTestCase):
    def test_valid_session_reaches_the_handler_with_the_user_attached(self):
        status, _, body = call("GET", "/api/v1/system", cookie=self.session)
        self.assertEqual((status, body["user"]), (200, "alice"))

    def test_logout_revokes_access_immediately(self):
        user_auth_db.delete_session(self.session)
        self.assertEqual(call("GET", "/api/v1/system", cookie=self.session)[0], 401)

    def test_user_rate_limit_returns_429(self):
        with mock.patch.object(auth_db, "check_rate_limit", return_value=False) as limit:
            status, _, _ = call("GET", "/api/v1/system", cookie=self.session)
        self.assertEqual(status, 429)
        self.assertEqual(limit.call_args.kwargs["max_requests"], mw.USER_RATE_LIMIT)
        self.assertEqual(limit.call_args.args[0], f"user:{self.user['id']}")


class AgentTests(MiddlewareTestCase):
    def test_agent_can_push_metrics(self):
        self.assertEqual(call("POST", "/api/v1/metrics", self.agent_headers)[0], 200)

    def test_bad_or_missing_agent_credentials_are_401(self):
        bad = {"X-Agent-ID": self.agent_id, "X-Agent-Token": "wrong"}
        self.assertEqual(call("POST", "/api/v1/metrics", bad)[0], 401)
        self.assertEqual(call("POST", "/api/v1/metrics", {"X-Agent-ID": self.agent_id})[0], 401)
        self.assertEqual(call("POST", "/api/v1/metrics")[0], 401)

    def test_agent_token_is_rejected_on_every_dashboard_route(self):
        for path in PATHS:
            if mw.classify("GET", path) != mw.USER and mw.classify("POST", path) != mw.USER:
                continue
            for method in ALL_METHODS:
                if mw.classify(method, path) != mw.USER:
                    continue
                with self.subTest(method=method, path=path):
                    self.assertEqual(call(method, path, self.agent_headers)[0], 401)

    def test_user_session_cannot_push_agent_metrics(self):
        status, _, _ = call("POST", "/api/v1/metrics", CSRF, cookie=self.session)
        self.assertEqual(status, 401)

    def test_agent_rate_limit_returns_429(self):
        with mock.patch.object(auth_db, "check_rate_limit", return_value=False) as limit:
            status, _, _ = call("POST", "/api/v1/metrics", self.agent_headers)
        self.assertEqual(status, 429)
        self.assertEqual(limit.call_args.kwargs["max_requests"], mw.AGENT_RATE_LIMIT)


class CsrfTests(MiddlewareTestCase):
    def test_unsafe_request_with_cookie_needs_the_header(self):
        for method in ["POST", "PUT", "PATCH", "DELETE"]:
            with self.subTest(method=method):
                status, _, body = call(method, "/api/v1/docker/container/abc/stop", cookie=self.session)
                self.assertEqual((status, body["detail"]), (403, "Missing CSRF header"))
                self.assertEqual(
                    call(method, "/api/v1/docker/container/abc/stop", {"X-Requested-With": "fetch"}, self.session)[0], 403)
                self.assertEqual(
                    call(method, "/api/v1/docker/container/abc/stop", CSRF, self.session)[0], 200)

    def test_safe_requests_do_not_need_the_header(self):
        self.assertEqual(call("GET", "/api/v1/system", cookie=self.session)[0], 200)

    def test_logout_is_csrf_protected_too(self):
        self.assertEqual(call("POST", "/api/v1/auth/logout", cookie=self.session)[0], 403)
        self.assertEqual(call("POST", "/api/v1/auth/logout", CSRF, self.session)[0], 200)

    def test_requests_without_a_cookie_are_not_subject_to_csrf(self):
        # login/register have no session yet; agents authenticate by header, not cookie
        self.assertEqual(call("POST", "/api/v1/auth/login")[0], 200)
        self.assertEqual(call("POST", "/api/v1/metrics", self.agent_headers)[0], 200)

    def test_csrf_is_checked_before_authentication(self):
        # a stale cookie on a state-changing request is refused outright
        self.assertEqual(call("POST", "/api/v1/docker/container/abc/stop", cookie="stale")[0], 403)


if __name__ == "__main__":
    unittest.main()
