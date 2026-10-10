"""
User authentication router.

Endpoints:
- POST /api/v1/auth/register - создать аккаунт
- POST /api/v1/auth/login - войти, получить токен сессии
- POST /api/v1/auth/logout - выйти (инвалидировать сессию)
- GET  /api/v1/auth/me - данные текущего пользователя по токену сессии
"""

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from typing import Optional

from ..user_auth import user_auth_db, UserExistsError, InvalidCredentialsError, ValidationError

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    email: str
    password: str = Field(..., min_length=8)


class LoginRequest(BaseModel):
    username_or_email: str
    password: str


@router.post("/register")
async def register(request: RegisterRequest):
    try:
        user = user_auth_db.register(request.username, request.email, request.password)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except UserExistsError as e:
        raise HTTPException(status_code=409, detail=str(e))

    token = user_auth_db.create_session(user["id"])
    return {"token": token, "user": user}


@router.post("/login")
async def login(request: LoginRequest):
    try:
        user = user_auth_db.authenticate(request.username_or_email, request.password)
    except InvalidCredentialsError as e:
        raise HTTPException(status_code=401, detail=str(e))

    token = user_auth_db.create_session(user["id"])
    return {"token": token, "user": user}


@router.post("/logout")
async def logout(x_user_token: Optional[str] = Header(None)):
    if x_user_token:
        user_auth_db.delete_session(x_user_token)
    return {"status": "ok"}


@router.get("/me")
async def me(x_user_token: Optional[str] = Header(None)):
    user = user_auth_db.get_user_by_session(x_user_token) if x_user_token else None
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    return {"user": user}
