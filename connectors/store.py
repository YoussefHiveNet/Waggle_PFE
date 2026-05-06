# connectors/store.py
"""
Source registry — thin async facade over auth.db.

A "source" is whatever the user can query: a Postgres connection, an
uploaded CSV/Parquet (DuckDB), or eventually BigQuery. Every source has
an owner; ownership is enforced at the API layer, never inside tools.

Two distinct read paths:
  - get_source(id)               — no auth, used by tools that received an id
                                   the route layer already validated
  - get_source_for_user(id, uid) — used by routes before they hand the id
                                   downstream
"""
from __future__ import annotations

from auth.db import (
    create_source as _create_source,
    get_source as _get_source,
    get_source_for_user as _get_source_for_user,
    list_sources_for_user as _list_sources_for_user,
    rename_source as _rename_source,
    delete_source as _delete_source,
)


async def save_source(
    user_id: str, label: str, source_type: str, config: dict
) -> dict:
    """Create a source for a user. Returns the full row."""
    return await _create_source(user_id, label, source_type, config)


async def get_source(source_id: str) -> dict | None:
    return await _get_source(source_id)


async def get_source_for_user(source_id: str, user_id: str) -> dict | None:
    return await _get_source_for_user(source_id, user_id)


async def list_sources_for_user(user_id: str) -> list[dict]:
    return await _list_sources_for_user(user_id)


async def rename_source_for_user(
    source_id: str, user_id: str, new_label: str
) -> dict | None:
    return await _rename_source(source_id, user_id, new_label)


async def delete_source_for_user(source_id: str, user_id: str) -> bool:
    return await _delete_source(source_id, user_id)
