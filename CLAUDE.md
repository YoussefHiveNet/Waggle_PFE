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
│       └── semantic.py          # POST /semantic/{id}  ← next to build
│
├── agent/
│   ├── llm.py                   # OpenAI-compat client (Groq / Hivenet)
│   ├── runtime.py               # Harness loop  ← not yet built
│   ├── context.py               # Token tracking + compaction  ← not yet
│   ├── session.py               # JSONL persistence  ← not yet
│   └── tools/
│       ├── schema_tool.py       # Schema extraction + LLM formatting
│       ├── semantic_tool.py     # LLM generates YAML from schema  ← in progress
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
│   └── schemas/                 # Cached extracted schemas per connection_id
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

---

## Milestone Map

| Milestone | Scope | Status |
|---|---|---|
| **M1** | Scaffolding + DB connection | ✅ Done |
| **M2** | Schema extraction + Semantic YAML | 🔄 In Progress |
| **M3** | Agent harness + query tool | ⬜ Not started |
| **M4** | Validation engine | ⬜ Not started |
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
**Files modified:** `connectors/postgres.py` (added `test_connection`, `fetch_with_config`), `api/main.py`

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
**Files modified:** `connectors/postgres.py` (added `extract_schema`), `api/main.py`

**What was built:**
- `extract_schema(config)` — reads PostgreSQL `information_schema`, returns structured dict with:
  - Tables, columns, data types
  - Primary keys (marked `primary_key: true`)
  - Foreign keys (marked with `foreign_table` + `foreign_column`)
  - 3 sample rows per table
  - Approximate row counts
- `schema_tool.py`:
  - `get_schema(connection_id, force_refresh)` — with file cache in `data/schemas/`
  - `format_for_llm(schema)` — token-efficient string (excludes nullability/defaults, keeps FK annotations + samples)
  - `get_foreign_keys(schema)` — flat list of FK relationships
- `GET /schema/{id}` — returns full schema JSON
- `GET /schema/{id}/llm-context` — returns exactly what the LLM sees (debug endpoint)

**Test DB in `waggle_dev` (Mac):**
```sql
tables: users, orders, products
FK: orders.user_id → users.id
Sample data: 3 users, 4 orders, 2 products
```

**Test result:**
```
GET /schema/{id}            → 3 tables, all columns + FKs + sample rows  ✅
GET /schema/{id}/llm-context → compact token-efficient string             ✅
```

---

### Day 4 — Semantic YAML generation ✅
**Files created:** `semantic/models.py`, `semantic/engine.py`, `agent/tools/semantic_tool.py`, `api/routes/semantic.py`  
**Files modified:** `api/main.py`

**What was built:**
- `semantic/models.py` — Python dataclasses:
  - `DimensionType` enum: `string | number | time | boolean`
  - `MeasureType` enum: `sum | count | count_distinct | avg | max | min | number`
  - `Dimension`, `Measure`, `Join`, `Cube`, `SemanticModel` dataclasses
  - `Measure.to_sql_expression()` — generates `SUM(...)`, `COUNT(...)` etc.
- `semantic/engine.py` — `SemanticEngine` class:
  - `load(connection_id)` — reads YAML from disk, parses to dataclasses, in-memory cache
  - `save(connection_id, model)` — serializes back to YAML, invalidates cache
  - `exists(connection_id)` — check if model file exists
  - `build_llm_context(model, relevant_cubes)` — compact string for LLM SQL generation
  - `_parse_model / _parse_cube / _serialize_model` — YAML ↔ dataclass conversion
- `agent/tools/semantic_tool.py` — LLM-driven generation:
  - Phase 1: LLM classifies each column as `dimension | measure | time | skip`
  - Phase 2: LLM generates clarification questions about business logic
  - Phase 3: User answers → business rules embedded in YAML measures
  - Phase 4: Assemble and save YAML model
  - Uses sample rows to help LLM classify (critical — `amount: [99.99, 149.00]` → clearly a measure)
