# api/routes/query.py
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from agent.runtime import run_turn
from agent.session import get_session, create_session

router = APIRouter()

class QueryRequest(BaseModel):
    question:   str
    session_id: Optional[str] = None  # optional — creates new session if absent

@router.post("/query/{connection_id}")
async def query(connection_id: str, body: QueryRequest):
    """
    Main query endpoint.

    Pass session_id to continue a conversation.
    Omit session_id to start a fresh one.

    The agent will:
    1. Decide which tool to call
    2. Execute it
    3. Return a natural language response + raw data
    """
    try:
        # Get or create session
        if body.session_id:
            session = get_session(body.session_id)
            if not session:
                raise HTTPException(
                    status_code=404,
                    detail=f"Session {body.session_id} not found"
                )
        else:
            session = create_session(connection_id)

        # Run the harness loop
        result = await run_turn(session, body.question)

        return {
            "question":   body.question,
            "response":   result["response"],
            "tool_calls": result["tool_calls"],
            "session_id": result["session_id"],
            "tokens_used": result["tokens_used"]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))