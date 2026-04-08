"""Markdown Renderer — mChatAI microservice for Markdown→HTML conversion and structure extraction."""

import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Models ──

class RenderInput(BaseModel):
    markdown: str = Field(..., min_length=1)
    extensions: list[str] = Field(default=["tables", "fenced_code"])

class RenderOutput(BaseModel):
    html: str

class TOCHeading(BaseModel):
    level: int
    text: str

class TOCInput(BaseModel):
    markdown: str = Field(..., min_length=1)

class TOCOutput(BaseModel):
    headings: list[TOCHeading]

class LinkItem(BaseModel):
    text: str
    url: str

class LinksInput(BaseModel):
    markdown: str = Field(..., min_length=1)

class LinksOutput(BaseModel):
    links: list[LinkItem]


# ── Endpoints ──

@router.post("/render", response_model=RenderOutput)
async def render_markdown(body: RenderInput):
    try:
        import markdown as md_lib
    except ImportError:
        raise HTTPException(status_code=503, detail="markdown package not installed")
    html = md_lib.markdown(body.markdown, extensions=body.extensions)
    return RenderOutput(html=html)


@router.post("/toc", response_model=TOCOutput)
async def extract_toc(body: TOCInput):
    headings = []
    for line in body.markdown.split("\n"):
        match = re.match(r'^(#{1,6})\s+(.+)$', line.strip())
        if match:
            level = len(match.group(1))
            text = match.group(2).strip()
            headings.append(TOCHeading(level=level, text=text))
    return TOCOutput(headings=headings)


@router.post("/links", response_model=LinksOutput)
async def extract_links(body: LinksInput):
    # Match [text](url) patterns
    pattern = r'\[([^\]]+)\]\(([^)]+)\)'
    matches = re.findall(pattern, body.markdown)
    links = [LinkItem(text=text, url=url) for text, url in matches]
    return LinksOutput(links=links)
