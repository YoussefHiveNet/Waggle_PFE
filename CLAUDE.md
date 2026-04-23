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
│   ├── main.py                  # App entrypoint, route wiring
│   └── routes/
│       ├── connect.py           # POST /connect, GET /connect/{id}
│       ├── schema.py            # GET /schema/{id}, /schema/{id}/llm-context
│       ├── semantic.py          # POST/GET/DELETE /semantic/{id}
│       ├── session.py           # POST /session, GET /session/{id}, GET /sessions
│       └── query.py             # POST /query/{id}  ← not yet wired
│
├── agent/
│   ├── llm.py                   # OpenAI-compat client (Groq / Hivenet)
│   ├── session.py               # JSONL persistence — one file per session
│   ├── context.py               # Token estimation + compaction
│   ├── runtime.py               # Harness loop  ← not yet built
│   └── tools/
│       ├── schema_tool.py       # Schema extraction + LLM formatting
│       ├── semantic_tool.py     # LLM generates YAML from schema
│       └── query_tool.py        # NL → SQL → validate  ← not yet built
│
├── connectors/
│   ├── postgres.py              # asyncpg: connect, fetch, extract_schema
│   ├── store.py                 # JSON-backed connection registry
│   └── bigquery.py              # Placeholder — not yet built
│
├── semantic/
│   ├── models.py                # Dataclasses: Cube, Dimension, Measure, Join
│   ├── engine.py                # YAML load/save/parse/build_llm_context
│   └── models/                  # Stored .yaml files per connection_id
│
├── validation/
│   └── engine.py                # 5-check validation pipeline  ← not yet built
│
├── data/
│   ├── connections.json         # Auto-generated connection store
│   ├── schemas/                 # Cached extracted schemas per connection_id
│   └── sessions/                # One .jsonl file per session
│
├── config.py                    # LLMConfig + DBConfig from .env
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
| Semantic layer | Custom YAML engine | Budget reasons + capstone learning value |
| SQL parsing | sqlglot | Free, pure Python, multi-dialect |
| Session format | JSONL | Appendable, human-readable, same format as Claude Code / OpenAI evals |
| Session tracking | GitHub Issues + Milestones | Doubles as capstone journal |
| Frontend | React + TypeScript | Already built, pre-exists |

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
| **M3** | Agent harness + query tool | 🔄 In Progress (Day 7 left) |
| **M4** | Validation engine | ✅ Done (built alongside Day 6) |
| **M5** | React frontend integration | ⬜ Not started |
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

## What's Next — Ordered Priority

### Day 7 — runtime.py
- [ ] `agent/runtime.py` — conversation harness: check compaction → build system prompt → append user message → call LLM with full session history → append response → return
- [ ] Update `POST /query/{connection_id}` to accept optional `session_id` for multi-turn conversations
- [ ] Test: two-turn conversation referencing prior context

### M5 — Frontend integration
- [ ] Connect React frontend to FastAPI backend
- [ ] Connection form → `POST /connect`
- [ ] Schema viewer, semantic model display + business Q&A flow
- [ ] Query input + result table with confidence badge

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

*Last updated: 2026-04-22 — Day 6 done: NL → SQL query tool + validation pipeline wired*
