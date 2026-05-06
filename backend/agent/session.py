# agent/session.py
"""
Session persistence using JSONL format.

Every conversation turn is appended as a JSON line:
  {"role": "user",      "content": "...", "ts": 1234567890}
  {"role": "assistant", "content": "...", "ts": 1234567890}
  {"role": "tool",      "name": "query_tool", "result": {...}, "ts": ...}

Why JSONL:
- Appendable without rewriting the whole file
- Human readable — you can open it in any text editor
- Streamable — read line by line without loading everything
- Same format used by Claude Code, OpenAI evals, every prod system
"""
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Literal, Optional

SESSIONS_DIR = Path("data/sessions")

MessageRole = Literal["user", "assistant", "tool", "system"]

class Session:
    def __init__(self, session_id: str, connection_id: str):
        self.session_id    = session_id
        self.connection_id = connection_id
        self.path          = SESSIONS_DIR / f"{session_id}.jsonl"
        self._messages: list[dict] = []
        SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
        self.path.touch(exist_ok=True)

    # ── WRITE ──────────────────────────────────────────────────────────

    def add(self, role: MessageRole, content: str, **extra) -> dict:
        """Append one message to the session."""
        msg = {
            "role":          role,
            "content":       content,
            "ts":            int(time.time()),
            "connection_id": self.connection_id,
            **extra
        }
        self._messages.append(msg)
        # Append to JSONL file immediately — never lose a message
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(msg) + "\n")
        return msg

    def add_tool_result(self, tool_name: str, result: dict) -> dict:
        """Record a tool call result as its own event."""
        return self.add(
            role="tool",
            content=f"Tool {tool_name} executed",
            tool_name=tool_name,
            result=result
        )

    # ── READ ───────────────────────────────────────────────────────────

    def messages(self) -> list[dict]:
        """Return all messages in memory."""
        return self._messages.copy()

    def to_llm_messages(self) -> list[dict]:
        """
        Convert session to the format the LLM API expects.
        Tool results are folded into assistant context.
        Skips tool events — those are internal records.
        """
        llm_msgs = []
        for msg in self._messages:
            if msg["role"] in ("user", "assistant"):
                llm_msgs.append({
                    "role":    msg["role"],
                    "content": msg["content"]
                })
            elif msg["role"] == "system":
                llm_msgs.insert(0, {
                    "role":    "system",
                    "content": msg["content"]
                })
        return llm_msgs

    def last_n(self, n: int) -> list[dict]:
        """Return last N messages — used by context compaction."""
        return self._messages[-n:]

    def message_count(self) -> int:
        return len(self._messages)

    def replace_messages(self, new_messages: list[dict]):
        """
        Replace in-memory messages with compacted version.
        Rewrites the JSONL file to match.
        Used by context compaction.
        """
        self._messages = new_messages
        with self.path.open("w", encoding="utf-8") as f:
            for msg in new_messages:
                f.write(json.dumps(msg) + "\n")

    # ── SUMMARY ────────────────────────────────────────────────────────

    def summary(self) -> dict:
        return {
            "session_id":    self.session_id,
            "connection_id": self.connection_id,
            "message_count": len(self._messages),
            "path":          str(self.path)
        }


# ── SESSION STORE ──────────────────────────────────────────────────────────

_sessions: dict[str, Session] = {}

def create_session(connection_id: str) -> Session:
    """Create a new session and register it."""
    session_id = str(uuid.uuid4())
    session    = Session(session_id, connection_id)
    _sessions[session_id] = session
    return session

def get_session(session_id: str) -> Optional[Session]:
    """Get session from memory or reload from disk."""
    if session_id in _sessions:
        return _sessions[session_id]
    # Try loading from disk (server restart recovery)
    path = SESSIONS_DIR / f"{session_id}.jsonl"
    if not path.exists():
        return None
    session = _resume_from_disk(session_id, path)
    _sessions[session_id] = session
    return session

def _resume_from_disk(session_id: str, path: Path) -> Session:
    """
    Reload a session from its JSONL file.
    This is the resume functionality — exactly what was broken
    in the Claude Code leak (db8 bug stripped tool records).
    We preserve ALL record types so resume works correctly.
    """
    messages = []
    connection_id = ""
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
                messages.append(msg)
                if not connection_id and "connection_id" in msg:
                    connection_id = msg["connection_id"]
            except json.JSONDecodeError:
                continue  # skip corrupted lines

    session = Session(session_id, connection_id)
    session._messages = messages
    return session

def list_sessions(connection_id: Optional[str] = None) -> list[dict]:
    """List all sessions, optionally filtered by connection."""
    result = []
    for path in SESSIONS_DIR.glob("*.jsonl"):
        session_id = path.stem
        s = get_session(session_id)
        if s:
            if connection_id is None or s.connection_id == connection_id:
                result.append(s.summary())
    return result
