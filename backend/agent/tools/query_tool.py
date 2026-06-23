# agent/tools/query_tool.py
from __future__ import annotations
"""
query_tool.py

Converts a natural language question to SQL, executes it, and returns results.

Retry loop (up to MAX_ATTEMPTS):
  1. Resolve relevant cubes from the semantic model (keyword match on question)
  2. Build LLM prompt (semantic context + schema + question + prior errors)
  3. Syntax-validate with sqlglot — cheap, no DB round-trip
  4. Execute against the DB
  5. Run validation pipeline (structural → semantic coherence → assertions →
     cross-query → LLM sanity)
  6. Return if validation passed, or retry with error in context

Why accumulate errors across attempts:
  The LLM sees what it tried and why it failed — same as a human debugging
  at a REPL. Without this it tends to regenerate the same broken SQL.
"""
import sqlglot
from typing import Optional

from agent.llm import generate_text as generate
from agent.tools.schema_tool import get_schema, format_for_llm
from agent.debug_log import log
from connectors.postgres import fetch_with_config as _pg_fetch
from connectors.duckdb import fetch_with_config as _duck_fetch
# Re-exported for backwards compatibility — old callers used _serialize_rows
from util.serialize import serialize_rows as _serialize_rows  # noqa: F401
from connectors.store import get_source
from semantic.engine import SemanticEngine
from semantic.models import SemanticModel, Cube
from validation.engine import validate

MAX_ATTEMPTS = 3
_engine = SemanticEngine()

_SQL_SYSTEM = "You are a SQL expert. Generate precise, minimal SELECT queries."

_SQL_PROMPT = """\
Semantic model — use these definitions for aggregations and filters:
{semantic_context}

Database schema:
{schema_context}

Question: {question}{cross_source_hint}{error_section}

Rules:
- Return ONLY the SQL query — no explanation, no markdown fences
- Use only tables and columns listed in the schema above
- Always alias tables (e.g. SELECT o.amount FROM orders o)
- Never use SELECT *
- Use the semantic model metric expressions verbatim where applicable"""

_CROSS_SOURCE_FEW_SHOT = """

CROSS-SOURCE SQL RULES — read carefully:

★ PREFER `unified_<table>` VIEWS for any question asking about both/all sources
  (common values, combined metrics, "across stores" comparisons). These are
  auto-generated VIEWs that UNION ALL every source's version of a shared table
  and add a `source` column identifying the origin. Filter / group by `source`
  instead of hand-authoring cross-source UNIONs.

- The TABLE MAP header at the top of the schema lists which unified views exist.
- Use the qualified `"alias".public."table"` names only when the question is
  specific to ONE source (e.g. "how many orders in NYC").
- NEVER invent column names — every column used must appear in the schema.
- If the question implies time (per month, by year, trend), use the real
  timestamp column from the schema (e.g. `ordered_at`). Do not assume.

EXAMPLE 1 — Count from one source:
SELECT COUNT(*) AS order_count
FROM "store1".public."orders";

EXAMPLE 2 — Common rows across sources (the "who shops in both stores?" pattern):
SELECT email,
       MIN(first_name) AS first_name,
       MIN(last_name)  AS last_name
FROM unified_customers
GROUP BY email
HAVING COUNT(DISTINCT source) = 2
ORDER BY last_name;

EXAMPLE 3 — Common SKUs across stores:
SELECT sku, MIN(name) AS name
FROM unified_products
GROUP BY sku
HAVING COUNT(DISTINCT source) = (SELECT COUNT(DISTINCT source) FROM unified_products)
ORDER BY sku;

EXAMPLE 4 — Compare a metric per shared SKU across sources (use unified views, pivot by `source`):
WITH rev AS (
  SELECT oi.source, p.sku, p.name,
         oi.quantity * oi.unit_price AS amount
  FROM unified_order_items oi
  JOIN unified_products p
    ON p.id = oi.product_id AND p.source = oi.source
)
SELECT sku,
       MIN(name) AS name,
       SUM(amount) FILTER (WHERE source = 'store1') AS store1_revenue,
       SUM(amount) FILTER (WHERE source = 'store2') AS store2_revenue
FROM rev
GROUP BY sku
ORDER BY store1_revenue + store2_revenue DESC NULLS LAST;

EXAMPLE 5 — Combined metric over time across sources:
SELECT DATE_TRUNC('month', ordered_at) AS month,
       SUM(order_total - discount_amt) AS combined_revenue
FROM unified_orders
GROUP BY month
ORDER BY month;

EXAMPLE 6 — Per-source breakdown of any shared metric:
SELECT source,
       COUNT(*)              AS order_count,
       SUM(order_total)      AS total
FROM unified_orders
GROUP BY source;
"""


# ── MAIN ENTRY POINT ──────────────────────────────────────────────────────

