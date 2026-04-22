# connectors/postgres.py
from __future__ import annotations
import asyncpg
from config import DBConfig

_pool = None

async def get_pool():
    global _pool
    if _pool is None:
        cfg = DBConfig()
        _pool = await asyncpg.create_pool(dsn=cfg.dsn)
    return _pool

async def fetch(sql: str, *args) -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)
        return [dict(r) for r in rows]

async def fetch_with_config(config: dict, sql: str) -> list[dict]:
    dsn = (
        f"postgresql://{config['user']}:{config['password']}"
        f"@{config['host']}:{config['port']}/{config['database']}"
    )
    conn = await asyncpg.connect(dsn)
    try:
        rows = await conn.fetch(sql)
        return [dict(r) for r in rows]
    finally:
        await conn.close()

async def test_connection(
    host: str, port: int, user: str,
    password: str, database: str
) -> tuple[bool, str]:
    dsn = f"postgresql://{user}:{password}@{host}:{port}/{database}"
    try:
        conn = await asyncpg.connect(dsn, timeout=5)
        await conn.fetchval("SELECT 1")
        await conn.close()
        return True, ""
    except Exception as e:
        return False, str(e)

async def extract_schema(config: dict) -> dict:
    """
    Extract full schema from a connected PostgreSQL database.
    Returns tables with columns, types, PKs, FKs and sample rows.
    """
    dsn = (
        f"postgresql://{config['user']}:{config['password']}"
        f"@{config['host']}:{config['port']}/{config['database']}"
    )
    conn = await asyncpg.connect(dsn)

    try:
        # ── 1. All tables in public schema ──────────────────────────
        tables = await conn.fetch("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type   = 'BASE TABLE'
            ORDER BY table_name
        """)

        # ── 2. All columns with types ────────────────────────────────
        columns = await conn.fetch("""
            SELECT
                c.table_name,
                c.column_name,
                c.data_type,
                c.is_nullable,
                c.column_default,
                c.ordinal_position
            FROM information_schema.columns c
            WHERE c.table_schema = 'public'
            ORDER BY c.table_name, c.ordinal_position
        """)

        # ── 3. Primary keys ──────────────────────────────────────────
        pks = await conn.fetch("""
            SELECT
                kcu.table_name,
                kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema    = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_schema    = 'public'
        """)

        # ── 4. Foreign keys ──────────────────────────────────────────
        fks = await conn.fetch("""
            SELECT
                kcu.table_name,
                kcu.column_name,
                ccu.table_name  AS foreign_table,
                ccu.column_name AS foreign_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema    = 'public'
        """)

        # ── 5. Sample rows (3 per table) ─────────────────────────────
        pk_set = {(r["table_name"], r["column_name"]) for r in pks}
        fk_map = {
            (r["table_name"], r["column_name"]): {
                "foreign_table":  r["foreign_table"],
                "foreign_column": r["foreign_column"]
            }
            for r in fks
        }

        col_map: dict[str, list] = {}
        for col in columns:
            t = col["table_name"]
            if t not in col_map:
                col_map[t] = []
            col_map[t].append({
                "name":       col["column_name"],
                "type":       col["data_type"],
                "nullable":   col["is_nullable"] == "YES",
                "primary_key": (t, col["column_name"]) in pk_set,
                "foreign_key": fk_map.get((t, col["column_name"]))
            })

        schema: dict = {}
        for table in tables:
            t = table["table_name"]
            # Get 3 sample rows
            try:
                sample_rows = await conn.fetch(
                    f'SELECT * FROM "{t}" LIMIT 3'
                )
                samples = [dict(r) for r in sample_rows]
                # Convert non-serializable types to strings
                for row in samples:
                    for k, v in row.items():
                        if not isinstance(v, (str, int, float, bool, type(None))):
                            row[k] = str(v)
            except Exception:
                samples = []

            schema[t] = {
                "columns": col_map.get(t, []),
                "sample_rows": samples,
                "row_count": None  # filled below
            }

        # ── 6. Approximate row counts ────────────────────────────────
        for t in schema:
            try:
                count = await conn.fetchval(
                    f'SELECT COUNT(*) FROM "{t}"'
                )
                schema[t]["row_count"] = count
            except Exception:
                schema[t]["row_count"] = 0

        return schema

    finally:
        await conn.close()

async def ping() -> str:
    result = await fetch("SELECT 'pong' AS response")
    return result[0]["response"]