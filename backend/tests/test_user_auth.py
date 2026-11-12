import hashlib
import os
import sqlite3
import tempfile
import threading
import time
import unittest
from unittest import mock

from src import user_auth
from src.user_auth import (
    InvalidCredentialsError,
    RegistrationClosedError,
    UserAuthDB,
    UserExistsError,
    ValidationError,
)


class UserAuthTestCase(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._dir.cleanup)
        self.path = os.path.join(self._dir.name, "users.db")
        self.db = UserAuthDB(self.path)

    def rows(self, sql, *args):
        conn = sqlite3.connect(self.path)
        try:
            return conn.execute(sql, args).fetchall()
        finally:
            conn.close()


class RegistrationPolicyTests(UserAuthTestCase):
    def test_first_account_is_always_allowed(self):
        user = self.db.register("alice", "alice@example.com", "correct-horse")
        self.assertEqual(user["username"], "alice")
        self.assertEqual(self.db.count_users(), 1)

    def test_later_accounts_are_refused_by_default(self):
        self.db.register("alice", "alice@example.com", "correct-horse")
        with self.assertRaises(RegistrationClosedError):
            self.db.register("bob", "bob@example.com", "correct-horse")
        self.assertEqual(self.db.count_users(), 1)

    def test_later_accounts_allowed_when_opened(self):
        self.db.register("alice", "alice@example.com", "correct-horse")
        self.db.register("bob", "bob@example.com", "correct-horse", allow_additional=True)
        self.assertEqual(self.db.count_users(), 2)

    def test_simultaneous_first_signups_create_exactly_one_account(self):
        n = 6
        barrier = threading.Barrier(n)
        results = []

        def attempt(i):
            barrier.wait()
            try:
                self.db.register(f"user{i}", f"user{i}@example.com", "correct-horse")
                results.append("ok")
            except RegistrationClosedError:
                results.append("closed")

        threads = [threading.Thread(target=attempt, args=(i,)) for i in range(n)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(results.count("ok"), 1, results)
        self.assertEqual(self.db.count_users(), 1)

    def test_duplicate_and_validation_errors(self):
        self.db.register("alice", "alice@example.com", "correct-horse")
        with self.assertRaises(UserExistsError):
            self.db.register("alice", "other@example.com", "correct-horse", allow_additional=True)
        with self.assertRaises(UserExistsError):
            self.db.register("other", "alice@example.com", "correct-horse", allow_additional=True)
        with self.assertRaises(ValidationError):
            self.db.register("x", "x@example.com", "correct-horse", allow_additional=True)
        with self.assertRaises(ValidationError):
            self.db.register("carol", "not-an-email", "correct-horse", allow_additional=True)
        with self.assertRaises(ValidationError):
            self.db.register("carol", "carol@example.com", "short", allow_additional=True)


class AuthenticateTests(UserAuthTestCase):
    def setUp(self):
        super().setUp()
        self.db.register("alice", "alice@example.com", "correct-horse")

    def test_login_by_username_or_email_case_insensitive(self):
        self.assertEqual(self.db.authenticate("alice", "correct-horse")["username"], "alice")
        self.assertEqual(self.db.authenticate("ALICE@Example.com", "correct-horse")["username"], "alice")

    def test_wrong_password_rejected(self):
        with self.assertRaises(InvalidCredentialsError):
            self.db.authenticate("alice", "wrong-password")

    def test_unknown_user_still_spends_hash_time(self):
        with mock.patch.object(UserAuthDB, "_hash_password", wraps=UserAuthDB._hash_password) as spy:
            with self.assertRaises(InvalidCredentialsError):
                self.db.authenticate("nobody", "whatever-123")
        spy.assert_called_once()
        self.assertEqual(spy.call_args.args[1], user_auth._DUMMY_SALT)

    def test_same_error_for_unknown_user_and_wrong_password(self):
        with self.assertRaises(InvalidCredentialsError) as a:
            self.db.authenticate("nobody", "whatever-123")
        with self.assertRaises(InvalidCredentialsError) as b:
            self.db.authenticate("alice", "wrong-password")
        self.assertEqual(str(a.exception), str(b.exception))


class SessionTests(UserAuthTestCase):
    def setUp(self):
        super().setUp()
        self.user = self.db.register("alice", "alice@example.com", "correct-horse")

    def test_roundtrip_and_logout(self):
        token = self.db.create_session(self.user["id"])
        self.assertEqual(self.db.get_user_by_session(token)["username"], "alice")
        self.db.delete_session(token)
        self.assertIsNone(self.db.get_user_by_session(token))

    def test_raw_token_is_never_stored(self):
        token = self.db.create_session(self.user["id"])
        stored = self.rows("SELECT token_hash FROM sessions")
        self.assertEqual(stored, [(hashlib.sha256(token.encode()).hexdigest(),)])
        for table in ("sessions", "users"):
            for row in self.rows(f"SELECT * FROM {table}"):
                self.assertNotIn(token, [str(v) for v in row])

    def test_tokens_are_unique_and_long(self):
        tokens = {self.db.create_session(self.user["id"]) for _ in range(20)}
        self.assertEqual(len(tokens), 20)
        self.assertTrue(all(len(t) >= 40 for t in tokens))

    def test_unknown_empty_and_none_tokens(self):
        self.assertIsNone(self.db.get_user_by_session("nope"))
        self.assertIsNone(self.db.get_user_by_session(""))
        self.assertIsNone(self.db.get_user_by_session(None))
        self.db.delete_session(None)  # must not raise

    def test_expired_session_is_rejected_and_removed(self):
        token = self.db.create_session(self.user["id"])
        conn = sqlite3.connect(self.path)
        conn.execute("UPDATE sessions SET expires_at = ?", (time.time() - 1,))
        conn.commit()
        conn.close()
        self.assertIsNone(self.db.get_user_by_session(token))
        self.assertEqual(self.rows("SELECT COUNT(*) FROM sessions"), [(0,)])

    def test_expired_sessions_are_purged(self):
        self.db.create_session(self.user["id"])
        conn = sqlite3.connect(self.path)
        conn.execute("UPDATE sessions SET expires_at = ?", (time.time() - 1,))
        conn.commit()
        conn.close()
        self.assertEqual(self.db.purge_expired_sessions(), 1)
        live = self.db.create_session(self.user["id"])
        self.assertEqual(self.db.purge_expired_sessions(), 0)
        self.assertIsNotNone(self.db.get_user_by_session(live))


class LegacyMigrationTests(unittest.TestCase):
    def test_plaintext_token_sessions_table_is_replaced_and_users_survive(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "users.db")
            conn = sqlite3.connect(path)
            conn.executescript("""
                CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL,
                    created_at REAL NOT NULL);
                CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
                    created_at REAL NOT NULL, expires_at REAL NOT NULL);
            """)
            h, s = UserAuthDB._hash_password("correct-horse")
            conn.execute("INSERT INTO users VALUES (1,'alice','alice@example.com',?,?,?)", (h, s, time.time()))
            conn.execute("INSERT INTO sessions VALUES ('legacy-raw-token',1,?,?)", (time.time(), time.time() + 9999))
            conn.commit()
            conn.close()

            db = UserAuthDB(path)

            self.assertIsNone(db.get_user_by_session("legacy-raw-token"))   # old sessions are gone
            self.assertEqual(db.authenticate("alice", "correct-horse")["id"], 1)  # accounts kept
            cols = {r[1] for r in sqlite3.connect(path).execute("PRAGMA table_info(sessions)")}
            self.assertIn("token_hash", cols)
            self.assertNotIn("token", cols)

    def test_current_schema_is_left_alone(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "users.db")
            db = UserAuthDB(path)
            u = db.register("alice", "alice@example.com", "correct-horse")
            token = db.create_session(u["id"])
            db2 = UserAuthDB(path)  # re-open: must not drop live sessions
            self.assertIsNotNone(db2.get_user_by_session(token))


if __name__ == "__main__":
    unittest.main()
