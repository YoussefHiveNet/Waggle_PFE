from __future__ import annotations
from typing import TYPE_CHECKING, Protocol, runtime_checkable

if TYPE_CHECKING:
    import duckdb

_REGISTRY: dict[str, "ConnectorAdapter"] = {}


def register(source_type: str, adapter: "ConnectorAdapter") -> None:
    _REGISTRY[source_type] = adapter


def get_adapter(source_type: str) -> "ConnectorAdapter":
    if source_type not in _REGISTRY:
        raise ValueError(
            f"No adapter registered for source_type '{source_type}'. "
            f"Available: {list(_REGISTRY.keys())}"
        )
    return _REGISTRY[source_type]


@runtime_checkable
class ConnectorAdapter(Protocol):
    async def materialize(
        self,
        conn: "duckdb.DuckDBPyConnection",
        source_config: dict,
        alias: str,
    ) -> None:
        """Load all tables from this source into `conn` under schema `alias`.
        Tables become accessible as alias.table_name in DuckDB SQL."""
        ...

    async def get_tables(self, source_config: dict) -> list[str]:
        """Return list of bare table names exposed by this source."""
        ...
