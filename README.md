# Waggle — AI-Powered Semantic Data Platform

> Ask questions about your database in plain English. Get validated SQL, results, and live charts — no SQL knowledge required.

<!-- Replace with actual screenshot -->
<!-- ![Waggle Dashboard](docs/dashboard.png) -->

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Coming%20Soon-orange?style=for-the-badge)](https://github.com/YoussefHiveNet/Waggle_PFE)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Youssef%20Maghraoui-blue?style=for-the-badge&logo=linkedin)](https://www.linkedin.com/in/maghraouiyoussef/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

---

## What is Waggle?

Organizations sit on large databases but querying them requires strong SQL expertise. Waggle bridges that gap.

Connect your database → Waggle auto-generates a semantic model → ask questions in natural language → get validated SQL, results, and visualizations in real time.

Built as a final-year engineering capstone (PFE) over 4 months.

---

## Demo

<!-- Replace with actual demo GIF or video link -->
> 🎬 Demo video coming soon

**Example interactions:**
- *"What was the total revenue last quarter?"* → runs validated SQL, renders a metric card
- *"Show me revenue by month"* → generates a line chart with 18 months of data
- *"Break that down by product category"* → follow-up query with full conversation context

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     React Frontend                       │
│         Dashboard · Chat · Artifact Editor              │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS  /api/*
┌────────────────────────▼────────────────────────────────┐
│                   FastAPI Backend                        │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Auth (JWT)  │  │  Agent       │  │  Validation   │  │
│  │ bcrypt      │  │  Runtime     │  │  Engine       │  │
│  │ Refresh     │  │  2-call LLM  │  │  5-check      │  │
│  │ Tokens      │  │  harness     │  │  pipeline     │  │
│  └─────────────┘  └──────┬───────┘  └───────────────┘  │
│                          │                              │
│  ┌───────────────────────▼─────────────────────────┐    │
│  │              Semantic Engine                     │    │
│  │   YAML model · LLM context builder · Resolver   │    │
│  └───────────────────────┬─────────────────────────┘    │
│                          │                              │
│  ┌───────────────────────▼─────────────────────────┐    │
│  │              Connectors                          │    │
│  │   PostgreSQL (asyncpg) · DuckDB (CSV/Parquet)    │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │   LLM Provider      │
              │   Mistral 24B via   │
              │   Hivenet GPU VPS   │
              │   (Groq fallback)   │
              └─────────────────────┘
```

---

## Key Features

**Natural Language Querying**
Conversational multi-turn queries with full session memory. Follow-up questions resolve context from prior turns — "break that down by user" works after "what is total revenue".

**Semantic Layer**
LLM-generated YAML model captures business logic (what "revenue" means, which statuses count, how tables relate). Queries use the semantic context, not raw schema — dramatically better SQL accuracy.

**5-Check Validation Pipeline**
Every query result passes through: structural integrity → semantic coherence → business assertions → cross-query verification → LLM sanity check. Confidence score returned on every response.

**8 Chart Renderers**
Auto-inferred artifact type from result shape: metric cards, line charts, bar charts, pie charts, scatter plots, tables, progress rings, and funnels. Per-artifact style editor with color, axis, and schedule controls.

**Multi-Connector**
PostgreSQL via asyncpg connection pool. CSV and Parquet files via embedded DuckDB — zero setup, fully isolated per user. Same query interface for both.

**Dashboard**
Drag-and-drop artifact grid. Each card runs its stored question through the full validation pipeline on load. 5-minute TanStack Query cache. Schedule-based auto-refresh.

**Auth**
JWT access tokens (24h) + opaque refresh tokens (30d) in httpOnly cookies. Token rotation on every refresh. Full ownership model — users can only access their own sources and artifacts.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 · TypeScript · Vite · Tailwind v4 · shadcn/ui · Recharts · TanStack Query · Zustand |
| Backend | FastAPI · Python 3.12 · asyncpg · Pydantic v2 |
| LLM | Mistral Small 24B (Hivenet GPU) · Llama 3.3 70B (Groq fallback) · OpenAI-compatible client |
| Databases | PostgreSQL 16 (user data) · DuckDB (file queries) |
| Auth | JWT (python-jose) · bcrypt (passlib) · httpOnly refresh cookies |
| SQL Parsing | sqlglot (multi-dialect, pure Python) |
| Deployment | Nginx · Gunicorn + uvicorn workers · systemd · GitHub Actions CI/CD |
| Hosting | Hivenet bare-metal GPU VPS (UAE) |

---

## Project Structure

```
waggle/
├── backend/
│   ├── api/routes/          # FastAPI endpoints (auth, sources, query, semantic, artifacts)
│   ├── agent/               # LLM client, session persistence, runtime harness, tools
│   ├── semantic/            # YAML engine, dataclasses, per-connection model storage
│   ├── connectors/          # PostgreSQL + DuckDB connectors, connection registry
│   ├── validation/          # 5-check validation pipeline
│   ├── auth/                # JWT, bcrypt, waggle_app schema
│   └── config.py            # Centralized config (LLM, DB, Auth, Upload)
└── frontend/
    ├── src/
    │   ├── components/      # Dashboard, Chat, Artifacts, shared UI (40+ components)
    │   ├── hooks/           # TanStack Query hooks for all resources
    │   ├── lib/             # Axios instances, artifact inference, query client
    │   ├── pages/           # Landing, Login, Register, Dashboard, Chat
    │   └── store/           # Zustand auth store
    └── ...
```

---

## Getting Started

### Prerequisites
- Python 3.12+
- Node.js 22+ (via nvm)
- PostgreSQL 16
- An LLM API key (Groq free tier works — `api.groq.com/openai/v1`)

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Fill in LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, PG_* values

uvicorn api.main:app --reload
```

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

### Environment Variables

```env
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=your_groq_key
LLM_MODEL=llama-3.3-70b-versatile

PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=your_password
PG_DATABASE=waggle_dev

SECRET_KEY=your_64_char_secret
```

### Seed the demo database (optional)

```bash
createdb waggle_demo
psql waggle_demo < backend/scripts/seed_demo.sql

# or the 50-table stress-test DB (~80k rows, 18 months of data)
createdb waggle_hard
psql waggle_hard < backend/scripts/seed_hard.sql
```

---

## What I Built

This is a solo 4-month capstone covering the full stack end-to-end:

- Designed and built a **custom semantic layer** from scratch (YAML engine, LLM-assisted generation, cube/dimension/measure dataclasses) — chose this over Cube.js to demonstrate depth of understanding
- Engineered a **deterministic two-call LLM agent** that eliminated infinite tool-call loops (replaced a while-loop harness with a structured dispatch pattern)
- Built a **5-stage validation pipeline** ordering cheap deterministic checks before expensive LLM calls to minimize token usage
- Implemented **full JWT auth** with silent refresh, token rotation, and ownership-level access control on every resource
- Shipped **8 chart renderers** with auto-inference from result shape, per-artifact style config, and scheduled refresh
- Deployed on a **bare-metal GPU VPS** with Nginx, systemd, Gunicorn, and GitHub Actions CI/CD

---

## Roadmap

- [ ] BigQuery connector
- [ ] Draggable / resizable dashboard grid (react-grid-layout)
- [ ] Multiple dashboards per user
- [ ] LLM fallback chain (Hivenet → OpenRouter → Groq)
- [ ] Demo video + live URL
- [ ] README + API docs

---

## Author

**Youssef Maghraoui** — Engineering student, PFE 2026

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-blue?logo=linkedin)](https://www.linkedin.com/in/maghraouiyoussef/)

---

*Built with FastAPI, React, and a lot of debugging.*
