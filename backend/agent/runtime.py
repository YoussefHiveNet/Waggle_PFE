# agent/runtime.py
from __future__ import annotations
"""
The agent harness — one function call per user turn.

Architecture: structured router + self-correction loop (max MAX_TURNS iterations).

Each turn:
  1. LLM is called with native OpenAI-format tool definitions (Groq is compatible).
     The LLM returns either a tool_call or a text response — no fragile JSON parsing.
  2. If a tool_call is returned → execute the tool.
     - On error, the full error + attempted SQL are added to turn_messages and the loop retries.
     - On success, synthesize a plain-language answer (Call 2, no tools in system).
  3. If a text response is returned on the first turn for a data question → inject a
     correction message and retry once (handles cases where the LLM is overconfident).

Why this replaces the old two-call pattern:
  - Native tool calling is structured output — no brace-scanning text parsing.
  - The self-correction loop feeds real DB errors back to the LLM so it can fix its SQL.
  - _needs_tool() uses keyword + pronoun signals to reliably detect data questions and
    follow-ups that reference prior results.
"""
import json
from typing import Optional

from agent.session import Session, get_session, create_session
from agent.context import needs_compaction, compact_session, build_system_prompt, estimate_tokens
from agent.llm import generate, generate_text
from agent.tools.query_tool import run_query
from agent.tools.schema_tool import get_schema, format_for_llm
from agent.debug_log import log
from semantic.engine import SemanticEngine
from auth.db import log_query
from connectors.store import get_source

_engine = SemanticEngine()

MAX_TURNS = 2

# ── TOOL DEFINITIONS (OpenAI function-calling format) ──────────────────────

TOOL_DEFS = [
    {
        "type": "function",
        "function": {
            "name": "query",
            "description": (
                "Execute a SQL query against the database and return rows. "
                "Call this for ANY question about data — counts, totals, comparisons, "
                "rankings, lists of rows, trends, or metrics. "
                "NEVER answer data questions from memory or from the schema description."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The natural-language question to answer with data"
                    }
                },
                "required": ["question"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_schema",
            "description": (
                "List tables and column definitions. "
                "Use only when the user asks what tables or columns exist. "
                "Not for data questions."
            ),
            "parameters": {"type": "object", "properties": {}}
        }
    }
]

# ── FOLLOW-UP / DATA-QUESTION DETECTION ───────────────────────────────────

_DATA_KEYWORDS = frozenset({
    "show", "list", "how many", "what", "which", "top", "total", "sum",
    "revenue", "count", "average", "compare", "orders", "customers",
    "products", "sales", "find", "give me", "query", "across", "between",
    "breakdown", "per", "group", "each", "trend", "month", "week",
    "year", "highest", "lowest", "most", "least", "number of", "amount",
    # Artifact / visualization triggers
    "create an artifact", "save this", "make a chart", "show me a chart",
    "visualize", "chart this", "plot this", "graph this", "create a chart",
    "make an artifact", "add to dashboard",
})

_FOLLOWUP_PRONOUNS = frozenset({
    "them", "those", "their", "that", "its", "these",
    "the same", "also", "and also", "additionally",
    "now include", "add", "with their", "include their",
})

# Phrases that mean "tell me the structure" (table names / columns), not "run a data query".
# Matching any of these makes _needs_tool return False so the LLM is free to pick
# get_schema via the native tool definitions instead of being forced into query.
_SCHEMA_PHRASES = (
    "what tables", "which tables",
    "list tables", "list the tables", "list all tables",
    "give me a list of tables", "table of tables", "names of tables",
    "table names", "schema of", "what's in the database",
    "all the tables", "every table",
)


def _needs_tool(user_message: str, has_prior_data: bool) -> bool:
    """Return True if this message should trigger a query tool call."""
    t = user_message.lower()
    # Schema-introspection phrasings: don't force the query tool.
    if any(p in t for p in _SCHEMA_PHRASES):
        return False
    if any(kw in t for kw in _DATA_KEYWORDS):
        return True
    if has_prior_data and any(p in t for p in _FOLLOWUP_PRONOUNS):
        return True
    return False


# ── TOOL EXECUTOR ──────────────────────────────────────────────────────────

async def _execute_tool(tool_name: str, params: dict, connection_id: str) -> dict:
    if tool_name == "query":
        question = params.get("question", "")
        if not question:
            return {"error": "query tool requires a 'question' parameter"}
        return await run_query(connection_id, question)

    if tool_name == "get_schema":
        schema = await get_schema(connection_id)
        return {
            "tables":  list(schema.keys()),
            "context": format_for_llm(schema, max_sample_rows=0)
        }

    return {"error": f"Unknown tool: {tool_name}"}


