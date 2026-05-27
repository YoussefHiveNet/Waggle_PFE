# api/routes/source_groups.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth.jwt import get_current_user
from auth.db import (
    create_source_group, list_source_groups, delete_source_group,
    get_source_for_user, create_source, delete_source,
)

router = APIRouter(prefix="/source-groups", tags=["source-groups"])


class SourceGroupCreate(BaseModel):
    label: str
    source_ids: list[str]
    link_ids: list[str]
    links: list[dict]  # full link objects resolved by the frontend


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_group(
    body: SourceGroupCreate,
    user_id: str = Depends(get_current_user),
):
    # Verify caller owns all component sources
    component_sources = []
    for sid in body.source_ids:
        src = await get_source_for_user(sid, user_id)
        if not src:
            raise HTTPException(status_code=404, detail=f"Source {sid} not found")
        component_sources.append({
            "connection_id": sid,
            "source_type":   src["source_type"],
            "config":        src["config"],
            "alias":         src["label"].replace(" ", "_").lower(),
        })

    # Build combined source config
    config = {
        "component_sources": component_sources,
        "links": body.links,
    }

    # Create the sources row so it appears in the sidebar
    combined_source = await create_source(
        user_id=user_id,
        label=body.label,
        source_type="combined",
        config=config,
    )

    # Record the group
    group = await create_source_group(
        user_id=user_id,
        label=body.label,
        source_ids=body.source_ids,
        link_ids=body.link_ids,
        source_id=combined_source["id"],
    )
    group["source"] = combined_source
    return group


@router.get("")
async def list_groups(user_id: str = Depends(get_current_user)):
    return await list_source_groups(user_id)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_group(
    group_id: str,
    user_id: str = Depends(get_current_user),
):
    deleted = await delete_source_group(group_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Source group not found")

    # Also remove the combined source so it disappears from the sidebar
    if deleted.get("source_id"):
        await delete_source(deleted["source_id"], user_id)
