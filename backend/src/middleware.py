"""
Middleware: authentication, CSRF protection and rate limiting.

Access policy (default deny for everything under /api/v1/):

- PUBLIC   reachable without credentials: the health probe, API docs, and the auth
           endpoints (which enforce their own rules: credential checks, throttling,
           registration policy). Agent self-registration is public too, because an agent
           has no token until it registers.
- AGENT    POST /api/v1/metrics only. Requires X-Agent-ID + X-Agent-Token. An agent token
           is NOT accepted anywhere else, so a compromised monitored host cannot read
           dashboard data or run Docker/process actions.
- USER     every other /api/v1/ route. Requires a valid session cookie (HttpOnly, set at
           login by routers/auth_router.py).

CSRF: unsafe requests (POST/PUT/PATCH/DELETE) that carry the session cookie must also send
``X-Requested-With: XMLHttpRequest``. Browsers cannot attach that header cross-site without
passing CORS (see ALLOWED_ORIGINS), and the cookie is SameSite=Lax, so a third-party page
cannot make an authenticated state-changing request.
"""

from typing import List, Optional, Tuple
import os

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette import status
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import JSONResponse

from .auth import verify_agent_token, auth_db
from .core.config import SESSION_COOKIE_NAME
from .user_auth import user_auth_db


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


PUBLIC, AGENT, USER = "public", "agent", "user"

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "XMLHttpRequest"

USER_RATE_LIMIT = 300  # requests per minute, per user and endpoint
AGENT_RATE_LIMIT = 60  # requests per minute, per agent and endpoint

PUBLIC_PATHS = frozenset({"/", "/docs", "/redoc", "/openapi.json", "/api/v1/health"})

# These handlers decide access themselves (credentials, throttling, registration policy).
AUTH_PATHS = frozenset({
    "/api/v1/auth/status",
    "/api/v1/auth/register",
    "/api/v1/auth/login",
    "/api/v1/auth/logout",
    "/api/v1/auth/me",
})

# An agent has no token before it registers.
AGENT_PUBLIC = frozenset({("POST", "/api/v1/agents/register")})

# The only endpoints that accept agent credentials.
AGENT_ROUTES = frozenset({("POST", "/api/v1/metrics")})


def classify(method: str, path: str) -> str:
    """Return which credentials a request needs. Default deny under /api/v1/."""
    if path in PUBLIC_PATHS or path in AUTH_PATHS or (method, path) in AGENT_PUBLIC:
        return PUBLIC
    if (method, path) in AGENT_ROUTES:
        return AGENT
    if path.startswith("/api/v1/"):
        return USER
    return PUBLIC  # non-API paths (e.g. /docs/oauth2-redirect) carry no data


def _error(code: int, detail: str) -> JSONResponse:
    return JSONResponse(status_code=code, content={"detail": detail})


def _authenticate_user(token: Optional[str], path: str) -> Tuple[Optional[dict], bool]:
    """Blocking work (SQLite): resolve the session and apply the per-user rate limit."""
    user = user_auth_db.get_user_by_session(token)
    if user is None:
        return None, False
    key = f"user:{user['id']}"
    auth_db.record_request(key, path)
    within_limit = auth_db.check_rate_limit(key, path, max_requests=USER_RATE_LIMIT)
    return user, not within_limit


def _authenticate_agent(agent_id: str, token: str, path: str) -> Tuple[bool, bool]:
    """Blocking work (SQLite): verify the agent token and apply its rate limit."""
    if not verify_agent_token(agent_id, token):
        return False, False
    auth_db.record_request(agent_id, path)
    within_limit = auth_db.check_rate_limit(agent_id, path, max_requests=AGENT_RATE_LIMIT)
    return True, not within_limit


async def auth_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method
    session_token = request.cookies.get(SESSION_COOKIE_NAME)

    # CSRF: checked before anything else, for every unsafe API request that carries the cookie.
    if (
        path.startswith("/api/v1/")
        and method not in SAFE_METHODS
        and session_token
        and request.headers.get(CSRF_HEADER) != CSRF_VALUE
    ):
        return _error(status.HTTP_403_FORBIDDEN, "Missing CSRF header")

    kind = classify(method, path)

    if kind == PUBLIC:
        return await call_next(request)

    if kind == AGENT:
        agent_id = request.headers.get("X-Agent-ID")
        agent_token = request.headers.get("X-Agent-Token")
        if not agent_id or not agent_token:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Missing authentication headers. Required: X-Agent-ID + X-Agent-Token"},
                headers={"WWW-Authenticate": "AgentToken"},
            )
        valid, limited = await run_in_threadpool(_authenticate_agent, agent_id, agent_token, path)
        if not valid:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Invalid agent token or agent_id"},
                headers={"WWW-Authenticate": "AgentToken"},
            )
        if limited:
            return _error(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Rate limit exceeded. Maximum {AGENT_RATE_LIMIT} requests per minute.",
            )
        request.state.agent_id = agent_id
        return await call_next(request)

    # USER
    user, limited = await run_in_threadpool(_authenticate_user, session_token, path)
    if user is None:
        return _error(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    if limited:
        return _error(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Rate limit exceeded. Maximum {USER_RATE_LIMIT} requests per minute.",
        )
    request.state.user = user
    return await call_next(request)
