"""
End-to-end auth tests against the real FastAPI app (src.main:app).

Needs fastapi + httpx (``pip install -r requirements-dev.txt``); skipped when they are not
installed. The route-inventory test is the important guardrail: it enumerates every route
the app actually registers, so a new endpoint cannot ship unauthenticated by accident.
"""

import pathlib
import re
import time
import unittest

try:
    from fastapi.testclient import TestClient
    from src.main import app
except ImportError as exc:  # pragma: no cover - depends on the environment
    raise unittest.SkipTest(f"FastAPI test dependencies not installed: {exc}")

from src import middleware as mw
from src import stores
from src.auth import auth_db
from src.core.config import SESSION_COOKIE_NAME
from src.routers import auth_router, metrics_router
from src.user_auth import user_auth_db

CSRF = {"X-Requested-With": "XMLHttpRequest"}
ALICE = {"username": "alice", "email": "alice@example.com", "password": "correct-horse"}

# Adding a public or agent-accessible route must be a conscious decision: update these sets.
EXPECTED_PUBLIC = {
    ("GET", "/api/v1/health"),
    ("POST", "/api/v1/agents/register"),
    ("GET", "/api/v1/auth/status"),
    ("POST", "/api/v1/auth/register"),
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/logout"),
    ("GET", "/api/v1/auth/me"),
}
EXPECTED_AGENT = {("POST", "/api/v1/metrics")}
# The only routes an ordinary (non-admin) user may call: they touch data the caller owns.
# Everything else, including any route added later, is administrator-only until it is
# deliberately added here AND to USER_RULES in middleware.py.
EXPECTED_USER = {
    ("GET", "/api/v1/agents"),
    ("POST", "/api/v1/agents/enrollment-keys"),
    ("DELETE", "/api/v1/agents/x"),
    ("GET", "/api/v1/metrics/latest"),
    ("GET", "/api/v1/metrics/history"),
    ("GET", "/api/v1/metrics/summary"),
    ("GET", "/api/v1/process/x/history"),
}


HTTP_METHODS = {"get", "post", "put", "patch", "delete"}


def api_routes():
    """Every (METHOD, path) under /api/v1/, with path parameters replaced by "x".

    Taken from the OpenAPI schema on purpose: it is public API and stable across FastAPI
    versions, whereas ``app.routes`` holds private wrapper objects in recent releases (0.143
    stopped flattening included routers), which silently yielded no routes. The price is
    that routes hidden from the schema would be invisible here; a test below forbids those.
    """
    for template, operations in app.openapi()["paths"].items():
        if not template.startswith("/api/v1/"):
            continue
        path = re.sub(r"\{[^}]+\}", "x", template)
        for method in operations:
            if method in HTTP_METHODS:
                yield method.upper(), path


def reset_state():
    with user_auth_db._connect() as conn:
        conn.execute("DELETE FROM sessions")
        conn.execute("DELETE FROM users")
    agents = auth_db._get_connection()
    for table in ("rate_limits", "agents", "enrollment_keys"):
        agents.execute(f"DELETE FROM {table}")
    agents.commit()
    for store in (stores.metrics_history, stores.agents_registry, stores.agent_last_seen, stores.process_history):
        store.clear()
    auth_router.login_throttle._failures.clear()
    auth_router.register_throttle._failures.clear()
    metrics_router.enroll_throttle._failures.clear()


class RouteInventoryTests(unittest.TestCase):
    def test_no_route_is_hidden_from_the_openapi_schema(self):
        # The inventory below reads the OpenAPI schema, so a route with
        # include_in_schema=False would dodge it. Forbid that.
        src = pathlib.Path(__file__).resolve().parent.parent / "src"
        offenders = [str(p.relative_to(src)) for p in src.rglob("*.py")
                     if "include_in_schema" in p.read_text(encoding="utf-8")]
        self.assertEqual(offenders, [], "routes hidden from OpenAPI escape the auth inventory")

    def test_public_and_agent_routes_are_exactly_the_expected_ones(self):
        routes = set(api_routes())
        self.assertGreater(len(routes), 25, "route discovery looks broken")
        public = {r for r in routes if mw.classify(*r) == mw.PUBLIC}
        agent = {r for r in routes if mw.classify(*r) == mw.AGENT}
        user = {r for r in routes if mw.classify(*r) == mw.USER}
        admin = {r for r in routes if mw.classify(*r) == mw.ADMIN}
        self.assertEqual(public, EXPECTED_PUBLIC)
        self.assertEqual(agent, EXPECTED_AGENT)
        self.assertEqual(user, EXPECTED_USER)
        self.assertGreaterEqual(len(admin), 20, "the Docker/process/system routes should all be admin-only")
        self.assertIn(("GET", "/api/v1/system"), admin)
        self.assertIn(("POST", "/api/v1/docker/container/x/stop"), admin)
        self.assertIn(("POST", "/api/v1/process/x/stop"), admin)

    def test_every_other_route_is_401_without_credentials(self):
        reset_state()
        client = TestClient(app)
        for method, path in api_routes():
            if (method, path) in EXPECTED_PUBLIC:
                continue
            with self.subTest(method=method, path=path):
                self.assertEqual(client.request(method, path).status_code, 401)

    def test_agent_credentials_do_not_open_dashboard_routes(self):
        reset_state()
        token = auth_db.create_agent("inventory-agent", "h", "10.0.0.1", "1", [])
        headers = {"X-Agent-ID": "inventory-agent", "X-Agent-Token": token}
        client = TestClient(app)
        for method, path in api_routes():
            if mw.classify(method, path) not in (mw.USER, mw.ADMIN):
                continue
            with self.subTest(method=method, path=path):
                self.assertEqual(client.request(method, path, headers=headers).status_code, 401)


