"""
Middleware для аутентификации и rate limiting.
"""

from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from typing import List
import os

from .auth import verify_agent_token, auth_db
from .core.config import DASHBOARD_API_TOKEN


# Rate limiter
limiter = Limiter(key_func=get_remote_address)


def get_allowed_origins() -> List[str]:
    """
    Получить список разрешённых доменов из переменных окружения.
    
    Переменные:
    - ALLOWED_ORIGINS: comma-separated список доменов
    - ENVIRONMENT: dev/staging/prod (для предустановленных конфигов)
    """
    env = os.getenv("ENVIRONMENT", "dev").lower()
    
    # Предустановленные конфигурации
    predefined = {
        "dev": ["http://localhost:3000", "http://localhost:5173", "http://localhost:5174", "http://localhost:5176"],
        "staging": ["https://staging.ahova.example.com"],
        "prod": ["https://ahova.example.com", "https://app.ahova.example.com"],
    }
    
    # Если есть переменная ALLOWED_ORIGINS - используем её
    custom_origins = os.getenv("ALLOWED_ORIGINS", "")
    if custom_origins:
        return [origin.strip() for origin in custom_origins.split(",") if origin.strip()]
    
    # Иначе используем предустановленную конфигурацию
    return predefined.get(env, predefined["dev"])


async def verify_agent_middleware(request: Request, call_next):
    """
    Middleware для проверки аутентификации.
    
    Поддерживает два типа токенов:
    1. X-Dashboard-Token — для браузерного дашборда (SPA)
    2. X-Agent-ID + X-Agent-Token — для Go-агентов
    
    Публичные пути (без токена):
    - GET /, /docs, /redoc, /openapi.json
    - GET /api/v1/health, /api/v1/system
    - GET /api/v1/docker/images, /api/v1/docker/metrics
    - GET /api/v1/docker/cis/*
    - POST /api/v1/agents/register
    """
    path = request.url.path
    method = request.method
    
    # Публичные пути — доступны без токена
    public_paths = [
        "/",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/api/v1/health",
        "/api/v1/system",
        "/api/v1/docker/images",
        "/api/v1/docker/metrics",
        "/api/v1/docker/cis/scan",
        "/api/v1/docker/cis/categories",
    ]
    
    if path in public_paths:
        return await call_next(request)
    
    # Регистрация агента — доступна без токена (токен выдаётся после)
    if path == "/api/v1/agents/register" and method == "POST":
        return await call_next(request)
    
    # Все остальные /api/v1/ пути требуют аутентификации
    if not path.startswith("/api/v1/"):
        return await call_next(request)
    
    # --- Путь 1: браузерный дашборд (SPA) ---
    # Токен дашборда: обычно приходит в заголовке X-Dashboard-Token, но
    # браузерный EventSource (используется для стриминга логов контейнера)
    # не умеет отправлять кастомные заголовки — поэтому для него же принимаем
    # токен как query-параметр ?dashboard_token=...
    dashboard_token = request.headers.get("X-Dashboard-Token") or request.query_params.get("dashboard_token")
    if dashboard_token and dashboard_token == DASHBOARD_API_TOKEN:
        request.state.agent_id = "__dashboard__"
        auth_db.record_request("__dashboard__", path)
        if not auth_db.check_rate_limit("__dashboard__", path, max_requests=300):
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Rate limit exceeded. Maximum 300 requests per minute."},
            )
        return await call_next(request)

    # --- Путь 2: агент (Go-агент, пушащий свои метрики) ---
    agent_id = request.headers.get("X-Agent-ID")
    agent_token = request.headers.get("X-Agent-Token")

    # Проверяем наличие заголовков
    if not agent_id or not agent_token:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={
                "detail": "Missing authentication headers. Required: X-Dashboard-Token, or X-Agent-ID + X-Agent-Token"
            },
            headers={"WWW-Authenticate": "AgentToken"},
        )
    
    # Проверяем токен
    if not verify_agent_token(agent_id, agent_token):
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Invalid agent token or agent_id"},
            headers={"WWW-Authenticate": "AgentToken"},
        )
    
    # Добавляем agent_id в context запроса
    request.state.agent_id = agent_id
    
    # Записываем запрос для rate limiting
    auth_db.record_request(agent_id, path)
    
    # Проверяем rate limit (60 запросов в минуту на endpoint)
    if not auth_db.check_rate_limit(agent_id, path, max_requests=60):
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"detail": "Rate limit exceeded. Maximum 60 requests per minute."},
        )
    
    return await call_next(request)
