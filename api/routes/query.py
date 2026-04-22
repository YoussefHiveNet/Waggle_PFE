# api/routes/query.py
from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from agent.tools.query_tool import run_query

router = APIRouter()


class QueryRequest(BaseModel):
    question: str


@router.post("/query/{connection_id}")
async def query(connection_id: str, body: QueryRequest):
    """
    Natural language → SQL → validated results.

    Returns:
      sql               — the generated SQL
      data              — list of result rows as dicts
      row_count         — number of rows
      validation_report — checks run, failures, confidence
      confidence        — float 0–1
      attempts          — how many LLM retries were needed
    """
    try:
        result = await run_query(connection_id, body.question)
        if "error" in result:
            raise HTTPException(status_code=422, detail=result)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
