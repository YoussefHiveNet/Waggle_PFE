# api/routes/connect.py
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.jwt import get_current_user
from connectors.postgres import test_connection
from connectors.store import save_source

router = APIRouter()


class ConnectRequest(BaseModel):
    host:     str
    port:     int = 5432
    user:     str
    password: str
    database: str
    label:    Optional[str] = None  # display name; defaults to database


class ConnectResponse(BaseModel):
    connection_id: str
    label:         str
    source_type:   str
    status:        str
    message:       str


@router.post("/connect", response_model=ConnectResponse)
async def connect(
    req: ConnectRequest,
    user_id: str = Depends(get_current_user),
):
    ok, error = await test_connection(
        host=req.host, port=req.port,
        user=req.user, password=req.password, database=req.database,
    )
    if not ok:
        raise HTTPException(
            status_code=400,
            detail=f"Could not connect to database: {error}",
        )

    label  = req.label or req.database
    source = await save_source(
        user_id=user_id,
        label=label,
        source_type="postgres",
        config={
            "host":     req.host,
            "port":     req.port,
            "user":     req.user,
            "password": req.password,
            "database": req.database,
        },
    )

    return ConnectResponse(
        connection_id=source["id"],
        label=source["label"],
        source_type=source["source_type"],
        status="ok",
        message=f"Connected to {req.database} on {req.host}",
    )
