# api/routes/artifacts.py
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth.jwt import get_current_user
from auth.db import (
    create_artifact, list_artifacts, get_artifact, update_artifact,
    delete_artifact, touch_artifact_last_refreshed,
)
from connectors.store import get_source_for_user
from connectors.postgres import fetch_with_config as _pg_fetch
from connectors.duckdb import fetch_with_config as _duck_fetch
from util.serialize import serialize_row, serialize_rows

router = APIRouter(prefix="/artifacts", tags=["artifacts"])


# ── SCHEMAS ───────────────────────────────────────────────────────────────────

class ArtifactCreate(BaseModel):
    connection_id:    str
    name:             str
    question:         str
    sql:              str
    artifact_type:    str = "table"
    style_config:     dict = {}
    refresh_schedule: str = "daily"

class ArtifactUpdate(BaseModel):
    name:             Optional[str]  = None
    question:         Optional[str]  = None
    sql:              Optional[str]  = None
    artifact_type:    Optional[str]  = None
    style_config:     Optional[dict] = None
    refresh_schedule: Optional[str]  = None


# Row serialization lives in util.serialize — single source of truth for
# converting asyncpg rows (Decimal, date, UUID, …) to JSON-safe dicts.
_serialize = serialize_row


# ── ENDPOINTS ─────────────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED)
async def save_artifact(
    body: ArtifactCreate,
    user_id: str = Depends(get_current_user)
):
    artifact = await create_artifact(
        user_id       = user_id,
        connection_id = body.connection_id,
        name          = body.name,
        question      = body.question,
        sql           = body.sql,
        artifact_type = body.artifact_type,
        style_config  = body.style_config,
        refresh_schedule = body.refresh_schedule,
    )
    return _serialize(artifact)


@router.get("")
async def get_artifacts(user_id: str = Depends(get_current_user)):
    rows = await list_artifacts(user_id)
    return [_serialize(r) for r in rows]


@router.get("/{artifact_id}")
async def get_one_artifact(artifact_id: str, user_id: str = Depends(get_current_user)):
    artifact = await get_artifact(artifact_id, user_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return _serialize(artifact)


@router.put("/{artifact_id}")
async def edit_artifact(
    artifact_id: str,
    body: ArtifactUpdate,
    user_id: str = Depends(get_current_user)
):
    updated = await update_artifact(
        artifact_id, user_id,
        **{k: v for k, v in body.model_dump().items() if v is not None}
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return _serialize(updated)


@router.delete("/{artifact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_artifact(artifact_id: str, user_id: str = Depends(get_current_user)):
    ok = await delete_artifact(artifact_id, user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Artifact not found")


@router.post("/{artifact_id}/execute")
async def execute_artifact(
    artifact_id: str,
    user_id: str = Depends(get_current_user),
):
    """
    Run the artifact's stored SQL directly — no LLM, no validation pipeline.
    On failure (schema drift, bad SQL) returns 422 so the frontend can fall
    back to /query/{connection_id}, which regenerates the SQL via the LLM.
    """
    art = await get_artifact(artifact_id, user_id)
    if not art:
        raise HTTPException(status_code=404, detail="Artifact not found")
    src = await get_source_for_user(art["connection_id"], user_id)
    if not src:
        raise HTTPException(status_code=404, detail="Source not found")

    fetch_fn = _pg_fetch if src["source_type"] == "postgres" else _duck_fetch
    try:
        rows = await fetch_fn(src["config"], art["sql"])
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"SQL execution failed: {e}")

    rows = serialize_rows(rows)
    await touch_artifact_last_refreshed(artifact_id, user_id)
    return {
        "data": rows,
        "row_count": len(rows),
        "last_refreshed": datetime.now(timezone.utc).isoformat(),
    }
