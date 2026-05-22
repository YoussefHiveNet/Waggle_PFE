# api/routes/source_links.py
from __future__ import annotations
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth.jwt import get_current_user
from auth.db import create_source_link, list_source_links, delete_source_link

router = APIRouter(prefix="/source-links", tags=["source-links"])


class SourceLinkCreate(BaseModel):
    source_a_id: str
    table_a:     str
    col_a:       str
    source_b_id: str
    table_b:     str
    col_b:       str
    join_type:   Literal["LEFT", "INNER"] = "LEFT"


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_link(
    body: SourceLinkCreate,
    user_id: str = Depends(get_current_user),
):
    return await create_source_link(
        user_id=user_id,
        source_a_id=body.source_a_id,
        table_a=body.table_a,
        col_a=body.col_a,
        source_b_id=body.source_b_id,
        table_b=body.table_b,
        col_b=body.col_b,
        join_type=body.join_type,
    )


@router.get("")
async def list_links(user_id: str = Depends(get_current_user)):
    return await list_source_links(user_id)


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_link(
    link_id: str,
    user_id: str = Depends(get_current_user),
):
    ok = await delete_source_link(link_id, user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Link not found")
