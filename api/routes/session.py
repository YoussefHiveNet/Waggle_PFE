# api/routes/session.py
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from agent.session import create_session, get_session, list_sessions
from api._deps import require_source
from auth.jwt import get_current_user
from connectors.store import get_source_for_user

router = APIRouter()


class CreateSessionRequest(BaseModel):
    connection_id: str


@router.post("/session")
async def new_session(
    body: CreateSessionRequest,
    user_id: str = Depends(get_current_user),
):
    """Create a new conversation session for a source the caller owns."""
    source = await get_source_for_user(body.connection_id, user_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    session = create_session(body.connection_id)
    return session.summary()


@router.get("/session/{session_id}")
async def get_session_info(
    session_id: str,
    user_id: str = Depends(get_current_user),
):
    """Get session info and full message history (only if you own its source)."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    source = await get_source_for_user(session.connection_id, user_id)
    if not source:
        # Don't reveal that the session exists for someone else's source
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        **session.summary(),
        "messages": session.messages(),
    }


@router.get("/sessions")
async def sessions(
    connection_id: Optional[str] = None,
    user_id: str = Depends(get_current_user),
):
    """List sessions for a source the caller owns."""
    if not connection_id:
        raise HTTPException(
            status_code=400,
            detail="connection_id is required",
        )
    source = await get_source_for_user(connection_id, user_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"sessions": list_sessions(connection_id)}
