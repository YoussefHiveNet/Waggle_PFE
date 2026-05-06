from __future__ import annotations
import httpx
from typing import Optional
from openai import AsyncOpenAI
from config import LLMConfig

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
    messages: Optional[list[dict]] = None
) -> str:
    """
    Call the LLM.
    - If messages is provided, use it directly (multi-turn mode)
    - Otherwise build from system + prompt (single-turn mode)
    """
    if messages is not None:
        # Multi-turn: inject system at front if provided
        full_messages = []
        if system:
            full_messages.append({"role": "system", "content": system})
        full_messages.extend(messages)
    else:
        full_messages = []
        if system:
            full_messages.append({"role": "system", "content": system})
        full_messages.append({"role": "user", "content": prompt})

    response = await get_client().chat.completions.create(
        model=LLMConfig.model,
        messages=full_messages,
        temperature=LLMConfig.temperature,
        max_tokens=LLMConfig.max_tokens,
    )
    return response.choices[0].message.content

async def ping() -> str:
    return await generate("Reply with exactly: pong")