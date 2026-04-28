# connectors/duckdb.py
"""
DuckDB connector for CSV (and future Parquet/JSON) file sources.

Each uploaded file gets a stable path: data/uploads/{user_id}/{file_id}.csv
DuckDB reads it on-demand — no import into Postgres, fully isolated per user.

The interface mirrors connectors/postgres.py so the rest of the pipeline
(schema_tool, query_tool, validation) works unchanged.
"""
from __future__ import annotations
import duckdb
from pathlib import Path
from typing import Optional

from config import UploadConfig


def _conn() -> duckdb.DuckDBPyConnection:
    """Return a fresh in-process DuckDB connection (thread-safe: one per call)."""
    return duckdb.connect(database=":memory:", read_only=False)


# ── SCHEMA EXTRACTION ─────────────────────────────────────────────────────────

def extract_schema_from_file(file_path: str, display_name: Optional[str] = None) -> dict:
    """
    Read the CSV at file_path and return a schema dict in the same format
    as connectors/postgres.py extract_schema() so the rest of the pipeline
    doesn't need to know it's a file.
    display_name overrides the stem so the table name shown to the LLM is human-readable.
    """
    con = _conn()
    table_name = display_name or Path(file_path).stem

    con.execute(f"CREATE VIEW '{table_name}' AS SELECT * FROM read_csv_auto('{file_path}')")

    cols_rows = con.execute(f"DESCRIBE '{table_name}'").fetchall()
    col_names = [r[0] for r in cols_rows]
    col_types = [r[1] for r in cols_rows]

    sample_rows_raw = con.execute(f"SELECT * FROM '{table_name}' LIMIT 3").fetchall()
    sample_rows = [dict(zip(col_names, row)) for row in sample_rows_raw]
    # Make JSON-safe
    for row in sample_rows:
        for k, v in row.items():
            if not isinstance(v, (str, int, float, bool, type(None))):
                row[k] = str(v)

    row_count = con.execute(f"SELECT COUNT(*) FROM '{table_name}'").fetchone()[0]

    columns = [
        {
            "name":        name,
            "type":        dtype,
            "nullable":    True,
            "primary_key": False,
            "foreign_key": None,
        }
        for name, dtype in zip(col_names, col_types)
    ]

    con.close()
    return {
        table_name: {
            "columns":     columns,
            "sample_rows": sample_rows,
            "row_count":   row_count,
        }
    }


# ── QUERY EXECUTION ───────────────────────────────────────────────────────────

def fetch_from_file(file_path: str, sql: str) -> list[dict]:
    """
    Execute SQL against the CSV file.
    The table name in the SQL must match the filename stem.
    """
    con = _conn()
    table_name = Path(file_path).stem
    con.execute(f"CREATE VIEW '{table_name}' AS SELECT * FROM read_csv_auto('{file_path}')")

    result = con.execute(sql).fetchall()
    col_names = [desc[0] for desc in con.description]
    con.close()

    return [dict(zip(col_names, row)) for row in result]


async def fetch_with_config(config: dict, sql: str) -> list[dict]:
    """
    Async-compatible wrapper — matches the postgres.py interface
    so the query_tool and validation engine work without modification.
    """
    file_path = config.get("file_path")
    if not file_path:
        raise ValueError("DuckDB config missing 'file_path'")
    return fetch_from_file(file_path, sql)


# ── FILE MANAGEMENT ───────────────────────────────────────────────────────────

def get_upload_path(user_id: str, file_id: str, filename: str) -> Path:
    ext  = Path(filename).suffix.lower() or ".csv"
    path = Path(UploadConfig.upload_dir) / user_id / f"{file_id}{ext}"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def validate_file_type(filename: str) -> bool:
    return Path(filename).suffix.lower() in {".csv", ".tsv", ".parquet", ".json"}
