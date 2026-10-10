"""
Модуль аутентификации и авторизации для Ahova API.

Хранение токенов агентов в SQLite (переживает рестарт бэкенда).
"""

import sqlite3
import secrets
import hashlib
import os
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from pathlib import Path
import threading

from .core.config import AGENTS_DB_PATH


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
                     version: str = "", tags: list = None) -> str:
        """
        Создать агента и сгенерировать токен.
        
        Returns:
           Plain-текст токен (возвращается только один раз при регистрации)
        """
        # Генерируем случайный токен
        token = secrets.token_hex(32)  # 64 символа
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        
        conn = self._get_connection()
        cursor = conn.cursor()
        
        # Проверяем, существует ли уже агент
        cursor.execute("SELECT agent_id FROM agents WHERE agent_id = ?", (agent_id,))
        existing = cursor.fetchone()
        
        if existing:
            # Агент уже существует - обновляем last_seen и возвращаем ошибку
            # (токен не перевыпускаем для безопасности)
            cursor.execute('''
                UPDATE agents 
                SET last_seen = CURRENT_TIMESTAMP,
                    hostname = ?,
                    ip_address = ?,
                    version = ?
                WHERE agent_id = ?
            ''', (hostname, ip_address, version, agent_id))
            conn.commit()
            return None  # Токен не возвращаем - агент уже зарегистрирован
        
        # Создаём нового агента
        cursor.execute('''
            INSERT INTO agents (agent_id, token_hash, hostname, 
                              ip_address, version, tags, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (agent_id, token_hash, hostname, ip_address, version, 
              str(tags) if tags else "[]"))
        
        conn.commit()
        print(f"✅ Agent created: {agent_id} (hostname: {hostname})")
        
        return token
    
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
                   created_at, last_seen, is_active
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
            "is_active": bool(row["is_active"])
        }
    
    def list_agents(self, active_only: bool = False) -> list:
        """Получить список всех агентов."""
        conn = self._get_connection()
        cursor = conn.cursor()
        
        query = '''
            SELECT agent_id, hostname, ip_address, version, tags, 
                   created_at, last_seen, is_active
            FROM agents
        '''
        
        if active_only:
            query += " WHERE is_active = 1"
        
        cursor.execute(query)
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
                       version: str = "", tags: list = None) -> Optional[str]:
    """Создать агента и вернуть токен."""
    return auth_db.create_agent(agent_id, hostname, ip_address, version, tags)


def get_agent_info(agent_id: str) -> Optional[Dict[str, Any]]:
    """Получить информацию об агенте."""
    return auth_db.get_agent(agent_id)
