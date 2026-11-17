"""
Модуль аутентификации и авторизации для Ahova API.

Хранение токенов агентов в SQLite (переживает рестарт бэкенда).

Агент принадлежит пользователю (owner_id) и регистрируется только по одноразовому ключу
(enrollment key), который пользователь создаёт в дашборде. В базе хранятся только SHA-256
хеши токенов агентов и ключей.
"""

import json
import sqlite3
import secrets
import hashlib
import os
import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Set, Tuple
from pathlib import Path
import threading

from .core.config import AGENTS_DB_PATH

ENROLLMENT_KEY_PREFIX = "ahk_"
ENROLLMENT_KEY_TTL_SECONDS = 60 * 60          # a key is valid for one hour
MAX_ACTIVE_KEYS_PER_OWNER = 20
ENROLLMENT_KEY_RETENTION_SECONDS = 7 * 24 * 3600  # keep used/expired rows a week for audit


class InvalidEnrollmentKeyError(Exception):
    """The key does not exist, was already used, or has expired (deliberately not distinguished)."""


class AgentExistsError(Exception):
    pass


class TooManyKeysError(Exception):
    pass


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class AgentAuthDB:
    """SQLite хранилище для токенов агентов."""
    
    def __init__(self, db_path: str = AGENTS_DB_PATH):
        self.db_path = db_path
        self._local = threading.local()
        self._init_db()
    
    def _get_connection(self) -> sqlite3.Connection:
        """Получить соединение для текущего потока."""
        if not hasattr(self._local, 'connection') or self._local.connection is None:
            self._local.connection = sqlite3.connect(self.db_path, check_same_thread=False)
            self._local.connection.row_factory = sqlite3.Row
        return self._local.connection
    
    def _init_db(self):
        """Инициализация схемы БД."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Таблица агентов с токенами
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS agents (
                agent_id TEXT PRIMARY KEY,
                token_hash TEXT NOT NULL,
                hostname TEXT,
                ip_address TEXT,
                version TEXT,
                tags TEXT,  -- JSON массив
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP,
                is_active BOOLEAN DEFAULT 1
            )
        ''')
        
        # Владелец агента. У агентов, созданных до появления владельцев, он NULL: при старте
        # бэкенда их забирает первый аккаунт (см. adopt_orphan_agents).
        agent_columns = {row["name"] for row in conn.execute("PRAGMA table_info(agents)")}
        if "owner_id" not in agent_columns:
            cursor.execute("ALTER TABLE agents ADD COLUMN owner_id INTEGER")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents (owner_id)")

        # Одноразовые ключи регистрации агентов (хранится только хеш)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS enrollment_keys (
                key_hash TEXT PRIMARY KEY,
                owner_id INTEGER NOT NULL,
                label TEXT,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL,
                used_at REAL,
                agent_id TEXT
            )
        ''')
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_enroll_owner ON enrollment_keys (owner_id)")

        # Таблица для rate limiting (опционально)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS rate_limits (
                agent_id TEXT,
                endpoint TEXT,
                timestamp REAL,
                PRIMARY KEY (agent_id, endpoint, timestamp)
            )
        ''')
        
        conn.commit()
        print(f"✅ Auth database initialized: {self.db_path}")
    
    def create_agent(self, agent_id: str, hostname: str = "", ip_address: str = "",
                     version: str = "", tags: list = None,
                     owner_id: Optional[int] = None) -> Optional[str]:
        """
        Создать агента напрямую (без ключа регистрации) и сгенерировать токен.

        Используется тестами и внутренними вызовами; публичная регистрация идёт через
        enroll_agent. Существующего агента НЕ изменяет: возвращает None.

        Returns:
           Plain-текст токен (возвращается только один раз) или None, если agent_id занят.
        """
        token = secrets.token_hex(32)  # 64 символа
        conn = self._get_connection()
        try:
            conn.execute("BEGIN IMMEDIATE")
            if conn.execute("SELECT 1 FROM agents WHERE agent_id = ?", (agent_id,)).fetchone():
                conn.rollback()
                return None
            self._insert_agent(conn, agent_id, _sha256(token), hostname, ip_address, version, tags, owner_id)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        print(f"✅ Agent created: {agent_id} (hostname: {hostname})")
        return token

    @staticmethod
    def _insert_agent(conn, agent_id, token_hash, hostname, ip_address, version, tags, owner_id):
        conn.execute('''
            INSERT INTO agents (agent_id, token_hash, hostname, ip_address, version, tags,
                                last_seen, owner_id)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        ''', (agent_id, token_hash, hostname, ip_address, version, json.dumps(tags or []), owner_id))

    # ------------------------------------------------------------------ enrollment

    def create_enrollment_key(self, owner_id: int, label: Optional[str] = None,
                              ttl_seconds: int = ENROLLMENT_KEY_TTL_SECONDS) -> Tuple[str, float]:
        """Create a one-time key for ``owner_id``. Returns (plain key, expires_at).

        The plain key is returned once and never stored; only its hash is.
        """
        now = time.time()
        key = ENROLLMENT_KEY_PREFIX + secrets.token_urlsafe(24)
        conn = self._get_connection()
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                "DELETE FROM enrollment_keys WHERE COALESCE(used_at, expires_at) < ?",
                (now - ENROLLMENT_KEY_RETENTION_SECONDS,),
            )
            active = conn.execute(
                "SELECT COUNT(*) FROM enrollment_keys WHERE owner_id = ? AND used_at IS NULL AND expires_at > ?",
                (owner_id, now),
            ).fetchone()[0]
            if active >= MAX_ACTIVE_KEYS_PER_OWNER:
                conn.rollback()
                raise TooManyKeysError("Too many unused enrollment keys")
            conn.execute(
                "INSERT INTO enrollment_keys (key_hash, owner_id, label, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
                (_sha256(key), owner_id, label, now, now + ttl_seconds),
            )
            conn.commit()
        except TooManyKeysError:
            raise
        except Exception:
            conn.rollback()
            raise
        return key, now + ttl_seconds

    def enroll_agent(self, enrollment_key: str, agent_id: str, hostname: str = "",
                     ip_address: str = "", version: str = "", tags: list = None) -> str:
        """Consume a key and create the agent it authorises, atomically.

        The agent belongs to the key's owner. Raises InvalidEnrollmentKeyError (unknown,
        used or expired key) or AgentExistsError (agent_id taken). On AgentExistsError the key
        is NOT consumed and the existing agent is left completely untouched.
        """
        now = time.time()
        token = secrets.token_hex(32)
        conn = self._get_connection()
        try:
            conn.execute("BEGIN IMMEDIATE")
            key_hash = _sha256(enrollment_key)
            row = conn.execute(
                "SELECT owner_id FROM enrollment_keys WHERE key_hash = ? AND used_at IS NULL AND expires_at > ?",
                (key_hash, now),
            ).fetchone()
            if row is None:
                conn.rollback()
                raise InvalidEnrollmentKeyError("Invalid or expired enrollment key")
            if conn.execute("SELECT 1 FROM agents WHERE agent_id = ?", (agent_id,)).fetchone():
                conn.rollback()
                raise AgentExistsError(agent_id)
            self._insert_agent(conn, agent_id, _sha256(token), hostname, ip_address, version, tags, row["owner_id"])
            conn.execute(
                "UPDATE enrollment_keys SET used_at = ?, agent_id = ? WHERE key_hash = ?",
                (now, agent_id, key_hash),
            )
            conn.commit()
        except (InvalidEnrollmentKeyError, AgentExistsError):
            raise
        except Exception:
            conn.rollback()
            raise
        print(f"✅ Agent enrolled: {agent_id} (hostname: {hostname})")
        return token

    # ------------------------------------------------------------------ ownership

    def get_agent_owner(self, agent_id: str) -> Optional[int]:
        row = self._get_connection().execute(
            "SELECT owner_id FROM agents WHERE agent_id = ?", (agent_id,)
        ).fetchone()
        return row["owner_id"] if row else None

    def agent_ids_for_owner(self, owner_id: int) -> Set[str]:
        rows = self._get_connection().execute(
            "SELECT agent_id FROM agents WHERE owner_id = ?", (owner_id,)
        ).fetchall()
        return {r["agent_id"] for r in rows}

    def delete_agent(self, agent_id: str, owner_id: int) -> bool:
        """Delete an agent the caller owns (revokes its token). False if not found or not theirs."""
        conn = self._get_connection()
        cursor = conn.execute("DELETE FROM agents WHERE agent_id = ? AND owner_id = ?", (agent_id, owner_id))
        conn.execute("DELETE FROM rate_limits WHERE agent_id = ?", (agent_id,))
        conn.commit()
        return cursor.rowcount > 0

    def adopt_orphan_agents(self, owner_id: int) -> int:
        """Give agents that predate ownership to ``owner_id``. Idempotent."""
        conn = self._get_connection()
        cursor = conn.execute("UPDATE agents SET owner_id = ? WHERE owner_id IS NULL", (owner_id,))
        conn.commit()
        return cursor.rowcount

    def verify_token(self, agent_id: str, token: str) -> bool:
        """
        Проверить токен агента.
        
        Returns:
            True если токен валиден, False иначе
        """
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT agent_id, token_hash, is_active, last_seen 
            FROM agents 
            WHERE agent_id = ? AND token_hash = ? AND is_active = 1
        ''', (agent_id, token_hash))
        
        row = cursor.fetchone()
        
        if not row:
            return False
        
        # Обновляем last_seen при успешной проверке
        cursor.execute('''
            UPDATE agents SET last_seen = CURRENT_TIMESTAMP 
            WHERE agent_id = ?
        ''', (agent_id,))
        conn.commit()
        
        return True
    
    def get_agent(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Получить информацию об агенте."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT agent_id, hostname, ip_address, version, tags, 
                   created_at, last_seen, is_active, owner_id
            FROM agents 
            WHERE agent_id = ?
        ''', (agent_id,))
        
        row = cursor.fetchone()
        if not row:
            return None
        
        return {
            "agent_id": row["agent_id"],
            "hostname": row["hostname"],
            "ip_address": row["ip_address"],
            "version": row["version"],
            "tags": row["tags"],
            "created_at": row["created_at"],
            "last_seen": row["last_seen"],
            "is_active": bool(row["is_active"]),
            "owner_id": row["owner_id"],
        }
    
    def list_agents(self, active_only: bool = False, owner_id: Optional[int] = None) -> list:
        """Получить список агентов (всех или только владельца)."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        query = '''
            SELECT agent_id, hostname, ip_address, version, tags, 
                   created_at, last_seen, is_active
            FROM agents
        '''
        conditions, params = [], []
        if active_only:
            conditions.append("is_active = 1")
        if owner_id is not None:
            conditions.append("owner_id = ?")
            params.append(owner_id)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        return [{
            "agent_id": row["agent_id"],
            "hostname": row["hostname"],
            "ip_address": row["ip_address"],
            "version": row["version"],
            "tags": row["tags"],
            "created_at": row["created_at"],
            "last_seen": row["last_seen"],
            "is_active": bool(row["is_active"])
        } for row in rows]
    
    def deactivate_agent(self, agent_id: str) -> bool:
        """Деактивировать агента (отозвать токен)."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE agents SET is_active = 0 WHERE agent_id = ?
        ''', (agent_id,))
        
        conn.commit()
        return cursor.rowcount > 0
    
    def record_request(self, agent_id: str, endpoint: str):
        """Записать запрос для rate limiting."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        timestamp = datetime.now().timestamp()
        
        # Удаляем старые записи (старше 1 минуты)
        cursor.execute('''
            DELETE FROM rate_limits 
            WHERE timestamp < ?
        ''', (timestamp - 60,))
        
        # Записываем текущий запрос
        cursor.execute('''
            INSERT OR IGNORE INTO rate_limits (agent_id, endpoint, timestamp)
            VALUES (?, ?, ?)
        ''', (agent_id, endpoint, timestamp))
        
        conn.commit()
    
    def check_rate_limit(self, agent_id: str, endpoint: str, 
                         max_requests: int = 60) -> bool:
        """
        Проверить rate limit для агента.
        
        Returns:
            True если лимит не превышен, False иначе
        """
        conn = self._get_connection()
        cursor = conn.cursor()
        
        timestamp = datetime.now().timestamp()
        minute_ago = timestamp - 60
        
        cursor.execute('''
            SELECT COUNT(*) as count
            FROM rate_limits
            WHERE agent_id = ? AND endpoint = ? AND timestamp > ?
        ''', (agent_id, endpoint, minute_ago))
        
        row = cursor.fetchone()
        count = row["count"] if row else 0
        
        return count < max_requests


# Глобальный экземпляр БД
auth_db = AgentAuthDB()


def verify_agent_token(agent_id: str, token: str) -> bool:
    """Проверить токен агента."""
    return auth_db.verify_token(agent_id, token)


def create_agent_token(agent_id: str, hostname: str = "", ip_address: str = "",
                       version: str = "", tags: list = None,
                       owner_id: Optional[int] = None) -> Optional[str]:
    """Создать агента напрямую и вернуть токен (None, если agent_id занят)."""
    return auth_db.create_agent(agent_id, hostname, ip_address, version, tags, owner_id)


def get_agent_info(agent_id: str) -> Optional[Dict[str, Any]]:
    """Получить информацию об агенте."""
    return auth_db.get_agent(agent_id)
