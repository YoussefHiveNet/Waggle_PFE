# api/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from auth.db import init_db
from agent.llm import ping as llm_ping
from connectors.postgres import ping as db_ping
from api.routes.connect   import router as connect_router
from api.routes.schema    import router as schema_router
from api.routes.semantic  import router as semantic_router
from api.routes.query     import router as query_router
from api.routes.session   import router as session_router
from api.routes.auth      import router as auth_router
from api.routes.artifacts import router as artifacts_router
from api.routes.sources   import router as sources_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Waggle API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite + CRA defaults
    allow_credentials=True,   # needed for httpOnly refresh cookie
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(artifacts_router)
app.include_router(sources_router)
app.include_router(connect_router)
app.include_router(schema_router)
app.include_router(semantic_router)
app.include_router(query_router)
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
