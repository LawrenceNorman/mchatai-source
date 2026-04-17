"""Icon Maker — headless icon composition microservice for mChatAI.

Mounts at `/svc/icon-maker/*` inside the mChatAIShell FastAPI sidecar. See
MICROSERVICE.md for the design contract and CONTEXT.md for extension guidance.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import re
from pathlib import Path
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from compositor import compose_icon, downsample, render_at_native_size
from packaging import build_icns, build_appiconset_zip
from styles import STYLE_PRESETS, list_style_names
from symbols import MaterialSymbolCatalog, resolve_symbol
from textures import list_texture_names

router = APIRouter()

ASSETS_DIR = Path(__file__).parent / "assets"
MATERIAL_FONT_PATH = ASSETS_DIR / "MaterialIconsRound.otf"
MATERIAL_CATALOG_PATH = ASSETS_DIR / "material_icons_catalog.json"
SF_HINTS_PATH = ASSETS_DIR / "sf_symbol_hints.json"

_catalog: Optional[MaterialSymbolCatalog] = None


def _get_catalog() -> MaterialSymbolCatalog:
    global _catalog
    if _catalog is None:
        _catalog = MaterialSymbolCatalog.load(MATERIAL_CATALOG_PATH, SF_HINTS_PATH)
    return _catalog


# ── Models ───────────────────────────────────────────────────────────────────

HexColor = str  # "#RRGGBB" or "#RRGGBBAA" validated at composition time


class GradientSpec(BaseModel):
    start: HexColor
    end: HexColor
    angle: float = -45.0  # degrees; matches IconMakerService default


class TextOverlay(BaseModel):
    text: str
    font: Optional[str] = None  # family name (system lookup) or relative asset path
    size: float = 64.0
    color: HexColor = "#FFFFFF"
    weight: Literal["regular", "medium", "semibold", "bold", "black"] = "bold"
    position: Literal["center", "below", "above"] = "below"
    bg_color: Optional[HexColor] = None
    bg_corner_radius: float = 12.0


SymbolSet = Literal["material", "sf", "none"]
BgTexture = Literal["none", "noise", "dots", "grid", "stripes", "crosshatch", "waves"]
Shape = Literal["rounded_rect", "circle", "squircle"]
BundleKind = Literal["none", "icns", "appiconset", "all"]
OutputMode = Literal["base64", "workspace"]


class ComposeRequest(BaseModel):
    symbol_id: Optional[str] = None
    symbol_set: SymbolSet = "material"
    symbol_color: HexColor = "#FFFFFF"
    symbol_size: float = 520.0  # in 1024 canvas units
    bg_color: Optional[HexColor] = None
    bg_gradient: Optional[GradientSpec] = None
    bg_image_b64: Optional[str] = None
    bg_image_opacity: float = 1.0
    bg_texture: BgTexture = "none"
    texture_opacity: float = 0.15
    shape: Shape = "rounded_rect"
    corner_radius: float = 180.0  # in 1024 canvas units
    inset: float = 20.0
    text_overlay: Optional[TextOverlay] = None
    style_preset: Optional[str] = None
    sizes: List[int] = Field(default_factory=lambda: [1024, 512, 256, 128, 64, 32, 16])
    bundle: BundleKind = "none"
    output: OutputMode = "base64"
    workspace_path: Optional[str] = None
    seed: Optional[int] = None  # reproducibility for texture generators
    # Extension keys from style presets (glow, frosted, shadow, stroke, etc.).
    # Callers can also populate this directly to override per-request.
    extras: Dict = Field(default_factory=dict)


class ComposeResponse(BaseModel):
    pngs: Dict[str, str] = Field(default_factory=dict)
    files: Dict[str, str] = Field(default_factory=dict)
    bundle_b64: Optional[str] = None
    bundle_path: Optional[str] = None
    meta: Dict = Field(default_factory=dict)


class PreviewRequest(ComposeRequest):
    preview_size: int = 1024


class PreviewResponse(BaseModel):
    png_b64: str
    width: int
    height: int
    meta: Dict = Field(default_factory=dict)


# ── Request normalization ────────────────────────────────────────────────────

def _apply_style_preset(req: ComposeRequest) -> ComposeRequest:
    """Merge preset defaults where the request left fields at their defaults.

    Rule (per plan): explicit request fields ALWAYS win over preset defaults.
    We detect 'unset' by comparing to the pydantic model default.
    """
    if not req.style_preset:
        return req
    preset = STYLE_PRESETS.get(req.style_preset)
    if preset is None:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "style_preset_unknown",
                "message": f"Unknown style_preset '{req.style_preset}'",
                "hint": f"Known presets: {list_style_names()}",
            },
        )

    defaults = ComposeRequest()
    patch = req.model_dump()
    extras = dict(patch.get("extras") or {})
    for key, preset_value in preset.items():
        if hasattr(defaults, key) and key != "extras":
            if getattr(req, key) == getattr(defaults, key):
                patch[key] = preset_value
        else:
            # Extension keys (glow, frosted, shadow, stroke, etc.) — the
            # compositor reads these via req.extras. Caller-supplied extras
            # win over preset extras on conflict.
            if key not in extras:
                extras[key] = preset_value
    patch["extras"] = extras
    return ComposeRequest.model_validate(patch)


def _canonical_seed(req: ComposeRequest) -> int:
    if req.seed is not None:
        return int(req.seed) & 0x7FFFFFFF
    canonical = json.dumps(req.model_dump(exclude={"seed"}), sort_keys=True, default=str)
    digest = hashlib.sha256(canonical.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") & 0x7FFFFFFF


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/compose", response_model=ComposeResponse)
async def compose(req: ComposeRequest) -> ComposeResponse:
    normalized = _apply_style_preset(req)
    _validate_sizes(normalized.sizes)
    _validate_workspace(normalized)

    resolved = resolve_symbol(normalized.symbol_id, normalized.symbol_set, _get_catalog())

    seed = _canonical_seed(normalized)

    # Render canonical 1024 canvas once; derive larger sizes by supersampling
    # on demand and smaller sizes by Lanczos downsample or native re-render.
    master = compose_icon(
        req=normalized,
        symbol=resolved,
        material_font_path=MATERIAL_FONT_PATH if resolved and resolved.set == "material" else None,
        seed=seed,
    )

    pngs: Dict[str, str] = {}
    files: Dict[str, str] = {}
    workspace_root = Path(normalized.workspace_path).expanduser() if normalized.workspace_path else None

    for size in sorted(set(int(s) for s in normalized.sizes), reverse=True):
        if size < 32:
            # Render from scratch at native size — downsampling blurs <32px glyphs.
            img = render_at_native_size(
                req=normalized,
                symbol=resolved,
                material_font_path=MATERIAL_FONT_PATH if resolved and resolved.set == "material" else None,
                seed=seed,
                target_size=size,
            )
        elif size == 1024:
            img = master
        else:
            img = downsample(master, size)

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        data = buf.getvalue()

        if normalized.output == "base64":
            pngs[str(size)] = base64.b64encode(data).decode("ascii")
        else:
            assert workspace_root is not None
            out_path = workspace_root / f"icon_{size}.png"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(data)
            files[str(size)] = str(out_path)

    # Optional bundle
    bundle_b64: Optional[str] = None
    bundle_path: Optional[str] = None
    if normalized.bundle in ("icns", "all"):
        icns_bytes = build_icns({int(s): _png_bytes_for(s, pngs, files) for s in normalized.sizes})
        if normalized.output == "base64":
            bundle_b64 = base64.b64encode(icns_bytes).decode("ascii")
        else:
            assert workspace_root is not None
            out = workspace_root / "AppIcon.icns"
            out.write_bytes(icns_bytes)
            bundle_path = str(out)
    if normalized.bundle in ("appiconset", "all"):
        zip_bytes = build_appiconset_zip({int(s): _png_bytes_for(s, pngs, files) for s in normalized.sizes})
        if normalized.output == "base64":
            bundle_b64 = base64.b64encode(zip_bytes).decode("ascii")
        else:
            assert workspace_root is not None
            out = workspace_root / "AppIcon.appiconset.zip"
            out.write_bytes(zip_bytes)
            bundle_path = str(out)

    return ComposeResponse(
        pngs=pngs,
        files=files,
        bundle_b64=bundle_b64,
        bundle_path=bundle_path,
        meta={
            "symbol_resolved": resolved.dict() if resolved else None,
            "style_preset_applied": normalized.style_preset,
            "seed": seed,
            "sizes": sorted(set(int(s) for s in normalized.sizes)),
            "warnings": [],
        },
    )


def _png_bytes_for(size: int, pngs: Dict[str, str], files: Dict[str, str]) -> bytes:
    key = str(size)
    if key in pngs:
        return base64.b64decode(pngs[key])
    if key in files:
        return Path(files[key]).read_bytes()
    raise HTTPException(status_code=500, detail={"code": "missing_size_for_bundle", "message": f"size {size} missing"})


@router.post("/preview", response_model=PreviewResponse)
async def preview(req: PreviewRequest) -> PreviewResponse:
    compose_req = ComposeRequest.model_validate(req.model_dump(exclude={"preview_size"}))
    normalized = _apply_style_preset(compose_req)
    resolved = resolve_symbol(normalized.symbol_id, normalized.symbol_set, _get_catalog())
    seed = _canonical_seed(normalized)

    if req.preview_size >= 128:
        master = compose_icon(
            req=normalized,
            symbol=resolved,
            material_font_path=MATERIAL_FONT_PATH if resolved and resolved.set == "material" else None,
            seed=seed,
        )
        img = master if req.preview_size == 1024 else downsample(master, req.preview_size)
    else:
        img = render_at_native_size(
            req=normalized,
            symbol=resolved,
            material_font_path=MATERIAL_FONT_PATH if resolved and resolved.set == "material" else None,
            seed=seed,
            target_size=req.preview_size,
        )

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return PreviewResponse(
        png_b64=base64.b64encode(buf.getvalue()).decode("ascii"),
        width=img.width,
        height=img.height,
        meta={"symbol_resolved": resolved.dict() if resolved else None, "seed": seed},
    )


@router.get("/info")
async def info() -> Dict:
    catalog = _get_catalog()
    return {
        "version": "1.0.0",
        "styles": list_style_names(),
        "textures": list_texture_names(),
        "symbol_sets": ["material", "sf", "none"],
        "material_font_loaded": MATERIAL_FONT_PATH.exists(),
        "material_catalog_count": catalog.count,
        "sf_hints_loaded": SF_HINTS_PATH.exists(),
        "supported_sizes": {"min": 8, "max": 2048, "recommended_bundle": [16, 32, 64, 128, 256, 512, 1024]},
    }


@router.get("/symbols/material/categories")
async def material_categories() -> Dict:
    catalog = _get_catalog()
    return {"categories": catalog.categories_with_counts()}


@router.get("/symbols/material/search")
async def material_search(q: str = Query(..., min_length=1, max_length=64), limit: int = Query(50, ge=1, le=500)) -> Dict:
    catalog = _get_catalog()
    results = catalog.search(q, limit=limit)
    return {"query": q, "count": len(results), "results": results}


@router.get("/symbols/material/{icon_id}")
async def material_icon(icon_id: str) -> Dict:
    catalog = _get_catalog()
    icon = catalog.get(icon_id)
    if icon is None:
        suggestions = [s["name"] for s in catalog.search(icon_id, limit=5)]
        raise HTTPException(
            status_code=404,
            detail={
                "code": "symbol_not_found",
                "message": f"Material icon '{icon_id}' not found",
                "suggestions": suggestions,
            },
        )
    return icon


@router.get("/healthz")
async def healthz() -> Dict:
    return {"status": "ok", "service": "icon-maker", "version": "1.0.0"}


# ── Validation helpers ───────────────────────────────────────────────────────

_SIZE_MIN = 8
_SIZE_MAX = 2048


def _validate_sizes(sizes: List[int]) -> None:
    if not sizes:
        raise HTTPException(
            status_code=400,
            detail={"code": "size_out_of_range", "message": "sizes must contain at least one value"},
        )
    for size in sizes:
        if not isinstance(size, int) or size < _SIZE_MIN or size > _SIZE_MAX:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "size_out_of_range",
                    "message": f"size {size} outside [{_SIZE_MIN}, {_SIZE_MAX}]",
                },
            )


def _validate_workspace(req: ComposeRequest) -> None:
    if req.output == "workspace" and not req.workspace_path:
        raise HTTPException(
            status_code=400,
            detail={"code": "workspace_path_required", "message": "output=workspace requires workspace_path"},
        )
    if req.workspace_path:
        expanded = Path(req.workspace_path).expanduser()
        if ".." in expanded.parts:
            raise HTTPException(
                status_code=403,
                detail={"code": "workspace_path_forbidden", "message": "workspace_path must not contain '..'"},
            )
