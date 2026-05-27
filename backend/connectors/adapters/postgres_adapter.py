from __future__ import annotations
import asyncpg


class PostgresAdapter:
    """Attaches a live Postgres database into a DuckDB session via postgres_scanner.
    Tables are accessible as {alias}.public.{table_name}."""

    async def materialize(self, conn, source_config: dict, alias: str) -> None:
        cfg = source_config
        dsn = (
            f"host={cfg['host']} port={cfg['port']} "
            f"dbname={cfg['database']} user={cfg['user']} "
            f"password={cfg['password']}"
        )
        conn.execute("INSTALL postgres_scanner; LOAD postgres_scanner;")
        conn.execute(f"ATTACH '{dsn}' AS \"{alias}\" (TYPE postgres, READ_ONLY)")

    async def get_tables(self, source_config: dict) -> list[str]:
        cfg = source_config
        dsn = (
            f"postgresql://{cfg['user']}:{cfg['password']}"
            f"@{cfg['host']}:{cfg['port']}/{cfg['database']}"
        )
        conn = await asyncpg.connect(dsn)
        try:
            rows = await conn.fetch(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
                "ORDER BY table_name"
            )
            return [r["table_name"] for r in rows]
        finally:
            await conn.close()
