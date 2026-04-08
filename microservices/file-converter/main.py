"""File Converter — mChatAI microservice for converting between data formats."""

import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ── Models ──

class JsonToYamlInput(BaseModel):
    json_string: str = Field(..., min_length=1)

class YamlOutput(BaseModel):
    yaml: str

class YamlToJsonInput(BaseModel):
    yaml_string: str = Field(..., min_length=1)

class JsonOutput(BaseModel):
    json: str

class DetectInput(BaseModel):
    content: str = Field(default="")
    filename: str = Field(default="")

class DetectOutput(BaseModel):
    format: str
    confidence: str


# ── Endpoints ──

@router.post("/json-to-yaml", response_model=YamlOutput)
async def json_to_yaml(body: JsonToYamlInput):
    try:
        import yaml
    except ImportError:
        raise HTTPException(status_code=503, detail="pyyaml not installed")

    try:
        data = json.loads(body.json_string)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")

    return YamlOutput(yaml=yaml.dump(data, default_flow_style=False, allow_unicode=True))


@router.post("/yaml-to-json", response_model=JsonOutput)
async def yaml_to_json(body: YamlToJsonInput):
    try:
        import yaml
    except ImportError:
        raise HTTPException(status_code=503, detail="pyyaml not installed")

    try:
        data = yaml.safe_load(body.yaml_string)
    except yaml.YAMLError as e:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {e}")

    return JsonOutput(json=json.dumps(data, indent=2, ensure_ascii=False))


@router.post("/detect", response_model=DetectOutput)
async def detect_format(body: DetectInput):
    # Extension-based detection
    ext_map = {
        ".json": "json", ".yaml": "yaml", ".yml": "yaml",
        ".toml": "toml", ".csv": "csv", ".tsv": "tsv",
        ".xml": "xml", ".html": "html", ".htm": "html",
        ".md": "markdown", ".txt": "text",
    }
    if body.filename:
        for ext, fmt in ext_map.items():
            if body.filename.lower().endswith(ext):
                return DetectOutput(format=fmt, confidence="high")

    # Content-based detection
    content = body.content.strip()
    if not content:
        return DetectOutput(format="unknown", confidence="low")

    if content.startswith("{") or content.startswith("["):
        try:
            json.loads(content)
            return DetectOutput(format="json", confidence="high")
        except json.JSONDecodeError:
            pass

    if content.startswith("<?xml") or content.startswith("<"):
        return DetectOutput(format="xml", confidence="medium")

    if "---" in content[:10]:
        return DetectOutput(format="yaml", confidence="medium")

    if "," in content.split("\n")[0] and len(content.split("\n")) > 1:
        return DetectOutput(format="csv", confidence="medium")

    if content.startswith("#") or "**" in content or "[" in content:
        return DetectOutput(format="markdown", confidence="low")

    return DetectOutput(format="text", confidence="low")
