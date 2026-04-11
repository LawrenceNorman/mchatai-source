"""qz-visual — Narration, visual choreography, image generation, and image search."""

import os
import json
import logging

from fastapi import APIRouter
from pydantic import BaseModel, Field

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "qz-shared"))
from llm_client import llm_chat, llm_chat_json, image_generate

router = APIRouter()
logger = logging.getLogger(__name__)

BING_SEARCH_KEY = os.getenv("BING_SEARCH_API_KEY", "")
BING_SEARCH_URL = "https://api.bing.microsoft.com/v7.0/images/search"


# ── Models ──

class NarrationInput(BaseModel):
    topic: str
    description: str = ""
    learning_content: str = ""
    subject: str = ""
    job_id: str = Field(default="")

class NarrationOutput(BaseModel):
    narration: str
    estimated_duration_seconds: int

class ChoreographyInput(BaseModel):
    narration: str
    topic: str = ""
    job_id: str = Field(default="")

class VisualElement(BaseModel):
    type: str  # emoji, table, text, ai_generated_image
    content: str
    start_time_offset: float = 0.0
    duration: float = 3.0
    position: str = "center"
    animation: str = "fade_in"

class ChoreographySegment(BaseModel):
    visuals: list[VisualElement]
    narration: str
    duration: float

class ChoreographyOutput(BaseModel):
    segments: list[dict]

class GenerateImageInput(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=1000)
    size: str = Field(default="1024x1024")
    job_id: str = Field(default="")

class GenerateImageOutput(BaseModel):
    url: str

class FetchImageInput(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)

class FetchImageOutput(BaseModel):
    url: str
    source: str = ""
    thumbnail_url: str = ""

class BatchImagesInput(BaseModel):
    prompts: list[str]
    size: str = Field(default="1024x1024")
    job_id: str = Field(default="")

class BatchImagesOutput(BaseModel):
    images: list[dict]
    count: int


# ── Endpoints ──

@router.post("/generate-narration", response_model=NarrationOutput)
async def generate_narration(body: NarrationInput):
    """Create a narration script for a learning item."""
    logger.info(f"Generating narration for topic: {body.topic}")

    prompt = f"""Write a clear, engaging narration script about '{body.topic}' in the context of '{body.subject}'.

Description: {body.description}
Key content: {body.learning_content[:2000] if body.learning_content else 'Cover the key concepts'}

The narration should:
- Be 100-300 words (suitable for 1-2 minutes of audio)
- Sound natural when read aloud
- Cover the most important points
- Be educational but accessible

Return only the narration text."""

    narration = await llm_chat(
        messages=[
            {"role": "system", "content": "You are a skilled educational narrator."},
            {"role": "user", "content": prompt},
        ],
        model="gpt-4o-mini",
        job_id=body.job_id,
        json_mode=False,
    )

    word_count = len(narration.split())
    est_duration = int(word_count / 150 * 60)

    return NarrationOutput(narration=narration, estimated_duration_seconds=est_duration)


@router.post("/create-choreography", response_model=ChoreographyOutput)
async def create_choreography(body: ChoreographyInput):
    """Generate visual sync JSON (emojis, tables, animations) for narration."""
    logger.info(f"Creating visual choreography for: {body.topic[:60]}")

    prompt = f"""Create a visual choreography to accompany this narration about '{body.topic}'.

Narration:
{body.narration[:3000]}

For each segment of the narration, create visual elements that reinforce the content.
Return JSON:
{{
    "segments": [
        {{
            "narration": "portion of narration text",
            "duration": 5.0,
            "visuals": [
                {{
                    "type": "emoji",
                    "content": "relevant emoji(s)",
                    "start_time_offset": 0.0,
                    "duration": 3.0,
                    "position": "center",
                    "animation": "fade_in"
                }}
            ]
        }}
    ]
}}

Visual types: emoji, table, text, ai_generated_image
Positions: top_left, top_center, top_right, center, bottom_left, bottom_center, bottom_right
Animations: fade_in, slide_in_left, slide_in_right, scale_up, bounce"""

    result = await llm_chat_json(
        messages=[
            {"role": "system", "content": "You are a visual designer creating synchronized visual elements for educational content."},
            {"role": "user", "content": prompt},
        ],
        model="gpt-4o-mini",
        job_id=body.job_id,
    )

    return ChoreographyOutput(segments=result.get("segments", []))


@router.post("/generate-image", response_model=GenerateImageOutput)
async def generate_image_endpoint(body: GenerateImageInput):
    """Generate an image via DALL-E through compute-proxy."""
    logger.info(f"Generating image: {body.prompt[:60]}")

    url = await image_generate(
        prompt=body.prompt,
        size=body.size,
        job_id=body.job_id,
    )

    return GenerateImageOutput(url=url)


@router.post("/fetch-image-url", response_model=FetchImageOutput)
async def fetch_image_url(body: FetchImageInput):
    """Search Bing Image Search for a relevant image."""
    logger.info(f"Searching image for: {body.query[:60]}")

    if not BING_SEARCH_KEY:
        return FetchImageOutput(url="", source="", thumbnail_url="")

    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            BING_SEARCH_URL,
            params={"q": body.query, "count": 1, "safeSearch": "Strict"},
            headers={"Ocp-Apim-Subscription-Key": BING_SEARCH_KEY},
            timeout=15.0,
        )

        if resp.status_code != 200:
            logger.warning(f"Bing search failed: {resp.status_code}")
            return FetchImageOutput(url="", source="", thumbnail_url="")

        data = resp.json()
        images = data.get("value", [])
        if not images:
            return FetchImageOutput(url="", source="", thumbnail_url="")

        img = images[0]
        return FetchImageOutput(
            url=img.get("contentUrl", ""),
            source=img.get("hostPageUrl", ""),
            thumbnail_url=img.get("thumbnailUrl", ""),
        )


@router.post("/batch-images", response_model=BatchImagesOutput)
async def batch_generate_images(body: BatchImagesInput):
    """Generate images for multiple prompts."""
    logger.info(f"Batch generating {len(body.prompts)} images")

    results = []
    for prompt in body.prompts:
        try:
            url = await image_generate(
                prompt=prompt,
                size=body.size,
                job_id=body.job_id,
            )
            results.append({"prompt": prompt, "url": url, "status": "ok"})
        except Exception as e:
            logger.warning(f"Image generation failed for prompt: {prompt[:40]}: {e}")
            results.append({"prompt": prompt, "url": "", "status": "error", "error": str(e)})

    return BatchImagesOutput(images=results, count=len(results))
