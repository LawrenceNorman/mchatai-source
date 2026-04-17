"""12 style preset bundles.

Each preset is a dict of ComposeRequest-field overrides applied ONLY when the
caller left those fields at their model defaults. Explicit request fields
always win — presets are starting points, not straightjackets.

Extension keys (glow, frosted, pixelate_symbol, chromatic_aberration,
symbol_emboss, symbol_soften, stroke, inset_shadow) land in request._extras
and are read by the compositor's post-pass filters.
"""

from __future__ import annotations

from typing import Dict, List


def _gradient(start: str, end: str, angle: float = -45.0) -> Dict:
    return {"start": start, "end": end, "angle": angle}


STYLE_PRESETS: Dict[str, Dict] = {
    "flat": {
        "bg_color": "#3B82F6",
        "bg_gradient": None,
        "symbol_color": "#FFFFFF",
        "bg_texture": "none",
        "corner_radius": 180.0,
    },
    "3d": {
        "bg_gradient": _gradient("#4F46E5", "#7C3AED", -60),
        "symbol_color": "#FFFFFF",
        "bg_texture": "none",
        "corner_radius": 180.0,
        "symbol_highlight": True,
        "shadow": {"blur": 40, "dy": 24, "alpha": 0.35},
    },
    "neon": {
        "bg_gradient": _gradient("#0B0B1A", "#1A0B2E", -45),
        "symbol_color": "#00FFD1",
        "bg_texture": "none",
        "corner_radius": 180.0,
        "glow": {"color": "#00FFD1", "blur": 60, "alpha": 0.9},
    },
    "vintage": {
        "bg_gradient": _gradient("#C8A878", "#8B5E3C", -30),
        "symbol_color": "#F5E6C8",
        "bg_texture": "noise",
        "texture_opacity": 0.25,
        "corner_radius": 120.0,
        "shadow": {"blur": 4, "dy": 2, "alpha": 0.2},
    },
    "glass": {
        "bg_gradient": _gradient("#8EC5FC", "#E0C3FC", -45),
        "symbol_color": "#FFFFFF",
        "bg_texture": "noise",
        "texture_opacity": 0.08,
        "corner_radius": 220.0,
        "frosted": True,
        "shadow": {"blur": 30, "dy": 10, "alpha": 0.2},
    },
    "minimal": {
        "bg_color": "#FFFFFF",
        "bg_gradient": None,
        "symbol_color": "#111827",
        "bg_texture": "none",
        "corner_radius": 160.0,
        "stroke": {"color": "#E5E7EB", "width": 2},
    },
    "gradient": {
        "bg_gradient": _gradient("#FF6B6B", "#4ECDC4", -45),
        "symbol_color": "#FFFFFF",
        "bg_texture": "none",
        "corner_radius": 200.0,
        "shadow": {"blur": 20, "dy": 8, "alpha": 0.25},
    },
    "pixel": {
        "bg_color": "#1F2937",
        "bg_gradient": None,
        "symbol_color": "#F59E0B",
        "bg_texture": "grid",
        "texture_opacity": 0.4,
        "corner_radius": 0.0,
        "pixelate_symbol": 8,
    },
    "watercolor": {
        "bg_gradient": _gradient("#FFE5EC", "#B8E0F6", -20),
        "symbol_color": "#6B46C1",
        "bg_texture": "noise",
        "texture_opacity": 0.3,
        "corner_radius": 180.0,
        "symbol_soften": 6,
        "shadow": {"blur": 12, "dy": 4, "alpha": 0.15},
    },
    "sketch": {
        "bg_color": "#FAF8F1",
        "bg_gradient": None,
        "symbol_color": "#1F1F1F",
        "bg_texture": "crosshatch",
        "texture_opacity": 0.35,
        "corner_radius": 140.0,
    },
    "cyberpunk": {
        "bg_gradient": _gradient("#0F0F23", "#FF006E", -60),
        "symbol_color": "#00F5FF",
        "bg_texture": "grid",
        "texture_opacity": 0.25,
        "corner_radius": 180.0,
        "glow": {"color": "#00F5FF", "blur": 50, "alpha": 0.8},
        "chromatic_aberration": 3,
    },
    "clay": {
        "bg_gradient": _gradient("#FFD6A5", "#FFADAD", -45),
        "symbol_color": "#8B4513",
        "bg_texture": "noise",
        "texture_opacity": 0.1,
        "corner_radius": 220.0,
        "symbol_emboss": True,
        "shadow": {"blur": 32, "dy": 20, "alpha": 0.3, "inset": True},
    },
}


def list_style_names() -> List[str]:
    return sorted(STYLE_PRESETS.keys())
