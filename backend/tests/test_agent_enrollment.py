import os
import sqlite3
import tempfile
import threading
import time
import unittest

from src.auth import (
    ENROLLMENT_KEY_PREFIX,
    ENROLLMENT_KEY_RETENTION_SECONDS,
    MAX_ACTIVE_KEYS_PER_OWNER,
    AgentAuthDB,
    AgentExistsError,
    InvalidEnrollmentKeyError,
    TooManyKeysError,
)

ALICE, BOB = 1, 2


class EnrollmentTestCase(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.path = os.path.join(self._dir.name, "agents.db")
        self.db = AgentAuthDB(self.path)

    def sql(self, query, *args):
        conn = sqlite3.connect(self.path)
        try:
            return conn.execute(query, args).fetchall()
        finally:
            conn.close()

    def enroll(self, owner=ALICE, agent_id="agent-1", **kw):
        key, _ = self.db.create_enrollment_key(owner)
        return key, self.db.enroll_agent(key, agent_id, **kw)


class KeyCreationTests(EnrollmentTestCase):
    def test_key_format_expiry_and_hash_only_storage(self):
        before = time.time()
        key, expires_at = self.db.create_enrollment_key(ALICE, label="web-1")
        self.assertTrue(key.startswith(ENROLLMENT_KEY_PREFIX))
        self.assertGreaterEqual(len(key), 30)
        self.assertAlmostEqual(expires_at - before, 3600, delta=5)
        rows = self.sql("SELECT * FROM enrollment_keys")
        self.assertEqual(len(rows), 1)
        self.assertNotIn(key, [str(v) for v in rows[0]])           # plain key is never stored
        self.assertEqual(self.sql("SELECT label, used_at FROM enrollment_keys"), [("web-1", None)])

    def test_keys_are_unique(self):
        keys = {self.db.create_enrollment_key(ALICE)[0] for _ in range(MAX_ACTIVE_KEYS_PER_OWNER)}
        self.assertEqual(len(keys), MAX_ACTIVE_KEYS_PER_OWNER)

    def test_active_keys_are_capped_per_owner(self):
        for _ in range(MAX_ACTIVE_KEYS_PER_OWNER):
            self.db.create_enrollment_key(ALICE)
        with self.assertRaises(TooManyKeysError):
            self.db.create_enrollment_key(ALICE)
        self.db.create_enrollment_key(BOB)                         # other owners are unaffected

    def test_used_and_expired_keys_do_not_count_toward_the_cap(self):
        for i in range(MAX_ACTIVE_KEYS_PER_OWNER):
            key, _ = self.db.create_enrollment_key(ALICE)
            if i % 2:
                self.db.enroll_agent(key, f"a{i}")                 # used
            else:
                self.sql("UPDATE enrollment_keys SET expires_at = 1 WHERE key_hash = (SELECT key_hash FROM enrollment_keys WHERE used_at IS NULL LIMIT 1)")
        self.db.create_enrollment_key(ALICE)                       # does not raise

    def test_old_used_and_expired_rows_are_purged_on_creation(self):
        old = time.time() - ENROLLMENT_KEY_RETENTION_SECONDS - 10
        self.db.create_enrollment_key(ALICE)
        self.db.create_enrollment_key(ALICE)
        conn = sqlite3.connect(self.path)
        conn.execute("UPDATE enrollment_keys SET expires_at = ? WHERE rowid = 1", (old,))
        conn.execute("UPDATE enrollment_keys SET used_at = ?, expires_at = ? WHERE rowid = 2", (old, old))
        conn.commit()
        conn.close()
        self.db.create_enrollment_key(ALICE)
        self.assertEqual(self.sql("SELECT COUNT(*) FROM enrollment_keys"), [(1,)])


class EnrollTests(EnrollmentTestCase):
    def test_enroll_creates_an_agent_owned_by_the_keys_owner(self):
        key, token = self.enroll(owner=BOB, agent_id="srv-1", hostname="h", ip_address="10.0.0.1", version="2.6")
        self.assertTrue(self.db.verify_token("srv-1", token))
        self.assertEqual(self.db.get_agent_owner("srv-1"), BOB)
        used_at, agent_id = self.sql("SELECT used_at, agent_id FROM enrollment_keys")[0]
        self.assertIsNotNone(used_at)
        self.assertEqual(agent_id, "srv-1")

    def test_agent_token_is_stored_hashed(self):
        _, token = self.enroll()
        for row in self.sql("SELECT * FROM agents"):
            self.assertNotIn(token, [str(v) for v in row])

    def test_a_key_works_exactly_once(self):
        key, _ = self.enroll(agent_id="agent-1")
        with self.assertRaises(InvalidEnrollmentKeyError):
            self.db.enroll_agent(key, "agent-2")
        self.assertEqual(self.sql("SELECT COUNT(*) FROM agents"), [(1,)])

    def test_unknown_empty_and_malformed_keys_are_rejected(self):
        for bad in ["", "nope", ENROLLMENT_KEY_PREFIX, ENROLLMENT_KEY_PREFIX + "x" * 40, "ahk_' OR 1=1 --"]:
            with self.subTest(key=bad), self.assertRaises(InvalidEnrollmentKeyError):
                self.db.enroll_agent(bad, "agent-x")
        self.assertEqual(self.sql("SELECT COUNT(*) FROM agents"), [(0,)])

    def test_expired_key_is_rejected_and_creates_nothing(self):
        key, _ = self.db.create_enrollment_key(ALICE, ttl_seconds=-1)
        with self.assertRaises(InvalidEnrollmentKeyError):
            self.db.enroll_agent(key, "agent-1")
        self.assertEqual(self.sql("SELECT COUNT(*) FROM agents"), [(0,)])

    def test_taken_agent_id_fails_without_touching_the_existing_agent_or_the_key(self):
        _, old_token = self.enroll(agent_id="agent-1", hostname="real-host", ip_address="10.0.0.1", version="2.6")
        key2, _ = self.db.create_enrollment_key(BOB)
        with self.assertRaises(AgentExistsError):
            self.db.enroll_agent(key2, "agent-1", hostname="attacker", ip_address="6.6.6.6", version="evil")
        # the existing agent is exactly as it was
        info = self.db.get_agent("agent-1")
        self.assertEqual((info["hostname"], info["ip_address"], info["version"], info["owner_id"]),
                         ("real-host", "10.0.0.1", "2.6", ALICE))
        self.assertTrue(self.db.verify_token("agent-1", old_token))
        # and the key was not burnt: it still works for a different id
        self.db.enroll_agent(key2, "agent-2")
        self.assertEqual(self.db.get_agent_owner("agent-2"), BOB)

    def test_create_agent_does_not_overwrite_an_existing_agent(self):
        self.db.create_agent("agent-1", "real-host", "10.0.0.1", "2.6", owner_id=ALICE)
        self.assertIsNone(self.db.create_agent("agent-1", "attacker", "6.6.6.6", "evil"))
        info = self.db.get_agent("agent-1")
        self.assertEqual((info["hostname"], info["ip_address"], info["version"]), ("real-host", "10.0.0.1", "2.6"))

    def test_two_threads_racing_on_one_key_create_exactly_one_agent(self):
        key, _ = self.db.create_enrollment_key(ALICE)
        n, barrier, results = 8, threading.Barrier(8), []

        def attempt(i):
            barrier.wait()
            try:
                self.db.enroll_agent(key, f"agent-{i}")
                results.append("ok")
            except InvalidEnrollmentKeyError:
                results.append("invalid")

        threads = [threading.Thread(target=attempt, args=(i,)) for i in range(n)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(results.count("ok"), 1, results)
        self.assertEqual(self.sql("SELECT COUNT(*) FROM agents"), [(1,)])

    def test_two_threads_racing_on_one_agent_id_create_one_agent_and_burn_one_key(self):
        keys = [self.db.create_enrollment_key(ALICE)[0] for _ in range(6)]
        barrier, results = threading.Barrier(6), []

        def attempt(key):
            barrier.wait()
            try:
                self.db.enroll_agent(key, "same-id")
                results.append("ok")
            except AgentExistsError:
                results.append("exists")

        threads = [threading.Thread(target=attempt, args=(k,)) for k in keys]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(results.count("ok"), 1, results)
        self.assertEqual(self.sql("SELECT COUNT(*) FROM enrollment_keys WHERE used_at IS NOT NULL"), [(1,)])


class OwnershipTests(EnrollmentTestCase):
    def test_listing_and_lookup_are_scoped_to_the_owner(self):
        self.enroll(owner=ALICE, agent_id="a1")
        self.enroll(owner=ALICE, agent_id="a2")
        self.enroll(owner=BOB, agent_id="b1")
        self.assertEqual(self.db.agent_ids_for_owner(ALICE), {"a1", "a2"})
        self.assertEqual(self.db.agent_ids_for_owner(BOB), {"b1"})
        self.assertEqual(self.db.agent_ids_for_owner(99), set())
        self.assertEqual({a["agent_id"] for a in self.db.list_agents(owner_id=BOB)}, {"b1"})
        self.assertEqual(len(self.db.list_agents()), 3)

    def test_only_the_owner_can_delete_an_agent_and_deleting_revokes_the_token(self):
        _, token = self.enroll(owner=ALICE, agent_id="a1")
        self.assertFalse(self.db.delete_agent("a1", BOB))          # not theirs
        self.assertTrue(self.db.verify_token("a1", token))
        self.assertTrue(self.db.delete_agent("a1", ALICE))
        self.assertFalse(self.db.verify_token("a1", token))
        self.assertFalse(self.db.delete_agent("a1", ALICE))        # already gone
        self.enroll(owner=ALICE, agent_id="a1")                    # the id can be enrolled again

    def test_adopt_orphans_only_takes_unowned_agents_and_is_idempotent(self):
        self.db.create_agent("legacy-1")
        self.db.create_agent("legacy-2")
        self.enroll(owner=BOB, agent_id="bobs")
        self.assertEqual(self.db.adopt_orphan_agents(ALICE), 2)
        self.assertEqual(self.db.agent_ids_for_owner(ALICE), {"legacy-1", "legacy-2"})
        self.assertEqual(self.db.get_agent_owner("bobs"), BOB)
        self.assertEqual(self.db.adopt_orphan_agents(ALICE), 0)


class LegacyMigrationTests(unittest.TestCase):
    def test_database_without_owner_column_is_upgraded_in_place(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "agents.db")
            conn = sqlite3.connect(path)
            conn.executescript("""
                CREATE TABLE agents (agent_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, hostname TEXT,
                    ip_address TEXT, version TEXT, tags TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_seen TIMESTAMP, is_active BOOLEAN DEFAULT 1);
                CREATE TABLE rate_limits (agent_id TEXT, endpoint TEXT, timestamp REAL,
                    PRIMARY KEY (agent_id, endpoint, timestamp));
            """)
            import hashlib
            conn.execute("INSERT INTO agents (agent_id, token_hash, hostname) VALUES ('old-agent', ?, 'old-host')",
                         (hashlib.sha256(b"old-token").hexdigest(),))
            conn.commit()
            conn.close()

            db = AgentAuthDB(path)

            self.assertTrue(db.verify_token("old-agent", "old-token"))   # existing token still works
            self.assertIsNone(db.get_agent_owner("old-agent"))
            self.assertEqual(db.adopt_orphan_agents(7), 1)
            self.assertEqual(db.get_agent_owner("old-agent"), 7)
            AgentAuthDB(path)  # reopening is a no-op (column already exists)


if __name__ == "__main__":
    unittest.main()
