# agent/tools/schema_tool.py
from __future__ import annotations
"""
schema_tool.py

Responsible for:
1. Extracting raw schema from a connected DB
2. Formatting it compactly for LLM consumption
3. Caching it so we don't re-query information_schema on every turn
"""
import json
from pathlib import Path
from connectors.postgres import extract_schema
from connectors.duckdb import extract_schema_from_file
from connectors.store import get_source

# Simple file cache — avoids re-extracting on every request
CACHE_DIR = Path("data/schemas")

def _cache_path(connection_id: str) -> Path:
    return CACHE_DIR / f"{connection_id}.json"

def _load_cache(connection_id: str) -> dict | None:
    path = _cache_path(connection_id)
    if path.exists():
        return json.loads(path.read_text())
    return None

def _save_cache(connection_id: str, schema: dict):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _cache_path(connection_id).write_text(
        json.dumps(schema, indent=2, default=str)
    )

async def get_schema(connection_id: str, force_refresh: bool = False) -> dict:
    """
    Get schema for a source. Uses cache unless force_refresh=True.
    Dispatches on source_type so postgres goes through asyncpg
    and duckdb (file uploads) goes through the in-process reader.
    """
    if not force_refresh:
        cached = _load_cache(connection_id)
        if cached:
            return cached

    source = await get_source(connection_id)
    if not source:
        raise ValueError(f"Source {connection_id} not found")

    cfg         = source["config"]
    source_type = source["source_type"]

    if source_type == "duckdb":
        display_name = cfg.get("table_name") or Path(cfg["file_path"]).stem
        schema = extract_schema_from_file(cfg["file_path"], display_name=display_name)
    elif source_type == "postgres":
        schema = await extract_schema(cfg)
    else:
        raise ValueError(f"Unsupported source_type: {source_type}")

    _save_cache(connection_id, schema)
    return schema

def format_for_llm(schema: dict, max_sample_rows: int = 2) -> str:
    """
    Convert raw schema dict into a compact, token-efficient string
    the LLM can use for SQL generation and semantic modeling.

    We deliberately exclude nullability, defaults, and row counts
    from the LLM context — they add tokens without helping SQL gen.
    """
    lines = []

    for table_name, table_data in schema.items():
        lines.append(f"TABLE: {table_name}")

        for col in table_data["columns"]:
            flags = []
            if col["primary_key"]:
                flags.append("PK")
            if col["foreign_key"]:
                fk = col["foreign_key"]
                flags.append(f"FK→{fk['foreign_table']}.{fk['foreign_column']}")

            flag_str = f" [{', '.join(flags)}]" if flags else ""
            lines.append(f"  {col['name']} ({col['type']}){flag_str}")

        # Sample rows help LLM understand actual data values
        if table_data.get("sample_rows") and max_sample_rows > 0:
            samples = table_data["sample_rows"][:max_sample_rows]
            lines.append(f"  Sample: {samples}")

        lines.append("")  # spacing

    return "\n".join(lines)

def get_table_names(schema: dict) -> list[str]:
    return list(schema.keys())

def get_foreign_keys(schema: dict) -> list[dict]:
    """Extract all FK relationships as a flat list."""
    fks = []
    for table, data in schema.items():
        for col in data["columns"]:
            if col["foreign_key"]:
                fks.append({
                    "from_table":  table,
                    "from_column": col["name"],
                    "to_table":    col["foreign_key"]["foreign_table"],
                    "to_column":   col["foreign_key"]["foreign_column"]
                })
    return fks