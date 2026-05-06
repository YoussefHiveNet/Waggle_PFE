# api/routes/sources.py
"""
Source management endpoints.

A "source" is anything the user can query — an uploaded file (DuckDB) or a
connected Postgres database. Both live in waggle_app.sources, owned by user.

Routes:
  POST   /sources/upload   — upload CSV/TSV/Parquet/JSON, returns connection_id
  GET    /sources          — list the caller's sources
  GET    /sources/{id}     — single source (no secrets)
  PATCH  /sources/{id}     — rename
  DELETE /sources/{id}     — remove
"""
from __future__ import annotations
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from auth.jwt import get_current_user
from connectors.duckdb import (
    extract_schema_from_file, get_upload_path, validate_file_type,
)
from connectors.store import (
    save_source, get_source_for_user, list_sources_for_user,
    rename_source_for_user, delete_source_for_user,
)

router = APIRouter(prefix="/sources", tags=["sources"])

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB


# ── DTOs ──────────────────────────────────────────────────────────────────────

class SourceSummary(BaseModel):
    connection_id: str
    label:         str
    source_type:   str
    created_at:    str
    # Optional metadata surfaced for nicer UI; depends on type
    table_name:    Optional[str] = None
    original_name: Optional[str] = None
    database:      Optional[str] = None
    host:          Optional[str] = None


class RenameRequest(BaseModel):
    label: str


def _summarize(source: dict) -> SourceSummary:
    cfg = source["config"] or {}
    return SourceSummary(
        connection_id=source["id"],
        label=source["label"],
        source_type=source["source_type"],
        created_at=str(source["created_at"]),
        table_name=cfg.get("table_name"),
        original_name=cfg.get("original_name"),
        database=cfg.get("database"),
        host=cfg.get("host"),
    )


# ── ROUTES ────────────────────────────────────────────────────────────────────

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
):
    if not validate_file_type(file.filename or ""):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unsupported file type. Accepted: .csv, .tsv, .parquet, .json",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds 100 MB limit",
        )

    file_id   = str(uuid.uuid4())
    file_path = get_upload_path(user_id, file_id, file.filename or "upload.csv")
    file_path.write_bytes(content)

    original_stem = Path(file.filename or "upload").stem
    try:
        schema = extract_schema_from_file(str(file_path), display_name=original_stem)
    except Exception as e:
        file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not parse file: {e}",
        )

    table_name = list(schema.keys())[0]
    source = await save_source(
        user_id=user_id,
        label=file.filename or original_stem,
        source_type="duckdb",
        config={
            "file_path":     str(file_path),
            "original_name": file.filename,
            "file_id":       file_id,
            "table_name":    table_name,
        },
    )

    row_count = schema[table_name]["row_count"]
    col_count = len(schema[table_name]["columns"])

    return {
        "connection_id": source["id"],
        "label":         source["label"],
        "source_type":   source["source_type"],
        "table_name":    table_name,
        "row_count":     row_count,
        "column_count":  col_count,
        "columns":       [c["name"] for c in schema[table_name]["columns"]],
    }


@router.get("", response_model=list[SourceSummary])
async def list_sources(user_id: str = Depends(get_current_user)):
    rows = await list_sources_for_user(user_id)
    return [_summarize(r) for r in rows]


@router.get("/{connection_id}", response_model=SourceSummary)
async def get_source_route(
    connection_id: str,
    user_id: str = Depends(get_current_user),
):
    source = await get_source_for_user(connection_id, user_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return _summarize(source)


@router.patch("/{connection_id}", response_model=SourceSummary)
async def rename_source_route(
    connection_id: str,
    body: RenameRequest,
    user_id: str = Depends(get_current_user),
):
    label = body.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="Label cannot be empty")
    updated = await rename_source_for_user(connection_id, user_id, label)
    if not updated:
        raise HTTPException(status_code=404, detail="Source not found")
    return _summarize(updated)


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source_route(
    connection_id: str,
    user_id: str = Depends(get_current_user),
):
    # Best-effort cleanup of cached schema and uploaded file
    source = await get_source_for_user(connection_id, user_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    if source["source_type"] == "duckdb":
        fp = source["config"].get("file_path")
        if fp:
            Path(fp).unlink(missing_ok=True)

    schema_cache = Path("data/schemas") / f"{connection_id}.json"
    schema_cache.unlink(missing_ok=True)

    await delete_source_for_user(connection_id, user_id)
    return None