# ── RESULT FORMATTERS ──────────────────────────────────────────────────────

def _tool_result_to_string(tool_name: str, result: dict) -> str:
    """Full-detail string fed back into the self-correction loop (not user-facing)."""
    if tool_name == "query":
        if "error" in result:
            attempts = result.get("attempts", [])
            sql      = result.get("sql", "")
            lines    = [f"FAILED. Error: {result['error']}"]
            if sql:
                lines.append(f"SQL attempted:\n{sql}")
            if attempts:
                lines.append("Previous attempt errors:\n" + "\n".join(f"  {a}" for a in attempts))
            lines.append("Fix the SQL and try again.")
            return "\n".join(lines)
        data    = result.get("data", [])
        sql     = result.get("sql", "")
        preview = json.dumps(data[:5], default=str)
        return f"SUCCESS.\nSQL: {sql}\nRows: {len(data)}\nSample: {preview}"

    if tool_name == "get_schema":
        tables = result.get("tables", [])
        ctx    = result.get("context", "")
        return f"Tables: {', '.join(tables)}\n\n{ctx}"

    return json.dumps(result, default=str)[:600]


def _summarize_tool_result(tool_name: str, result: dict) -> str:
    """User-facing summary passed to the synthesis LLM call."""
    if tool_name == "query":
        if "error" in result:
            attempts = result.get("attempts", [])
            last_err = attempts[-1] if attempts else result["error"]
            return (
                f"The query failed after {len(attempts)} attempt(s). "
                f"Last error: {last_err}. "
                "Tell the user the query could not be completed and briefly why. "
                "DO NOT make up any numbers, totals, percentages, or data. "
                "Suggest how they might rephrase the question more simply."
            )
        data    = result.get("data", [])
        sql     = result.get("sql", "")
        conf    = result.get("confidence", 1.0)
        preview = json.dumps(data[:5], default=str)
        return (
            f"SQL executed: {sql}\n"
            f"Rows returned: {len(data)}\n"
            f"Data preview: {preview}\n"
            f"Confidence: {conf:.0%}"
        )
    if tool_name == "get_schema":
        tables = result.get("tables", [])
        ctx    = result.get("context", "")
        return f"Tables: {', '.join(tables)}\n\n{ctx}"
    return json.dumps(result, default=str)[:600]


# ── HISTORY BUILDER ────────────────────────────────────────────────────────

def _clean_history(session: Session) -> list[dict]:
    """Build a clean message list from session — only genuine user/assistant turns."""
    clean = []
    for msg in session.messages():
        role    = msg.get("role")
        content = msg.get("content", "")
        if role == "tool":
            continue
        if content.startswith("[Tool result]"):
            continue
        if content.startswith("[Calling tool"):
            continue
        if role in ("user", "assistant", "system"):
            clean.append({"role": role, "content": content})
    return clean


def _has_prior_data(session: Session) -> bool:
    """True if any prior turn in this session produced a successful query result."""
    for msg in session.messages():
        if msg.get("role") == "tool":
            result = msg.get("result", {})
            if isinstance(result, dict) and result.get("data"):
                return True
    return False


# ── MAIN ENTRY POINT ───────────────────────────────────────────────────────

