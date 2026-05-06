# Waggle — Project Knowledge Base

> This file is the single source of truth for anyone (human or LLM) picking up this project.
> It tracks every decision made, every feature built, every problem hit, and what comes next.

---

## What is Waggle?

An AI-powered **semantic data modeling platform** — a PFE (end-of-studies capstone) project.

**The core problem it solves:** Organizations have large databases but need strong technical expertise to query them. Waggle bridges the gap by:
1. Connecting to a database
2. Auto-extracting the schema
3. Using an LLM to generate a semantic YAML model (what columns *mean*, not just what they are)
4. Letting users query in natural language → validated SQL → results

**Timeline:** 3–4 months  
**Student:** Youssef Maghraoui (`onssantrii@gmail.com`)  
**Budget:** Tight — free tiers preferred, Groq free LLM API in use

---

## Architecture

```
waggle/
├── api/                         # FastAPI REST layer
│   ├── main.py                  # App entrypoint, CORS, lifespan (DB init)
│   └── routes/
│       ├── auth.py              # POST /auth/register|login|refresh|logout, GET /auth/me
│       ├── artifacts.py         # POST/GET/PUT/DELETE /artifacts
│       ├── sources.py           # POST /sources/upload  (CSV/Parquet)
│       ├── connect.py           # POST /connect, GET /connect/{id}
│       ├── schema.py            # GET /schema/{id}, /schema/{id}/llm-context
│       ├── semantic.py          # POST/GET/DELETE /semantic/{id}
│       ├── session.py           # POST /session, GET /session/{id}, GET /sessions
│       └── query.py             # POST /query/{id}
│
├── auth/
│   ├── __init__.py
│   ├── password.py              # bcrypt hash/verify via passlib
│   ├── jwt.py                   # JWT issue/decode + FastAPI dependency get_current_user
│   └── db.py                    # waggle_app schema: users, refresh_tokens, artifacts tables
│
├── agent/
│   ├── llm.py                   # OpenAI-compat client (Groq / Hivenet)
│   ├── session.py               # JSONL persistence — one file per session
│   ├── context.py               # Token estimation + compaction
│   ├── runtime.py               # Two-call agent harness
│   └── tools/
│       ├── schema_tool.py       # Schema extraction + LLM formatting
│       ├── semantic_tool.py     # LLM generates YAML from schema
│       └── query_tool.py        # NL → SQL → validate
│
├── connectors/
│   ├── postgres.py              # asyncpg: connect, fetch, extract_schema
│   ├── duckdb.py                # DuckDB: CSV/Parquet query + schema extraction
│   ├── store.py                 # JSON-backed connection registry
│   └── bigquery.py              # Placeholder — not yet built
│
├── semantic/
│   ├── models.py                # Dataclasses: Cube, Dimension, Measure, Join
│   ├── engine.py                # YAML load/save/parse/build_llm_context
│   └── models/                  # Stored .yaml files per connection_id
│
├── validation/
│   └── engine.py                # 5-check validation pipeline
│
├── data/
│   ├── connections.json         # Auto-generated connection store
│   ├── schemas/                 # Cached extracted schemas per connection_id
│   ├── sessions/                # One .jsonl file per session
│   └── uploads/                 # Uploaded files: {user_id}/{file_id}.csv
│
├── config.py                    # LLMConfig + DBConfig + AuthConfig + UploadConfig
├── requirements.txt
└── .env                         # Never commit — in .gitignore
```

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | FastAPI + asyncpg | Async-first, fast, Python |
| LLM API | Groq (free tier) | Hivenet had SSL/routing issues; Groq is OpenAI-compatible, free |
| LLM Model | `llama-3.3-70b-versatile` (Groq) | Best SQL/JSON quality available for free |
| DB (local) | PostgreSQL 18 | Standard, asyncpg pool support |
| DB (cloud) | BigQuery | Free 1TB/month, internship access |
| File queries | DuckDB (embedded) | Zero-setup analytical SQL on CSV/Parquet; fully isolated per user |
| Auth | JWT (python-jose) + bcrypt (passlib) | Stateless access tokens, opaque refresh tokens in httpOnly cookie |
| Semantic layer | Custom YAML engine | Budget reasons + capstone learning value |
| SQL parsing | sqlglot | Free, pure Python, multi-dialect |
| Session format | JSONL | Appendable, human-readable, same format as Claude Code / OpenAI evals |
| Session tracking | GitHub Issues + Milestones | Doubles as capstone journal |
| Frontend | React + TypeScript + shadcn/ui | Vite, Tailwind, Recharts — to be built Day 10+ |
| Hosting | Hivenet bare metal | Free, full control, no vendor limits |

**LLM temperature: always 0.1** for SQL/YAML generation — determinism over creativity.

---

## Key Design Decisions (with rationale)

### 1. Custom YAML engine instead of Cube.js
- Cube.js cloud is paid; self-host adds operational complexity
- For a capstone, "I built it myself" is a stronger answer than "I plugged in a framework"
- Can add Cube.js interoperability in month 4 as stretch goal

