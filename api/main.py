# api/main.py
from fastapi import FastAPI
from agent.llm import ping as llm_ping
from connectors.postgres import ping as db_ping
from api.routes.connect import router as connect_router

app = FastAPI(title="Waggle API", version="0.1.0")

app.include_router(connect_router)

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