class AuthFlowTests(unittest.TestCase):
    def setUp(self):
        reset_state()
        self.client = TestClient(app)

    def test_first_run_register_session_logout(self):
        r = self.client.get("/api/v1/auth/status")
        self.assertEqual(r.json(), {"setup_required": True, "registration_open": True})

        r = self.client.post("/api/v1/auth/register", json=ALICE)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertNotIn("token", r.json())
        self.assertIs(r.json()["user"]["is_admin"], True)       # the first account is the administrator
        cookie = r.headers["set-cookie"].lower()
        for attr in ("httponly", "samesite=lax", "path=/api", f"{SESSION_COOKIE_NAME}="):
            self.assertIn(attr, cookie)

        self.assertEqual(self.client.get("/api/v1/auth/me").json()["user"]["username"], "alice")
        self.assertNotIn(self.client.get("/api/v1/agents").status_code, (401, 403))

        # logout is state-changing, so it needs the CSRF header
        self.assertEqual(self.client.post("/api/v1/auth/logout").status_code, 403)
        self.assertEqual(self.client.post("/api/v1/auth/logout", headers=CSRF).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/auth/me").status_code, 401)
        self.assertEqual(self.client.get("/api/v1/agents").status_code, 401)

    def test_registration_closes_after_the_first_account(self):
        self.client.post("/api/v1/auth/register", json=ALICE)
        other = TestClient(app)
        r = other.post("/api/v1/auth/register", json={**ALICE, "username": "bob", "email": "bob@example.com"})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(other.get("/api/v1/auth/status").json(),
                         {"setup_required": False, "registration_open": False})

    def test_login_rotates_the_session(self):
        self.client.post("/api/v1/auth/register", json=ALICE)
        old = self.client.cookies.get(SESSION_COOKIE_NAME)
        r = self.client.post("/api/v1/auth/login",
                             json={"username_or_email": "alice", "password": ALICE["password"]}, headers=CSRF)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertNotEqual(self.client.cookies.get(SESSION_COOKIE_NAME), old)
        self.assertIsNone(user_auth_db.get_user_by_session(old))

    def test_wrong_password_is_401_then_throttled(self):
        self.client.post("/api/v1/auth/register", json=ALICE)
        fresh = TestClient(app)
        bad = {"username_or_email": "alice", "password": "wrong-password"}
        for _ in range(auth_router.LOGIN_LIMITS["ip"]):
            self.assertEqual(fresh.post("/api/v1/auth/login", json=bad).status_code, 401)
        r = fresh.post("/api/v1/auth/login", json=bad)
        self.assertEqual(r.status_code, 429)
        self.assertIn("retry-after", r.headers)

    def test_oversized_credentials_are_rejected_before_hashing(self):
        r = self.client.post("/api/v1/auth/login",
                             json={"username_or_email": "alice", "password": "x" * 5000})
        self.assertEqual(r.status_code, 422)

    def test_the_retired_dashboard_token_does_nothing(self):
        token = "dev-dashboard-token-change-me"
        self.assertEqual(self.client.get("/api/v1/docker/metrics", headers={"X-Dashboard-Token": token}).status_code, 401)
        self.assertEqual(self.client.get(f"/api/v1/docker/metrics?dashboard_token={token}").status_code, 401)


class AdminRoleTests(unittest.TestCase):
    """alice (first account) is the administrator, bob an ordinary user."""

    def setUp(self):
        reset_state()
        self.alice = TestClient(app)
        self.alice.post("/api/v1/auth/register", json=ALICE)
        user_auth_db.register("bob", "bob@example.com", "correct-horse", allow_additional=True)
        self.bob = TestClient(app)
        r = self.bob.post("/api/v1/auth/login", json={"username_or_email": "bob", "password": "correct-horse"})
        self.assertEqual(r.status_code, 200, r.text)

    def test_the_role_is_reported_to_the_ui(self):
        self.assertIs(self.alice.get("/api/v1/auth/me").json()["user"]["is_admin"], True)
        self.assertIs(self.bob.get("/api/v1/auth/me").json()["user"]["is_admin"], False)

    def test_ordinary_users_get_403_on_every_admin_route(self):
        admin_routes = [r for r in api_routes() if mw.classify(*r) == mw.ADMIN]
        self.assertGreaterEqual(len(admin_routes), 20)
        for method, path in admin_routes:
            with self.subTest(method=method, path=path):
                r = self.bob.request(method, path, headers=CSRF)
                self.assertEqual(r.status_code, 403, r.text)
                self.assertEqual(r.json()["detail"], "Administrator access required")

    def test_administrators_are_let_through_to_a_host_route(self):
        # only a safe read: the point is that the policy does not stop an admin
        self.assertNotIn(self.alice.get("/api/v1/system").status_code, (401, 403))

    def test_ordinary_users_keep_access_to_their_own_agent_routes(self):
        for method, path in sorted(EXPECTED_USER):
            if method != "GET":
                continue
            with self.subTest(path=path):
                self.assertNotIn(self.bob.get(path).status_code, (401, 403))


def metrics(agent_id, cpu=5.0):
    return {"agent_id": agent_id, "timestamp": time.time(), "cpu": {"usage": cpu}, "memory": {"used_percent": 1.0},
            "processes": [{"pid": 4242, "name": f"proc-of-{agent_id}"}]}


class AgentEnrollmentTests(unittest.TestCase):
    def setUp(self):
        reset_state()
        self.alice = TestClient(app)
        self.alice.post("/api/v1/auth/register", json=ALICE)
        self.alice_id = user_auth_db.first_user_id()

    def second_user(self):
        user_auth_db.register("bob", "bob@example.com", "correct-horse", allow_additional=True)
        bob = TestClient(app)
        r = bob.post("/api/v1/auth/login", json={"username_or_email": "bob", "password": "correct-horse"})
        self.assertEqual(r.status_code, 200, r.text)
        return bob

    def key_for(self, client):
        r = client.post("/api/v1/agents/enrollment-keys", json={"label": "test"}, headers=CSRF)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["key"]

    def enroll(self, key, agent_id, **extra):
        # agents register without a browser session
        return TestClient(app).post("/api/v1/agents/register",
                                    json={"agent_id": agent_id, "enrollment_key": key, "hostname": "h", **extra})

    def push(self, token, agent_id, body=None):
        return TestClient(app).post("/api/v1/metrics", json=body or metrics(agent_id),
                                    headers={"X-Agent-ID": agent_id, "X-Agent-Token": token})

    def test_enrol_push_and_see_the_agent(self):
        key = self.key_for(self.alice)
        self.assertTrue(key.startswith("ahk_"))
        r = self.enroll(key, "srv-1")
        self.assertEqual(r.status_code, 200, r.text)
        token = r.json()["token"]
        self.assertEqual(self.push(token, "srv-1").status_code, 200)
        self.assertEqual({a["id"] for a in self.alice.get("/api/v1/agents").json()["agents"]}, {"srv-1"})
        self.assertIn("srv-1", self.alice.get("/api/v1/metrics/latest").json())

    def test_creating_a_key_needs_a_session_and_the_csrf_header(self):
        self.assertEqual(TestClient(app).post("/api/v1/agents/enrollment-keys", headers=CSRF).status_code, 401)
        self.assertEqual(self.alice.post("/api/v1/agents/enrollment-keys").status_code, 403)

    def test_registration_requires_a_valid_unused_key(self):
        anonymous = TestClient(app)
        for body in ({"agent_id": "x"}, {"agent_id": "x", "enrollment_key": "ahk_nope"}):
            self.assertEqual(anonymous.post("/api/v1/agents/register", json=body).status_code, 401)
        key = self.key_for(self.alice)
        self.assertEqual(self.enroll(key, "srv-1").status_code, 200)
        self.assertEqual(self.enroll(key, "srv-2").status_code, 401)           # one-time

    def test_taken_agent_id_is_409_and_the_existing_agent_is_untouched(self):
        self.enroll(self.key_for(self.alice), "srv-1", ip_address="10.0.0.1")
        r = self.enroll(self.key_for(self.alice), "srv-1", hostname="evil", ip_address="6.6.6.6")
        self.assertEqual(r.status_code, 409)
        info = auth_db.get_agent("srv-1")
        self.assertEqual((info["hostname"], info["ip_address"]), ("h", "10.0.0.1"))

    def test_an_agent_that_went_quiet_is_still_listed_and_can_be_removed(self):
        self.enroll(self.key_for(self.alice), "quiet-srv")
        self.assertEqual(self.alice.get("/api/v1/agents").json()["agents"][0]["status"], "active")  # just enrolled
        stores.agent_last_seen["quiet-srv"] = time.time() - 3600                                   # ...an hour of silence
        agents = {a["id"]: a for a in self.alice.get("/api/v1/agents").json()["agents"]}
        self.assertEqual(agents["quiet-srv"]["status"], "inactive")
        self.assertEqual(agents["quiet-srv"]["hostname"], "h")
        self.assertEqual(self.alice.delete("/api/v1/agents/quiet-srv", headers=CSRF).status_code, 200)
        self.assertEqual(self.alice.get("/api/v1/agents").json()["agents"], [])

    def test_agents_are_still_listed_after_a_backend_restart(self):
        token = self.enroll(self.key_for(self.alice), "srv-1").json()["token"]
        self.push(token, "srv-1")
        stores.agent_last_seen.clear()          # what a restart does: memory is empty,
        stores.agents_registry.clear()          # the database is not
        agent = self.alice.get("/api/v1/agents").json()["agents"][0]
        self.assertEqual((agent["id"], agent["hostname"]), ("srv-1", "h"))
        self.assertEqual(agent["status"], "active")        # last_seen comes from the database
        self.assertGreater(agent["last_seen"], time.time() - 60)

    def test_idle_agents_of_another_user_are_not_listed(self):
        bob = self.second_user()
        self.enroll(self.key_for(self.alice), "alice-quiet")
        self.assertEqual(bob.get("/api/v1/agents").json()["agents"], [])

    def test_an_agent_cannot_push_metrics_as_another_agent(self):
        t1 = self.enroll(self.key_for(self.alice), "srv-1").json()["token"]
        self.enroll(self.key_for(self.alice), "srv-2")
        self.assertEqual(self.push(t1, "srv-1", metrics("srv-2")).status_code, 403)
        self.assertNotIn("srv-2", stores.metrics_history)

    def test_users_only_see_their_own_agents(self):
        bob = self.second_user()
        ta = self.enroll(self.key_for(self.alice), "alice-srv").json()["token"]
        tb = self.enroll(self.key_for(bob), "bob-srv").json()["token"]
        self.push(ta, "alice-srv")
        self.push(tb, "bob-srv")
        self.assertEqual({a["id"] for a in self.alice.get("/api/v1/agents").json()["agents"]}, {"alice-srv"})
        self.assertEqual({a["id"] for a in bob.get("/api/v1/agents").json()["agents"]}, {"bob-srv"})
        self.assertEqual(set(self.alice.get("/api/v1/metrics/latest").json()), {"alice-srv"})
        self.assertEqual(self.alice.get("/api/v1/metrics/history", params={"agent_id": "bob-srv"}).status_code, 404)
        self.assertEqual(set(self.alice.get("/api/v1/metrics/summary").json()["summary"]), {"alice-srv"})
        procs = self.alice.get("/api/v1/process/4242/history").json()
        self.assertEqual({e["name"] for e in procs["history"]}, {"proc-of-alice-srv"})

    def test_deleting_an_agent_is_owner_only_and_revokes_its_token(self):
        bob = self.second_user()
        token = self.enroll(self.key_for(self.alice), "alice-srv").json()["token"]
        self.assertEqual(bob.delete("/api/v1/agents/alice-srv", headers=CSRF).status_code, 404)
        self.assertEqual(self.push(token, "alice-srv").status_code, 200)
        self.assertEqual(self.alice.delete("/api/v1/agents/alice-srv", headers=CSRF).status_code, 200)
        self.assertEqual(self.push(token, "alice-srv").status_code, 401)
        self.assertEqual(self.alice.delete("/api/v1/agents/alice-srv").status_code, 403)  # CSRF header required

    def test_agents_that_predate_ownership_go_to_the_first_account(self):
        reset_state()
        auth_db.create_agent("legacy-agent")
        self.assertIsNone(auth_db.get_agent_owner("legacy-agent"))
        client = TestClient(app)
        client.post("/api/v1/auth/register", json=ALICE)
        self.assertEqual(auth_db.get_agent_owner("legacy-agent"), user_auth_db.first_user_id())


if __name__ == "__main__":
    unittest.main()