### 2. connection_id pattern
- User submits credentials once → gets a UUID back
- Every future call uses only the UUID (no re-sending passwords)
- Same pattern as Fivetran, dbt Cloud, Metabase

### 3. Validate before storing (in /connect)
- If connection fails, nothing gets saved — fail fast, no orphaned records

### 4. Passwords never returned via API
- GET /connect/{id} strips the password field before responding

### 5. Separate connectors/store.py
- Multiple tools (schema_tool, query_tool, semantic_tool) all need to look up connections
- One file owns that responsibility — avoids circular imports and duplication

### 6. Schema caching in data/schemas/
- information_schema queries are slow on large DBs
- Cache per connection_id, invalidate with `?refresh=true` query param

### 7. LLM context = only relevant cubes
- On large DBs (40+ tables), feeding the full schema wastes tokens and hurts accuracy
- `SemanticEngine.resolve()` does keyword matching to pick relevant cubes first

### 8. Validation pipeline order: deterministic checks first, LLM checks second
- Structural + semantic + assertion checks are free (pure Python)
- Cross-query and LLM sanity checks cost tokens
- If cheap checks fail → skip expensive ones → save budget

### 9. JSONL for session persistence
- Each turn is appended as one JSON line — never rewrites the whole file
- Survives server restarts: `get_session()` checks memory first, then reloads from disk
- `list_sessions()` globs `data/sessions/*.jsonl` so it works after restart too
- File is touched (created empty) on session creation so listing works before any messages

### 10. Token compaction threshold = 6000 (conservative)
- Groq free tier has per-request limits; 6000 estimated tokens is a safe ceiling
- On compaction: old messages are summarized by LLM, last 6 messages kept verbatim
- Session file is rewritten to match — disk and memory always in sync

---

## Milestone Map

| Milestone | Scope | Status |
|---|---|---|
| **M1** | Scaffolding + DB connection | ✅ Done |
| **M2** | Schema extraction + Semantic YAML | ✅ Done |
| **M3** | Agent harness + query tool | ✅ Done |
| **M4** | Validation engine | ✅ Done (built alongside Day 6) |
| **M5** | React frontend + Auth UI | 🔄 Day 11 done — dashboard, chat, 8 renderers, source ownership |
| **M5b** | Auth backend (JWT + users + artifacts + DuckDB) | ✅ Done (Day 9) |
| **M6** | BigQuery connector | ⬜ Not started |
| **M7** | Polish, testing, demo | ⬜ Not started |

---

## What Has Been Built — Day by Day

### Day 1 — Infrastructure ✅
**Files created:** `config.py`, `agent/llm.py`, `connectors/postgres.py`, `api/main.py`  
**Endpoints working:** `/health`, `/ping-llm`, `/ping-db`

**Problems hit:**
- Hivenet GPU endpoint returned 404 — URL format was `{id}-8800.uae.tenants.hivecompute.ai:4443/v1` but the vLLM routing was broken on that instance
- SSL cert self-signed → fixed with `httpx.AsyncClient(verify=False)` in `agent/llm.py`
- Postgres not running → installed PostgreSQL 18 locally, created `waggle_dev` DB
- `httpx` not imported → `pip install httpx`
- **Final resolution:** Switched LLM to Groq free tier (`api.groq.com/openai/v1`) — zero code change needed, just `.env` update

**Result:** Both pings green. `/ping-llm` returns `{"status":"ok","response":"pong"}`

---

### Day 2 — /connect endpoint ✅
**Files created:** `api/routes/connect.py`, `connectors/store.py`  
**Files modified:** `connectors/postgres.py`, `api/main.py`

**What was built:**
- `POST /connect` — validates credentials, stores connection, returns `connection_id`
- `GET /connect/{id}` — retrieves connection info (password stripped)
- `connectors/store.py` — JSON file at `data/connections.json`, keys = UUIDs
- `test_connection()` — asyncpg connect with 5s timeout, runs `SELECT 1`, immediately closes

**Test result:**
```
connection_id: 31a052b8-e5ac-4c0a-b71a-be13bdbeb4dc  ✅
```

---

### Day 3 — Schema extraction ✅
**Files created:** `agent/tools/schema_tool.py`, `api/routes/schema.py`  
**Files modified:** `connectors/postgres.py`, `api/main.py`

**What was built:**
- `extract_schema(config)` — reads PostgreSQL `information_schema`, returns structured dict with tables, columns, PKs, FKs, 3 sample rows, row counts
- `schema_tool.py` — `get_schema()` with file cache, `format_for_llm()`, `get_foreign_keys()`
- `GET /schema/{id}` — full schema JSON
- `GET /schema/{id}/llm-context` — token-efficient string (debug endpoint)

**Test DB in `waggle_dev`:** tables: `users`, `orders`, `products` — FK: `orders.user_id → users.id`

**Test result:**
```
GET /schema/{id}             → 3 tables, all columns + FKs + sample rows  ✅
GET /schema/{id}/llm-context → compact token-efficient string              ✅
```

---

### Day 4 — Semantic YAML generation ✅
**Files created:** `semantic/models.py`, `semantic/engine.py`, `agent/tools/semantic_tool.py`, `api/routes/semantic.py`  
**Files modified:** `api/main.py`

