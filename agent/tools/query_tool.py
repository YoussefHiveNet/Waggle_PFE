# agent/tools/query_tool.py
from __future__ import annotations
"""
query_tool.py

Natural language → SQL pipeline with a 3-attempt retry loop.

Pipeline per attempt:
  1. Resolve relevant cubes from the semantic model (keyword match)
  2. Build LLM prompt (semantic context + schema + question + prior errors)
  3. Generate SQL via LLM
  4. Validate syntax with sqlglot (cheap, no DB call)
  5. Execute against the DB
  6. Run validation pipeline (structural → semantic → assertions → LLM checks)
  7. Return if passed or if this is the last attempt
"""
import sqlglot
from typing import Optional

from agent.llm import generate
from agent.tools.schema_tool import get_schema, format_for_llm
from connectors.postgres import fetch_with_config
from connectors.store import get_connection
from semantic.engine import SemanticEngine
from semantic.models import SemanticModel, Cube
from validation.engine import validate

_engine = SemanticEngine()

_SQL_SYSTEM = "You are a PostgreSQL expert. Generate precise SELECT queries."

_SQL_PROMPT = """\
Semantic model — use these definitions for aggregations and filters:
{semantic_context}

Database schema:
{schema_context}

Question: {question}{error_section}

Return ONLY the SQL query. No explanation, no markdown fences."""


# ── MAIN ENTRY ─────────────────────────────────────────────────────────────

async def run_query(connection_id: str, question: str) -> dict:
    config = get_connection(connection_id)
    if not config:
        raise ValueError(f"Connection '{connection_id}' not found")

    schema = await get_schema(connection_id)

    try:
        model: Optional[SemanticModel] = _engine.load(connection_id)
    except FileNotFoundError:
        model = None

    errors: list[str] = []

    for attempt in range(3):
        sql = await _generate_sql(schema, model, question, errors)

        # Syntax check — free, no DB round-trip
        try:
            sqlglot.parse_one(sql, dialect="postgres")
        except Exception as e:
            errors.append(f"[attempt {attempt + 1}] Syntax error: {e}")
            continue

        # Execute
        try:
            data = await fetch_with_config(config, sql)
        except Exception as e:
            errors.append(f"[attempt {attempt + 1}] DB error: {e}")
            continue

        # Validate
        if model:
            report = await validate(question, sql, data, model, config)
        else:
            report = {
                "passed": True, "checks": [], "failures": [], "confidence": 0.70
            }

        if report["passed"] or attempt == 2:
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
        "error":    "Query failed after 3 attempts",
        "attempts": errors,
    }


# ── INTERNAL HELPERS ────────────────────────────────────────────────────────

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
        error_section = "\n\nPrevious errors to avoid:\n" + "\n".join(
            f"  - {e}" for e in errors
        )

    prompt = _SQL_PROMPT.format(
        semantic_context=semantic_ctx,
        schema_context=format_for_llm(schema),
        question=question,
        error_section=error_section,
    )

    response = await generate(prompt, system=_SQL_SYSTEM)
    return _extract_sql(response)


def _resolve_cubes(model: SemanticModel, question: str) -> list[Cube]:
    """Return cubes whose name or field names appear in the question."""
    q = question.lower()
    matched = [
        cube for cube in model.cubes
        if cube.name.lower() in q
        or any(f.lower() in q for f in cube.all_field_names())
    ]
    return matched or model.cubes


def _extract_sql(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text  = "\n".join(lines[1:-1])
    return text.strip()
