# agent/context.py
"""
Token tracking and context compaction.

Why this matters:
- LLMs have a context window limit (Llama 3.3 70B = 128k tokens)
- Groq free tier has per-request token limits
- Long sessions accumulate tokens fast
- When context is too big: costs explode, responses degrade

Our strategy:
1. Estimate tokens cheaply (no API call needed)
2. When threshold reached, ask LLM to summarize old messages
3. Replace old messages with summary + keep last N messages intact
4. Session file is rewritten to reflect compaction

This is the fix for the exact bug described in the Claude Code leak.
"""
from agent.session import Session

# ── CONSTANTS ─────────────────────────────────────────────────────────────

# Rough estimate: 1 token ≈ 4 characters (standard approximation)
CHARS_PER_TOKEN   = 4

# Trigger compaction when estimated tokens exceed this
COMPACTION_THRESHOLD = 6000   # conservative for Groq free tier

# Always keep last N messages verbatim after compaction
# (so the LLM has immediate context)
KEEP_RECENT = 6

# ── TOKEN ESTIMATION ──────────────────────────────────────────────────────

def estimate_tokens(text: str) -> int:
    """
    Fast token estimation without an API call.
    Accurate enough for threshold decisions.
    Real tokenizers vary but 4 chars/token is a safe average.
    """
    return len(text) // CHARS_PER_TOKEN

def session_token_estimate(session: Session) -> int:
    """Estimate total tokens in a session's message history."""
    total_chars = sum(
        len(msg.get("content", "")) + len(str(msg.get("result", "")))
        for msg in session.messages()
    )
    return total_chars // CHARS_PER_TOKEN

def needs_compaction(session: Session) -> bool:
    """Return True if session is approaching token limit."""
    return session_token_estimate(session) > COMPACTION_THRESHOLD

# ── COMPACTION ────────────────────────────────────────────────────────────

COMPACTION_PROMPT = """
Summarize the following conversation history concisely.
Preserve:
- What database/tables were discussed
- What queries were run and what they returned
- Any business rules or definitions that were established
- Any errors that occurred and how they were resolved

Be brief but complete. This summary replaces the original messages.

CONVERSATION:
{history}
"""

async def compact_session(session: Session, llm) -> dict:
    """
    Summarize old messages, keep recent ones, rewrite session.
    Returns a report of what was done.
    """
    messages = session.messages()

    if len(messages) <= KEEP_RECENT:
        return {"compacted": False, "reason": "too few messages"}

    # Split: old messages get summarized, recent ones are kept verbatim
    old_messages    = messages[:-KEEP_RECENT]
    recent_messages = messages[-KEEP_RECENT:]

    # Build history text for LLM
    history_text = "\n".join([
        f"{m['role'].upper()}: {m.get('content', str(m.get('result', '')))}"
        for m in old_messages
    ])

    # Ask LLM to summarize
    summary_text = await llm(
        COMPACTION_PROMPT.format(history=history_text)
    )

    # Build compacted message list
    summary_msg = {
        "role":          "system",
        "content":       f"[CONVERSATION SUMMARY]\n{summary_text}",
        "ts":            int(__import__('time').time()),
        "connection_id": session.connection_id,
        "compacted":     True,
        "replaced_count": len(old_messages)
    }

    new_messages = [summary_msg] + recent_messages

    # Rewrite session
    session.replace_messages(new_messages)

    return {
        "compacted":      True,
        "removed":        len(old_messages),
        "kept_recent":    KEEP_RECENT,
        "summary_tokens": estimate_tokens(summary_text)
    }

# ── CONTEXT BUILDER ───────────────────────────────────────────────────────

def build_system_prompt(connection_id: str, semantic_context: str) -> str:
    """
    The system prompt injected at the start of every LLM call.
    Kept short deliberately — every token here costs on every turn.
    """
    return f"""You are Waggle, an AI data analyst.
You have access to a database (connection: {connection_id}).

{semantic_context}

Rules:
- Always generate valid PostgreSQL SQL
- Use the semantic model definitions above for metrics
- If unsure, ask a clarifying question rather than guessing
- Return results as structured data, not prose
"""
