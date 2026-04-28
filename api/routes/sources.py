# api/routes/sources.py
"""
File source upload endpoint.

POST /sources/upload  — upload a CSV/TSV/Parquet file
                        returns a connection_id that works with all existing
                        /query, /schema, /semantic endpoints unchanged.

The uploaded file is stored at data/uploads/{user_id}/{file_id}.{ext}
A synthetic connection record is written to connectors/store.py with
db_type = "duckdb" so downstream code can route to the right connector.
"""
from __future__ import annotations
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from auth.jwt import get_current_user
from connectors.duckdb import get_upload_path, validate_file_type, extract_schema_from_file
from connectors.store import save_connection

router = APIRouter(prefix="/sources", tags=["sources"])

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB


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
            detail=f"File exceeds 100 MB limit",
        )

    file_id   = str(uuid.uuid4())
    file_path = get_upload_path(user_id, file_id, file.filename or "upload.csv")
    file_path.write_bytes(content)

    # Extract schema so we can confirm the file is readable before returning
    original_stem = Path(file.filename or "upload").stem
    try:
        schema = extract_schema_from_file(str(file_path), display_name=original_stem)
    except Exception as e:
        file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not parse file: {e}",
        )

    # Register as a connection so /query/{id}, /schema/{id}, etc. all work
    connection_id = str(uuid.uuid4())
    save_connection(connection_id, {
        "db_type":       "duckdb",
        "file_path":     str(file_path),
        "original_name": file.filename,
        "user_id":       user_id,
        "file_id":       file_id,
    })

    table_name  = list(schema.keys())[0]
    row_count   = schema[table_name]["row_count"]
    col_count   = len(schema[table_name]["columns"])

    return {
        "connection_id":   connection_id,
        "file_id":         file_id,
        "original_name":   file.filename,
        "table_name":      table_name,
        "row_count":       row_count,
        "column_count":    col_count,
        "columns":         [c["name"] for c in schema[table_name]["columns"]],
    }
