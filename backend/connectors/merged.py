"""
connectors/merged.py — DuckDB-backed cross-source query engine.

Every component source is materialized into one DuckDB :memory: session
via the ConnectorAdapter protocol.  Tables are accessible as:
    {alias}.{table_name}       (duckdb / file sources)
    {alias}.public.{table}     (postgres sources via postgres_scanner)

The LLM writes SQL using these qualified names; no ETL required.
Adding a new source type = one adapter file + one register() call in
connectors/adapters/__init__.py.
"""
from __future__ import annotations
import duckdb

from connectors.adapters import get_adapter


# ── CORE ENGINE ───────────────────────────────────────────────────────────────

async def _open_session(config: dict) -> duckdb.DuckDBPyConnection:
    """Open a DuckDB :memory: session with all component sources materialized."""
    conn = duckdb.connect(database=":memory:", read_only=False)
    for src in config["component_sources"]:
        adapter = get_adapter(src["source_type"])
        await adapter.materialize(conn, src["config"], src["alias"])
    return conn


async def fetch_with_config(config: dict, sql: str) -> list[dict]:
    """Execute SQL against a merged DuckDB session. Returns list of row dicts."""
    conn = await _open_session(config)
    try:
        result = conn.execute(sql)
        cols = [d[0] for d in result.description]
        rows = result.fetchall()
        return [dict(zip(cols, row)) for row in rows]
    finally:
        conn.close()


async def extract_schema(config: dict) -> dict:
    """
    Return a merged schema dict in the same shape as postgres.extract_schema():
        { "alias.table_name": { "columns": [...], "row_count": int, "sample_rows": [...] } }

    Table keys are fully qualified (alias.table) so the LLM can write
    unambiguous SQL even when two sources share a table name.
    """
    conn = await _open_session(config)
    schema: dict = {}
    try:
        for src in config["component_sources"]:
            alias = src["alias"]
            adapter = get_adapter(src["source_type"])
            table_names = await adapter.get_tables(src["config"])

            for table in table_names:
                # Postgres attaches under alias.public.table; DuckDB under alias.table
                qualified = (
                    f'"{alias}".public."{table}"'
                    if src["source_type"] == "postgres"
                    else f'"{alias}"."{table}"'
                )
                display_key = f"{alias}.{table}"

                try:
                    cols_raw = conn.execute(f"DESCRIBE {qualified}").fetchall()
                    columns = [
                        {
                            "name":        c[0],
                            "type":        c[1],
                            "nullable":    True,
                            "primary_key": False,
                            "foreign_key": None,
                        }
                        for c in cols_raw
                    ]

                    col_names = [c["name"] for c in columns]
                    sample_raw = conn.execute(
                        f"SELECT * FROM {qualified} LIMIT 3"
                    ).fetchall()
                    sample_rows = []
                    for row in sample_raw:
                        d = dict(zip(col_names, row))
                        for k, v in d.items():
                            if not isinstance(v, (str, int, float, bool, type(None))):
                                d[k] = str(v)
                        sample_rows.append(d)

                    row_count = conn.execute(
                        f"SELECT COUNT(*) FROM {qualified}"
                    ).fetchone()[0]

                    # Inject user-defined link hints as synthetic FK entries
                    _apply_link_hints(columns, display_key, config.get("links", []))

                    schema[display_key] = {
                        "columns":     columns,
                        "row_count":   row_count,
                        "sample_rows": sample_rows,
                        "sql_name":    qualified,
                    }
                except Exception:
                    # Table may be a view or temporarily unavailable — skip gracefully
                    pass
    finally:
        conn.close()

    return schema


# ── HELPERS ───────────────────────────────────────────────────────────────────

def _apply_link_hints(columns: list[dict], display_key: str, links: list[dict]) -> None:
    """Annotate columns with FK-style hints derived from user-drawn source links.
    This is purely informational for the LLM — the merge engine doesn't enforce FKs.
    """
    for link in links:
        # link = { table_a, col_a, table_b, col_b, join_type }
        for col in columns:
            if display_key == link["table_a"] and col["name"] == link["col_a"]:
                col["foreign_key"] = {
                    "foreign_table":  link["table_b"],
                    "foreign_column": link["col_b"],
                }
            elif display_key == link["table_b"] and col["name"] == link["col_b"]:
                col["foreign_key"] = {
                    "foreign_table":  link["table_a"],
                    "foreign_column": link["col_a"],
                }


def build_join_hint(links: list[dict]) -> str:
    """Return SQL-formatted JOIN instructions from user-drawn links.
    Injected into the LLM prompt so it writes correct qualified JOIN syntax.
    display_key format (waggle_nyc.customers) → SQL format ("waggle_nyc".public."customers").
    """
    if not links:
        return ""

    def to_sql(display_key: str) -> str:
        """Convert 'alias.table' display key to DuckDB-qualified SQL name."""
        parts = display_key.split(".", 1)
        if len(parts) == 2:
            # Postgres sources are attached as alias.public.table in DuckDB
            return f'"{parts[0]}".public."{parts[1]}"'
        return f'"{display_key}"'

    lines = ["CROSS-SOURCE JOINS — use these exact SQL names:"]
    for lk in links:
        sql_a = to_sql(lk["table_a"])
        sql_b = to_sql(lk["table_b"])
        lines.append(
            f"  {sql_a} {lk['join_type']} JOIN {sql_b} "
            f"ON <alias_a>.{lk['col_a']} = <alias_b>.{lk['col_b']}"
        )
    return "\n".join(lines)
