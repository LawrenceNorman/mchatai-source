"""URL Inspector — mChatAI microservice for parsing, validating, and inspecting URLs."""

import time
from urllib.parse import urlparse, parse_qs

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Models ──

class URLInput(BaseModel):
    url: str = Field(..., min_length=1)

class ParseOutput(BaseModel):
    scheme: str
    host: str
    port: int | None
    path: str
    query: dict[str, list[str]]
    fragment: str

class CheckInput(BaseModel):
    url: str = Field(..., min_length=1)
    timeout: int = Field(default=5, ge=1, le=30)

class CheckOutput(BaseModel):
    reachable: bool
    status_code: int | None
    redirect_url: str | None
    response_time_ms: int

class HeadersOutput(BaseModel):
    headers: dict[str, str]


# ── Endpoints ──

@router.post("/parse", response_model=ParseOutput)
async def parse_url(body: URLInput):
    parsed = urlparse(body.url)
    return ParseOutput(
        scheme=parsed.scheme,
        host=parsed.hostname or "",
        port=parsed.port,
        path=parsed.path,
        query=parse_qs(parsed.query),
        fragment=parsed.fragment,
    )


@router.post("/check", response_model=CheckOutput)
async def check_url(body: CheckInput):
    try:
        import httpx
    except ImportError:
        raise HTTPException(status_code=503, detail="httpx not installed")

    start = time.time()
    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=body.timeout) as client:
            resp = await client.head(body.url)
            elapsed = int((time.time() - start) * 1000)
            redirect_url = str(resp.headers.get("location")) if resp.is_redirect else None
            return CheckOutput(
                reachable=True,
                status_code=resp.status_code,
                redirect_url=redirect_url,
                response_time_ms=elapsed,
            )
    except Exception:
        elapsed = int((time.time() - start) * 1000)
        return CheckOutput(reachable=False, status_code=None, redirect_url=None, response_time_ms=elapsed)


@router.post("/headers", response_model=HeadersOutput)
async def get_headers(body: URLInput):
    try:
        import httpx
    except ImportError:
        raise HTTPException(status_code=503, detail="httpx not installed")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
            resp = await client.head(body.url)
            headers = {k: v for k, v in resp.headers.items()}
            return HeadersOutput(headers=headers)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Request failed: {e}")
