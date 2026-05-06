# api/routes/query.py
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from agent.runtime import run_turn
from agent.session import get_session, create_session
from api._deps import require_source

router = APIRouter()


class QueryRequest(BaseModel):
    question:   str
    session_id: Optional[str] = None  # creates a new session if absent


@router.post("/query/{connection_id}")
async def query(
    connection_id: str,
    body: QueryRequest,
    source: dict = Depends(require_source),
):
    """
    Send a question. The agent picks a tool, executes it, and synthesizes
    a plain-language answer. Pass session_id to continue a conversation;
    omit to start a fresh one.
    """
    try:
        if body.session_id:
            session = get_session(body.session_id)
            if not session:
                raise HTTPException(404, f"Session {body.session_id} not found")
            if session.connection_id != connection_id:
                raise HTTPException(400, "Session belongs to a different source")
        else:
            session = create_session(connection_id)

        result = await run_turn(session, body.question)

        return {
            "question":    body.question,
            "response":    result["response"],
            "tool_calls":  result["tool_calls"],
            "session_id":  result["session_id"],
            "tokens_used": result["tokens_used"],
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
