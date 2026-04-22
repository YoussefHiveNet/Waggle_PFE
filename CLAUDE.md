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



what i changed today : Day 5 — Session persistence + token tracking
What we're building and why
Every serious agent system stores conversations. Without persistence, if uvicorn restarts you lose all context. More importantly, the agent needs to know what was said earlier in a conversation to give coherent answers — "show me last month's revenue" only makes sense if the agent remembers you already connected to the orders database.
We're using JSONL (one JSON object per line) — the same format the leaked Claude Code used and the same format every production LLM system uses. Each line is one event: user message, assistant response, tool call, tool result. Simple, appendable, readable.
The token tracker sits alongside the session and counts how many tokens are in the current context window. When it gets too large we trigger compaction — summarizing old messages to free space. This is the bug that was draining tokens in the Claude Code leak: bad session management = cache misses = full re-processing every turn.
New files today
waggle/
├── agent/
│   ├── session.py        ← NEW — JSONL conversation store
│   └── context.py        ← NEW — token counter + compaction
└── data/
    └── sessions/         ← AUTO-CREATED — one .jsonl per session

1 — Create agent/session.py:
python# agent/session.py
"""
Session persistence using JSONL format.

Every conversation turn is appended as a JSON line:
  {"role": "user",      "content": "...", "ts": 1234567890}
  {"role": "assistant", "content": "...", "ts": 1234567890}
  {"role": "tool",      "name": "query_tool", "result": {...}, "ts": ...}

Why JSONL:
- Appendable without rewriting the whole file
- Human readable — you can open it in any text editor
- Streamable — read line by line without loading everything
- Same format used by Claude Code, OpenAI evals, every prod system
"""
import json
import time
import uuid
from pathlib import Path
from typing import Literal

SESSIONS_DIR = Path("data/sessions")

MessageRole = Literal["user", "assistant", "tool", "system"]

class Session:
    def __init__(self, session_id: str, connection_id: str):
        self.session_id    = session_id
        self.connection_id = connection_id
        self.path          = SESSIONS_DIR / f"{session_id}.jsonl"
        self._messages: list[dict] = []
        SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

    # ── WRITE ──────────────────────────────────────────────────────────

    def add(self, role: MessageRole, content: str, **extra) -> dict:
        """Append one message to the session."""
        msg = {
            "role":          role,
            "content":       content,
            "ts":            int(time.time()),
            "connection_id": self.connection_id,
            **extra
        }
        self._messages.append(msg)
        # Append to JSONL file immediately — never lose a message
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(msg) + "\n")
        return msg

    def add_tool_result(self, tool_name: str, result: dict) -> dict:
        """Record a tool call result as its own event."""
        return self.add(
            role="tool",
            content=f"Tool {tool_name} executed",
            tool_name=tool_name,
            result=result
        )

    # ── READ ───────────────────────────────────────────────────────────

    def messages(self) -> list[dict]:
        """Return all messages in memory."""
        return self._messages.copy()

    def to_llm_messages(self) -> list[dict]:
        """
        Convert session to the format the LLM API expects.
        Tool results are folded into assistant context.
        Skips tool events — those are internal records.
        """
        llm_msgs = []
        for msg in self._messages:
            if msg["role"] in ("user", "assistant"):
                llm_msgs.append({
                    "role":    msg["role"],
                    "content": msg["content"]
                })
            elif msg["role"] == "system":
                llm_msgs.insert(0, {
                    "role":    "system",
                    "content": msg["content"]
                })
        return llm_msgs

    def last_n(self, n: int) -> list[dict]:
        """Return last N messages — used by context compaction."""
        return self._messages[-n:]

    def message_count(self) -> int:
        return len(self._messages)

    def replace_messages(self, new_messages: list[dict]):
        """
        Replace in-memory messages with compacted version.
        Rewrites the JSONL file to match.
        Used by context compaction.
        """
        self._messages = new_messages
        with self.path.open("w", encoding="utf-8") as f:
            for msg in new_messages:
                f.write(json.dumps(msg) + "\n")

    # ── SUMMARY ────────────────────────────────────────────────────────

    def summary(self) -> dict:
        return {
            "session_id":    self.session_id,
            "connection_id": self.connection_id,
            "message_count": len(self._messages),
            "path":          str(self.path)
        }


# ── SESSION STORE ──────────────────────────────────────────────────────────

