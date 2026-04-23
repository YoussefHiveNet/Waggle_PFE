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
import decimal
import datetime
import uuid
import sqlglot
from typing import Optional

from agent.llm import generate
from agent.tools.schema_tool import get_schema, format_for_llm
from connectors.postgres import fetch_with_config
from connectors.store import get_connection
from semantic.engine import SemanticEngine
from semantic.models import SemanticModel, Cube
from validation.engine import validate

MAX_ATTEMPTS = 3
_engine = SemanticEngine()

_SQL_SYSTEM = "You are a PostgreSQL expert. Generate precise, minimal SELECT queries."

_SQL_PROMPT = """\
Semantic model — use these definitions for aggregations and filters:
{semantic_context}

Database schema:
{schema_context}

Question: {question}{error_section}

Rules:
- Return ONLY the SQL query — no explanation, no markdown fences
- Use only tables and columns listed in the schema above
- Always alias tables (e.g. SELECT o.amount FROM orders o)
- Never use SELECT *
- Use the semantic model metric expressions verbatim where applicable"""


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
    config = get_connection(connection_id)
    if not config:
        raise ValueError(f"Connection '{connection_id}' not found")

    schema = await get_schema(connection_id)

    try:
        model: Optional[SemanticModel] = _engine.load(connection_id)
    except FileNotFoundError:
        model = None

    errors: list[str] = []

    for attempt in range(MAX_ATTEMPTS):
        sql = await _generate_sql(schema, model, question, errors)

        # Syntax check — free, catches obvious LLM mistakes before a DB round-trip
        try:
            sqlglot.parse_one(sql, dialect="postgres")
        except Exception as e:
            errors.append(f"[attempt {attempt + 1}] Syntax error: {e}")
            continue

        # Execute
        try:
            raw_data = await fetch_with_config(config, sql)
        except Exception as e:
            errors.append(f"[attempt {attempt + 1}] DB error: {e}")
            continue

        data = _serialize_rows(raw_data)

        # Validate (checks 1-3 free; checks 4-5 cost one LLM call each)
        report = await validate(
            question, sql, data, model or _empty_model(), config
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

async def _generate_sql(
    schema: dict,
    model: Optional[SemanticModel],
    question: str,
    errors: list[str],
) -> str:
    if model:
        relevant     = _resolve_cubes(model, question)
        semantic_ctx = _engine.build_llm_context(model, relevant)
    else:
        semantic_ctx = "(no semantic model — derive intent directly from schema)"

    error_section = ""
    if errors:
        error_section = "\n\nPrevious attempts that failed:\n" + "\n".join(
            f"  {e}" for e in errors
        )

    prompt = _SQL_PROMPT.format(
        semantic_context=semantic_ctx,
        schema_context=format_for_llm(schema, max_sample_rows=1),
        question=question,
        error_section=error_section,
    )

    response = await generate(prompt, system=_SQL_SYSTEM)
    return _clean_sql(response)


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


def _serialize_rows(rows: list[dict]) -> list[dict]:
    """
    Make asyncpg rows JSON-safe.
    asyncpg returns Decimal for NUMERIC, date/datetime for temporal columns,
    and UUID objects — none of which FastAPI's JSON encoder handles by default.
    """
    result = []
    for row in rows:
        clean = {}
        for k, v in row.items():
            if isinstance(v, decimal.Decimal):
                clean[k] = float(v)
            elif isinstance(v, (datetime.date, datetime.datetime)):
                clean[k] = v.isoformat()
            elif isinstance(v, uuid.UUID):
                clean[k] = str(v)
            else:
                clean[k] = v
        result.append(clean)
    return result


def _empty_model() -> SemanticModel:
    from semantic.models import SemanticModel
    return SemanticModel(cubes=[], assertions=[])
