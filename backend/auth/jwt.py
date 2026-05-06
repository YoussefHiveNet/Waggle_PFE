# auth/jwt.py
from __future__ import annotations
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import AuthConfig

_bearer = HTTPBearer(auto_error=False)

ACCESS_TTL  = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=7)


def create_access_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub":  user_id,
        "iat":  now,
        "exp":  now + ACCESS_TTL,
        "type": "access",
    }
    return jwt.encode(payload, AuthConfig.secret_key, algorithm=AuthConfig.algorithm)


def create_refresh_token() -> str:
    """Opaque UUID — stored server-side, not a JWT."""
    return str(uuid.uuid4())


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, AuthConfig.secret_key, algorithms=[AuthConfig.algorithm])
        if payload.get("type") != "access":
            raise JWTError("wrong token type")
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> str:
    """FastAPI dependency — returns user_id from Bearer token."""
    if not creds:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_access_token(creds.credentials)
    return payload["sub"]