_sessions: dict[str, Session] = {}

def create_session(connection_id: str) -> Session:
    """Create a new session and register it."""
    session_id = str(uuid.uuid4())
    session    = Session(session_id, connection_id)
    _sessions[session_id] = session
    return session

def get_session(session_id: str) -> Session | None:
    """Get session from memory or reload from disk."""
    if session_id in _sessions:
        return _sessions[session_id]
    # Try loading from disk (server restart recovery)
    path = SESSIONS_DIR / f"{session_id}.jsonl"
    if not path.exists():
        return None
    session = _resume_from_disk(session_id, path)
    _sessions[session_id] = session
    return session

def _resume_from_disk(session_id: str, path: Path) -> Session:
    """
    Reload a session from its JSONL file.
    This is the resume functionality — exactly what was broken
    in the Claude Code leak (db8 bug stripped tool records).
    We preserve ALL record types so resume works correctly.
    """
    messages = []
    connection_id = ""
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
                messages.append(msg)
                if not connection_id and "connection_id" in msg:
                    connection_id = msg["connection_id"]
            except json.JSONDecodeError:
                continue  # skip corrupted lines

    session = Session(session_id, connection_id)
    session._messages = messages
    return session

def list_sessions(connection_id: str | None = None) -> list[dict]:
    """List all sessions, optionally filtered by connection."""
    result = []
    for path in SESSIONS_DIR.glob("*.jsonl"):
        session_id = path.stem
        s = get_session(session_id)
        if s:
            if connection_id is None or s.connection_id == connection_id:
                result.append(s.summary())
    return result

2 — Create agent/context.py:
python# agent/context.py
"""
Token tracking and context compaction.

Why this matters:
- LLMs have a context window limit (Llama 3.3 70B = 128k tokens)
- Groq free tier has per-request token limits
- Long sessions accumulate tokens fast
- When context is too big: costs explode, responses degrade

Our strategy:
1. Estimate tokens cheaply (no API call needed)
2. When threshold reached, ask LLM to summarize old messages
3. Replace old messages with summary + keep last N messages intact
4. Session file is rewritten to reflect compaction

This is the fix for the exact bug described in the Claude Code leak.
"""
from agent.session import Session

# ── CONSTANTS ─────────────────────────────────────────────────────────────

# Rough estimate: 1 token ≈ 4 characters (standard approximation)
CHARS_PER_TOKEN   = 4

# Trigger compaction when estimated tokens exceed this
COMPACTION_THRESHOLD = 6000   # conservative for Groq free tier

# Always keep last N messages verbatim after compaction
# (so the LLM has immediate context)
KEEP_RECENT = 6

# ── TOKEN ESTIMATION ──────────────────────────────────────────────────────

def estimate_tokens(text: str) -> int:
    """
    Fast token estimation without an API call.
    Accurate enough for threshold decisions.
    Real tokenizers vary but 4 chars/token is a safe average.
    """
    return len(text) // CHARS_PER_TOKEN

def session_token_estimate(session: Session) -> int:
    """Estimate total tokens in a session's message history."""
    total_chars = sum(
        len(msg.get("content", "")) + len(str(msg.get("result", "")))
        for msg in session.messages()
    )
    return total_chars // CHARS_PER_TOKEN

def needs_compaction(session: Session) -> bool:
    """Return True if session is approaching token limit."""
    return session_token_estimate(session) > COMPACTION_THRESHOLD

# ── COMPACTION ────────────────────────────────────────────────────────────

COMPACTION_PROMPT = """
Summarize the following conversation history concisely.
Preserve:
- What database/tables were discussed
- What queries were run and what they returned
- Any business rules or definitions that were established
- Any errors that occurred and how they were resolved

Be brief but complete. This summary replaces the original messages.

CONVERSATION:
{history}
"""

