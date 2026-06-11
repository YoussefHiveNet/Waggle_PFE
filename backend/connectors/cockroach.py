from __future__ import annotations
import psycopg
from config import DBConfig




async def test_connection(host: str, port: int, user: str,
    password: str, database: str
) -> tuple[bool, str]:
    dsn = f"postgresql://{user}:{password}@{host}:{port}/{database}"
    try:
        conn = await psycopg.connect(dsn, timeout=5)
        await conn.fetchval("select 1")
        await conn.close()
        return True, ""
    except Exception as e:
        return False, str(e)