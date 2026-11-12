"""
Пользовательская аутентификация: регистрация, вход, сессии.

Пароли хешируются через hashlib.pbkdf2_hmac (PBKDF2-HMAC-SHA256,
260 000 итераций — тот же алгоритм и то же количество итераций, что
Django использует по умолчанию с 2019 года). Специализированных библиотек
вроде bcrypt/passlib на бэкенде нет и сети для их установки тоже нет —
PBKDF2 через стандартную библиотеку является общепризнанно безопасным
выбором и не требует внешних зависимостей.

Это единственный способ входа в дашборд: после логина сервер выставляет HttpOnly-cookie
с токеном сессии (см. routers/auth_router.py), а middleware.py пускает на все
дашбордные эндпоинты только запросы с действующей сессией. Агенты аутентифицируются
отдельно (X-Agent-ID + X-Agent-Token) и имеют доступ только к agent-эндпоинтам.

Токены сессий хранятся в БД только в виде SHA-256-хеша: утечка файла users.db не даёт
готовых рабочих сессий.
"""

import sqlite3
import hashlib
import logging
import secrets
import re
import time
from pathlib import Path
from typing import Optional, Dict, Any
from contextlib import contextmanager

from .core.config import USERS_DB_PATH

PBKDF2_ITERATIONS = 260_000
SESSION_TTL_SECONDS = 30 * 24 * 3600  # 30 дней

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,32}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class UserExistsError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


class ValidationError(Exception):
    pass


class RegistrationClosedError(Exception):
    pass


logger = logging.getLogger(__name__)

# Used to spend the same PBKDF2 time when the account does not exist, so response time
# does not reveal which usernames/emails are registered.
_DUMMY_SALT = bytes(16)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class UserAuthDB:
    def __init__(self, db_path: str = USERS_DB_PATH):
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def _connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_db(self):
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    created_at REAL NOT NULL
                )
            """)
            # Legacy schema stored the raw token as the primary key. Drop it (this signs
            # everyone out once) rather than keep credentials readable from the DB file.
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(sessions)")}
            if columns and "token_hash" not in columns:
                conn.execute("DROP TABLE sessions")
                logger.warning(
                    "Dropped legacy plaintext-token sessions table; all users must sign in again."
                )
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    created_at REAL NOT NULL,
                    expires_at REAL NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at)")

    @staticmethod
    def _hash_password(password: str, salt: Optional[bytes] = None) -> tuple:
        if salt is None:
            salt = secrets.token_bytes(16)
        pwd_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
        return pwd_hash.hex(), salt.hex()

    def count_users(self) -> int:
        with self._connect() as conn:
            return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]

    def register(
        self, username: str, email: str, password: str, *, allow_additional: bool = False
    ) -> Dict[str, Any]:
        """Create an account.

        The first account can always be created. Later ones require ``allow_additional``
        (ALLOW_REGISTRATION); otherwise RegistrationClosedError is raised. The check and
        the insert run in one write transaction so two simultaneous first sign-ups
        cannot both pass the "no users yet" check.
        """
        username = username.strip()
        email = email.strip().lower()

        if not USERNAME_RE.match(username):
            raise ValidationError("Username must be 3-32 characters (letters, digits, . _ -)")
        if not EMAIL_RE.match(email):
            raise ValidationError("Invalid email address")
        if len(password) < 8:
            raise ValidationError("Password must be at least 8 characters")

        # Hash before taking the write lock: PBKDF2 is slow and must not hold it.
        pwd_hash, salt = self._hash_password(password)

        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            if not allow_additional and conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0:
                raise RegistrationClosedError("Registration is closed")

            existing = conn.execute(
                "SELECT id FROM users WHERE username = ? OR email = ?", (username, email)
            ).fetchone()
            if existing:
                raise UserExistsError("Username or email already registered")

            cursor = conn.execute(
                "INSERT INTO users (username, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)",
                (username, email, pwd_hash, salt, time.time()),
            )
            user_id = cursor.lastrowid

        return {"id": user_id, "username": username, "email": email}

    def authenticate(self, username_or_email: str, password: str) -> Dict[str, Any]:
        identifier = username_or_email.strip().lower()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE lower(username) = ? OR email = ?", (identifier, identifier)
            ).fetchone()

        if not row:
            self._hash_password(password, _DUMMY_SALT)  # equalise timing with the found-user path
            raise InvalidCredentialsError("Invalid username/email or password")

        computed_hash, _ = self._hash_password(password, bytes.fromhex(row["salt"]))
        if not secrets.compare_digest(computed_hash, row["password_hash"]):
            raise InvalidCredentialsError("Invalid username/email or password")

        return {"id": row["id"], "username": row["username"], "email": row["email"]}

    def create_session(self, user_id: int) -> str:
        """Create a session and return the raw token (shown once, only its hash is stored)."""
        token = secrets.token_urlsafe(32)
        now = time.time()
        with self._connect() as conn:
            conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
            conn.execute(
                "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                (_token_hash(token), user_id, now, now + SESSION_TTL_SECONDS),
            )
        return token

    def get_user_by_session(self, token: Optional[str]) -> Optional[Dict[str, Any]]:
        if not token:
            return None
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT u.id, u.username, u.email, s.expires_at
                FROM sessions s JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = ?
                """,
                (_token_hash(token),),
            ).fetchone()

        if not row:
            return None
        if row["expires_at"] < time.time():
            self.delete_session(token)
            return None

        return {"id": row["id"], "username": row["username"], "email": row["email"]}

    def delete_session(self, token: Optional[str]) -> None:
        if not token:
            return
        with self._connect() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))

    def purge_expired_sessions(self) -> int:
        with self._connect() as conn:
            return conn.execute("DELETE FROM sessions WHERE expires_at < ?", (time.time(),)).rowcount


user_auth_db = UserAuthDB()