async def compact_session(session: Session, llm) -> dict:
    """
    Summarize old messages, keep recent ones, rewrite session.
    Returns a report of what was done.
    """
    messages = session.messages()

    if len(messages) <= KEEP_RECENT:
        return {"compacted": False, "reason": "too few messages"}

    # Split: old messages get summarized, recent ones are kept verbatim
    old_messages    = messages[:-KEEP_RECENT]
    recent_messages = messages[-KEEP_RECENT:]

    # Build history text for LLM
    history_text = "\n".join([
        f"{m['role'].upper()}: {m.get('content', str(m.get('result', '')))}"
        for m in old_messages
    ])

    # Ask LLM to summarize
    summary_text = await llm(
        COMPACTION_PROMPT.format(history=history_text)
    )

    # Build compacted message list
    summary_msg = {
        "role":          "system",
        "content":       f"[CONVERSATION SUMMARY]\n{summary_text}",
        "ts":            int(__import__('time').time()),
        "connection_id": session.connection_id,
        "compacted":     True,
        "replaced_count": len(old_messages)
    }

    new_messages = [summary_msg] + recent_messages

    # Rewrite session
    session.replace_messages(new_messages)

    return {
        "compacted":      True,
        "removed":        len(old_messages),
        "kept_recent":    KEEP_RECENT,
        "summary_tokens": estimate_tokens(summary_text)
    }

# ── CONTEXT BUILDER ───────────────────────────────────────────────────────

def build_system_prompt(connection_id: str, semantic_context: str) -> str:
    """
    The system prompt injected at the start of every LLM call.
    Kept short deliberately — every token here costs on every turn.
    """
    return f"""You are Waggle, an AI data analyst.
You have access to a database (connection: {connection_id}).

{semantic_context}

Rules:
- Always generate valid PostgreSQL SQL
- Use the semantic model definitions above for metrics
- If unsure, ask a clarifying question rather than guessing
- Return results as structured data, not prose
"""

3 — Add session routes to api/routes/session.py:
python# api/routes/session.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from agent.session import create_session, get_session, list_sessions

router = APIRouter()

class CreateSessionRequest(BaseModel):
    connection_id: str

@router.post("/session")
async def new_session(body: CreateSessionRequest):
    """Create a new conversation session for a connection."""
    session = create_session(body.connection_id)
    return session.summary()

@router.get("/session/{session_id}")
async def get_session_info(session_id: str):
    """Get session info and full message history."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        **session.summary(),
        "messages": session.messages()
    }

@router.get("/sessions")
async def sessions(connection_id: str | None = None):
    """List all sessions, optionally filtered by connection."""
    return {"sessions": list_sessions(connection_id)}

4 — Update api/main.py:
python# api/main.py
from fastapi import FastAPI
from agent.llm import ping as llm_ping
from connectors.postgres import ping as db_ping
from api.routes.connect  import router as connect_router
from api.routes.schema   import router as schema_router
from api.routes.semantic import router as semantic_router
from api.routes.session  import router as session_router

app = FastAPI(title="Waggle API", version="0.1.0")

app.include_router(connect_router)
app.include_router(schema_router)
app.include_router(semantic_router)
app.include_router(session_router)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/ping-llm")
async def ping_llm():
    try:
        response = await llm_ping()
        return {"status": "ok", "response": response}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

@app.get("/ping-db")
async def ping_db():
    try:
        response = await db_ping()
        return {"status": "ok", "response": response}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

5 — Test sequence, run in order:
bash# 1. Create a session
curl -X POST http://127.0.0.1:8000/session \
  -H "Content-Type: application/json" \
  -d '{"connection_id": "31a052b8-e5ac-4c0a-b71a-be13bdbeb4dc"}'

# 2. Check it exists (use session_id from step 1)
curl http://127.0.0.1:8000/session/YOUR_SESSION_ID

# 3. List all sessions
curl http://127.0.0.1:8000/sessions

# 4. Verify the JSONL file was created on disk
# On Windows Git Bash:
ls data/sessions/
cat data/sessions/YOUR_SESSION_ID.jsonl
After step 1 you'll get back a session_id. Save it — every query in Day 6 and 7 will use it alongside the connection_id.




M1 — Scaffolding + DB connection        ✅ DONE  (Days 1–2)
M2 — Schema extraction + Semantic YAML ✅ DONE  (Days 3–4)
M3 — Agent harness + query tool
     Day 5: Session + context           ⬜ TODAY
     Day 6: query_tool.py               ⬜
     Day 7: runtime.py + /query         ⬜
M4 — Validation engine                  ⬜       (Days 8–9)
M5 — Frontend integration               ⬜       (Days 10–12)
M6 — BigQuery connector                 ⬜       (Days 13–14)
M7 — Polish + demo prep                 ⬜       (Days 15–16)
─────────────────────────────────────────────────────────────
Days completed:  4 / 16
Days remaining: 12 / 16