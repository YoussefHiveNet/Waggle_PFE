# api/_deps.py
"""Shared route helpers — keep ownership checks in one place."""
from __future__ import annotations

from fastapi import Depends, HTTPException, status

from auth.jwt import get_current_user
from connectors.store import get_source_for_user


async def require_source(connection_id: str, user_id: str = Depends(get_current_user)) -> dict:
    """
    Resolve a source the caller owns, or 404.

    We return 404 (not 403) on ownership mismatch so we don't leak that the id
    exists at all.
    """
    source = await get_source_for_user(connection_id, user_id)
    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source not found",
        )
    return source
