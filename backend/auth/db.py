# auth/db.py
"""
App-level database — users, refresh_tokens, artifacts.
Uses the same Postgres instance as waggle_dev but a separate schema: waggle_app.

All tables are created on startup via init_db(). No migration framework needed for now.
"""
from __future__ import annotations
import asyncpg
from config import DBConfig


_pool: asyncpg.Pool | None = None


async def get_app_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        cfg = DBConfig()
        _pool = await asyncpg.create_pool(dsn=cfg.dsn, min_size=2, max_size=10)
    return _pool


async def init_db() -> None:
    """Create waggle_app schema and all tables if they don't exist."""
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        await conn.execute("CREATE SCHEMA IF NOT EXISTS waggle_app")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS waggle_app.users (
                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email        TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at   TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS waggle_app.refresh_tokens (
                token       TEXT PRIMARY KEY,
                user_id     UUID NOT NULL REFERENCES waggle_app.users(id) ON DELETE CASCADE,
                expires_at  TIMESTAMPTZ NOT NULL,
                created_at  TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS waggle_app.sources (
                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id      UUID NOT NULL REFERENCES waggle_app.users(id) ON DELETE CASCADE,
                label        TEXT NOT NULL,
                source_type  TEXT NOT NULL,
                config       JSONB NOT NULL,
                created_at   TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS sources_user_id_idx ON waggle_app.sources(user_id)"
        )

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS waggle_app.artifacts (
                id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id          UUID NOT NULL REFERENCES waggle_app.users(id) ON DELETE CASCADE,
                connection_id    TEXT NOT NULL,
                name             TEXT NOT NULL,
                question         TEXT NOT NULL,
                sql              TEXT NOT NULL,
                artifact_type    TEXT NOT NULL DEFAULT 'table',
                style_config     JSONB NOT NULL DEFAULT '{}',
                refresh_schedule TEXT NOT NULL DEFAULT 'daily',
                last_refreshed   TIMESTAMPTZ,
                created_at       TIMESTAMPTZ DEFAULT NOW(),
                updated_at       TIMESTAMPTZ DEFAULT NOW()
            )
        """)


# ── USER HELPERS ──────────────────────────────────────────────────────────────

async def create_user(email: str, password_hash: str) -> dict:
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO waggle_app.users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
            email, password_hash
        )
        return dict(row)


async def get_user_by_email(email: str) -> dict | None:
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, email, password_hash, created_at FROM waggle_app.users WHERE email = $1",
            email
        )
        return dict(row) if row else None


async def get_user_by_id(user_id: str) -> dict | None:
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, email, created_at FROM waggle_app.users WHERE id = $1",
            user_id
        )
        return dict(row) if row else None


# ── REFRESH TOKEN HELPERS ─────────────────────────────────────────────────────

async def store_refresh_token(token: str, user_id: str, expires_at) -> None:
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO waggle_app.refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)",
            token, user_id, expires_at
        )


async def get_refresh_token(token: str) -> dict | None:
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT token, user_id, expires_at FROM waggle_app.refresh_tokens WHERE token = $1",
            token
        )
        return dict(row) if row else None


async def delete_refresh_token(token: str) -> None:
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM waggle_app.refresh_tokens WHERE token = $1", token)


async def delete_user_refresh_tokens(user_id: str) -> None:
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM waggle_app.refresh_tokens WHERE user_id = $1", user_id)


# ── ARTIFACT HELPERS ──────────────────────────────────────────────────────────

async def create_artifact(
    user_id: str, connection_id: str, name: str, question: str,
    sql: str, artifact_type: str, style_config: dict, refresh_schedule: str
) -> dict:
    import json
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO waggle_app.artifacts
                (user_id, connection_id, name, question, sql, artifact_type, style_config, refresh_schedule)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
            RETURNING *
            """,
            user_id, connection_id, name, question, sql,
            artifact_type, json.dumps(style_config), refresh_schedule
        )
        return dict(row)


async def list_artifacts(user_id: str) -> list[dict]:
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM waggle_app.artifacts WHERE user_id = $1 ORDER BY created_at DESC",
            user_id
        )
        return [dict(r) for r in rows]


async def get_artifact(artifact_id: str, user_id: str) -> dict | None:
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM waggle_app.artifacts WHERE id = $1 AND user_id = $2",
            artifact_id, user_id
        )
        return dict(row) if row else None


async def update_artifact(artifact_id: str, user_id: str, **fields) -> dict | None:
    import json
    allowed = {"name", "question", "sql", "artifact_type", "style_config", "refresh_schedule"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return await get_artifact(artifact_id, user_id)

    set_parts = []
    values = []
    i = 1
    for k, v in updates.items():
        if k == "style_config":
            set_parts.append(f"{k} = ${i}::jsonb")
            values.append(json.dumps(v))
        else:
            set_parts.append(f"{k} = ${i}")
            values.append(v)
        i += 1

    set_parts.append(f"updated_at = NOW()")
    values.extend([artifact_id, user_id])

    pool = await get_app_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE waggle_app.artifacts SET {', '.join(set_parts)} WHERE id = ${i} AND user_id = ${i+1} RETURNING *",
            *values
        )
        return dict(row) if row else None


async def delete_artifact(artifact_id: str, user_id: str) -> bool:
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM waggle_app.artifacts WHERE id = $1 AND user_id = $2",
            artifact_id, user_id
        )
        return result == "DELETE 1"


# ── SOURCE HELPERS ────────────────────────────────────────────────────────────

async def create_source(
    user_id: str, label: str, source_type: str, config: dict
) -> dict:
    import json
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO waggle_app.sources (user_id, label, source_type, config)
            VALUES ($1, $2, $3, $4::jsonb)
            RETURNING id, user_id, label, source_type, config, created_at
            """,
            user_id, label, source_type, json.dumps(config),
        )
        return _source_row(row)


async def get_source(source_id: str) -> dict | None:
    """Lookup without auth — used by tools that already received a vetted id."""
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, user_id, label, source_type, config, created_at "
            "FROM waggle_app.sources WHERE id = $1",
            source_id,
        )
        return _source_row(row) if row else None


async def get_source_for_user(source_id: str, user_id: str) -> dict | None:
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, user_id, label, source_type, config, created_at "
            "FROM waggle_app.sources WHERE id = $1 AND user_id = $2",
            source_id, user_id,
        )
        return _source_row(row) if row else None


async def list_sources_for_user(user_id: str) -> list[dict]:
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, user_id, label, source_type, config, created_at "
            "FROM waggle_app.sources WHERE user_id = $1 ORDER BY created_at DESC",
            user_id,
        )
        return [_source_row(r) for r in rows]


async def rename_source(source_id: str, user_id: str, new_label: str) -> dict | None:
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE waggle_app.sources SET label = $1 "
            "WHERE id = $2 AND user_id = $3 "
            "RETURNING id, user_id, label, source_type, config, created_at",
            new_label, source_id, user_id,
        )
        return _source_row(row) if row else None


async def delete_source(source_id: str, user_id: str) -> bool:
    pool = await get_app_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM waggle_app.sources WHERE id = $1 AND user_id = $2",
            source_id, user_id,
        )
        return result == "DELETE 1"


def _source_row(row) -> dict:
    """Decode JSONB config from asyncpg back to a dict."""
    import json
    d = dict(row)
    cfg = d.get("config")
    if isinstance(cfg, str):
        d["config"] = json.loads(cfg)
    d["id"] = str(d["id"])
    d["user_id"] = str(d["user_id"])
    return d