**What was built:**
- `semantic/models.py` — dataclasses: `DimensionType`, `MeasureType`, `Dimension`, `Measure`, `Join`, `Cube`, `SemanticModel` + `Measure.to_sql_expression()`
- `semantic/engine.py` — `SemanticEngine`: load/save/exists/build_llm_context, YAML ↔ dataclass conversion
- `agent/tools/semantic_tool.py` — 4-phase LLM generation: classify columns → clarification questions → user answers → assemble YAML
- `POST /semantic/{id}`, `GET /semantic/{id}`, `DELETE /semantic/{id}`

**Test result:**
```
POST /semantic/{id} (empty body)  → 5 smart LLM clarification questions   ✅
POST /semantic/{id} (with rules)  → YAML saved with 3 cubes               ✅
GET  /semantic/{id}               → model + LLM context returned           ✅
revenue measure                   → SUM(CASE WHEN status='completed'...)   ✅
active_user_count                 → COUNT(CASE WHEN last_login > NOW()-30d)✅
```

**Bugs found and fixed:**
1. **Python 3.9 `X | None` syntax** — added `from __future__ import annotations` + switched Pydantic fields to `Optional[...]` across all new files
2. **Double-wrapping in `build_llm_context`** — was calling `m.to_sql_expression()` on an already-full expression like `SUM(CASE WHEN ...)`, producing `SUM(SUM(...))`. Fixed to use `m.sql` directly in context display.

---

### Day 5 — Session persistence + token tracking ✅
**Files created:** `agent/session.py`, `agent/context.py`, `api/routes/session.py`  
**Files modified:** `api/main.py`

**What was built:**

`agent/session.py` — `Session` class + module-level store:
- `add(role, content)` — appends a message to memory and immediately flushes to JSONL file
- `add_tool_result(tool_name, result)` — records tool events as their own line
- `to_llm_messages()` — converts session to the `[{role, content}]` format the LLM API expects; system messages are inserted at position 0
- `replace_messages(new_messages)` — overwrites both memory and the JSONL file (used by compaction)
- `create_session(connection_id)` — generates UUID, touches the JSONL file immediately so listing works before any messages
- `get_session(session_id)` — checks in-memory dict first, then reloads from disk (server restart recovery)
- `list_sessions(connection_id?)` — globs `data/sessions/*.jsonl`

`agent/context.py` — token tracking + compaction:
- `estimate_tokens(text)` — `len(text) // 4`, no API call needed
- `session_token_estimate(session)` — sums all message content lengths
- `needs_compaction(session)` — threshold: 6000 estimated tokens
- `compact_session(session, llm)` — LLM summarizes old messages, keeps last 6 verbatim, rewrites session file
- `build_system_prompt(connection_id, semantic_context)` — the system prompt prepended to every LLM call

`api/routes/session.py`:
- `POST /session` — creates session, returns `session_id`
- `GET /session/{session_id}` — returns summary + full message list
- `GET /sessions?connection_id=...` — lists all sessions, optional filter

**Test result:**
```
POST /session                → session_id returned, JSONL file created on disk  ✅
GET  /session/{id}           → summary + messages returned                       ✅
GET  /sessions               → session appears in list                           ✅
Disk resume (after restart)  → all messages reloaded correctly from JSONL        ✅
```

**Bugs found and fixed:**
1. **Python 3.9 `X | None` syntax** — same issue as Day 4; fixed in `session.py` and `session.py` route with `from __future__ import annotations` + `Optional[...]`
2. **JSONL file not created on session init** — `add()` opens in append mode so no file exists until the first message. `list_sessions()` globs for `.jsonl` files so fresh sessions were invisible. Fixed by calling `self.path.touch(exist_ok=True)` in `Session.__init__`.

---

