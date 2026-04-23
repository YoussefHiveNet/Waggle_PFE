# api/routes/session.py
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from agent.session import create_session, get_session, list_sessions

router = APIRouter()

class CreateSessionRequest(BaseModel):
    connection_id: str

@router.post("/session")
async def new_session(body: CreateSessionRequest):
    """Create a new conversation session for a connection."""
    session = create_session(body.connection_id)
    return session.summary()

@router.get("/session/{session_id}")
async def get_session_info(session_id: str):
    """Get session info and full message history."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        **session.summary(),
        "messages": session.messages()
    }

@router.get("/sessions")
async def sessions(connection_id: Optional[str] = None):
    """List all sessions, optionally filtered by connection."""
    return {"sessions": list_sessions(connection_id)}
