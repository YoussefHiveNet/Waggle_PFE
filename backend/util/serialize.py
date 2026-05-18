"""
Row serialization — single source of truth for converting DB rows to
JSON-safe dicts.

asyncpg returns Python types (Decimal, date, datetime, UUID) that
FastAPI's default JSON encoder cannot handle. Every route that returns
DB rows needs to run them through here first.
"""
from __future__ import annotations
import datetime
import decimal
import uuid
from typing import Any


def serialize_value(v: Any) -> Any:
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.isoformat()
    if isinstance(v, uuid.UUID):
        return str(v)
    return v


def serialize_row(row: dict) -> dict:
    return {k: serialize_value(v) for k, v in row.items()}


def serialize_rows(rows: list[dict]) -> list[dict]:
    return [serialize_row(r) for r in rows]