### Day 6 — NL → SQL query tool ✅
**Files created:** `agent/tools/query_tool.py`  
**Files already in place:** `api/routes/query.py`, `validation/engine.py`  
**GitHub issues:** [M3-3](https://github.com/YoussefHiveNet/Waggle_PFE/issues/5), [M3-4](https://github.com/YoussefHiveNet/Waggle_PFE/issues/6)

**What was built:**

`agent/tools/query_tool.py` — end-to-end NL → SQL pipeline:
- `run_query(connection_id, question)` — main entry point; orchestrates the full flow
- `_resolve_cubes(model, question)` — keyword-matches the question against cube/field names to pick only relevant cubes for the LLM context (avoids bloating prompts on large schemas)
- Retry loop (up to `MAX_ATTEMPTS = 3`):
  1. `_generate_sql()` — builds the LLM prompt with semantic context + schema + accumulated error history, calls `generate(prompt, system=...)`
  2. `sqlglot.parse_one()` — syntax-validates the SQL for free before touching the DB
  3. `fetch_with_config()` — executes against the DB
  4. `validate()` — runs the full 5-check validation pipeline
  5. Returns on pass, or appends the failure to `errors[]` and retries
- `_serialize_rows()` — converts asyncpg's non-JSON-serializable types (Decimal → float, date/datetime → ISO string, UUID → str) before FastAPI returns them

**Validation pipeline** (`validation/engine.py` — already built, wired in today):
1. **Structural** — empty result with no aggregation, row explosion (>10k), all-NULL column
2. **Semantic coherence** — "how many / total / sum" question but no numeric column returned
3. **Business assertions** — checks YAML assertions from the semantic model (e.g. revenue ≥ 0)
4. **Cross-query** — LLM writes a simpler COUNT(*) and compares row count (skipped for scalar aggregates to avoid false positives)
5. **LLM sanity** — shows first 3 rows to LLM and asks if the result makes sense

**Test results:**
```
POST /query/{id}  {"question": "what is the total revenue?"}
→ SQL:  SELECT SUM(CASE WHEN o.status = 'completed' THEN o.amount ELSE 0 END) AS revenue FROM orders o
→ data: [{"revenue": 1147.99}]
→ all 5 checks passed, confidence: 0.95, attempts: 1  ✅

POST /query/{id}  {"question": "how many users do we have?"}
→ SQL:  SELECT COUNT(u.id) AS total_users FROM users u
→ data: [{"total_users": 3}]
→ confidence: 0.95, attempts: 1  ✅

POST /query/{id}  {"question": "show me the number of orders per user"}
→ SQL:  SELECT u.email, COUNT(o.id) AS order_count FROM orders o JOIN users u ON o.user_id = u.id GROUP BY u.email
→ data: 3 rows, cross-query check passed, confidence: 0.95, attempts: 1  ✅
```

**Bugs found and fixed:**
1. **Stale connection_id** — the connection in `data/connections.json` had changed from Day 2; used the current UUID from disk
2. **`_serialize_rows` missing from stub** — the pre-existing stub returned raw asyncpg rows which FastAPI cannot JSON-encode (Decimal, date, UUID types). Added `_serialize_rows()` to handle all three cases.

---

### Day 7 — Agent harness (runtime.py) ✅
**Files created:** `agent/runtime.py`  
**Files modified:** `agent/llm.py`, `api/routes/query.py`  
**GitHub issue:** [M3-5](https://github.com/YoussefHiveNet/Waggle_PFE/issues/7)

**What was built:**

`agent/runtime.py` — the central conversation harness:
- Tool registry: `query` (NL → SQL) and `get_schema` (schema listing)
- `_tool_descriptions()` — formats tool list for the system prompt so the LLM knows how to call them
- `_parse_tool_call(text)` — detects whether the LLM responded with a JSON tool call or plain text
- `_execute_tool(name, params, connection_id)` — dispatches to `run_query` or `get_schema`
- `_clean_history(session)` — strips internal bookkeeping entries (`role=tool`, `[Tool result]` messages, `[Calling tool]` messages) from the session before building the LLM message list
- `_summarize_tool_result(name, result)` — concise summary (SQL + row count + first 5 rows) to feed into the synthesis call
- `run_turn(session, user_message)` — the main entry point (see design decisions below)
- `get_or_create_session(connection_id, session_id)` — helper exported for routes

`agent/llm.py` — extended `generate()` to accept an optional `messages` list for multi-turn calls. When `messages` is provided, the full history is sent; otherwise falls back to single-turn mode with just `prompt` + `system`.

`api/routes/query.py` — updated to:
- Accept `session_id: Optional[str]` in the request body
- Delegate to `run_turn(session, question)` instead of calling `run_query` directly
- Create a new session if no `session_id` is provided

**Key design decision — two-call pattern (not a loop):**

Every turn makes exactly 1 or 2 LLM calls:
- **Call 1:** LLM sees full conversation history + tool descriptions → responds with either a JSON tool call or a plain-text answer
- **Call 2:** (only if a tool was called) LLM sees the tool result → writes the final plain-language answer; tool descriptions are NOT in the system prompt for this call, so it physically cannot loop back

This replaces the original while-loop design which caused the tool loop bug (see Day 8 below).

**Bugs discovered during Day 7 testing:**
1. **Tool loop (critical)** — the while-loop harness called the tool 5 times per question, always hitting MAX_TOOL_ITERATIONS and returning a generic fallback message. Root cause: `generate(prompt, system)` was only passing the last message content as a string, not the full history. The injected `[Tool result]` user message looked like a new data request.
2. **LLM sanity false positive** — revenue-by-user result (valid data) was flagged by the sanity check because "Reply YES or NO only" gave the LLM no guidance on what constitutes a real problem.

---

### Day 8 — Runtime bug fixes ✅
**Files modified:** `agent/runtime.py`, `validation/engine.py`  
**GitHub issue:** [M3-5](https://github.com/YoussefHiveNet/Waggle_PFE/issues/7)

**What was fixed:**

**Bug 1 — Tool loop (critical):** Replaced the while-loop harness with the deterministic two-call pattern described above. Added `_clean_history()` which strips `role=tool` records and `[Tool result]` injected messages from the session before the LLM call. These bookkeeping entries were what caused the LLM to interpret tool results as new user requests.

**Bug 2 — LLM sanity false positives:** Rewrote the `_check_llm_sanity` prompt in `validation/engine.py` to explicitly tell the LLM what NOT to flag: valid groupings, zero-value rows, fewer columns than expected. The new prompt says "Only answer NO if there is a clear data problem" (negative revenue, impossibly large counts, completely unrelated columns). Same YES/NO parsing, far fewer false positives.

**Cleanup:** Removed unused `params` variable from `_tool_descriptions()` in `runtime.py`.

**Test results:**
```
POST /query/{id}  {"question": "What is the total revenue?"}
→ tool_calls: 1 (query)
→ response: "The total revenue is $1147.99. This is the total amount earned from completed orders."
→ confidence: 0.95, attempts: 1  ✅

POST /query/{id}  {"question": "Now break that down by user", session_id: ...}
→ tool_calls: 1 (query — resolved "that" to revenue from prior context)
→ response: "Alice $148.99 · Carol $999.00 · Bob $0.00. Carol is the largest contributor."
→ confidence: 0.95, all 5 checks passed (sanity no longer false-positive)  ✅

POST /query/{id}  {"question": "What tables do we have?", session_id: ...}
→ tool_calls: 1 (get_schema)
→ response: "We have 3 tables: orders, products, and users."  ✅

Session message count: 12 for 3 questions (was 51 before the fix)  ✅
```

---

### Day 9 — Auth + Artifacts API + DuckDB connector ✅
**Files created:** `auth/password.py`, `auth/jwt.py`, `auth/db.py`, `api/routes/auth.py`, `api/routes/artifacts.py`, `api/routes/sources.py`, `connectors/duckdb.py`  
**Files modified:** `api/main.py`, `config.py`, `requirements.txt`

**What was built:**

`auth/` module:
- `password.py` — bcrypt hash/verify via passlib
- `jwt.py` — HS256 JWT (15-min access token) + opaque refresh token (UUID, 7-day TTL). `get_current_user` FastAPI dependency extracts `user_id` from Bearer header. Token rotation on every refresh call.
- `db.py` — `waggle_app` Postgres schema (separate from user data). Tables: `users`, `refresh_tokens`, `artifacts`. `init_db()` called on FastAPI startup via `lifespan`. All CRUD helpers live here.

`api/routes/auth.py` — 5 endpoints:
- `POST /auth/register` — bcrypt hash, store user, issue access + refresh tokens. Refresh token in httpOnly cookie (path=`/auth/refresh` to limit exposure).
- `POST /auth/login` — verify password, same token flow
- `POST /auth/refresh` — validates cookie, rotates refresh token, returns new access token
- `POST /auth/logout` — deletes refresh token server-side, clears cookie
- `GET /auth/me` — returns `{id, email, created_at}` from Bearer token

`api/routes/artifacts.py` — full CRUD behind JWT:
- `POST /artifacts` — save query + type + style + schedule
- `GET /artifacts` — list user's artifacts
- `GET /artifacts/{id}` — single artifact
- `PUT /artifacts/{id}` — patch any field (name, sql, artifact_type, style_config, refresh_schedule)
- `DELETE /artifacts/{id}` — remove

`connectors/duckdb.py` — CSV/Parquet connector with the same interface as `postgres.py`:
- `extract_schema_from_file(path, display_name)` — returns schema dict compatible with `format_for_llm()` and the query tool
- `fetch_from_file(path, sql)` — runs DuckDB SQL against the file, returns list of dicts
- `fetch_with_config(config, sql)` — async wrapper matching `postgres.fetch_with_config` so validation engine + query tool work unchanged
- `get_upload_path(user_id, file_id, filename)` — stable path under `data/uploads/`
- `validate_file_type(filename)` — allows `.csv`, `.tsv`, `.parquet`, `.json`

`api/routes/sources.py` — `POST /sources/upload`:
- Accepts multipart file upload (max 100 MB)
- Writes to `data/uploads/{user_id}/{file_id}.ext`
- Calls `extract_schema_from_file` to confirm readability before saving
- Registers a synthetic connection in `connectors/store.py` with `db_type: duckdb`
- Returns `{connection_id, table_name, row_count, column_count, columns}` — ready to use with `/query/{connection_id}`

`api/main.py` — added:
- `lifespan` context manager calling `init_db()` on startup
- CORS middleware (`allow_origins: localhost:5173 + 3000`, `allow_credentials: True` for cookies)
- All new routers registered

**Key design decisions:**
- **Separate `waggle_app` schema** in the same Postgres: user data never pollutes the connected databases users bring in. Swap to a separate DB instance with one env var change.
- **Refresh token in httpOnly cookie with `path=/auth/refresh`**: the cookie is only sent to that one endpoint, limiting CSRF exposure. `secure=False` for localhost; flip to `True` in production.
- **DuckDB in-process**: no server, no network, zero setup. Each query spins up a fresh `:memory:` connection — fully thread-safe with no shared state.
- **`display_name` on DuckDB schema**: LLM sees the original filename stem (`test_sales`) as the table name, not the UUID stored on disk.
- **`bcrypt==4.0.1` pinned**: passlib 1.7.4 reads `bcrypt.__about__.__version__` which was removed in bcrypt 4.1+. Pinning 4.0.1 is the standard workaround until passlib ships a fix.

**Test results:**
```
POST /auth/register  {"email":"youssef@waggle.dev","password":"waggle123"}
→ {"access_token": "eyJ...", "token_type": "bearer"}  ✅  (refresh cookie set)

POST /auth/register  (same email again)
→ {"detail": "Email already registered"}  409 ✅

POST /auth/login
→ access token returned, token rotated  ✅

GET /auth/me  (Bearer token)
→ {"id":"55ebb4b1...","email":"youssef@waggle.dev","created_at":"2026-04-28T..."}  ✅

POST /artifacts  (Bearer token)
→ artifact saved with id, timestamps  ✅

GET /artifacts
→ [{"id":"12ed4750...","name":"Total Revenue","artifact_type":"metric",...}]  ✅

PUT /artifacts/{id}  {"name":"Total Revenue (updated)","style_config":{"color":"#C4500A","font_size":32}}
→ updated_at changed, name + style updated  ✅

POST /sources/upload  test_sales.csv (4 rows, 4 cols)
→ {"connection_id":"e020e715...","table_name":"test_sales","row_count":4,"column_count":4,
   "columns":["date","product","revenue","units"]}  ✅
```

---

### Day 10 — React frontend scaffold ✅
**Files created:** `frontend/` — entire frontend tree  
**Node:** v25.9.0, **pnpm:** 10.33.2, **React:** 19.2.5, **Vite:** 8.0.10, **Tailwind:** 4.2.4

**Folder structure built:**
```
frontend/src/
├── types/index.ts + axios.d.ts     # all TS interfaces from backend contracts
├── lib/api.ts                       # two Axios instances + service helpers
├── lib/queryClient.ts               # TanStack Query config
├── lib/utils.ts                     # shadcn cn()
├── store/authStore.ts               # Zustand: in-memory token, user, isInitialized
├── hooks/useAuth.ts + useLogin.ts + useRegister.ts + useToast.ts
├── components/ui/                   # button, input, label, card, toast (written manually)
├── components/shared/               # ProtectedRoute, LoadingSpinner, WaggleLogo, Toaster
├── components/layout/               # RootLayout, AuthLayout, DashboardLayout
└── pages/                           # LandingPage, LoginPage, RegisterPage, DashboardPage
```

**Key architecture decisions:**
- **Tailwind v4 CSS-first**: no `tailwind.config.js` — colors defined via `@theme` block in `globals.css` using hex values directly. `@import "tailwindcss"` is the only directive needed.
- **shadcn/ui written manually**: the v3 CLI launches an interactive TUI (preset picker) that doesn't work with piped input. All components (button, input, label, card, toast) written by hand — no difference at runtime.
- **Two Axios instances** (`authApi` / `api`) to prevent infinite 401 refresh loop: `authApi` has no interceptors and is used exclusively for auth endpoints; `api` has request+response interceptors that inject the Bearer token and handle silent token refresh.
- **Direct store import** in `api.ts` interceptors: no circular dependency exists (`authStore` only imports zustand + types), so `useAuthStore.getState()` is called directly instead of `require()`.
- **`isInitialized` flag** in Zustand: `ProtectedRoute` shows a spinner until the silent refresh bootstrap in `RootLayout` completes. Without this, hard refresh flashes a redirect to /login before the cookie is validated.
- **Vite proxy** `/api/*` → strips `/api` → `:8000`. Zero code changes needed for production (nginx rewrite replaces the proxy).

**Problems hit and fixed:**
1. **Vite scaffold used vanilla TS template** (no React) — fixed by manually adding `react`, `react-dom`, `@vitejs/plugin-react` and updating `vite.config.ts`.
2. **TypeScript `baseUrl` deprecated in TS 7.0** — silenced with `"ignoreDeprecations": "6.0"` in tsconfig.
3. **CSS import type error** — added `src/vite-env.d.ts` with `/// <reference types="vite/client" />`.
4. **`require()` in interceptor** — replaced with direct `import { useAuthStore }` since no circular dependency exists.

**Test results:**
```
pnpm tsc --noEmit     → 0 errors  ✅
GET /api/health       → {"status":"ok"} via Vite proxy  ✅
http://localhost:3000 → Landing page renders with Hivenet orange  ✅
/register             → form visible, submits to real backend  ✅
/login                → form visible  ✅
/dashboard (logged out) → redirects to /login  ✅
Hard refresh logged-in → spinner → stays on dashboard  ✅
```

---

### Day 11 — Sources as first-class users-owned entities + Dashboard + Chat UI ✅

**Why this was a refactor, not just UI work:** Before Day 11, `data/connections.json` was a global JSON file shared across all users. Adding a "list my sources" endpoint cleanly required ownership at the data layer — anything else would have been spaghetti. So Day 11 promoted sources to a real first-class entity before any UI was written.

**Backend — sources became a real entity:**

`auth/db.py` — added `waggle_app.sources` table:
```sql
sources(id UUID PK, user_id UUID FK→users CASCADE, label TEXT,
        source_type TEXT, config JSONB, created_at)
```
Indexed on `user_id`. `config` is the per-type bag (postgres credentials, or DuckDB `{file_path, original_name, file_id, table_name}`). Plus async helpers: `create_source`, `get_source` (no auth, for tools), `get_source_for_user` (route-layer ownership), `list_sources_for_user`, `rename_source`, `delete_source`.

`connectors/store.py` — rewritten as a thin async facade over `auth.db`. The old `data/connections.json` file is no longer read or written. Functions now: `save_source`, `get_source`, `get_source_for_user`, `list_sources_for_user`, `rename_source_for_user`, `delete_source_for_user`.

`api/_deps.py` (new) — single `require_source` FastAPI dependency. 404 on ownership mismatch (don't leak existence), 401 if no token.

**Routes that now require auth + ownership:** `/connect`, `/schema/{id}`, `/schema/{id}/llm-context`, `/semantic/{id}`, `/query/{id}`, `/session*`. Each verifies `current_user.id` owns the source before doing any work.

**`api/routes/sources.py` — full CRUD:**
- `POST /sources/upload` — file upload (was already there, now writes to Postgres)
- `GET /sources` — list user's sources
- `GET /sources/{id}` — single source (no secrets)
- `PATCH /sources/{id}` — rename label
- `DELETE /sources/{id}` — also unlinks the uploaded file and clears the cached schema

**db_type dispatch in tools:**
- `agent/tools/schema_tool.py:get_schema()` — dispatches on `source["source_type"]`. `duckdb` → `extract_schema_from_file`, `postgres` → `extract_schema`. Per-source schema cache unchanged.
- `agent/tools/query_tool.py:run_query()` — picks `_pg_fetch` or `_duck_fetch` from the source type and threads it as `fetch_fn` into the validation engine.
- `validation/engine.py:validate()` — gained a `fetch_fn` parameter. The cross-query check no longer hardcodes `from connectors.postgres import fetch_with_config`. Now any connector that matches the `(config, sql) → list[dict]` signature works.

**Pre-existing DuckDB bug fixed:** `fetch_from_file` was using `Path(file_path).stem` (the UUID) as the table name, but `extract_schema_from_file` registered the view under `display_name`. So queries the LLM wrote against `sales_smoke` were being run against a view named after the UUID. Now `fetch_from_file` accepts an explicit `table_name` param threaded through from `source["config"]["table_name"]`.

**Frontend — dashboard + chat shipped:**

`types/index.ts` — added `Source`, `SourceType`, `ToolCall`, `QueryToolResult`, `SchemaToolResult`, `ValidationReport`, `Row`. `QueryResponse.tool_calls` is now properly typed so the chat can extract SQL + data + confidence from `tool_calls[0].result`.

`lib/api.ts` — full `sourceService` (list/get/rename/delete/upload-with-progress).

`hooks/`:
- `useSources` — TanStack list/upload/connect/rename/delete with proper invalidation
- `useArtifacts` — TanStack list/get/create/update/delete
- `useChat` — manages a conversation against one source. Optimistic placeholder while `/query` is in flight, persists `session_id` returned from the backend so follow-ups continue the same conversation.

`lib/artifactInfer.ts` — `summarizeColumns` (numeric/temporal/categorical/boolean), `inferArtifactType` (1×1 numeric → metric, time + numeric → line, ≤6 categories → pie, >6 → bar, two numerics → scatter), `pickAxes`.

`components/ui/` — added `dialog`, `tabs`, `dropdown-menu`, `select`, `separator`, `badge`, `skeleton`, `scroll-area` (all Radix-backed, written by hand because the shadcn CLI is interactive).

`components/artifacts/` — 8 renderers + dispatcher + shared types. Charts use Recharts with the Hivenet orange palette + theme variables. Each renderer takes `{data, styleConfig, name}` and degrades to an explanation pane when the data shape doesn't match.

`components/dashboard/`:
- `SourceSidebar` — left nav, list of sources with overflow menu (open in chat, rename via prompt, delete with confirm), `+` opens AddSourceDialog
- `AddSourceDialog` — Tabs: Upload File (drag-drop + native picker, progress bar) / Connect Postgres (form)
- `DashboardGrid` — responsive 1/2/3/4-column grid of `ArtifactCard`s, filtered by selected source
- `ArtifactCard` — fetches its data by re-running its question through `/query` (so validation stays in the loop and we don't trust raw stored SQL forever), renders via `ArtifactRenderer`, has overflow menu (open chat, refresh, delete)

`components/chat/`:
- `ChatPage` — split-pane: 420–480px conversation column on the left, artifact panel filling the rest. Source header with back button.
- `MessageList` — scrolling bubble list, click an assistant bubble that backs a query result to focus its artifact in the right pane
- `ChatInput` — autosizing textarea, Enter to send, Shift+Enter for newline
- `CurrentArtifactPanel` — shows the latest (or focused) query result, type picker (auto-inferred but user can override per-render), confidence badge, collapsible SQL view, "Save" button → `SaveArtifactDialog`
- `SaveArtifactDialog` — name + type, posts to `/artifacts`

Routes: `/dashboard` (grid + sidebar), `/chat/:connectionId` (split-pane).

**Smoke test (with the dev server up):**
```
POST /auth/register      → 200 + access token + refresh cookie  ✅
POST /sources/upload     → 201 sales_smoke.csv → 4 rows, 4 cols, source_type=duckdb  ✅
GET  /sources            → 1 source listed for owner             ✅
POST /query/{id} "what is the total revenue?"
  → SQL: SELECT SUM(s.revenue) FROM sales_smoke s
  → data: [{"sum(s.revenue)": 4401.0}]    (1200.5+800+1500+900.5 ✓)
  → response: "The total revenue is $4401.0..."
  → 1 attempt, validation passed                                 ✅

Ownership checks (second user / no auth):
  GET  /sources                  → []                            ✅
  GET  /sources/{otherUserId}    → 404                           ✅
  POST /query/{otherUserId}      → 404                           ✅
  POST /query (no Bearer)        → 401                           ✅
```

**Files changed (~30 new, ~10 modified):**
- Backend new: `api/_deps.py`
- Backend modified: `auth/db.py`, `connectors/store.py`, `connectors/duckdb.py`, `validation/engine.py`, `agent/tools/schema_tool.py`, `agent/tools/query_tool.py`, `api/routes/{connect,sources,schema,semantic,query,session}.py`
- Frontend new: `pages/ChatPage.tsx`, `lib/artifactInfer.ts`, `hooks/useSources.ts`, `hooks/useArtifacts.ts`, `hooks/useChat.ts`, all of `components/artifacts/`, `components/dashboard/`, `components/chat/`, plus 8 new UI primitives in `components/ui/`
- Frontend modified: `types/index.ts`, `lib/api.ts`, `pages/DashboardPage.tsx`, `components/layout/DashboardLayout.tsx`, `App.tsx`

**Known carry-over items, not blocking:**
- `connectors/bigquery.py` still empty (M6).
- Old `data/connections.json` file on disk is now unread; can be deleted.
- `semantic/validator.py` empty file still there.
- The directory is not a git repo locally; recommend `git init` before Day 12 so we get real diffs.

---

## What's Next — Ordered Priority

### Day 12 — Artifact editor + onboarding flow
- [ ] Gear icon → Sheet with Query / Style / Schedule tabs
- [ ] Onboarding: Connect DB → LLM Q&A → Model ready

### M6 — BigQuery connector
- [ ] `connectors/bigquery.py` — same interface as `postgres.py`
- [ ] Add `db_type: bigquery` support to `/connect`

### M7 — Polish
- [ ] Error handling and user-facing error messages
- [ ] README + demo video

---

## Environment Setup

```bash
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Fill in: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, PG_* values

uvicorn api.main:app --reload
```

**Current .env structure:**
```
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_...
LLM_MODEL=llama-3.3-70b-versatile

PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=...
PG_DATABASE=waggle_dev
```

---

## LLM Provider Notes

**Current:** Groq free tier — `api.groq.com/openai/v1`, model `llama-3.3-70b-versatile`  
Zero code changes needed to switch providers — just update `.env`. The client in `agent/llm.py` is OpenAI-compatible.

**Hivenet GPU rental (paused):**  
- Instance: 8x RTX 4090, vLLM running Llama 3.3 70B
- Issue: `/v1/models` returns 404 — routing problem on that instance
- Status: Switched to Groq to unblock development; Hivenet to be retested with a new instance

**Model preference for Waggle:**
1. Llama 3.3 70B Instruct — best SQL/JSON quality
2. Mistral Small 24B — good structured output, cheaper
3. Avoid: Falcon 3B/7B (too small for reliable SQL), Qwen VL (vision model)

---

## Previous Project Context

Before this PFE project, a separate Waggle experiment was built on a VPS with:
- Slack bot (Flask + slack-bolt) connected to BigQuery via Cube.js
- MCP server for LLM ↔ Cube.js bridge
- Docker Compose deployment on Hivenet GPU VPS

That project is separate from this codebase. Lessons learned:
- Cube.js 0.31 requires JS schema files (not YAML) for complex cases
- JWT auth is needed for Cube.js API calls
- Docker networking between services requires careful container naming

---

## GitHub Issues Template

```markdown
## [M{n}-{x}]: {Feature name}

**Milestone:** M{n} — {Milestone name}
**Date:** YYYY-MM-DD

### What was built
- (bullet list)

### Design decisions
- (why you chose this approach)

### Problems encountered
- (what broke and how you fixed it)

### Files changed
- path/to/file.py

### Test result
(paste curl output or test confirmation)

### What I'd change for production
- (honest assessment)
```

---

*Last updated: 2026-05-06 — Day 11 done: sources promoted to user-owned first-class entity (Postgres-backed, ownership enforced everywhere), full dashboard (sidebar + grid + AddSource dialog), full chat (split-pane + 8 artifact renderers + save flow), DuckDB table-name bug fixed. Day 12 next: artifact editor sheet + onboarding flow.*
