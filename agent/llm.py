import httpx
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

async def generate(prompt: str, system: str = "") -> str:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    response = await get_client().chat.completions.create(
        model=LLMConfig.model,
        messages=messages,
        temperature=LLMConfig.temperature,
        max_tokens=LLMConfig.max_tokens,
    )
    return response.choices[0].message.content

async def ping() -> str:
    return await generate("Reply with exactly: pong")
