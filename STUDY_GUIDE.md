# Waggle — Defense Study Guide

A focused, supervisor-ready walkthrough of every layer of the project. Read top to bottom once, then use the **Cheat sheet** at the end as recall fuel before the meeting.

> If you only memorize three sentences, memorize these:
> **Waggle is an NL→SQL platform that decouples *what columns mean* (semantic layer) from *how the LLM uses them* (agent harness), with a 5-check validation pipeline so we never trust the LLM blindly.** **The semantic YAML is hand-rolled instead of using Cube.js because we wanted full control and didn't want a paid SaaS dependency.** **Every user request goes through one deterministic two-call pattern — never a loop — so the agent is bounded, debuggable, and impossible to runaway.**

---

## 1. The 30-second pitch

**Problem:** Companies have huge databases but most people who want answers don't write SQL. Existing solutions (BI tools) need a data engineer to model the data first.

**Waggle's solution:**
1. User connects a database (Postgres or uploads a CSV).
2. We auto-extract the schema.
3. An LLM helps build a **semantic model** (YAML) that captures business meaning — "what counts as revenue?", "what is an active user?".
4. The user asks questions in plain English.
5. The agent generates SQL → executes it → validates the result through 5 deterministic + LLM checks → answers in plain English.
6. Results can be saved as **artifacts** (charts/metrics) on a dashboard, with auto-refresh.

**Why it's a real PFE project, not a toy:** the semantic layer + validation pipeline + agent harness are non-trivial systems-design problems. The LLM is a *component*, not the whole product.

---

## 2. Tech stack — what & why

