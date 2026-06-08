from __future__ import annotations
import json
import random
import string
import httpx
from typing import Optional
from openai import AsyncOpenAI
from config import LLMConfig
from agent.debug_log import log

_client = None

def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            base_url=LLMConfig.base_url,
            api_key=LLMConfig.api_key,
            http_client=httpx.AsyncClient(verify=False)
        )
    return _client


async def generate(
    prompt: str,
    system: str = "",
    messages: Optional[list[dict]] = None,
    max_tokens: Optional[int] = None,
    tools: Optional[list[dict]] = None,
    tool_choice: str = "auto",
) -> dict:
    """
    Call the LLM and return a structured result dict:
      {"type": "text",      "content": "..."}
      {"type": "tool_call", "id": "call_abc", "name": "...", "arguments": {...}}

    When tools is None, always returns {"type": "text", "content": "..."}.
    """
    if messages is not None:
        full_messages = []
        if system:
            full_messages.append({"role": "system", "content": system})
        full_messages.extend(messages)
    else:
        full_messages = []
        if system:
            full_messages.append({"role": "system", "content": system})
        full_messages.append({"role": "user", "content": prompt})

    kwargs: dict = {
        "model":       LLMConfig.model,
        "messages":    full_messages,
        "temperature": LLMConfig.temperature,
        "max_tokens":  max_tokens or LLMConfig.max_tokens,
    }
    if tools:
        kwargs["tools"]       = tools
        kwargs["tool_choice"] = tool_choice

    log("LLM:IN", f"tools={'yes' if tools else 'no'}  msgs={len(full_messages)}")
    log("LLM:IN", "last_msg:", json.dumps(full_messages[-1], default=str)[:400])

    response = await get_client().chat.completions.create(**kwargs)
    msg = response.choices[0].message

    log("LLM:OUT", f"path={'tool_call' if msg.tool_calls else 'text'}")
    log("LLM:OUT", f"content_preview: {(msg.content or '')[:300]}")

    # Native tool_calls (OpenAI format) — preferred path
    if msg.tool_calls:
        tc = msg.tool_calls[0]
        return {
            "type":      "tool_call",
            "id":        tc.id,
            "name":      tc.function.name,
            "arguments": json.loads(tc.function.arguments),
        }

    # Fallback: vLLM/Mistral sometimes returns tool calls as [TOOL_CALLS][{...}] in text
    content = msg.content or ""
    if "[TOOL_CALLS]" in content:
        try:
            raw = content[content.index("[TOOL_CALLS]") + len("[TOOL_CALLS]"):].strip()
            parsed = json.loads(raw) if raw.startswith("{") else json.loads(raw)[0]
            fallback_id = "".join(random.choices(string.ascii_letters + string.digits, k=9))
            log("LLM:FALLBACK", f"parsed_name={parsed['name']}  new_id={fallback_id}")
            return {
                "type":      "tool_call",
                "id":        fallback_id,
                "name":      parsed["name"],
                "arguments": parsed.get("arguments", parsed.get("parameters", {})),
            }
        except Exception:
            pass

    return {"type": "text", "content": content}


async def generate_text(
    prompt: str,
    system: str = "",
    messages: Optional[list[dict]] = None,
    max_tokens: Optional[int] = None,
) -> str:
    """Thin wrapper — returns plain text. Use everywhere except runtime.py."""
    result = await generate(prompt, system, messages, max_tokens)
    return result["content"] if result["type"] == "text" else ""


async def ping() -> str:
    return await generate_text("Reply with exactly: pong")
