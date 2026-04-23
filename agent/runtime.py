# agent/runtime.py
"""
The agent harness loop.

This is the most important file in Waggle.
Every user message flows through here.

Loop per turn:
  1. Load session + semantic context
  2. Check if compaction needed
  3. Build messages for LLM (system + history + new user message)
  4. Call LLM → get response
  5. Parse response: is it a tool call or a direct answer?
  6. If tool call → execute tool → append result → loop back to 4
  7. If direct answer → append to session → return to user

Why this matters:
  Without a harness, every query is stateless.
  With a harness, "now filter that by France" works because
  the agent remembers the previous query and its result.
"""
import json
import re
from agent.session import Session, get_session, create_session
from agent.context import (
    needs_compaction, compact_session,
    build_system_prompt, estimate_tokens
)
from agent.llm import generate
from agent.tools.query_tool import run_query
from agent.tools.schema_tool import get_schema, format_for_llm
from semantic.engine import SemanticEngine

_engine = SemanticEngine()

# Maximum tool call iterations per turn (prevents infinite loops)
MAX_TOOL_ITERATIONS = 5

# ── TOOL REGISTRY ─────────────────────────────────────────────────────────

TOOLS = {
    "query": {
        "description": (
            "Run a natural language query against the database. "
            "Use this whenever the user asks for data, metrics, "
            "counts, totals, or any question that requires querying."
        ),
        "parameters": ["question"]
    },
    "get_schema": {
        "description": (
            "Retrieve the database schema. Use this when the user "
            "asks what tables exist, what columns are available, "
            "or asks about the structure of the data."
        ),
        "parameters": []
    }
}

def _tool_descriptions() -> str:
    """Format tool list for the system prompt."""
    lines = ["AVAILABLE TOOLS — call by responding with JSON:"]
    for name, info in TOOLS.items():
        params = ", ".join(info["parameters"]) or "none"
        lines.append(f'  {name}: {info["description"]}')
        lines.append(f'    Parameters: {params}')
        lines.append(
            f'    Call format: {{"tool": "{name}", '
            f'"params": {{{", ".join(f\'"{p}": "value"\' for p in info["parameters"])}}}}}'
        )
    lines.append(
        '\nIf no tool is needed, respond normally in plain text.\n'
        'IMPORTANT: if calling a tool, respond with ONLY the JSON. '
        'No explanation before or after.'
    )
    return "\n".join(lines)

# ── TOOL CALL PARSER ──────────────────────────────────────────────────────

def _parse_tool_call(text: str) -> dict | None:
    """
    Check if LLM response is a tool call.
    Returns parsed dict or None if it's a plain text response.
    """
    text = text.strip()

    # Strip markdown fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        text  = "\n".join(lines[1:-1]).strip()

    # Must look like JSON with a "tool" key
    if not (text.startswith("{") and '"tool"' in text):
        return None

    try:
        parsed = json.loads(text)
        if "tool" in parsed:
            return parsed
    except json.JSONDecodeError:
        # Try extracting JSON from mixed text
        match = re.search(r'\{[^{}]*"tool"[^{}]*\}', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
    return None

# ── TOOL EXECUTOR ─────────────────────────────────────────────────────────

async def _execute_tool(
    tool_name: str,
    params: dict,
    connection_id: str
) -> dict:
    """Execute a named tool and return its result."""

    if tool_name == "query":
        question = params.get("question", "")
        if not question:
            return {"error": "query tool requires a 'question' parameter"}
        result = await run_query(connection_id, question)
        return result

    elif tool_name == "get_schema":
        schema = await get_schema(connection_id)
        return {
            "tables":  list(schema.keys()),
            "context": format_for_llm(schema, max_sample_rows=0)
        }

    else:
        return {"error": f"Unknown tool: {tool_name}"}

# ── MAIN HARNESS LOOP ─────────────────────────────────────────────────────

async def run_turn(
    session: Session,
    user_message: str
) -> dict:
    """
    Process one user turn through the full harness loop.

    Returns:
      {
        "response":    str,        # final text response to user
        "tool_calls":  list,       # tools that were called this turn
        "session_id":  str,
        "tokens_used": int         # estimated tokens this turn
      }
    """
    connection_id = session.connection_id
    tool_calls_this_turn = []

    # ── 1. Compaction check ───────────────────────────────────────────
    if needs_compaction(session):
        await compact_session(session, generate)

    # ── 2. Load semantic context ──────────────────────────────────────
    try:
        model           = _engine.load(connection_id)
        semantic_context = _engine.build_llm_context(model)
    except FileNotFoundError:
        # No semantic model yet — use raw schema
        schema           = await get_schema(connection_id)
        semantic_context = format_for_llm(schema)

    # ── 3. Build system prompt ────────────────────────────────────────
    system = (
        build_system_prompt(connection_id, semantic_context)
        + "\n\n"
        + _tool_descriptions()
    )

    # ── 4. Append user message to session ────────────────────────────
    session.add("user", user_message)

    # ── 5. Harness loop ───────────────────────────────────────────────
    final_response = ""
    iterations     = 0

    while iterations < MAX_TOOL_ITERATIONS:
        iterations += 1

        # Build message list for this LLM call
        llm_messages = session.to_llm_messages()

        # Call LLM
        raw_response = await generate(
            prompt=llm_messages[-1]["content"] if llm_messages else user_message,
            system=system
        )

        # Check if it's a tool call
        tool_call = _parse_tool_call(raw_response)

        if tool_call:
            tool_name = tool_call.get("tool")
            params    = tool_call.get("params", {})

            # Execute the tool
            tool_result = await _execute_tool(tool_name, params, connection_id)
            tool_calls_this_turn.append({
                "tool":   tool_name,
                "params": params,
                "result": tool_result
            })

            # Record tool call + result in session
            session.add(
                "assistant",
                f"[Calling tool: {tool_name}]",
                tool_call=tool_call
            )
            session.add_tool_result(tool_name, tool_result)

            # Feed result back to LLM as next user message
            # so it can formulate a natural language response
            result_summary = _summarize_tool_result(tool_name, tool_result)
            session.add("user", f"[Tool result]: {result_summary}")

            # Continue loop — LLM will now respond with final answer
            continue

        else:
            # Plain text response — we're done
            final_response = raw_response
            session.add("assistant", final_response)
            break

    # Fallback if loop exhausted without a plain response
    if not final_response:
        final_response = "I completed the analysis. Check the tool results above."
        session.add("assistant", final_response)

    # ── 6. Token accounting ───────────────────────────────────────────
    tokens_this_turn = estimate_tokens(
        system + user_message + final_response
    )

    return {
        "response":    final_response,
        "tool_calls":  tool_calls_this_turn,
        "session_id":  session.session_id,
        "tokens_used": tokens_this_turn
    }


def _summarize_tool_result(tool_name: str, result: dict) -> str:
    """
    Produce a concise summary of a tool result to feed back
    to the LLM. We don't feed raw data dumps — too many tokens.
    """
    if tool_name == "query":
        data  = result.get("data", [])
        sql   = result.get("sql", "")
        conf  = result.get("confidence", 1.0)
        rows  = len(data)
        # Show first 3 rows max
        preview = data[:3] if data else []
        return (
            f"Query executed successfully.\n"
            f"SQL: {sql}\n"
            f"Rows returned: {rows}\n"
            f"Preview: {json.dumps(preview, default=str)}\n"
            f"Confidence: {conf:.0%}"
        )
    elif tool_name == "get_schema":
        tables = result.get("tables", [])
        return f"Schema loaded. Tables: {', '.join(tables)}"
    else:
        return json.dumps(result, default=str)[:500]
