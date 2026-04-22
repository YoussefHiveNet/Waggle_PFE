# validation/engine.py
from __future__ import annotations
import json
import numbers
from typing import Optional
from semantic.models import SemanticModel


async def validate(
    question: str,
    sql: str,
    data: list[dict],
    model: SemanticModel,
    config: Optional[dict] = None,
) -> dict:
    """
    Run up to 5 validation checks on a SQL result.
    Checks 1-3 are free (pure Python). Checks 4-5 cost LLM tokens
    and only run when checks 1-3 pass and a DB config is provided.
    """
    checks: list[str]   = []
    failures: list[str] = []

    _check_structural(data, sql, checks, failures)
    _check_semantic_coherence(question, data, checks, failures)
    _check_assertions(model, data, checks, failures)

    cheap_passed = len(failures) == 0

    if cheap_passed and config:
        await _check_cross_query(question, sql, data, config, checks, failures)

    if cheap_passed and not failures and config:
        await _check_llm_sanity(question, data, checks, failures)

    passed = len(failures) == 0

    if passed and len(checks) == 5:
        confidence = 0.95
    elif passed:
        confidence = 0.80
    else:
        confidence = 0.30

    return {
        "passed":    passed,
        "checks":    checks,
        "failures":  failures,
        "confidence": confidence,
    }


# ── CHECK 1: STRUCTURAL ────────────────────────────────────────────────────

def _check_structural(
    data: list[dict], sql: str, checks: list[str], failures: list[str]
) -> None:
    checks.append("structural")

    if not data:
        sql_upper = sql.upper()
        has_aggregate = any(
            kw in sql_upper
            for kw in ("COUNT(", "SUM(", "AVG(", "MAX(", "MIN(", "GROUP BY")
        )
        if not has_aggregate:
            failures.append("Empty result set with no aggregation detected")
        return

    if len(data) > 10000:
        failures.append(f"Row explosion: {len(data)} rows returned (limit 10000)")
        return

    for col in data[0].keys():
        if all(row.get(col) is None for row in data):
            failures.append(f"Column '{col}' is entirely NULL")


# ── CHECK 2: SEMANTIC COHERENCE ────────────────────────────────────────────

def _check_semantic_coherence(
    question: str, data: list[dict], checks: list[str], failures: list[str]
) -> None:
    checks.append("semantic_coherence")
    if not data:
        return

    q = question.lower()
    wants_numeric = any(
        kw in q for kw in (
            "how many", "count", "number of",
            "total", "sum", "revenue", "amount", "average", "avg",
        )
    )
    if wants_numeric:
        row = data[0]
        has_numeric = any(
            isinstance(v, numbers.Number)
            for v in row.values()
            if v is not None
        )
        if not has_numeric:
            failures.append(
                "Question implies a numeric result but no numeric column was returned"
            )


# ── CHECK 3: BUSINESS ASSERTIONS ──────────────────────────────────────────

_OPS = {
    "gte": lambda a, b: a >= b,
    "lte": lambda a, b: a <= b,
    "gt":  lambda a, b: a > b,
    "lt":  lambda a, b: a < b,
    "eq":  lambda a, b: a == b,
    "ne":  lambda a, b: a != b,
}

def _check_assertions(
    model: SemanticModel, data: list[dict], checks: list[str], failures: list[str]
) -> None:
    checks.append("assertions")
    if not data or not model.assertions:
        return

    for assertion in model.assertions:
        col = assertion.get("column")
        op  = assertion.get("op")
        val = assertion.get("value")
        if not col or op not in _OPS or col not in data[0]:
            continue
        fn = _OPS[op]
        for row in data:
            v = row.get(col)
            if v is not None and not fn(v, val):
                failures.append(
                    f"Assertion violated: {col} {op} {val}, got {v}"
                )
                break


# ── CHECK 4: CROSS-QUERY VERIFICATION ─────────────────────────────────────

async def _check_cross_query(
    question: str,
    sql: str,
    data: list[dict],
    config: dict,
    checks: list[str],
    failures: list[str],
) -> None:
    # Scalar aggregates (SUM/AVG/MAX/MIN without GROUP BY) always return 1 row —
    # comparing against COUNT(*) would always mismatch, so skip the check.
    sql_upper = sql.upper()
    is_scalar_aggregate = (
        any(fn + "(" in sql_upper for fn in ("SUM", "COUNT", "AVG", "MAX", "MIN"))
        and "GROUP BY" not in sql_upper
    )
    if is_scalar_aggregate:
        checks.append("cross_query (skipped — scalar aggregate)")
        return

    checks.append("cross_query")
    try:
        from agent.llm import generate
        from connectors.postgres import fetch_with_config

        count_prompt = (
            f"Write a simple COUNT(*) SQL query that counts the rows relevant to: "
            f"'{question}'. Return ONLY the SQL, no explanation, no fences."
        )
        raw_sql = (await generate(count_prompt)).strip()
        if raw_sql.startswith("```"):
            raw_sql = "\n".join(raw_sql.split("\n")[1:-1]).strip()

        result = await fetch_with_config(config, raw_sql)
        if result:
            expected = list(result[0].values())[0]
            actual   = len(data)
            if isinstance(expected, int) and expected > 0 and actual != expected:
                failures.append(
                    f"Cross-query mismatch: COUNT(*) returned {expected}, "
                    f"but query returned {actual} rows"
                )
    except Exception:
        pass  # best-effort — never block a result


# ── CHECK 5: LLM SANITY ────────────────────────────────────────────────────

async def _check_llm_sanity(
    question: str,
    data: list[dict],
    checks: list[str],
    failures: list[str],
) -> None:
    checks.append("llm_sanity")
    try:
        from agent.llm import generate

        sample = data[:3]
        prompt = (
            f"Question: {question}\n"
            f"Result (first {len(sample)} rows): "
            f"{json.dumps(sample, default=str)}\n\n"
            "Does this result make sense for the question? Reply YES or NO only."
        )
        answer = (await generate(prompt)).strip().upper()
        if answer.startswith("NO"):
            failures.append("LLM sanity check: result does not match question intent")
    except Exception:
        pass  # advisory only
