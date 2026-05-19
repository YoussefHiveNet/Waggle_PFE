# api/routes/dashboards.py
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth.jwt import get_current_user
from auth.db import create_dashboard, list_dashboards, rename_dashboard, delete_dashboard
from util.serialize import serialize_row

router = APIRouter(prefix="/dashboards", tags=["dashboards"])


class DashboardCreate(BaseModel):
    connection_id: str
    name: str = "Dashboard"

class DashboardRename(BaseModel):
    name: str


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_dashboard_route(
    body: DashboardCreate,
    user_id: str = Depends(get_current_user),
):
    dashboard = await create_dashboard(user_id, body.connection_id, body.name)
    return serialize_row(dashboard)


@router.get("")
async def list_dashboards_route(
    connection_id: str,
    user_id: str = Depends(get_current_user),
):
    rows = await list_dashboards(user_id, connection_id)
    return [serialize_row(r) for r in rows]


@router.patch("/{dashboard_id}")
async def rename_dashboard_route(
    dashboard_id: str,
    body: DashboardRename,
    user_id: str = Depends(get_current_user),
):
    updated = await rename_dashboard(dashboard_id, user_id, body.name)
    if not updated:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return serialize_row(updated)


@router.delete("/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dashboard_route(
    dashboard_id: str,
    user_id: str = Depends(get_current_user),
):
    ok = await delete_dashboard(dashboard_id, user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Dashboard not found")
