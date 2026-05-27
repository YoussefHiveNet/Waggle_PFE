from .base import register, get_adapter, ConnectorAdapter
from .postgres_adapter import PostgresAdapter
from .duckdb_adapter import DuckDBAdapter

register("postgres", PostgresAdapter())
register("duckdb",   DuckDBAdapter())

# Future source types — add one line each:
# from .bigquery_adapter import BigQueryAdapter
# register("bigquery", BigQueryAdapter())
# from .shopify_adapter import ShopifyAdapter
# register("shopify", ShopifyAdapter())

__all__ = ["register", "get_adapter", "ConnectorAdapter"]
