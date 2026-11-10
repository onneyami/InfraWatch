"""
User authentication router.

Endpoints:
- GET  /api/v1/auth/status   - is sign-up open / is first-run setup required (public)
- POST /api/v1/auth/register - create an account and sign in
- POST /api/v1/auth/login    - sign in
- POST /api/v1/auth/logout   - sign out (idempotent)
- GET  /api/v1/auth/me       - the signed-in user, or 401

The session token travels only in an HttpOnly cookie. It is never returned in a response
body, so page JavaScript (and therefore an XSS bug) cannot read it. See middleware.py for
how the cookie is enforced on every other route and for the CSRF rule.
"""

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from ..core.config import ALLOW_REGISTRATION, COOKIE_SECURE, SESSION_COOKIE_NAME
from ..login_throttle import FailureThrottle
from ..user_auth import (
    SESSION_TTL_SECONDS,
    InvalidCredentialsError,
    RegistrationClosedError,
    UserExistsError,
    ValidationError,
    user_auth_db,
)

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])

# The cookie is only needed by the API, so do not send it with any other path.
COOKIE_PATH = "/api"

# Failures allowed per 15-minute window before further attempts get 429.
LOGIN_LIMITS = {"ip": 10, "id": 20}
REGISTER_LIMIT_PER_IP = 10  # attempts per hour

login_throttle = FailureThrottle(window_seconds=15 * 60)
register_throttle = FailureThrottle(window_seconds=60 * 60)


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    email: str = Field(..., max_length=254)
    # The upper bound matters: PBKDF2 cost grows with input size, so an unbounded password
    # would let anyone burn CPU with a single large request.
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    username_or_email: str = Field(..., max_length=254)
    password: str = Field(..., max_length=128)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        path=COOKIE_PATH,
    )
    response.headers["Cache-Control"] = "no-store"


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        path=COOKIE_PATH,
    )
    response.headers["Cache-Control"] = "no-store"


def _too_many(retry_after: int) -> HTTPException:
    return HTTPException(
        status_code=429,
        detail="Too many attempts. Try again later.",
        headers={"Retry-After": str(retry_after)},
    )


@router.get("/status")
async def auth_status():
    """Public: lets the UI show the right screen before anyone is signed in."""
    setup_required = await run_in_threadpool(user_auth_db.count_users) == 0
    return {
        "setup_required": setup_required,
        "registration_open": setup_required or ALLOW_REGISTRATION,
    }


@router.post("/register")
async def register(body: RegisterRequest, request: Request, response: Response):
    ip_key = f"ip:{_client_ip(request)}"
    retry = register_throttle.retry_after([(ip_key, REGISTER_LIMIT_PER_IP)])
    if retry:
        raise _too_many(retry)
    # Every attempt counts (not only failures), so sign-up cannot be used to hammer the DB.
    register_throttle.record_failure([ip_key])

    try:
        user = await run_in_threadpool(
            user_auth_db.register,
            body.username,
            body.email,
            body.password,
            allow_additional=ALLOW_REGISTRATION,
        )
    except RegistrationClosedError:
        raise HTTPException(
            status_code=403,
            detail="Registration is closed. Ask an administrator to create your account.",
        )
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except UserExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))

    token = await run_in_threadpool(user_auth_db.create_session, user["id"])
    _set_session_cookie(response, token)
    return {"user": user}


@router.post("/login")
async def login(body: LoginRequest, request: Request, response: Response):
    ip_key = f"ip:{_client_ip(request)}"
    id_key = f"id:{body.username_or_email.strip().lower()}"

    retry = login_throttle.retry_after(
        [(ip_key, LOGIN_LIMITS["ip"]), (id_key, LOGIN_LIMITS["id"])]
    )
    if retry:
        raise _too_many(retry)

    try:
        user = await run_in_threadpool(
            user_auth_db.authenticate, body.username_or_email, body.password
        )
    except InvalidCredentialsError as e:
        login_throttle.record_failure([ip_key, id_key])
        raise HTTPException(status_code=401, detail=str(e))

    login_throttle.reset([id_key])

    # Never reuse a pre-login session: end the old one, issue a fresh token.
    await run_in_threadpool(user_auth_db.delete_session, request.cookies.get(SESSION_COOKIE_NAME))
    token = await run_in_threadpool(user_auth_db.create_session, user["id"])
    _set_session_cookie(response, token)
    return {"user": user}


@router.post("/logout")
async def logout(request: Request, response: Response):
    await run_in_threadpool(user_auth_db.delete_session, request.cookies.get(SESSION_COOKIE_NAME))
    _clear_session_cookie(response)
    return {"status": "ok"}


@router.get("/me")
async def me(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE_NAME)
    user = await run_in_threadpool(user_auth_db.get_user_by_session, token)
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    response.headers["Cache-Control"] = "no-store"
    return {"user": user}
