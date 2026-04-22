# api/routes/semantic.py
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from agent.tools.semantic_tool import generate_semantic_model
from semantic.engine import SemanticEngine

router  = APIRouter()
_engine = SemanticEngine()

class SemanticGenerateRequest(BaseModel):
    business_rules: Optional[dict] = None

@router.post("/semantic/{connection_id}")
async def generate_semantic(
    connection_id: str,
    body: SemanticGenerateRequest = SemanticGenerateRequest()
):
    """
    Two-phase endpoint:
    Phase 1 — call with no body → returns clarification questions
    Phase 2 — call with business_rules answered → generates YAML model
    """
    try:
        result = await generate_semantic_model(
            connection_id,
            business_rules=body.business_rules
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/semantic/{connection_id}")
async def get_semantic(connection_id: str):
    """Return the current semantic model as the LLM sees it."""
    try:
        model   = _engine.load(connection_id)
        context = _engine.build_llm_context(model)
        return {
            "connection_id": connection_id,
            "cubes":         [c.name for c in model.cubes],
            "llm_context":   context
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))