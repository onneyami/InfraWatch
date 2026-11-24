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
    "/api/v1/metrics", "/api/v1/metrics/latest", "/api/v1/metrics/history", "/api/v1/metrics/summary",
    "/api/v1/agents", "/api/v1/agents/register", "/api/v1/agents/enrollment-keys", "/api/v1/agents/abc",
    "/api/v1/process/1", "/api/v1/process/1/tree", "/api/v1/process/1/history", "/api/v1/brand/new",
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
            # public
            ("GET", "/", mw.PUBLIC),
            ("GET", "/docs", mw.PUBLIC),
            ("GET", "/api/v1/health", mw.PUBLIC),
            ("POST", "/api/v1/agents/register", mw.PUBLIC),
            ("POST", "/api/v1/auth/login", mw.PUBLIC),
            ("GET", "/api/v1/auth/status", mw.PUBLIC),
            # agent token
            ("POST", "/api/v1/metrics", mw.AGENT),
            # ordinary signed-in users: only data the caller owns
            ("GET", "/api/v1/agents", mw.USER),
            ("POST", "/api/v1/agents/enrollment-keys", mw.USER),
            ("DELETE", "/api/v1/agents/srv-1", mw.USER),
            ("GET", "/api/v1/metrics/latest", mw.USER),
            ("GET", "/api/v1/metrics/history", mw.USER),
            ("GET", "/api/v1/metrics/summary", mw.USER),
            ("GET", "/api/v1/process/4242/history", mw.USER),
            # everything that acts on the backend host: administrators only
            ("GET", "/api/v1/system", mw.ADMIN),
            ("GET", "/api/v1/docker/metrics", mw.ADMIN),
            ("GET", "/api/v1/docker/images", mw.ADMIN),
            ("GET", "/api/v1/docker/cis/scan", mw.ADMIN),
            ("POST", "/api/v1/docker/image/scan", mw.ADMIN),
            ("POST", "/api/v1/docker/container/x/stop", mw.ADMIN),
            ("DELETE", "/api/v1/docker/volume/v", mw.ADMIN),
            ("GET", "/api/v1/processes", mw.ADMIN),
            ("GET", "/api/v1/process/4242", mw.ADMIN),
            ("GET", "/api/v1/process/4242/tree", mw.ADMIN),
            ("POST", "/api/v1/process/4242/stop", mw.ADMIN),
            # least privilege by default: anything not explicitly granted needs an admin
            ("GET", "/api/v1/anything/new", mw.ADMIN),
            ("GET", "/api/v1/", mw.ADMIN),
            ("GET", "/api/v1/health/", mw.ADMIN),                 # near-miss paths are denied
            ("GET", "/api/v1/agents/register", mw.ADMIN),         # only POST is public
            ("GET", "/api/v1/metrics", mw.ADMIN),                 # only POST /metrics is agent-only
            ("POST", "/api/v1/agents", mw.ADMIN),                 # right path, wrong method
            ("PUT", "/api/v1/agents/srv-1", mw.ADMIN),
            ("GET", "/api/v1/agents/srv-1/extra", mw.ADMIN),
            ("GET", "/api/v1/metrics/latest/", mw.ADMIN),
            ("DELETE", "/api/v1/process/4242/history", mw.ADMIN),  # history is GET-only
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


class RoleTests(MiddlewareTestCase):
    """alice (the first account) is the administrator; bob is an ordinary user."""

    def setUp(self):
        super().setUp()
        bob = user_auth_db.register("bob", "bob@example.com", "correct-horse", allow_additional=True)
        self.bob_session = user_auth_db.create_session(bob["id"])

    def routes_of(self, kind):
        return [(m, p) for p in PATHS for m in ALL_METHODS if mw.classify(m, p) == kind]

    def test_the_first_account_is_the_administrator_and_later_ones_are_not(self):
        self.assertTrue(self.user["is_admin"])
        self.assertFalse(user_auth_db.get_user_by_session(self.bob_session)["is_admin"])

    def test_ordinary_users_get_403_on_every_admin_route(self):
        routes = self.routes_of(mw.ADMIN)
        self.assertGreater(len(routes), 40)
        for method, path in routes:
            with self.subTest(method=method, path=path):
                status, _, body = call(method, path, CSRF, self.bob_session)
                self.assertEqual((status, body["detail"]), (403, "Administrator access required"))

    def test_administrators_reach_every_admin_route(self):
        for method, path in self.routes_of(mw.ADMIN):
            with self.subTest(method=method, path=path):
                self.assertEqual(call(method, path, CSRF, self.session)[0], 200)

    def test_ordinary_users_reach_the_routes_for_their_own_data(self):
        user_routes = self.routes_of(mw.USER)
        self.assertGreaterEqual(len(user_routes), 7)
        for method, path in user_routes:
            with self.subTest(method=method, path=path):
                status, _, body = call(method, path, CSRF, self.bob_session)
                self.assertEqual((status, body["user"]), (200, "bob"))

    def test_a_brand_new_unclassified_route_is_admin_only(self):
        self.assertEqual(call("GET", "/api/v1/brand/new", cookie=self.bob_session)[0], 403)
        self.assertEqual(call("GET", "/api/v1/brand/new", cookie=self.session)[0], 200)

    def test_anonymous_requests_are_401_not_403(self):
        # no information about which routes are admin-only leaks to people who are not signed in
        for method, path in self.routes_of(mw.ADMIN):
            with self.subTest(method=method, path=path):
                self.assertEqual(call(method, path)[0], 401)

    def test_demoting_is_immediate_because_the_role_is_read_on_every_request(self):
        self.assertEqual(call("GET", "/api/v1/system", cookie=self.session)[0], 200)
        conn = sqlite3.connect(user_auth_db.db_path)
        conn.execute("UPDATE users SET is_admin = 0 WHERE id = ?", (self.user["id"],))
        conn.commit()
        conn.close()
        self.assertEqual(call("GET", "/api/v1/system", cookie=self.session)[0], 403)


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
            for method in ALL_METHODS:
                if mw.classify(method, path) not in (mw.USER, mw.ADMIN):
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
