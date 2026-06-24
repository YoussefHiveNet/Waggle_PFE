# api/routes/artifacts.py
from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
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
    dashboard_id:     Optional[str] = None
    cached_data:      Optional[list[dict]] = None

class ArtifactUpdate(BaseModel):
    name:             Optional[str]  = None
    question:         Optional[str]  = None
    sql:              Optional[str]  = None
    artifact_type:    Optional[str]  = None
    style_config:     Optional[dict] = None
    refresh_schedule: Optional[str]  = None
    dashboard_id:     Optional[str]  = None
    layout:           Optional[dict] = None


# Row serialization lives in util.serialize — single source of truth for
# converting asyncpg rows (Decimal, date, UUID, …) to JSON-safe dicts.
# We additionally decode JSONB columns that asyncpg returns as strings,
# so the frontend gets real objects/arrays for style_config, layout, and cached_data.
_JSONB_FIELDS = ("style_config", "layout", "cached_data")


def _serialize(row: dict) -> dict:
    d = serialize_row(row)
    for field in _JSONB_FIELDS:
        v = d.get(field)
        if isinstance(v, str):
            try:
                d[field] = json.loads(v)
            except Exception:
                pass
    return d


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
        dashboard_id  = body.dashboard_id,
        cached_data   = body.cached_data,
    )
    return _serialize(artifact)


@router.get("")
async def get_artifacts(
    user_id: str = Depends(get_current_user),
    dashboard_id: Optional[str] = Query(None),
):
    rows = await list_artifacts(user_id, dashboard_id=dashboard_id)
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
    # exclude_unset → only fields the client explicitly sent get updated.
    # This lets the client pass empty strings (e.g. refresh_schedule="") to
    # clear values without accidentally clearing fields they didn't touch.
    updated = await update_artifact(
        artifact_id, user_id,
        **body.model_dump(exclude_unset=True),
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

    # Static artifact (schema list, etc.): return the stored rows directly,
    # no source DB touched, no LLM, no SQL.
    if art.get("cached_data") is not None:
        rows = art["cached_data"]
        # asyncpg returns JSONB as a string by default — decode if needed
        if isinstance(rows, str):
            rows = json.loads(rows)
        last = art.get("updated_at") or art.get("created_at")
        return {
            "data": rows,
            "row_count": len(rows),
            "last_refreshed": last.isoformat() if hasattr(last, "isoformat") else last,
        }

    src = await get_source_for_user(art["connection_id"], user_id)
    if not src:
        raise HTTPException(status_code=404, detail="Source not found")

    if src["source_type"] == "postgres":
        fetch_fn = _pg_fetch
    elif src["source_type"] == "duckdb":
        fetch_fn = _duck_fetch
    elif src["source_type"] == "combined":
        from connectors.merged import fetch_with_config as _merged_fetch
        fetch_fn = _merged_fetch
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported source type: {src['source_type']}")
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