- `api/routes/semantic.py`:
  - `POST /semantic/{connection_id}` — triggers generation (with optional user answers)
  - `GET /semantic/{connection_id}` — returns existing model
  - `DELETE /semantic/{connection_id}` — removes model (triggers regeneration)

**Test result:**
```
POST /semantic/{id} (empty body)       → 5 smart LLM clarification questions  ✅
POST /semantic/{id} (with rules)       → YAML saved with 3 cubes              ✅
GET  /semantic/{id}                    → model + LLM context returned          ✅
revenue measure                        → SUM(CASE WHEN status='completed'...)  ✅
active_user_count                      → COUNT(CASE WHEN last_login > NOW()-30d)✅
```

**Bugs found and fixed:**
1. **Python 3.9 `X | None` syntax error** — all files using `dict | None` or `list[str]`
   syntax got `from __future__ import annotations` added. Pydantic models specifically
   were changed to use `Optional[dict]` from `typing` since Pydantic evaluates
   annotations at runtime even with the future import.
   - Files fixed: `connectors/store.py`, `connectors/postgres.py`, `semantic/models.py`,
     `agent/tools/schema_tool.py`, `agent/tools/semantic_tool.py`, `api/routes/semantic.py`

2. **Double-wrapping in `build_llm_context`** — `SemanticEngine.build_llm_context()` was
   calling `m.to_sql_expression()` which wraps `m.sql` in `SUM(...)`. But the LLM already
   stores full expressions in `m.sql` (e.g. `SUM(CASE WHEN ...)`), causing `SUM(SUM(...))`.
   - Fix: changed line in `semantic/engine.py` to use `m.sql` directly in context display.
   - `to_sql_expression()` is still correct for when a raw column name needs wrapping.

---

## What's Next — Ordered Priority

### Day 5 (current) — M3: Query tool + Agent harness

### M3 — Agent harness + query tool
- [ ] `agent/tools/query_tool.py` — NL → SQL with retry loop (3 attempts, accumulating error history)
- [ ] `agent/runtime.py` — harness loop: assemble context → LLM → tool call → result → repeat
- [ ] `api/routes/query.py` — `POST /query/{connection_id}` endpoint
- [ ] Test: "what is the total revenue?" against `waggle_dev`

### M4 — Validation engine
- [ ] `validation/engine.py` — 5 checks in order:
  1. Structural (empty result, row explosion, all-null columns, duplicate rows)
  2. Semantic coherence (question asks "how many" but no integer column returned, etc.)
  3. Business rule assertions (from semantic model YAML)
  4. Cross-query verification (LLM writes a simpler check query)
  5. LLM sanity review (does the result magnitude make sense?)
- [ ] Wire into query_tool retry loop

### M5 — Frontend integration
- [ ] Connect React frontend to FastAPI backend
- [ ] Connection form → calls `POST /connect`
- [ ] Schema viewer
- [ ] Semantic model display + business Q&A flow
- [ ] Query input + result table with confidence badge

### M6 — BigQuery connector
- [ ] `connectors/bigquery.py` — implement same interface as postgres.py
- [ ] Add `db_type: bigquery` support to `/connect`

### M7 — Polish
- [ ] Session persistence (`agent/session.py` — JSONL files)
- [ ] Token tracking (`agent/context.py`)
- [ ] Error handling and user-facing error messages
- [ ] README + demo video

---

## Environment Setup

```bash
# Clone and set up
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create .env (never commit this)
cp .env.example .env
# Fill in: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, PG_* values

# Run
uvicorn api.main:app --reload
```

**Current .env values (structure — fill in real values):**
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
- URL format (once fixed): `https://{instance-id}-8800.uae.tenants.hivecompute.ai:4443/v1`
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

That project is separate from this codebase. The lessons learned:
- Cube.js 0.31 requires JS schema files (not YAML) for complex cases
- JWT auth is needed for Cube.js API calls (not a raw "Bearer test" token)
- Docker networking between services requires careful container naming

---

## GitHub Issues Template

Use this for every feature/day completed:

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

*Last updated: 2026-04-21 — M2 fully verified on Mac*