| Layer | Choice | Why this | What we considered |
|---|---|---|---|
| Backend | **FastAPI + asyncpg** | Async-first; Python ecosystem (LLM + DB libs); type hints + Pydantic validate request bodies for free | Flask (sync, no native async), Django (too heavy, ORM-bound), Node/Express (would mean a JS LLM stack which is less mature) |
| LLM provider | **Groq (free tier)** | OpenAI-compatible HTTP, free, fast | Hivenet (had SSL/routing issues — paused), OpenAI (paid), local llama.cpp (slow on laptop) |
| LLM model | `llama-3.3-70b-versatile` | Best free SQL/JSON quality | Mistral Small 24B (cheaper but worse at SQL), GPT-4 (not free) |
| LLM temperature | **0.1** | Determinism > creativity for SQL | 0.0 (sometimes brittle), 0.7 (too creative for production SQL) |
| Local DB | PostgreSQL 18 | Production-grade, asyncpg pools, JSON support | SQLite (no concurrent writers), MySQL (weaker JSON) |
| File queries | **DuckDB** (embedded) | Zero-setup, analytical SQL on CSV/Parquet, fully isolated per request | Pandas (slower, no SQL), Polars (no SQL), shell out to sqlite (worse at analytics) |
| Auth | **JWT (python-jose) + bcrypt** | Stateless access tokens for horizontal scale; opaque refresh tokens in httpOnly cookie for security | Session cookies (don't scale across instances), OAuth (overkill for a PFE), magic links (slower UX) |
| SQL parser | **sqlglot** | Free, pure Python, multi-dialect — used to syntax-validate SQL before hitting DB | Manually written regex (fragile), psycopg parse (Postgres-only) |
| Semantic layer | **Custom YAML engine** | Total control + capstone learning; can interop with Cube.js later | Cube.js (paid SaaS or complex self-host), LookML (closed-source) |
| Session format | **JSONL** (append-only) | Same format Claude Code/OpenAI evals use; cheap appends; resumable after server crash | SQL table (heavier writes), pickle (not human-readable), Redis (extra infra) |
| Frontend | **React 19 + Vite 8 + Tailwind v4 + shadcn/ui** | Industry standard, fast HMR, accessible primitives via Radix | Next.js (SSR overkill for an SPA), Svelte (smaller ecosystem), Vue (team familiarity) |
| Frontend state | **TanStack Query + Zustand** | TanStack handles server state (cache, invalidation, retries); Zustand handles auth UI state | Redux (boilerplate-heavy), Apollo (we're not GraphQL), Context API (no DevTools) |
| Charts | **Recharts** | React-native, declarative, free | Chart.js (imperative), D3 (too low-level), Plotly (paid features, large bundle) |

---

## 3. Repository map

```
Waggle_PFE/
├── CLAUDE.md                       Master journal — every decision + day-by-day
├── STUDY_GUIDE.md                  ← this file
├── backend/
│   ├── api/
│   │   ├── main.py                 FastAPI app, lifespan, CORS, routers
│   │   ├── _deps.py                require_source dependency (auth + ownership)
│   │   └── routes/
│   │       ├── auth.py             register/login/refresh/logout/me
│   │       ├── sources.py          upload/list/get/rename/delete sources
│   │       ├── connect.py          POST /connect (Postgres credentials → connection_id)
│   │       ├── schema.py           GET /schema/{id}, /llm-context
│   │       ├── semantic.py         POST/GET /semantic/{id}
│   │       ├── session.py          POST/GET /session, GET /sessions
│   │       ├── query.py            POST /query/{id} ← the main user endpoint
│   │       └── artifacts.py        POST/GET/PUT/DELETE /artifacts
│   ├── auth/
│   │   ├── password.py             bcrypt hash/verify
│   │   ├── jwt.py                  Token issue/decode + get_current_user dep
│   │   └── db.py                   waggle_app schema: users, refresh_tokens, sources, artifacts
│   ├── agent/
│   │   ├── llm.py                  OpenAI-compat client (httpx, Groq)
│   │   ├── session.py              Session class + JSONL persistence
│   │   ├── context.py              Token estimation + compaction + system prompt
│   │   ├── runtime.py              ★ THE AGENT HARNESS (two-call pattern)
│   │   └── tools/
│   │       ├── schema_tool.py      Schema cache + LLM formatting
│   │       ├── semantic_tool.py    YAML generator (4-phase LLM pipeline)
│   │       └── query_tool.py       ★ NL→SQL→validate (the inner loop)
│   ├── connectors/
│   │   ├── postgres.py             asyncpg-based: connect, fetch, extract_schema
│   │   ├── duckdb.py               CSV/Parquet via embedded DuckDB
│   │   ├── store.py                Async facade over auth.db.sources
│   │   └── bigquery.py             Empty placeholder (M6)
│   ├── semantic/
│   │   ├── models.py               Dataclasses: Cube, Dimension, Measure, Join
│   │   ├── engine.py               YAML load/save/build_llm_context
│   │   └── models/                 Generated *.yaml files per source
│   ├── validation/
│   │   └── engine.py               ★ 5-check validation pipeline
│   ├── data/                       Runtime artifacts (gitignored sessions/, schemas/)
│   ├── scripts/
│   │   └── seed_hard.sql           50-table stress-test DB (waggle_hard)
│   └── config.py                   LLMConfig + DBConfig + AuthConfig + UploadConfig
└── frontend/
    └── src/
        ├── lib/
        │   ├── api.ts              Two Axios instances + service helpers
        │   ├── queryClient.ts      TanStack Query config
        │   ├── artifactInfer.ts    Smart chart-type heuristic
        │   └── utils.ts            shadcn cn()
        ├── store/authStore.ts      Zustand auth state
        ├── hooks/                  React Query mutations + auth hooks
        ├── pages/                  Landing, Login, Register, Dashboard, Chat
        ├── components/
        │   ├── ui/                 shadcn primitives (Dialog, Sheet, Tabs, …)
        │   ├── shared/             ProtectedRoute, LoadingSpinner, …
        │   ├── layout/             RootLayout, AuthLayout, DashboardLayout
        │   ├── dashboard/          SourceSidebar, AddSourceDialog, ArtifactCard, DashboardGrid
        │   ├── chat/               ChatPage parts, MessageList, ChatInput, CurrentArtifactPanel
        │   ├── artifacts/          8 renderers + ArtifactRenderer dispatcher + ArtifactEditorSheet
        │   └── onboarding/         SourceOnboardingDialog (semantic wizard)
        └── types/index.ts          All TS interfaces mirroring backend Pydantic models
```

---

## 4. End-to-end data flow (the one diagram that matters)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  USER asks: "what is total revenue last quarter?"                            │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Frontend  POST /api/query/{connection_id}                                    │
│           Bearer <access_token>                                               │
│           {question, session_id?}                                             │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  api/routes/query.py                                                          │
│   1. require_source dep → checks JWT + source ownership                       │
│   2. get_or_create_session(connection_id, session_id)                         │
│   3. await run_turn(session, user_message)                                    │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  agent/runtime.py:run_turn()  ← THE HARNESS (two-call pattern)                │
│                                                                               │
│   ┌─ Compact session if > 6000 estimated tokens                               │
│   │                                                                           │
│   ├─ Load semantic YAML (or fall back to raw schema)                          │
│   │                                                                           │
│   ├─ Append user message to session, flush JSONL                              │
│   │                                                                           │
│   ├─ CALL 1:  LLM sees [system + tool descriptions + clean history]           │
│   │           → outputs either JSON tool call or plain text                   │
│   │                                                                           │
│   ├─ Parse output:                                                            │
│   │   - Plain text → return as final answer                                   │
│   │   - JSON {"tool":"query","params":{...}} → execute tool                   │
│   │                                                                           │
│   └─ CALL 2:  LLM sees [system WITHOUT tool descriptions + tool result]       │
│              → writes plain-language answer                                   │
│              (No tools available → guaranteed cannot loop)                    │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │ (when tool="query")
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  agent/tools/query_tool.py:run_query()  ← INNER LOOP (max 3 attempts)         │
│                                                                               │
│   ┌─ _resolve_cubes()  keyword-match question to relevant cubes               │
│   │                                                                           │
│   ├─ for attempt in 1..3:                                                     │
│   │     a. _generate_sql()   ← LLM call: NL question + cube context → SQL    │
│   │     b. sqlglot.parse_one() ← syntax-validate (free, no DB hit)           │
│   │     c. fetch_with_config()  ← actually run against Postgres/DuckDB        │
│   │     d. await validate(sql, rows, question, model, fetch_fn)               │
│   │           ┌─ structural   (empty result, row explosion, all-NULL)         │
│   │           ├─ semantic     (asks "how many" but no numeric col returned)   │
│   │           ├─ assertions   (revenue ≥ 0, etc — from YAML)                  │
│   │           ├─ cross-query  (LLM writes simpler COUNT, compare row counts)  │
│   │           └─ llm-sanity   (show 3 rows to LLM, ask if it makes sense)     │
│   │     e. If passed → return; else append error → retry                      │
│   │                                                                           │
│   └─ Return {sql, data, validation_report, confidence, attempts}              │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Response payload:                                                            │
│  { question, response: "Total revenue was $42,108…",                          │
│    tool_calls: [{tool:"query", result:{sql, data, validation_report, …}}],   │
│    session_id, tokens_used }                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Frontend renders:                                                            │
│   - Chat bubble with the prose answer                                         │
│   - ArtifactPanel inferring chart type from result shape                      │
│   - Save button → POST /artifacts persists question + sql + style + schedule  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**This is the single most important diagram in the project. Memorize it.**

---

## 5. Subsystems in depth

### 5.1 Authentication — `backend/auth/`

**Files:**
- `password.py` — `hash_password(plain) → str`, `verify_password(plain, hashed) → bool`. Uses `passlib[bcrypt]`. **Why bcrypt:** slow by design, salted, industry standard.
- `jwt.py` — `create_access_token(user_id) → str` (HS256, 1h TTL), `create_refresh_token() → str` (opaque UUID, 30d TTL), `get_current_user` FastAPI dependency.
- `db.py` — Postgres `waggle_app` schema. Tables: `users`, `refresh_tokens`, `sources`, `artifacts`. CRUD helpers + `init_db()` called via FastAPI `lifespan`.

**Flow:**
1. `POST /auth/register` → bcrypt-hash password → insert user → issue access JWT + refresh UUID → set httpOnly cookie (`path=/auth/refresh`) and return access JWT in body.
2. Subsequent requests carry `Authorization: Bearer <jwt>` header.
3. When the JWT expires, frontend gets 401 → silent `POST /auth/refresh` (cookie automatically attached) → new JWT.
4. Refresh tokens are **rotated** on every refresh — used token deleted, new one issued. Stops replay.

**Why two token types?**
- Access JWT is **stateless** — server doesn't store it. Scales horizontally.
- Refresh token is **opaque + stored in DB** — we can revoke it (logout, security incident).
- httpOnly cookie protects the refresh token from XSS; `path=/auth/refresh` limits CSRF surface.

**Why separate `waggle_app` schema?**
User-connected databases never mix with our app data. Swap to a separate Postgres instance with one env var change.

**Alternative considered:** session cookies. Rejected because they don't scale across multiple backend instances without sticky sessions or shared session storage (Redis).

### 5.2 Connectors — `backend/connectors/`

The contract every connector must implement (informal duck typing):
- `extract_schema(config) → dict` — return `{table_name: {columns: [...], primary_key: ..., foreign_keys: [...], sample_rows: [...], row_count: int}}`
- `fetch_with_config(config, sql) → list[dict]` — execute SQL, return JSON-friendly rows.

**`postgres.py`** — uses `asyncpg`. `test_connection()` does `SELECT 1` with 5s timeout (fast-fail). `extract_schema()` queries `information_schema` tables.

**`duckdb.py`** — embedded, in-process. `extract_schema_from_file()` registers the file as a DuckDB view named `display_name` (not the UUID), so the LLM sees `sales_smoke` not `e020e715-…`. Fully isolated: each query opens its own `:memory:` connection.

**`store.py`** — async facade over `auth.db.sources`. Hides whether sources are Postgres credentials or DuckDB file paths.

**Why DuckDB instead of pandas?** DuckDB speaks SQL, runs in-process (zero infra), and is built for analytical queries. Pandas would force a different code path (no `JOIN`, no `GROUP BY` syntax) — losing the unified NL→SQL story.

### 5.3 Schema extraction — `backend/agent/tools/schema_tool.py`

- `get_schema(connection_id, refresh=False)` — checks JSON cache at `data/schemas/{id}.json`; on miss or refresh, dispatches to `postgres.extract_schema` or `duckdb.extract_schema_from_file` based on `source_type`.
- `format_for_llm(schema, max_sample_rows=3)` — converts the dict into a compact text representation the LLM can read efficiently. Skips long descriptions, truncates sample rows.
- `get_foreign_keys(schema)` — flattens the schema's FK info into a list, used when generating semantic models.

**Why cache?** `information_schema` queries on a 100-table database take seconds. Cache invalidates on `?refresh=true`.

### 5.4 Semantic layer — `backend/semantic/` + `backend/agent/tools/semantic_tool.py`

**Why this exists:** raw schema doesn't tell the LLM that `orders.amount WHERE status='completed'` is what counts as "revenue". The semantic model encodes business meaning so the LLM doesn't have to guess.

**`semantic/models.py`** — dataclasses:
- `Cube` — a logical "view" of a table (one cube per important table)
- `Dimension` — a non-numeric grouping field (status, region, category)
- `Measure` — a numeric metric with `type` (sum/count/avg/…) and optional `sql` expression
- `Join` — how to relate two cubes (FK relationship)
- `Measure.to_sql_expression()` — turns `(type='sum', sql='amount')` into `SUM(amount)`. Returns `m.sql` directly if it's already an aggregate (avoids `SUM(SUM(...))` — Day 4 bug).

**`semantic/engine.py`** — `SemanticEngine`:
- `load(connection_id) → SemanticModel` — reads `models/{id}.yaml`
- `save(connection_id, model) → Path`
- `build_llm_context(model)` — produces the text block we paste into every LLM prompt: cube names, dimensions, measures (with SQL expressions), joins.

**`agent/tools/semantic_tool.py`** — the YAML generator. Four phases:
1. **Schema** — load via `get_schema`.
2. **Classify** — for each table, ask LLM to label each column as `dimension` or `measure` (with `CLASSIFY_PROMPT`).
3. **Questions** — ask LLM to generate 3-5 **clarification questions** about business logic (`QUESTIONS_PROMPT`). Returns to frontend if no rules supplied yet.
4. **Assemble** — second LLM call (`ASSEMBLE_PROMPT`) with classifications + FK relationships + user's business rules → produces JSON → converted to `SemanticModel` → saved as YAML.

This is the multi-step flow the **onboarding wizard** drives.

### 5.5 The agent harness — `backend/agent/runtime.py` ★

**The single most important file in the backend.** Memorize the two-call pattern.

```python
async def run_turn(session, user_message) -> dict:
    # 1. Compact if needed (over 6000 estimated tokens)
    if needs_compaction(session): await compact_session(session, generate)

    # 2. Load semantic context (or fall back to raw schema)
    try:    model = engine.load(connection_id); ctx = engine.build_llm_context(model)
    except: schema = await get_schema(connection_id); ctx = format_for_llm(schema)

    # 3. Record user message (appended to JSONL)
    session.add("user", user_message)

    # 4. CALL 1 — decide
    system_with_tools = build_system_prompt(connection_id, ctx) + "\n\n" + tool_descriptions()
    response_1 = await generate(prompt="", system=system_with_tools, messages=clean_history(session))

    tool_call = parse_tool_call(response_1)

    if tool_call:
        # 5a. Execute tool
        result = await execute_tool(tool_call["tool"], tool_call["params"], connection_id)

        # 6. CALL 2 — synthesize (NO TOOLS in system → cannot loop)
        synthesis_prompt = f"You called '{tool_name}' and received: {summary}. Original question: {user_message}. Write the answer."
        final = await generate(synthesis_prompt, system=build_system_prompt(connection_id, ctx))
    else:
        final = response_1   # plain-text answer, no tool needed

    session.add("assistant", final)
    return {response: final, tool_calls: [...], ...}
```

**Why two calls and not a loop?** A previous version had a `while` loop ("LLM, here's the result, do you want to call another tool?"). Llama 3.3 sometimes interpreted the injected `[Tool result]` user message as a *new request* and called the tool again — 5 times per turn. The two-call pattern **physically eliminates** the loop because Call 2's system prompt has no tool descriptions.

**Top 3 helper functions inside runtime.py:**
- `_parse_tool_call(text)` — brace-walking scanner; finds the first balanced `{...}` containing `"tool"` from anywhere in the text. Tolerates the LLM mixing prose with the JSON. (Fixed Day 12.5 — used to demand the response *start* with `{`.)
- `_clean_history(session)` — strips internal bookkeeping (`role=tool`, `[Tool result]` injections, `[Calling tool…]`) before sending the conversation back to the LLM. Avoids confusing the model.
- `_summarize_tool_result(name, result)` — concise version of the tool output for Call 2 (SQL + row count + first 5 rows + confidence).

### 5.6 Query tool — `backend/agent/tools/query_tool.py` ★

The actual NL→SQL pipeline. Called from `runtime._execute_tool()` when the LLM picks `tool="query"`.

```python
async def run_query(connection_id, question) -> dict:
    source = await get_source(connection_id)
    model  = engine.load(connection_id) or _empty_model()
    cubes  = _resolve_cubes(model, question)        # keyword-pick relevant cubes only
    fetch_fn = _pg_fetch if source["source_type"] == "postgres" else _duck_fetch

    errors = []
    for attempt in range(1, MAX_ATTEMPTS + 1):    # max 3
        sql_raw = await _generate_sql(question, cubes, schema_context, errors)
        sql     = _clean_sql(sql_raw)              # strip ``` fences

        try:    sqlglot.parse_one(sql, read="postgres")        # FREE syntax check
        except: errors.append("Invalid syntax"); continue

        try:    rows = await fetch_fn(source, sql)
        except as e: errors.append(str(e)); continue

        report = await validate(sql, rows, question, model, fetch_fn)
        if report.passed:
            return {sql, data: rows, validation_report, confidence: report.confidence, attempts: attempt}
        errors.append("Validation failed: " + ", ".join(report.failures))

    return {error: "Could not produce a valid query in 3 attempts", sql: last_sql, ...}
```

**Why retry with error history?** If attempt 1 produced `SELECT FROM` (typo), attempt 2 sees that error in the prompt and corrects. This is **self-healing**, not blind retry.

**Why `_resolve_cubes` (keyword matching)?** A 50-table database produces a giant LLM context. We do a cheap keyword match on the question to pick only the cubes that look relevant — saves tokens and improves SQL quality.

### 5.7 Validation engine — `backend/validation/engine.py` ★

Five checks, ordered cheapest first so we fail fast.

| # | Check | Cost | What it catches |
|---|---|---|---|
| 1 | **Structural** | Free | Empty result, row explosion (>10k), all-NULL column |
| 2 | **Semantic coherence** | Free | "How many users?" but result has no numeric column |
| 3 | **Business assertions** | Free | YAML asserts (e.g. `revenue >= 0`) violated |
| 4 | **Cross-query** | 1 LLM call + 1 DB call | LLM writes a simpler `COUNT(*)` version, compares row counts. Skipped for scalar aggregates. |
| 5 | **LLM sanity** | 1 LLM call | Show first 3 rows; LLM says YES/NO if data looks reasonable. Prompt explicitly tells it NOT to flag valid groupings or zero values (Day 8 fix). |

**Order matters:** if a structural check fails, we skip checks 4 + 5 and save tokens.

**Why 5 checks and not 1?** Single checks are brittle. A query can pass syntax but return garbage; can return correct rows but to the wrong question; can be semantically correct but explode rows due to a bad join. Layered defenses catch different failure modes.

### 5.8 Sessions — `backend/agent/session.py`

- `Session` class — in-memory list of messages, backed by a JSONL file at `data/sessions/{id}.jsonl`.
- `add(role, content)` — appends to memory **and** flushes to disk as one new JSON line. Atomic-ish.
- `replace_messages(new)` — used by compaction; rewrites the whole file.
- `get_session(id)` — checks in-memory dict first, then re-loads from JSONL if the server restarted.
- `list_sessions(connection_id?)` — globs `data/sessions/*.jsonl`. Filter by `connection_id` if provided.

**Why JSONL?** Append-only, line-delimited JSON. Same format Claude Code and OpenAI evals use. You can `tail -f` it to watch a conversation live. Survives crashes. Cheap O(1) appends.

**Compaction trigger:** `agent/context.py:needs_compaction()` returns True when estimated tokens > 6000. `compact_session()` summarizes everything except the last 6 messages, then `replace_messages()`. Disk and memory stay in sync.

### 5.9 LLM client — `backend/agent/llm.py`

`generate(prompt, system="", messages=None)` — single function. If `messages` is provided, sends the full chat history; else single-turn with just system + prompt. Uses `httpx.AsyncClient` to hit the OpenAI-compatible endpoint (Groq). Temperature `0.1`.

**Why one function?** All over the codebase (`runtime`, `query_tool`, `semantic_tool`, `validation/engine`) we call `generate()`. Centralizing the HTTP/auth/timeout/error-handling here means we can swap providers (Groq → Hivenet → OpenAI) by changing **one file**.

### 5.10 Frontend — chat & dashboard

**`frontend/src/lib/api.ts`** — two Axios instances:
- `authApi` — no interceptors, used for `/auth/*` (avoids infinite refresh loop).
- `api` — request interceptor injects `Bearer <token>`; response interceptor catches 401 → calls `authApi.post('/auth/refresh')` → retries the original request once. If refresh fails → redirect to `/login`.

**`frontend/src/store/authStore.ts`** — Zustand store with `accessToken`, `user`, `isInitialized`. Token lives **in memory only** (never localStorage — XSS protection). Hard refresh recovers via the bootstrap silent-refresh in `RootLayout`.

**`frontend/src/hooks/useChat.ts`** — `useChat(connectionId)` returns `{messages, send, isPending, lastQueryResult}`. Tracks `session_id` returned by the backend so follow-ups continue the same conversation.

**`frontend/src/lib/artifactInfer.ts`** — heuristic that picks chart type from result shape:
- `1×1 numeric` → metric
- `temporal + numeric` → line
- `≤6 categories` → pie, else bar
- `2 numerics, 0 categories` → scatter
- default → table

**`frontend/src/components/dashboard/ArtifactCard.tsx`** — re-runs the artifact's question through `/query` on mount (validates against schema drift instead of executing stale stored SQL). Frontend `setInterval` poller for `refresh_schedule`.

**`frontend/src/components/artifacts/ArtifactEditorSheet.tsx`** — Sheet (Radix Dialog right-slide) with three tabs: Query / Style / Schedule. Saving with a changed question re-runs through `/query` (validation pipeline stays in the loop).

**`frontend/src/components/onboarding/SourceOnboardingDialog.tsx`** — multi-phase wizard against `POST /semantic/{id}`. Persists in-progress answers in `localStorage` keyed by `connection_id` so a forced re-login doesn't lose them.

---

## 6. Top 15 functions to know cold

| # | Function | File | What it does |
|---|---|---|---|
| 1 | `run_turn(session, user_message)` | `agent/runtime.py:193` | Two-call agent harness — entry point of every chat turn |
| 2 | `run_query(connection_id, question)` | `agent/tools/query_tool.py:60` | NL→SQL inner loop with retry |
| 3 | `validate(sql, rows, question, model, fetch_fn)` | `validation/engine.py:11` | 5-check pipeline orchestrator |
| 4 | `_parse_tool_call(text)` | `agent/runtime.py:73` | Extracts JSON tool call from LLM output (anywhere in text) |
| 5 | `_resolve_cubes(model, question)` | `agent/tools/query_tool.py:173` | Keyword-match question to relevant cubes |
| 6 | `generate_semantic_model(connection_id, business_rules?)` | `agent/tools/semantic_tool.py:111` | 4-phase LLM YAML generator |
| 7 | `compact_session(session, llm)` | `agent/context.py:71` | Summarize old messages when over token limit |
| 8 | `Session.add(role, content)` | `agent/session.py:28` | Append message to memory + JSONL |
| 9 | `extract_schema(config)` | `connectors/postgres.py` | Read information_schema, return shape dict |
| 10 | `get_current_user(creds)` | `auth/jwt.py` | FastAPI dep — decode JWT + load user |
| 11 | `require_source(connection_id, current_user)` | `api/_deps.py` | Auth + ownership gate on every source-scoped route |
| 12 | `Measure.to_sql_expression()` | `semantic/models.py` | Turn (type, sql) into proper aggregate (no double-wrap) |
| 13 | `useChat(connectionId)` | `frontend/src/hooks/useChat.ts` | Frontend conversation manager |
| 14 | `inferArtifactType(rows)` | `frontend/src/lib/artifactInfer.ts:35` | Pick chart type from result shape |
| 15 | `api.interceptors.response.use(…)` | `frontend/src/lib/api.ts:47` | Silent JWT refresh on 401 |

---

## 7. Architecture decisions — and the alternatives

### Why custom semantic YAML instead of Cube.js?
- **Cube.js cloud is paid.** Self-host adds Docker + Node + a separate semantic schema language.
- **For a capstone**, "I designed and built it" beats "I integrated a tool".
- **Trade-off:** we don't get Cube.js's caching, multi-tenant support, or visual modeler for free.
- **Alternative:** could integrate Cube.js as a stretch goal in month 4 — our YAML is structurally similar enough to translate.

### Why two-call pattern instead of an agent loop?
- Loops with tool injection caused the **Day 7 bug**: LLM treated the `[Tool result]` user message as a new question and called the tool 5x per turn.
- Two calls = bounded cost, debuggable, no runaway behavior.
- **Trade-off:** can't chain multiple tools in one turn (e.g. "get schema, then run a query"). User has to ask twice.
- **Alternative considered:** ReAct framework — rejected because it requires careful trace formatting that small models often break.

### Why validate after every query instead of trusting the LLM?
- LLM-generated SQL is **probabilistic** — temperature 0.1 reduces but doesn't eliminate hallucinations.
- 5 layered checks catch different failure modes (syntax, semantics, scale, cross-checks, plausibility).
- **Trade-off:** ~1-2 extra LLM calls per query for checks 4+5. Worth it.
- **Alternative considered:** trust + retry on error. Rejected because some failures are silent (returning rows from the wrong table).

### Why JSONL sessions instead of a sessions table?
- JSONL is **append-only** — no DB writes per message, just `f.write(json.dumps(line) + "\n")`.
- Same format used by Claude Code, OpenAI evals — interoperable.
- Crash-safe: reload from disk replays the conversation.
- **Trade-off:** harder to query across sessions (would need a separate index for analytics).
- **Alternative:** Postgres table — rejected for write-volume reasons during a long agent conversation.

### Why JWT + httpOnly refresh cookie instead of session cookies?
- Stateless JWT scales horizontally — no shared session store.
- Refresh cookie is **stored** server-side so we can revoke (logout, force-expire).
- httpOnly + `path=/auth/refresh` minimizes XSS + CSRF surface.
- **Trade-off:** refresh logic in the frontend is non-trivial (silent retry).
- **Alternative considered:** localStorage for the access token. Rejected — XSS would steal it.

### Why DuckDB for files instead of pandas?
- DuckDB speaks SQL — same query path as Postgres.
- Embedded, no infra.
- **Trade-off:** slightly larger binary (~30MB).
- **Alternative:** pandas — would force a separate code path for file sources, splitting the validation pipeline.

### Why frontend setInterval for `refresh_schedule` (not backend cron)?
- **Day 12 scope kept tight** — backend cron means APScheduler or cron runner + worker process.
- Client-side interval is good enough while the dashboard tab is open.
- **Trade-off:** doesn't refresh while user is offline; multiple tabs duplicate refreshes.
- **Day 13 backlog:** real backend cron.

### Why React + Vite instead of Next.js?
- Waggle is a logged-in **SPA** — no SEO, no SSR needs.
- Vite is dramatically faster HMR than Next dev mode.
- **Trade-off:** lose Next's data-fetching primitives, but TanStack Query covers that.

### Why Tailwind v4 (CSS-first) instead of Tailwind v3?
- v4 dropped the `tailwind.config.js` file — colors defined via `@theme` block in CSS.
- Smaller setup, faster builds.
- **Trade-off:** had to ship the `@tailwindcss/vite` plugin (Day 11.5 fix — frontend was rendering as raw text without it).

---

## 8. Bug post-mortems (your supervisor will love these)

| Bug | Symptom | Root cause | Fix |
|---|---|---|---|
| **Tool loop** (D7) | Every chat answer was a generic fallback after 5 tool calls | While-loop harness; injected `[Tool result]` user messages confused the LLM into re-calling the tool | Replaced with deterministic two-call pattern; `_clean_history()` strips bookkeeping |
| **Sanity false positive** (D8) | Valid revenue-by-user result flagged as wrong | LLM sanity prompt was too vague — flagged any unfamiliar shape | Rewrote prompt: "Only answer NO if there is a clear data problem (negative revenue, impossible counts, unrelated columns)" |
| **Double aggregate** (D4) | Revenue measure produced `SUM(SUM(CASE WHEN…))` | `build_llm_context` called `to_sql_expression()` on already-aggregated SQL | `Measure.to_sql_expression()` checks for existing aggregate functions; returns `m.sql` unchanged if already wrapped |
| **DuckDB table-name mismatch** (D11) | LLM wrote `FROM sales_smoke` but query ran against `FROM e020e715-…` | View was registered under `display_name` but `fetch_from_file` used `Path.stem` | Threaded `table_name` param through from `source["config"]["table_name"]` |
| **Tool-JSON leak** (D12.5) | Chat showed raw `{"tool": "query", …}` JSON | `_parse_tool_call` only matched when response *started* with `{`; LLM mixed prose + JSON | Brace-walking scanner extracts first `{...}` containing `"tool"` from anywhere in text |
| **Forced logout in wizard** (D12.5) | Idle 15min → click Generate → bounce to /login + lost answers | `ACCESS_TTL` was 15min + silent refresh's `catch` redirects on any failure | TTL → 1h, REFRESH_TTL → 30d, `localStorage` persists wizard answers |
| **Tailwind not applying** (D11.5) | UI rendered as raw unstyled text | Tailwind v4 needs `@tailwindcss/vite` plugin; only `@import "tailwindcss"` isn't enough | Added the Vite plugin |

---

## 9. Anticipated supervisor questions — crisp answers

**Q: Why didn't you use LangChain / LlamaIndex?**
> Both are great for RAG and large agent frameworks. We're solving a narrow NL→SQL problem with a custom validation pipeline that needed direct control over every LLM call. LangChain would have hidden the call boundaries we depend on for debugging and the two-call pattern.

**Q: How do you prevent SQL injection?**
> The LLM never inserts user data into SQL — it generates the whole statement from natural language and the schema. We `sqlglot.parse_one()` to syntax-validate before execution. The connection user is read-only at the DB level (in production we'd enforce that with a dedicated role). The validation pipeline catches semantic issues. We do *not* concatenate user input into SQL.

**Q: What's the worst case latency for a single question?**
> Roughly: Call 1 (~1s on Groq) + LLM SQL gen (~1s) + DB exec (variable, often <100ms) + validation checks 4+5 (~2s for 2 LLM calls) + Call 2 synthesis (~1s) ≈ **5-6 seconds** for a happy path. Retries multiply. We chose Groq specifically because it's the fastest free tier (200+ tok/s).

**Q: Can multiple users share data?**
> No, sources are per-user (`auth.db.sources.user_id` FK). The `require_source` dep enforces ownership on every route. Multi-tenancy / sharing is a Day 14+ feature.

**Q: What if the LLM is wrong?**
> Three defenses, in order:
> 1. **Validation pipeline** rejects bad SQL/results → up to 3 retries with error history fed back.
> 2. **Confidence score** in the response — frontend badges low-confidence answers.
> 3. **Manual artifact editor** — user can edit the question or hand-correct via the Sheet (Day 12).

**Q: How do you handle large schemas (e.g. 1000 tables)?**
> Currently we keyword-match cubes in `_resolve_cubes`. Beyond ~200 cubes we'd need an embedding-based retriever — load all cubes into a vector DB once, retrieve top-K relevant cubes per question. Out of scope for the PFE.

**Q: Why YAML and not JSON for the semantic model?**
> Human-editable. Comments allowed (matters for business rules). Less syntactic noise than JSON for hand-edits.

**Q: How do you scale this beyond a laptop?**
> FastAPI is async + stateless — multiple workers behind a load balancer. Postgres handles all stateful work. Sessions are file-based today; would migrate to Postgres or Redis for multi-instance deploys. Groq is already a managed API.

**Q: Why bcrypt instead of Argon2?**
> Argon2 is technically stronger but bcrypt is the industry default and has a battle-tested Python library (`passlib`). Either is fine in 2026; we picked the boring choice.

**Q: How do you test this?**
> Manual smoke tests via the UI (documented in CLAUDE.md per day). Pytest test suite is on the Day 13 backlog. Type-checking via `mypy`-like discipline (Pydantic) and `pnpm tsc --noEmit` for the frontend.

**Q: What's the hardest part of the project, technically?**
> The agent harness loop bug (D7) was the deepest. The fix wasn't to add more guards — it was to **redesign the control flow** so the loop couldn't happen. That mindset shift (from "patch the symptom" to "remove the failure mode entirely") is the key engineering lesson.

---

## 10. Cheat sheet — the bare minimum to memorize

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ARCHITECTURE IN 6 LINES                                                     │
│  Frontend (React + TanStack Query)                                          │
│   → FastAPI route (auth + ownership)                                        │
│   → run_turn (two-call agent harness)                                       │
│   → run_query (NL→SQL retry loop)                                           │
│   → validate (5 checks)                                                     │
│   → asyncpg / DuckDB → results back up the stack                            │
└─────────────────────────────────────────────────────────────────────────────┘

THE 5 VALIDATION CHECKS:
  1. structural   — empty/explosion/all-NULL          [free]
  2. semantic     — count question, no number?         [free]
  3. assertions   — YAML business rules               [free]
  4. cross-query  — simpler COUNT(*) cross-check      [LLM + DB]
  5. llm-sanity   — "does this look reasonable?"      [LLM]

TWO-CALL PATTERN:
  Call 1: system + tools + history → tool call OR plain text
  Call 2: system (NO TOOLS) + tool result → final answer

SEMANTIC MODEL = YAML with:
  Cubes (≈ tables)
  ├── Dimensions (group-by candidates)
  ├── Measures   (aggregates: SUM/COUNT/AVG)
  └── Joins      (FK relationships)

AUTH:
  Access JWT (1h, in memory)
  + Refresh cookie (30d, httpOnly, path=/auth/refresh, rotated on use)

TOKEN COMPACTION:
  > 6000 estimated tokens → summarize old messages, keep last 6

TEMPERATURE 0.1 — always. Determinism > creativity for SQL.
```

---

## 11. Where to look during the meeting

If your supervisor asks you to walk through the code live, open these in order:

1. **`backend/api/main.py`** — the entrypoint. Show CORS, lifespan, routers registered.
2. **`backend/api/routes/query.py`** — show the `require_source` dep and the `run_turn` call.
3. **`backend/agent/runtime.py:run_turn`** — show the two-call pattern. **Most important file.**
4. **`backend/agent/tools/query_tool.py:run_query`** — show the retry loop with error history.
5. **`backend/validation/engine.py:validate`** — show the 5-check orchestration.
6. **`backend/semantic/engine.py:build_llm_context`** — show what the LLM sees.
7. **`frontend/src/hooks/useChat.ts`** — show the optimistic message + session_id threading.
8. **`frontend/src/components/artifacts/ArtifactEditorSheet.tsx`** — show how saving re-runs through `/query` to keep validation in the loop.

**One sentence per file** is enough. Don't read code line by line — explain the *intent* and *trade-offs*.

---

## 12. The three things that will impress the supervisor most

1. **You designed the validation pipeline before you built the agent.** That's an engineering instinct (defense in depth, fail fast). Most students would have shipped "LLM writes SQL, DB executes" and called it done.

2. **You found and fixed the agent loop bug by redesigning the control flow, not patching it.** Deep engineering judgment.

3. **You built a custom semantic layer instead of integrating Cube.js.** That's a deliberate trade-off you can defend: "I could have integrated Cube.js, but for a capstone the learning value of designing the abstraction myself was worth more than the operational features I'd have gotten for free."

---

*Last updated: 2026-05-10. Read once. Skim cheat sheet day-of. Walk in confident.*
