from __future__ import annotations
import asyncpg
from connectors.postgres import _build_dsn


class PostgresAdapter:
    """Attaches a live Postgres database into a DuckDB session via postgres_scanner.
    Tables are accessible as {alias}.public.{table_name}.
    Supports `sslmode` in source_config for cloud Postgres (CockroachDB, Neon, etc.)."""

    async def materialize(self, conn, source_config: dict, alias: str) -> None:
        cfg = source_config
        # libpq keyword/value DSN (what postgres_scanner expects).
        # Append sslmode if the source is a cloud DB requiring TLS.
        parts = [
            f"host={cfg['host']}",
            f"port={cfg['port']}",
            f"dbname={cfg['database']}",
            f"user={cfg['user']}",
            f"password={cfg['password']}",
        ]
        if cfg.get("sslmode"):
            parts.append(f"sslmode={cfg['sslmode']}")
        dsn = " ".join(parts)
        conn.execute("INSTALL postgres_scanner; LOAD postgres_scanner;")
        conn.execute(f"ATTACH '{dsn}' AS \"{alias}\" (TYPE postgres, READ_ONLY)")

    async def get_tables(self, source_config: dict) -> list[str]:
        cfg = source_config
        dsn = _build_dsn(
            cfg["user"], cfg["password"], cfg["host"],
            cfg["port"], cfg["database"], cfg.get("sslmode"),
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
