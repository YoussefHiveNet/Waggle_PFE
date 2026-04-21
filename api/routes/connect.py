# api/routes/connect.py
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from connectors.postgres import test_connection
from connectors.store import save_connection, get_connection

router = APIRouter()

class ConnectRequest(BaseModel):
    host:     str
    port:     int = 5432
    user:     str
    password: str
    database: str
    db_type:  str = "postgres"  # postgres | bigquery later

class ConnectResponse(BaseModel):
    connection_id: str
    status:        str
    message:       str

@router.post("/connect", response_model=ConnectResponse)
async def connect(req: ConnectRequest):
    # Test the connection first
    ok, error = await test_connection(
        host=req.host,
        port=req.port,
        user=req.user,
        password=req.password,
        database=req.database
    )

    if not ok:
        raise HTTPException(
            status_code=400,
            detail=f"Could not connect to database: {error}"
        )

    # Store it and return an ID
    connection_id = str(uuid.uuid4())
    save_connection(connection_id, {
        "host":     req.host,
        "port":     req.port,
        "user":     req.user,
        "password": req.password,
        "database": req.database,
        "db_type":  req.db_type
    })

    return ConnectResponse(
        connection_id=connection_id,
        status="ok",
        message=f"Connected to {req.database} on {req.host}"
    )

@router.get("/connect/{connection_id}")
async def get_connect(connection_id: str):
    conn = get_connection(connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    # Never return password
    safe = {k: v for k, v in conn.items() if k != "password"}
    return {"connection_id": connection_id, **safe}
