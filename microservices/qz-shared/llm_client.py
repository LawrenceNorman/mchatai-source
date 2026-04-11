"""Shared LLM proxy client for Quiznect microservices.

All LLM calls route through api.mchatai.com compute-proxy for centralized
billing, key management, and model routing. No hardcoded API keys.
"""

import os
import json
import logging
import httpx

logger = logging.getLogger(__name__)

PROXY_BASE_URL = os.getenv("MCHATAI_PROXY_URL", "https://api.mchatai.com")
SERVICE_TOKEN = os.getenv("MCHATAI_SERVICE_TOKEN", "")


async def llm_chat(
    messages: list[dict],
    model: str = "gpt-4o-mini",
    job_id: str = "",
    json_mode: bool = True,
    max_tokens: int | None = None,
    timeout: float = 60.0,
) -> str:
    """Call LLM via compute-proxy and return the assistant's content string."""
    headers = {"Content-Type": "application/json"}
    if SERVICE_TOKEN:
        headers["Authorization"] = f"Bearer {SERVICE_TOKEN}"
    if job_id:
        headers["x-mchatai-job-id"] = job_id

    body: dict = {"model": model, "messages": messages}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    if max_tokens:
        body["max_tokens"] = max_tokens

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            f"{PROXY_BASE_URL}/v1/chat/completions",
            json=body,
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()


async def llm_chat_json(
    messages: list[dict],
    model: str = "gpt-4o-mini",
    job_id: str = "",
    max_tokens: int | None = None,
    timeout: float = 60.0,
) -> dict:
    """Call LLM via compute-proxy and return parsed JSON."""
    content = await llm_chat(
        messages, model=model, job_id=job_id,
        json_mode=True, max_tokens=max_tokens, timeout=timeout,
    )
    return json.loads(content)


async def tts_generate(
    text: str,
    voice: str = "alloy",
    model: str = "gpt-4o-mini-tts",
    job_id: str = "",
    timeout: float = 120.0,
) -> bytes:
    """Generate speech via compute-proxy TTS endpoint. Returns MP3 bytes."""
    headers = {"Content-Type": "application/json"}
    if SERVICE_TOKEN:
        headers["Authorization"] = f"Bearer {SERVICE_TOKEN}"
    if job_id:
        headers["x-mchatai-job-id"] = job_id

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            f"{PROXY_BASE_URL}/v1/audio/speech",
            json={"model": model, "voice": voice, "input": text},
            headers=headers,
        )
        resp.raise_for_status()
        return resp.content


async def image_generate(
    prompt: str,
    model: str = "dall-e-3",
    size: str = "1024x1024",
    job_id: str = "",
    timeout: float = 120.0,
) -> str:
    """Generate image via compute-proxy. Returns image URL."""
    headers = {"Content-Type": "application/json"}
    if SERVICE_TOKEN:
        headers["Authorization"] = f"Bearer {SERVICE_TOKEN}"
    if job_id:
        headers["x-mchatai-job-id"] = job_id

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            f"{PROXY_BASE_URL}/v1/images/generations",
            json={"model": model, "prompt": prompt, "size": size, "n": 1},
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["data"][0]["url"]