async def run_query(connection_id: str, question: str) -> dict:
    """
    NL → SQL → execute → validate → return results.

    Returns on success:
      sql               — the SQL that ran successfully
      data              — list of JSON-safe row dicts
      row_count         — len(data)
      validation_report — {passed, checks, failures, confidence}
      confidence        — float 0–1
      attempts          — how many LLM calls were needed

    Returns on failure:
      error    — human-readable reason
      attempts — list of error strings per attempt
    """
    source = await get_source(connection_id)
    if not source:
        raise ValueError(f"Source '{connection_id}' not found")

    config      = source["config"]
    source_type = source["source_type"]
    if source_type == "duckdb":
        fetch_fn = _duck_fetch
    elif source_type == "combined":
        from connectors.merged import fetch_with_config as _merged_fetch
        async def fetch_fn(cfg, sql): return await _merged_fetch(cfg, sql)
    else:
        fetch_fn = _pg_fetch

    schema = await get_schema(connection_id)

    # Fetch user-drawn join hints for combined sources
    join_hints = ""
    if source_type == "combined":
        from connectors.merged import build_join_hint
        join_hints = build_join_hint(config.get("links", []))

    log("SQL:CONTEXT", f"source_type={source_type}  tables={list(schema.keys())[:6]}  join_hints_len={len(join_hints)}")

    try:
        model: Optional[SemanticModel] = _engine.load(connection_id)
    except FileNotFoundError:
        model = None

    errors: list[str] = []

    for attempt in range(MAX_ATTEMPTS):
        sql = await _generate_sql(schema, model, question, errors, join_hints=join_hints)

        # Syntax check — free, catches obvious LLM mistakes before a DB round-trip
        try:
            sqlglot.parse_one(sql, dialect="postgres")
        except Exception as e:
            log("SQL:ERROR", f"attempt={attempt + 1}  syntax: {e}")
            errors.append(f"[attempt {attempt + 1}] Syntax error: {e}")
            continue

        # Execute
        try:
            raw_data = await fetch_fn(config, sql)
        except Exception as e:
            log("SQL:ERROR", f"attempt={attempt + 1}  db: {e}")
            errors.append(f"[attempt {attempt + 1}] DB error: {e}")
            continue

        data = _serialize_rows(raw_data)

        # Validate (checks 1-3 free; checks 4-5 cost one LLM call each)
        report = await validate(
            question, sql, data, model or _empty_model(),
            config=config, fetch_fn=fetch_fn,
        ) if model else {
            "passed": True, "checks": [], "failures": [], "confidence": 0.70
        }

        if report["passed"] or attempt == MAX_ATTEMPTS - 1:
            return {
                "sql":               sql,
                "data":              data,
                "row_count":         len(data),
                "validation_report": report,
                "confidence":        report["confidence"],
                "attempts":          attempt + 1,
            }

        errors.append(
            f"[attempt {attempt + 1}] Validation failed: {report['failures']}"
        )

    return {
        "error":    f"Query failed after {MAX_ATTEMPTS} attempts",
        "attempts": errors,
    }


# ── SQL GENERATION ────────────────────────────────────────────────────────

def _is_combined_schema(schema: dict) -> bool:
    """True when schema keys are alias-prefixed (e.g. 'nyc.orders') — a combined source."""
    return any("." in k for k in schema)


async def _generate_sql(
    schema: dict,
    model: Optional[SemanticModel],
    question: str,
    errors: list[str],
    join_hints: str = "",
) -> str:
    if model:
        relevant     = _resolve_cubes(model, question)
        semantic_ctx = _engine.build_llm_context(model, relevant)
    else:
        semantic_ctx = "(no semantic model — derive intent directly from schema)"

    cross_source_hint = ""
    if _is_combined_schema(schema):
        join_block = (
            "\n\nUSER-DEFINED JOINS (drawn in the graph — use these exactly):\n"
            + join_hints + "\n"
        ) if join_hints else ""
        cross_source_hint = join_block + _CROSS_SOURCE_FEW_SHOT

    error_section = ""
    if errors:
        error_section = "\n\nPrevious attempts that failed:\n" + "\n".join(
            f"  {e}" for e in errors
        )

    prompt = _SQL_PROMPT.format(
        semantic_context=semantic_ctx,
        schema_context=format_for_llm(schema, max_sample_rows=1),
        question=question,
        cross_source_hint=cross_source_hint,
        error_section=error_section,
    )

    log("SQL:PROMPT", f"is_combined={_is_combined_schema(schema)}  join_hints_len={len(join_hints)}")
    log("SQL:PROMPT", "prompt_preview:", prompt[:800])

    response = await generate(prompt, system=_SQL_SYSTEM)
    sql = _clean_sql(response)
    log("SQL:RESULT", f"sql={sql[:300]}")
    return sql


# ── HELPERS ───────────────────────────────────────────────────────────────

def _resolve_cubes(model: SemanticModel, question: str) -> list[Cube]:
    """Return cubes whose name or field names appear in the question.
    Falls back to all cubes if nothing matches."""
    q = question.lower()
    matched = [
        cube for cube in model.cubes
        if cube.name.lower() in q
        or any(f.lower() in q for f in cube.all_field_names())
    ]
    return matched or model.cubes


def _clean_sql(text: str) -> str:
    """Strip markdown fences and whitespace from LLM output."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text  = "\n".join(lines[1:-1])
    # asyncpg rejects trailing semicolons in single-statement execution
    return text.strip().rstrip(";")


# _serialize_rows is imported from util.serialize at the top of this file.


def _empty_model() -> SemanticModel:
    from semantic.models import SemanticModel
    return SemanticModel(cubes=[], assertions=[])