async def run_turn(session: Session, user_message: str) -> dict:
    """
    Process one user turn. Returns:
      response    — final plain-language answer
      tool_calls  — list of tools called this turn (0 or 1)
      session_id  — pass this back for the next turn
      tokens_used — estimated tokens consumed
    """
    connection_id   = session.connection_id
    tool_calls_made = []

    # 1. Compact if needed
    if needs_compaction(session):
        await compact_session(session, generate_text)

    # 2. Load semantic context — skip for combined sources (their semantic models
    #    use bare column names that are ambiguous in the merged DuckDB session)
    source      = await get_source(connection_id)
    is_combined = source and source.get("source_type") == "combined"
    log("TURN:START", f"connection={connection_id}  is_combined={is_combined}")
    try:
        if not is_combined:
            model            = _engine.load(connection_id)
            semantic_context = _engine.build_llm_context(model)
        else:
            raise FileNotFoundError
    except FileNotFoundError:
        schema           = await get_schema(connection_id)
        semantic_context = format_for_llm(schema)

    # 3. Record user message
    session.add("user", user_message)

    system_prompt = build_system_prompt(connection_id, semantic_context)
    history       = _clean_history(session)
    prior_data    = _has_prior_data(session)

    # 4. Self-correction loop
    turn_messages: list[dict] = []
    final_response = ""

    for turn in range(MAX_TURNS):
        log("TURN:LOOP", f"turn={turn}  history_msgs={len(history + turn_messages)}")
        result = await generate(
            prompt="",
            system=system_prompt,
            messages=history + turn_messages,
            tools=TOOL_DEFS,
            tool_choice="auto",
        )

        log("TURN:LOOP", f"result_type={result['type']}")

        if result["type"] == "text":
            if turn == 0 and _needs_tool(user_message, prior_data):
                # LLM skipped the tool on a data question — inject correction and retry
                log("TURN:CORRECT", "LLM skipped tool on data question — injecting correction")
                turn_messages.append({"role": "assistant", "content": result["content"]})
                turn_messages.append({
                    "role":    "user",
                    "content": (
                        "This question requires querying the database. "
                        "Do NOT answer from memory or make up numbers. "
                        "Call the query tool now to get real data."
                    )
                })
                continue
            # Genuine direct answer
            log("TURN:DIRECT", f"answering directly (no tool)")
            final_response = result["content"]
            break

        # Tool call
        tc_id   = result["id"]
        tc_name = result["name"]
        tc_args = result["arguments"]

        log("TURN:TOOL", f"calling={tc_name}  args={tc_args}")
        tool_result = await _execute_tool(tc_name, tc_args, connection_id)

        # Log query attempts
        if tc_name == "query":
            try:
                has_error = "error" in tool_result
                await log_query(
                    connection_id=connection_id,
                    question=user_message,
                    status="error" if has_error else "ok",
                    session_id=session.session_id,
                    sql_attempted=tool_result.get("sql"),
                    error_detail=tool_result.get("error") if has_error else None,
                    row_count=len(tool_result.get("data", [])) if not has_error else None,
                    confidence=tool_result.get("confidence") if not has_error else None,
                )
            except Exception:
                pass

        session.add("assistant", f"[Calling tool: {tc_name}]", tool_call={"tool": tc_name, "params": tc_args})
        session.add_tool_result(tc_name, tool_result)

        tool_calls_made.append({"tool": tc_name, "params": tc_args, "result": tool_result})

        # Append proper OpenAI-format messages for next loop iteration
        turn_messages.append({
            "role":    "assistant",
            "content": None,
            "tool_calls": [{
                "id":   tc_id,
                "type": "function",
                "function": {
                    "name":      tc_name,
                    "arguments": json.dumps(tc_args),
                }
            }]
        })
        turn_messages.append({
            "role":         "tool",
            "tool_call_id": tc_id,
            "content":      _tool_result_to_string(tc_name, tool_result),
        })

        has_error = "error" in tool_result
        if has_error and turn < MAX_TURNS - 1:
            log("TURN:RETRY", f"tool error on turn {turn} — retrying: {tool_result.get('error', '')[:200]}")
            # Retry — the error detail is now visible in turn_messages
            continue

        # Success (or final attempt) — synthesize user-facing answer
        log("TURN:SYNTH", f"synthesizing answer from {tc_name}  rows={len(tool_result.get('data', []))}")
        result_summary = _summarize_tool_result(tc_name, tool_result)
        synthesis_prompt = (
            f"You called the '{tc_name}' tool and received this result:\n\n"
            f"{result_summary}\n\n"
            f"The user's original question was: \"{user_message}\"\n\n"
            "Write a clear, concise answer in plain language. "
            "State the key number or finding first, then explain briefly. "
            "Do not mention SQL or tool names. Do not ask follow-up questions."
        )
        final_response = await generate_text(
            prompt=synthesis_prompt,
            system=build_system_prompt(connection_id, semantic_context),
        )
        break

    # Log if tool was never called for a data question
    if not tool_calls_made:
        try:
            await log_query(
                connection_id=connection_id,
                question=user_message,
                status="no_tool_called",
                session_id=session.session_id,
            )
        except Exception:
            pass

    session.add("assistant", final_response)

    tokens_used = estimate_tokens(system_prompt + user_message + final_response)

    return {
        "question":    user_message,
        "response":    final_response,
        "tool_calls":  tool_calls_made,
        "session_id":  session.session_id,
        "tokens_used": tokens_used,
    }


# ── PUBLIC HELPER ──────────────────────────────────────────────────────────

def get_or_create_session(connection_id: str, session_id: Optional[str]) -> Session:
    if session_id:
        session = get_session(session_id)
        if not session:
            raise ValueError(f"Session '{session_id}' not found")
        return session
    return create_session(connection_id)
