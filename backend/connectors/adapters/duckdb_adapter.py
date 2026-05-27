from __future__ import annotations
from pathlib import Path


class DuckDBAdapter:
    """Exposes a CSV/Parquet file as a DuckDB schema.
    Table is accessible as {alias}.{table_name}."""

    async def materialize(self, conn, source_config: dict, alias: str) -> None:
        file_path = source_config["file_path"]
        table_name = source_config.get("table_name") or Path(file_path).stem
        conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{alias}"')
        conn.execute(
            f'CREATE VIEW "{alias}"."{table_name}" AS '
            f"SELECT * FROM read_csv_auto('{file_path}')"
        )

    async def get_tables(self, source_config: dict) -> list[str]:
        file_path = source_config["file_path"]
        table_name = source_config.get("table_name") or Path(file_path).stem
        return [table_name]
