# agent/runtime.py
from __future__ import annotations
"""
The agent harness — one function call per user turn.

Two-call pattern per turn (eliminates the tool loop bug):
  Call 1: LLM sees full conversation history + tool descriptions
          → decides whether to call a tool or answer directly
  Call 2: (only if a tool was called) LLM sees the tool result
          → formulates the final plain-language answer
          → tool descriptions are NOT included, so it cannot loop

This is intentionally not a loop. One tool call per turn is the right
design for a data Q&A agent — users ask one question, get one answer.
If they want to refine, they ask another question.
"""
import json
from typing import Optional

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

# ── TOOL REGISTRY ─────────────────────────────────────────────────────────

TOOLS = {
    "query": {
        "description": (
            "Run a natural language query against the database. "
            "Use this whenever the user asks for data, metrics, "
            "counts, totals, or any question that requires querying rows."
        ),
        "parameters": ["question"]
    },
    "get_schema": {
        "description": (
            "Retrieve the database schema — table names and column definitions. "
            "Use this when the user asks what tables exist or what columns "
            "are available. Do NOT use this for data questions."
        ),
        "parameters": []
    }
}

def _tool_descriptions() -> str:
    lines = [
        "AVAILABLE TOOLS — if you need data, call a tool by responding with JSON only.",
        "If you can answer from context, respond in plain text instead.\n"
    ]
    for name, info in TOOLS.items():
        param_example = ", ".join(f'"{p}": "..."' for p in info["parameters"])
        lines.append(f'Tool: {name}')
        lines.append(f'  When to use: {info["description"]}')
        lines.append(f'  Call format: {{"tool": "{name}", "params": {{{param_example}}}}}')
        lines.append("")
    lines.append(
        "IMPORTANT: if calling a tool, your ENTIRE response must be the JSON object.\n"
        "No text before or after. If not calling a tool, respond in plain text only."
    )
    return "\n".join(lines)


# ── TOOL CALL PARSER ──────────────────────────────────────────────────────

def _parse_tool_call(text: str) -> Optional[dict]:
    """Return parsed tool call dict, or None if it's a plain-text response."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text  = "\n".join(lines[1:-1]).strip()
    if not (text.startswith("{") and '"tool"' in text):
        return None
    try:
        parsed = json.loads(text)
        if "tool" in parsed:
            return parsed
    except json.JSONDecodeError:
        pass
    return None


# ── TOOL EXECUTOR ─────────────────────────────────────────────────────────

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


# ── HISTORY BUILDER ───────────────────────────────────────────────────────

def _clean_history(session: Session) -> list[dict]:
    """
    Build a clean message list for the LLM from the session.

    Strips out:
    - role=tool records (internal bookkeeping, confuse the LLM)
    - injected [Tool result] user messages (caused the loop bug)
    - [Calling tool] assistant messages (internal bookkeeping)

    Keeps only genuine user questions and assistant answers.
    The current user message (last in session) IS included — it's the prompt.
    """
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


# ── RESULT SUMMARISER ─────────────────────────────────────────────────────

def _summarize_tool_result(tool_name: str, result: dict) -> str:
    """Concise summary to feed into the second LLM call."""
    if tool_name == "query":
        if "error" in result:
            return f"The query failed: {result['error']}"
        data    = result.get("data", [])
        sql     = result.get("sql", "")
        conf    = result.get("confidence", 1.0)
        preview = json.dumps(data[:5], default=str)
        return (
            f"SQL executed: {sql}\n"
            f"Rows returned: {len(data)}\n"
            f"Data: {preview}\n"
            f"Confidence: {conf:.0%}"
        )
    if tool_name == "get_schema":
        tables = result.get("tables", [])
        ctx    = result.get("context", "")
        return f"Tables: {', '.join(tables)}\n\n{ctx}"
    return json.dumps(result, default=str)[:600]


# ── MAIN ENTRY POINT ──────────────────────────────────────────────────────

async def run_turn(session: Session, user_message: str) -> dict:
    """
    Process one user turn.

    Returns:
      response    — final plain-language answer for the user
      tool_calls  — list of tools called this turn (0 or 1)
      session_id  — pass this back for the next turn
      tokens_used — estimated tokens consumed this turn
    """
    connection_id    = session.connection_id
    tool_calls_made  = []

    # ── 1. Compact if needed ─────────────────────────────────────────
    if needs_compaction(session):
        await compact_session(session, generate)

    # ── 2. Load semantic context ─────────────────────────────────────
    try:
        model            = _engine.load(connection_id)
        semantic_context = _engine.build_llm_context(model)
    except FileNotFoundError:
        schema           = await get_schema(connection_id)
        semantic_context = format_for_llm(schema)

    # ── 3. Record user message ───────────────────────────────────────
    session.add("user", user_message)

    # ── 4. Call 1: decide what to do ─────────────────────────────────
    system_with_tools = (
        build_system_prompt(connection_id, semantic_context)
        + "\n\n"
        + _tool_descriptions()
    )
    history    = _clean_history(session)
    response_1 = await generate(
        prompt="",           # ignored — history carries the conversation
        system=system_with_tools,
        messages=history
    )

    tool_call = _parse_tool_call(response_1)

    # ── 5a. Tool path ────────────────────────────────────────────────
    if tool_call:
        tool_name   = tool_call.get("tool")
        params      = tool_call.get("params", {})

        tool_result = await _execute_tool(tool_name, params, connection_id)
        tool_calls_made.append({
            "tool":   tool_name,
            "params": params,
            "result": tool_result
        })

        # Record internally — kept out of the clean history
        session.add("assistant", f"[Calling tool: {tool_name}]", tool_call=tool_call)
        session.add_tool_result(tool_name, tool_result)

        # ── 6. Call 2: synthesize answer from tool result ─────────
        result_summary = _summarize_tool_result(tool_name, tool_result)
        synthesis_prompt = (
            f"You called the '{tool_name}' tool and received this result:\n\n"
            f"{result_summary}\n\n"
            f"The user's original question was: \"{user_message}\"\n\n"
            "Write a clear, concise answer in plain language. "
            "State the key number or finding first, then explain briefly. "
            "Do not mention SQL or tool names. Do not ask follow-up questions."
        )
        # No tool descriptions in system — prevents any further tool calls
        final_response = await generate(
            prompt=synthesis_prompt,
            system=build_system_prompt(connection_id, semantic_context)
        )

    # ── 5b. Direct answer path ───────────────────────────────────────
    else:
        final_response = response_1

    # ── 7. Record final response ─────────────────────────────────────
    session.add("assistant", final_response)

    tokens_used = estimate_tokens(
        system_with_tools + user_message + final_response
    )

    return {
        "question":    user_message,
        "response":    final_response,
        "tool_calls":  tool_calls_made,
        "session_id":  session.session_id,
        "tokens_used": tokens_used,
    }


# ── PUBLIC HELPER ─────────────────────────────────────────────────────────

def get_or_create_session(connection_id: str, session_id: Optional[str]) -> Session:
    if session_id:
        session = get_session(session_id)
        if not session:
            raise ValueError(f"Session '{session_id}' not found")
        return session
    return create_session(connection_id)
