# connectors/store.py
import json
from pathlib import Path

STORE_PATH = Path("data/connections.json")

def _load() -> dict:
    if not STORE_PATH.exists():
        return {}
    return json.loads(STORE_PATH.read_text())

def _save(data: dict):
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STORE_PATH.write_text(json.dumps(data, indent=2))

def save_connection(connection_id: str, config: dict):
    data = _load()
    data[connection_id] = config
    _save(data)

def get_connection(connection_id: str) -> dict | None:
    return _load().get(connection_id)

def list_connections() -> list[str]:
    return list(_load().keys())
