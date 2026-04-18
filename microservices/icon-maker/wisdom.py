"""Wisdom engine — loads wisdom.json and applies declarative rendering +
prompt-shaping rules.

Two entry points:
  - apply_prompt_shaping(parsed_dict) → mutates the parsed ComposeRequest-dict
    coming out of prompt_parser.parse_to_request BEFORE ComposeRequest
    validation. Handles category defaults, color-contrast nudges, etc.

  - apply_compositional(req) → returns a (maybe-adjusted) ComposeRequest-like
    AND a dict of extras to add. Called by main.compose() AFTER
    _apply_style_preset(), BEFORE the render. Handles auto-outline on pale bg,
    glow-on-dark, contrast-flip, etc.

Design principles:
  - Wisdom NEVER overrides values the caller set explicitly. We detect "caller
    set this" the same way style_preset does: compare against ComposeRequest
    model defaults.
  - All thresholds / colors live in wisdom.json — this file only contains the
    interpreter. New rules are content PRs.
  - Hot-reloadable: rules re-read from disk at each render if MTIME changed.
    Cheap in production (tens of microseconds), catches content updates
    without a process restart.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

WISDOM_PATH = Path(__file__).parent / "wisdom.json"

_wisdom_cache: Optional[Dict] = None
_wisdom_mtime: float = 0.0


def _load_wisdom() -> Dict:
    global _wisdom_cache, _wisdom_mtime
    try:
        mtime = WISDOM_PATH.stat().st_mtime
    except FileNotFoundError:
        return {"compositional": [], "prompt_shaping": []}
    if _wisdom_cache is None or mtime != _wisdom_mtime:
        _wisdom_cache = json.loads(WISDOM_PATH.read_text())
        _wisdom_mtime = mtime
    return _wisdom_cache


# ── Color helpers ────────────────────────────────────────────────────────────


def _hex_to_rgb(hex_str: str) -> Tuple[int, int, int]:
    s = hex_str.strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) >= 6:
        return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)
    return 0, 0, 0


def _rel_luminance(hex_str: str) -> float:
    """WCAG relative luminance, 0..1."""
    r, g, b = (v / 255.0 for v in _hex_to_rgb(hex_str))

    def linearize(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)


def _contrast_ratio(a_hex: str, b_hex: str) -> float:
    la = _rel_luminance(a_hex) + 0.05
    lb = _rel_luminance(b_hex) + 0.05
    return max(la, lb) / min(la, lb)


def _hsv(hex_str: str) -> Tuple[float, float, float]:
    r, g, b = (v / 255.0 for v in _hex_to_rgb(hex_str))
    mx = max(r, g, b)
    mn = min(r, g, b)
    d = mx - mn
    h = 0.0
    if d:
        if mx == r:
            h = ((g - b) / d) % 6
        elif mx == g:
            h = (b - r) / d + 2
        else:
            h = (r - g) / d + 4
    h *= 60
    s = 0.0 if mx == 0 else d / mx
    v = mx
    return h, s, v


def _is_saturated_bright(hex_str: str, sat_min: float = 0.7, val_min: float = 0.7) -> bool:
    _, s, v = _hsv(hex_str)
    return s >= sat_min and v >= val_min


def _bg_mean_luminance(req: Any) -> float:
    """Approximate mean luminance of the fill region (solid or gradient)."""
    grad = getattr(req, "bg_gradient", None)
    if grad:
        return (_rel_luminance(grad.start) + _rel_luminance(grad.end)) / 2.0
    solid = getattr(req, "bg_color", None) or "#3B82F6"
    return _rel_luminance(solid)


def _bg_colors(req: Any) -> List[str]:
    grad = getattr(req, "bg_gradient", None)
    if grad:
        return [grad.start, grad.end]
    return [getattr(req, "bg_color", None) or "#3B82F6"]


def _darken(hex_str: str, pct: float) -> str:
    r, g, b = _hex_to_rgb(hex_str)
    f = max(0.0, 1.0 - pct)
    return f"#{int(r * f):02X}{int(g * f):02X}{int(b * f):02X}"


# ── Prompt-shaping pass (operates on parsed dict) ───────────────────────────


def apply_prompt_shaping(parsed: Dict, prompt: str) -> Dict:
    """Mutate `parsed` (the ComposeRequest-shaped dict) per prompt_shaping rules.

    Called by prompt_parser.parse_to_request at the very end, before returning.
    """
    wisdom = _load_wisdom()
    rules = wisdom.get("prompt_shaping", [])
    lower = prompt.lower()

    for rule in rules:
        when = rule.get("when", {}) or {}
        apply = rule.get("apply", {}) or {}

        # ── Condition evaluation ────────────────────────────────────────────
        if "no_style_preset" in when and when["no_style_preset"]:
            if parsed.get("style_preset"):
                continue

        if "prompt_matches" in when:
            matches = when["prompt_matches"]
            if not any(re.search(rf"\b{re.escape(m)}\b", lower) for m in matches):
                continue

        grad = parsed.get("bg_gradient")
        if "gradient_delta_luminance_lt" in when:
            thresh = when["gradient_delta_luminance_lt"]
            if not grad:
                continue
            d = abs(_rel_luminance(grad["start"]) - _rel_luminance(grad["end"]))
            if d >= thresh:
                continue

        if "both_colors_saturated_and_bright" in when and when["both_colors_saturated_and_bright"]:
            if not grad:
                continue
            if not (_is_saturated_bright(grad["start"]) and _is_saturated_bright(grad["end"])):
                continue

        if "bg_gradient_mean_luminance_lt" in when:
            if not grad:
                continue
            mean = (_rel_luminance(grad["start"]) + _rel_luminance(grad["end"])) / 2.0
            if mean >= when["bg_gradient_mean_luminance_lt"]:
                continue

        if "symbol_color_matches_bg_approx" in when and when["symbol_color_matches_bg_approx"]:
            sym = parsed.get("symbol_color")
            if not sym:
                continue
            bg_samples = [grad["start"], grad["end"]] if grad else [parsed.get("bg_color", "#3B82F6")]
            if all(_contrast_ratio(sym, bg) >= 2.5 for bg in bg_samples):
                continue

        if "symbol_color_default" in when and when["symbol_color_default"]:
            if "symbol_color" in parsed:  # caller set it explicitly via prompt
                continue

        # ── Apply actions ───────────────────────────────────────────────────
        for key, value in apply.items():
            if key == "style_preset":
                parsed["style_preset"] = value
            elif key == "darken_second_color_by" and grad:
                grad["end"] = _darken(grad["end"], float(value))
            elif key == "swap_second_color" and grad:
                grad["end"] = value
            elif key == "symbol_color":
                parsed["symbol_color"] = value
            elif key == "symbol_color_fallback":
                bg_mean = (
                    (_rel_luminance(grad["start"]) + _rel_luminance(grad["end"])) / 2.0
                    if grad
                    else _rel_luminance(parsed.get("bg_color", "#3B82F6"))
                )
                parsed["symbol_color"] = "#FFFFFF" if bg_mean < 0.5 else "#111827"

    return parsed


# ── Compositional pass (operates on ComposeRequest instance) ────────────────


def apply_compositional(req: Any, defaults_model: Any) -> Any:
    """Return a (possibly patched) ComposeRequest with wisdom extras merged in.

    `req` must be a pydantic ComposeRequest (post _apply_style_preset). We treat
    a field as "unset" if it equals `defaults_model`'s value for that field —
    same rule the style-preset pass uses, so wisdom never fights an explicit
    caller choice.
    """
    wisdom = _load_wisdom()
    rules = wisdom.get("compositional", [])
    if not rules:
        return req

    bg_lum = _bg_mean_luminance(req)
    sym = getattr(req, "symbol_color", "#FFFFFF")
    primary_bg = _bg_colors(req)[0]
    contrast = _contrast_ratio(sym, primary_bg)
    extras = dict(getattr(req, "extras", None) or {})

    has_stroke = bool(extras.get("stroke"))
    has_shadow = bool(extras.get("shadow"))
    has_glow = bool(extras.get("glow"))
    symbol_is_bright = _rel_luminance(sym) > 0.6

    patches: Dict[str, Any] = {}

    for rule in rules:
        when = rule.get("when", {}) or {}
        apply = rule.get("apply", {}) or {}

        if "bg_luminance_gte" in when and bg_lum < when["bg_luminance_gte"]:
            continue
        if "bg_luminance_lte" in when and bg_lum > when["bg_luminance_lte"]:
            continue
        if "has_stroke" in when and has_stroke != when["has_stroke"]:
            continue
        if "has_shadow" in when and has_shadow != when["has_shadow"]:
            continue
        if "has_glow" in when and has_glow != when["has_glow"]:
            continue
        if "symbol_is_bright" in when and symbol_is_bright != when["symbol_is_bright"]:
            continue
        if "contrast_ratio_lt" in when and contrast >= when["contrast_ratio_lt"]:
            continue
        if "contrast_ratio_gte" in when and contrast < when["contrast_ratio_gte"]:
            continue

        # Apply
        for key, value in apply.items():
            if key == "extras.stroke" and not has_stroke:
                extras["stroke"] = value
                has_stroke = True
            elif key == "extras.shadow" and not has_shadow:
                extras["shadow"] = value
                has_shadow = True
            elif key == "extras.glow" and not has_glow:
                glow = dict(value)
                if glow.pop("follow_symbol_color", False):
                    glow["color"] = sym
                extras["glow"] = glow
                has_glow = True
            elif key == "flip_symbol_to_contrast":
                new_color = "#FFFFFF" if bg_lum < 0.5 else "#111827"
                if new_color != sym:
                    patches["symbol_color"] = new_color
                    sym = new_color
                    symbol_is_bright = _rel_luminance(sym) > 0.6
                    contrast = _contrast_ratio(sym, primary_bg)

    if not patches and extras == (getattr(req, "extras", None) or {}):
        return req
    patches["extras"] = extras
    dumped = req.model_dump()
    dumped.update(patches)
    return type(req).model_validate(dumped)
