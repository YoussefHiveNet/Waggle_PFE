# api/routes/artifacts.py
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth.jwt import get_current_user
from auth.db import create_artifact, list_artifacts, get_artifact, update_artifact, delete_artifact

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


def _serialize(row: dict) -> dict:
    """Convert UUID and datetime fields to JSON-safe strings."""
    result = {}
    for k, v in row.items():
        if hasattr(v, "isoformat"):
            result[k] = v.isoformat()
        elif hasattr(v, "__str__") and type(v).__name__ in ("UUID",):
            result[k] = str(v)
        else:
            result[k] = v
    return result


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
