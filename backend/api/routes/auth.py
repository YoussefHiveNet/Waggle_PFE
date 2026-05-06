# api/routes/auth.py
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, HTTPException, Response, status
from pydantic import BaseModel, EmailStr

from auth.password import hash_password, verify_password
from auth.jwt import create_access_token, create_refresh_token, get_current_user, REFRESH_TTL
from auth.db import (
    create_user, get_user_by_email, get_user_by_id,
    store_refresh_token, get_refresh_token, delete_refresh_token, delete_user_refresh_tokens
)

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_NAME = "waggle_refresh"


# ── SCHEMAS ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email:    EmailStr
    password: str

class LoginRequest(BaseModel):
    email:    EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"


# ── HELPERS ───────────────────────────────────────────────────────────────────

def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=False,   # set True in production (HTTPS)
        samesite="lax",
        max_age=int(REFRESH_TTL.total_seconds()),
        path="/auth/refresh",
    )


# ── ENDPOINTS ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, response: Response):
    existing = await get_user_by_email(body.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    if len(body.password) < 8:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Password must be at least 8 characters")

    user          = await create_user(body.email, hash_password(body.password))
    user_id       = str(user["id"])
    access_token  = create_access_token(user_id)
    refresh_token = create_refresh_token()
    expires_at    = datetime.now(timezone.utc) + REFRESH_TTL

    await store_refresh_token(refresh_token, user_id, expires_at)
    _set_refresh_cookie(response, refresh_token)

    return TokenResponse(access_token=access_token)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, response: Response):
    user = await get_user_by_email(body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    user_id       = str(user["id"])
    access_token  = create_access_token(user_id)
    refresh_token = create_refresh_token()
    expires_at    = datetime.now(timezone.utc) + REFRESH_TTL

    await store_refresh_token(refresh_token, user_id, expires_at)
    _set_refresh_cookie(response, refresh_token)

    return TokenResponse(access_token=access_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(response: Response, waggle_refresh: Optional[str] = Cookie(default=None)):
    if not waggle_refresh:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")

    record = await get_refresh_token(waggle_refresh)
    if not record:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    if record["expires_at"] < datetime.now(timezone.utc):
        await delete_refresh_token(waggle_refresh)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    # Rotate: delete old, issue new
    await delete_refresh_token(waggle_refresh)
    user_id       = str(record["user_id"])
    access_token  = create_access_token(user_id)
    new_refresh   = create_refresh_token()
    expires_at    = datetime.now(timezone.utc) + REFRESH_TTL

    await store_refresh_token(new_refresh, user_id, expires_at)
    _set_refresh_cookie(response, new_refresh)

    return TokenResponse(access_token=access_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, waggle_refresh: Optional[str] = Cookie(default=None)):
    if waggle_refresh:
        await delete_refresh_token(waggle_refresh)
    response.delete_cookie(key=COOKIE_NAME, path="/auth/refresh")


@router.get("/me")
async def me(user_id: str = __import__("fastapi").Depends(get_current_user)):
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": str(user["id"]), "email": user["email"], "created_at": user["created_at"]}
