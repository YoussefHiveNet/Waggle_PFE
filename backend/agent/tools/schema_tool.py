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
from config import DataPaths

# Simple file cache — avoids re-extracting on every request
CACHE_DIR = DataPaths.schemas

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
    source = await get_source(connection_id)

    # Combined sources are never served from cache — their sql_name fields must
    # be recomputed each time because the DuckDB qualified names depend on the
    # live component source configs (which may change).
    is_combined = source and source.get("source_type") == "combined"

    if not source:
        raise ValueError(f"Source {connection_id} not found")

    if not force_refresh and not is_combined:
        cached = _load_cache(connection_id)
        if cached:
            return cached

    cfg         = source["config"]
    source_type = source["source_type"]

    if source_type == "duckdb":
        display_name = cfg.get("table_name") or Path(cfg["file_path"]).stem
        schema = extract_schema_from_file(cfg["file_path"], display_name=display_name)
    elif source_type == "postgres":
        schema = await extract_schema(cfg)
    elif source_type == "combined":
        from connectors.merged import extract_schema as merged_extract_schema
        schema = await merged_extract_schema(cfg)
    else:
        raise ValueError(f"Unsupported source_type: {source_type}")

    _save_cache(connection_id, schema)
    return schema

def format_for_llm(schema: dict, max_sample_rows: int = 2) -> str:
    """
    Convert raw schema dict into a compact, token-efficient string
    the LLM can use for SQL generation and semantic modeling.

    For combined sources (table keys formatted as 'alias.table'), we
    add a header that groups tables by source and highlights tables
    that exist in multiple sources — this helps the LLM avoid picking
    a single-source table (e.g. 'inventory') when a shared table
    (e.g. 'products') is the right answer for a cross-source query.
    """
    lines: list[str] = []

    # Combined-source detection + grouping header
    if _is_combined_schema(schema):
        lines.extend(_combined_header(schema))
        lines.append("")

    for table_name, table_data in schema.items():
        row_count = table_data.get("row_count")
        row_info  = f" ({row_count:,} rows)" if row_count is not None else ""
        sql_name  = table_data.get("sql_name")
        sql_hint  = f"  [SQL: {sql_name}]" if sql_name else ""
        # Tag unified views so the LLM doesn't confuse them with base tables
        prefix = "VIEW (unified)" if table_data.get("kind") == "unified_view" else "TABLE"
        lines.append(f"{prefix}: {table_name}{row_info}{sql_hint}")

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


def _is_combined_schema(schema: dict) -> bool:
    """True when every key looks like 'alias.table' (combined source)."""
    return bool(schema) and all("." in k for k in schema)


def _combined_header(schema: dict) -> list[str]:
    """Build a 'tables grouped by source + shared tables + unified views' header for the LLM."""
    by_source: dict[str, list[str]] = {}
    unified_tables: list[str] = []
    for key, data in schema.items():
        if data.get("kind") == "unified_view":
            # display key is 'unified.<table>'
            _, _, table = key.partition(".")
            unified_tables.append(f"unified_{table}")
            continue
        alias, _, table = key.partition(".")
        by_source.setdefault(alias, []).append(table)

    sources = sorted(by_source.keys())
    table_sets = {alias: set(tables) for alias, tables in by_source.items()}

    # Tables that exist in ALL component sources (the safest cross-source targets)
    shared = sorted(set.intersection(*table_sets.values())) if len(sources) > 1 else []
    only_in: dict[str, list[str]] = {
        alias: sorted(t for t in by_source[alias] if t not in shared)
        for alias in sources
    }

    out = [
        "═══ COMBINED SOURCE — TABLE MAP ═══",
        f"Component sources: {', '.join(sources)}",
    ]
    if shared:
        out.append(
            "SHARED TABLES (exist in every source): "
            + ", ".join(shared)
        )
    for alias in sources:
        if only_in[alias]:
            out.append(f"ONLY in {alias}: {', '.join(only_in[alias])}")
    if unified_tables:
        out.append(
            "UNIFIED VIEWS — PREFER THESE for any 'across stores' / 'across sources' question: "
            + ", ".join(sorted(unified_tables))
        )
        out.append(
            "  Each unified_<table> view = UNION ALL of every source's version, "
            "with a `source` column identifying which source the row came from. "
            "Use `WHERE source = 'X'`, `GROUP BY source`, or `HAVING COUNT(DISTINCT source) = N` patterns."
        )
    out.append(
        "When the question is about a shared concept, prefer the UNIFIED VIEW — "
        "do NOT substitute a single-source table just because its name sounds related, "
        "and do NOT hand-author cross-source UNION ALLs when a unified view already exists."
    )
    out.append("═══════════════════════════════════")
    return out

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