# How to run / restart Waggle

Repo root: `/Users/youssef/Developer/Waggle_PFE`. Backend = `:8000`, frontend = `:3000`.

---

## TL;DR — restart everything in one go

```bash
# From repo root
pkill -f "uvicorn api.main"; pkill -f "vite"; sleep 2

# Backend (port 8000)
( cd backend && source venv/bin/activate && nohup uvicorn api.main:app --reload \
    > /tmp/waggle_backend.log 2>&1 & )

# Frontend (port 3000)
( cd frontend && nohup pnpm dev > /tmp/waggle_frontend.log 2>&1 & )

sleep 5
curl -s http://localhost:8000/health           # → {"status":"ok"}
curl -s http://localhost:8000/ping-llm         # → {"status":"ok","response":"pong"}
curl -s -o /dev/null -w "frontend HTTP %{http_code}\n" http://localhost:3000/
```

Open http://localhost:3000.

---

## Backend only

### Start (foreground — see logs live, Ctrl-C to stop)
```bash
cd backend
source venv/bin/activate
uvicorn api.main:app --reload
```

### Start (background — survives terminal close)
```bash
cd backend
source venv/bin/activate
nohup uvicorn api.main:app --reload > /tmp/waggle_backend.log 2>&1 &
```

### Restart
```bash
pkill -f "uvicorn api.main"
sleep 2
cd backend && source venv/bin/activate && \
  nohup uvicorn api.main:app --reload > /tmp/waggle_backend.log 2>&1 &
sleep 4
curl -s http://localhost:8000/ping-llm
```

### Watch the log
```bash
tail -f /tmp/waggle_backend.log
```

### Stop
```bash
pkill -f "uvicorn api.main"
```

---

## Frontend only

### Start (foreground)
```bash
cd frontend
pnpm dev
```

### Start (background)
```bash
cd frontend
nohup pnpm dev > /tmp/waggle_frontend.log 2>&1 &
```

### Restart
```bash
pkill -f "vite"
sleep 2
cd frontend && nohup pnpm dev > /tmp/waggle_frontend.log 2>&1 &
```

### Stop
```bash
pkill -f "vite"
```

---

## Picking which LLM provider — `.env`

`backend/.env` has three lines that pick the LLM. **Restart the backend after any change.**

### Hivenet self-hosted (current — gpt-oss-20b on RTX 4090)
```env
LLM_BASE_URL=https://3bd3a1a7-...fr.tenants.hivecompute.ai/v1
LLM_API_KEY=<your-hivenet-bearer-key>
LLM_MODEL=openai/gpt-oss-20b
```

### Groq fallback (Llama 3.3 70B — fast, reliable, third-party)
```env
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_...
LLM_MODEL=llama-3.3-70b-versatile
```

### OpenRouter (rate-limited free tier, careful)
```env
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=sk-or-v1-...
LLM_MODEL=google/gemma-4-31b-it:free      # or minimax/minimax-m2.5:free, etc
```

### Test after swap
```bash
curl -s http://localhost:8000/ping-llm
# expect: {"status":"ok","response":"pong"}
```

If you get `{"status":"error","detail":"Connection error."}` → check the URL ends in `/v1`, the API key has no trailing whitespace, and the model ID exists. Probe the provider directly:

```bash
set -a && source backend/.env && set +a
curl -s -w "\nHTTP %{http_code}\n" "$LLM_BASE_URL/models" \
  -H "Authorization: Bearer $LLM_API_KEY" | head -5
```

---

## Databases

Both Postgres DBs live on `localhost:5432`, user `postgres`.

| DB            | Difficulty | Purpose                             |
| ---------------| ------------| -------------------------------------|
| `waggle_demo` | Easy       | 5 tables, ~3,750 rows, e-commerce   |
| `waggle_hard` | Hard       | 50 tables, ~80k rows over 18 months |

### Reseed `waggle_hard` (idempotent — drops + recreates)
```bash
psql -U postgres -d waggle_hard -f backend/scripts/seed_hard.sql
```

### Verify monthly spread
```bash
psql -U postgres -d waggle_hard -c \
  "SELECT date_trunc('month', ordered_at)::date AS month, COUNT(*) FROM orders GROUP BY 1 ORDER BY 1;"
```

---

## Common troubleshooting

| Symptom | Fix |
|---|---|
| `/ping-llm` returns `Connection error` | LLM provider unreachable — check `.env` URL/key/model |
| `/ping-llm` returns `429` (rate-limited) | OpenRouter free tier — swap model or use Hivenet/Groq |
| Frontend shows raw unstyled text | Tailwind plugin missing — `cd frontend && pnpm install` |
| Backend crashes on startup | Postgres not running — `brew services start postgresql@18` |
| Browser shows "logged out" repeatedly | Refresh cookie expired — log back in (rare, 30-day TTL) |
| Chat returns generic fallback | Check backend log — usually LLM rate-limited or down |

---

## Quick health snapshot (paste this anytime)

```bash
echo "Backend:" && curl -s http://localhost:8000/health
echo "LLM:"     && curl -s http://localhost:8000/ping-llm
echo "Frontend HTTP:" && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
echo "Processes:" && ps -ef | grep -E "uvicorn|vite" | grep -v grep | awk '{print $2, $NF}'
```
