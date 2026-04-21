# api/routes/schema.py
from fastapi import APIRouter, HTTPException, Query
from agent.tools.schema_tool import get_schema, format_for_llm

router = APIRouter()

@router.get("/schema/{connection_id}")
async def schema(
    connection_id: str,
    refresh: bool = Query(False, description="Force re-extraction from DB")
):
    try:
        raw = await get_schema(connection_id, force_refresh=refresh)
        return {
            "connection_id": connection_id,
            "tables":        list(raw.keys()),
            "table_count":   len(raw),
            "schema":        raw
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/schema/{connection_id}/llm-context")
async def schema_llm_context(connection_id: str):
    """
    Returns the schema formatted exactly as the LLM will see it.
    Useful for debugging — you can see exactly what context
    the agent is working with.
    """
    try:
        raw = await get_schema(connection_id)
        return {
            "connection_id": connection_id,
            "llm_context":   format_for_llm(raw)
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))