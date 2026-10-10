"""
Пользовательская аутентификация: регистрация, вход, сессии.

Пароли хешируются через hashlib.pbkdf2_hmac (PBKDF2-HMAC-SHA256,
260 000 итераций — тот же алгоритм и то же количество итераций, что
Django использует по умолчанию с 2019 года). Специализированных библиотек
вроде bcrypt/passlib на бэкенде нет и сети для их установки тоже нет —
PBKDF2 через стандартную библиотеку является общепризнанно безопасным
выбором и не требует внешних зависимостей.

Это ОТДЕЛЬНЫЙ уровень от X-Dashboard-Token / X-Agent-Token (см. auth.py,
middleware.py) — тот уровень определяет, разрешён ли запрос к API вообще
(защита от анонимного доступа), этот — кто именно из пользователей сейчас
работает в дашборде (профиль, персонализация). Один не заменяет другой.
"""

import sqlite3
import hashlib
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
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    created_at REAL NOT NULL,
                    expires_at REAL NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            """)

    @staticmethod
    def _hash_password(password: str, salt: Optional[bytes] = None) -> tuple:
        if salt is None:
            salt = secrets.token_bytes(16)
        pwd_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
        return pwd_hash.hex(), salt.hex()

    def register(self, username: str, email: str, password: str) -> Dict[str, Any]:
        username = username.strip()
        email = email.strip().lower()

        if not USERNAME_RE.match(username):
            raise ValidationError("Username must be 3-32 characters (letters, digits, . _ -)")
        if not EMAIL_RE.match(email):
            raise ValidationError("Invalid email address")
        if len(password) < 8:
            raise ValidationError("Password must be at least 8 characters")

        with self._connect() as conn:
            existing = conn.execute(
                "SELECT id FROM users WHERE username = ? OR email = ?", (username, email)
            ).fetchone()
            if existing:
                raise UserExistsError("Username or email already registered")

            pwd_hash, salt = self._hash_password(password)
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
            raise InvalidCredentialsError("Invalid username/email or password")

        computed_hash, _ = self._hash_password(password, bytes.fromhex(row["salt"]))
        if not secrets.compare_digest(computed_hash, row["password_hash"]):
            raise InvalidCredentialsError("Invalid username/email or password")

        return {"id": row["id"], "username": row["username"], "email": row["email"]}

    def create_session(self, user_id: int) -> str:
        token = secrets.token_hex(32)
        now = time.time()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                (token, user_id, now, now + SESSION_TTL_SECONDS),
            )
        return token

    def get_user_by_session(self, token: str) -> Optional[Dict[str, Any]]:
        if not token:
            return None
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT u.id, u.username, u.email, s.expires_at
                FROM sessions s JOIN users u ON u.id = s.user_id
                WHERE s.token = ?
                """,
                (token,),
            ).fetchone()

        if not row:
            return None
        if row["expires_at"] < time.time():
            self.delete_session(token)
            return None

        return {"id": row["id"], "username": row["username"], "email": row["email"]}

    def delete_session(self, token: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


user_auth_db = UserAuthDB()
