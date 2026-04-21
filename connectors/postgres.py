# connectors/postgres.py
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
    """Execute a query using a specific connection config."""
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
    host: str,
    port: int,
    user: str,
    password: str,
    database: str
) -> tuple[bool, str]:
    """Try to connect and run a trivial query. Returns (ok, error_message)."""
    dsn = f"postgresql://{user}:{password}@{host}:{port}/{database}"
    try:
        conn = await asyncpg.connect(dsn, timeout=5)
        await conn.fetchval("SELECT 1")
        await conn.close()
        return True, ""
    except Exception as e:
        return False, str(e)

async def ping() -> str:
    result = await fetch("SELECT 'pong' AS response")
    return result[0]["response"]