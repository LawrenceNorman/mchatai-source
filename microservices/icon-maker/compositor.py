"""Pillow-based icon compositor.

Z-order (mirrors macOS IconMakerService.renderFromTemplate):
  1. Inset canvas
  2. Rounded-rect alpha mask (single clip source for all subsequent layers)
  3. Background fill (solid or linear gradient)
  4. Optional background image (clipped, opacity)
  5. Optional procedural texture
  6. Centered Material Icons glyph (tinted)
  7. Optional drop shadow (applied to glyph before text overlay)
  8. Optional text overlay
  9. Optional stroke on the background shape
"""

from __future__ import annotations

import base64
import io
import math
from pathlib import Path
from typing import Dict, Optional, Tuple

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

from textures import make_texture

RGBA = Tuple[int, int, int, int]


def parse_hex_color(hex_str: str) -> RGBA:
    """Parse '#RGB' / '#RRGGBB' / '#RRGGBBAA' into RGBA 0-255."""
    if not hex_str:
        raise ValueError("empty color string")
    s = hex_str.strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s) + "FF"
    elif len(s) == 6:
        s = s + "FF"
    elif len(s) == 8:
        pass
    else:
        raise ValueError(f"unsupported color format: {hex_str!r}")
    try:
        r = int(s[0:2], 16)
        g = int(s[2:4], 16)
        b = int(s[4:6], 16)
        a = int(s[6:8], 16)
    except ValueError as exc:
        raise ValueError(f"invalid hex color: {hex_str!r}") from exc
    return r, g, b, a


def build_shape_mask(canvas_size: int, shape: str, inset: int, corner_radius: float) -> Image.Image:
    """Return an L-mode mask (255 inside the shape, 0 outside)."""
    mask = Image.new("L", (canvas_size, canvas_size), 0)
    draw = ImageDraw.Draw(mask)
    box = (inset, inset, canvas_size - inset, canvas_size - inset)
    if shape == "circle":
        draw.ellipse(box, fill=255)
    elif shape == "squircle":
        # Pillow has no native squircle; approximate via very large corner radius.
        radius = min(box[2] - box[0], box[3] - box[1]) * 0.42
        draw.rounded_rectangle(box, radius=radius, fill=255)
    else:  # rounded_rect
        radius = max(0.0, min(corner_radius, (box[2] - box[0]) / 2.0))
        draw.rounded_rectangle(box, radius=radius, fill=255)
    return mask


def _fill_solid(canvas_size: int, color: RGBA) -> Image.Image:
    return Image.new("RGBA", (canvas_size, canvas_size), color)


def _fill_gradient(canvas_size: int, start: RGBA, end: RGBA, angle_deg: float) -> Image.Image:
    """Linear gradient across the canvas along `angle_deg`.

    Build a 1xN horizontal strip, rotate by angle, and crop to size. For small
    canvases this is plenty fast; for 1024 we only do it once per render.
    """
    # Over-sample length so rotated strip covers the canvas diagonal.
    length = int(canvas_size * 1.5)
    strip = Image.new("RGBA", (length, 1), start)
    px = strip.load()
    for x in range(length):
        t = x / max(1, length - 1)
        r = int(start[0] + (end[0] - start[0]) * t)
        g = int(start[1] + (end[1] - start[1]) * t)
        b = int(start[2] + (end[2] - start[2]) * t)
        a = int(start[3] + (end[3] - start[3]) * t)
        px[x, 0] = (r, g, b, a)
    # Expand strip vertically to cover canvas, then rotate.
    strip = strip.resize((length, length), Image.NEAREST)
    rotated = strip.rotate(angle_deg, resample=Image.BICUBIC, expand=True)
    # Center-crop back to canvas
    rx, ry = rotated.size
    left = (rx - canvas_size) // 2
    top = (ry - canvas_size) // 2
    cropped = rotated.crop((left, top, left + canvas_size, top + canvas_size))
    return cropped


def _apply_texture(canvas: Image.Image, mask: Image.Image, texture_name: str, opacity: float, seed: int) -> Image.Image:
    if texture_name == "none" or opacity <= 0:
        return canvas
    tex = make_texture(texture_name, size=canvas.size[0], seed=seed)
    # Tint texture black and composite with `opacity` through the shape mask.
    tinted = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    tinted.putalpha(ImageOps.invert(tex))  # where tex is bright, alpha stays low (we want the tile visible)
    # Blend as darkening overlay at `opacity`
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, int(255 * opacity)))
    overlay_mask = Image.eval(tex, lambda v: int(v * opacity))
    canvas.paste(overlay, mask=overlay_mask)
    # Re-apply shape mask to keep texture within the shape.
    canvas.putalpha(ImageChops_multiply_alpha(canvas.getchannel("A"), mask))
    return canvas


def ImageChops_multiply_alpha(a: Image.Image, b: Image.Image) -> Image.Image:
    """Multiply two L-mode masks (0-255 * 0-255 / 255)."""
    from PIL import ImageChops
    return ImageChops.multiply(a, b)


def _render_symbol(
    canvas: Image.Image,
    display_text: str,
    color: RGBA,
    size_px: float,
    font_path: Path,
) -> None:
    """Draw a Material Icons Round ligature centered on the canvas."""
    if not font_path or not font_path.exists():
        # Graceful degradation — no font, no glyph. Compositor logs a warning via caller.
        return
    font = ImageFont.truetype(str(font_path), size=max(8, int(size_px)))
    draw = ImageDraw.Draw(canvas)
    cx, cy = canvas.size[0] / 2, canvas.size[1] / 2
    draw.text((cx, cy), display_text, font=font, fill=color, anchor="mm")


def _render_symbol_with_shadow(
    canvas: Image.Image,
    display_text: str,
    color: RGBA,
    size_px: float,
    font_path: Path,
    shadow: Optional[Dict],
) -> None:
    """Render glyph onto a transparent layer; optionally draw shadow underneath."""
    if not display_text:
        return
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    _render_symbol(layer, display_text, color, size_px, font_path)

    if shadow:
        shadow_color = (0, 0, 0, int(255 * float(shadow.get("alpha", 0.3))))
        blur = float(shadow.get("blur", 24))
        dy = float(shadow.get("dy", 12))
        # Extract alpha from glyph layer; that's the shadow shape.
        alpha = layer.getchannel("A")
        shadow_layer = Image.new("RGBA", canvas.size, shadow_color)
        shadow_layer.putalpha(alpha)
        shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=blur))
        shadow_layer = shadow_layer.transform(
            canvas.size, Image.AFFINE, (1, 0, 0, 0, 1, -dy), resample=Image.BILINEAR
        )
        canvas.alpha_composite(shadow_layer)

    canvas.alpha_composite(layer)


def _render_text_overlay(
    canvas: Image.Image,
    overlay: "TextOverlayLike",
    symbol_present: bool,
) -> None:
    """Draw text overlay. `overlay` is a Pydantic TextOverlay (duck-typed)."""
    if not overlay or not overlay.text:
        return
    canvas_size = canvas.size[0]
    size_px = max(8, int(overlay.size * canvas_size / 1024))  # scale if canvas != 1024
    # Font lookup: explicit path first, then family name via system, then DejaVu.
    font = _load_font(overlay.font, size_px)
    color = parse_hex_color(overlay.color)

    draw = ImageDraw.Draw(canvas)
    # Measure
    bbox = draw.textbbox((0, 0), overlay.text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cx = canvas_size / 2

    if overlay.position == "center" or not symbol_present:
        cy = canvas_size / 2
    elif overlay.position == "above":
        cy = canvas_size * 0.16
    else:  # below (default)
        cy = canvas_size - (canvas_size * 0.10) - th / 2

    # Optional pill behind text
    if overlay.bg_color:
        pad_x = int(size_px * 0.4)
        pad_y = int(size_px * 0.2)
        pill = (
            int(cx - tw / 2 - pad_x),
            int(cy - th / 2 - pad_y),
            int(cx + tw / 2 + pad_x),
            int(cy + th / 2 + pad_y),
        )
        pill_color = parse_hex_color(overlay.bg_color)
        radius = float(getattr(overlay, "bg_corner_radius", 12.0) * canvas_size / 1024)
        draw.rounded_rectangle(pill, radius=radius, fill=pill_color)

    draw.text((cx, cy), overlay.text, font=font, fill=color, anchor="mm")


def _load_font(font_name: Optional[str], size_px: int) -> ImageFont.FreeTypeFont:
    """Find a usable TrueType font. Graceful cascade: explicit path → system family → DejaVu → default."""
    candidates = []
    if font_name:
        candidates.append(font_name)
        # Also try common macOS system paths for family names.
        for ext in (".ttc", ".otf", ".ttf"):
            candidates.append(f"/Library/Fonts/{font_name}{ext}")
            candidates.append(f"/System/Library/Fonts/{font_name}{ext}")
            candidates.append(f"/System/Library/Fonts/Supplemental/{font_name}{ext}")
    # DejaVu ships with Pillow on many distros; last resort is default bitmap.
    candidates.extend(
        [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
            "/System/Library/Fonts/SFNS.ttf",
        ]
    )
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size_px)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def _apply_stroke(canvas: Image.Image, mask: Image.Image, stroke: Dict) -> None:
    """Draw a stroke along the edge of the shape mask."""
    if not stroke:
        return
    width = max(1, int(stroke.get("width", 2)))
    color = parse_hex_color(stroke.get("color", "#E5E7EB"))
    # Edge = mask - erode(mask, width) approximation
    eroded = mask.filter(ImageFilter.MinFilter(size=max(3, width * 2 + 1)))
    edge = Image.eval(Image.new("L", mask.size), lambda v: 0)
    from PIL import ImageChops
    edge = ImageChops.subtract(mask, eroded)
    stroke_layer = Image.new("RGBA", canvas.size, color)
    stroke_layer.putalpha(edge)
    canvas.alpha_composite(stroke_layer)


def _decode_bg_image(b64: str) -> Image.Image:
    try:
        data = base64.b64decode(b64)
    except Exception as exc:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail={"code": "bg_image_b64_invalid", "message": f"base64 decode failed: {exc}"},
        )
    try:
        img = Image.open(io.BytesIO(data)).convert("RGBA")
    except Exception as exc:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=415,
            detail={"code": "bg_image_unsupported_format", "message": f"PIL could not open image: {exc}"},
        )
    return img


# ── Public API ───────────────────────────────────────────────────────────────

# Structural-typed alias so compositor doesn't need to import from main (avoids cycles)
class TextOverlayLike:  # pragma: no cover - structural type only
    text: str
    font: Optional[str]
    size: float
    color: str
    position: str
    bg_color: Optional[str]
    bg_corner_radius: float


def compose_icon(req, symbol, material_font_path: Optional[Path], seed: int) -> Image.Image:
    """Render the 1024px master. `req` is a ComposeRequest-like; `symbol` is ResolvedSymbol or None."""
    canvas_size = 1024
    return _render(
        canvas_size=canvas_size,
        req=req,
        symbol=symbol,
        material_font_path=material_font_path,
        seed=seed,
    )


def render_at_native_size(req, symbol, material_font_path: Optional[Path], seed: int, target_size: int) -> Image.Image:
    """Re-render at `target_size` natively (avoids blur for <32px favicons)."""
    return _render(
        canvas_size=target_size,
        req=req,
        symbol=symbol,
        material_font_path=material_font_path,
        seed=seed,
    )


def downsample(img_1024: Image.Image, target_size: int) -> Image.Image:
    if img_1024.size[0] == target_size:
        return img_1024
    return img_1024.resize((target_size, target_size), Image.LANCZOS)


def _scale(val: float, canvas_size: int) -> float:
    return val * canvas_size / 1024.0


def _render(canvas_size: int, req, symbol, material_font_path: Optional[Path], seed: int) -> Image.Image:
    inset = int(_scale(req.inset, canvas_size))
    corner_radius = _scale(req.corner_radius, canvas_size)

    # 1. Transparent canvas + shape mask
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    mask = build_shape_mask(canvas_size, req.shape, inset, corner_radius)

    # 2. Background fill
    if req.bg_gradient:
        start = parse_hex_color(req.bg_gradient.start)
        end = parse_hex_color(req.bg_gradient.end)
        fill = _fill_gradient(canvas_size, start, end, req.bg_gradient.angle)
    else:
        bg_hex = req.bg_color or "#3B82F6"
        fill = _fill_solid(canvas_size, parse_hex_color(bg_hex))

    canvas = Image.composite(fill, canvas, mask)

    # 3. Optional background image (overlay, clipped by mask, with opacity)
    if req.bg_image_b64:
        bg_img = _decode_bg_image(req.bg_image_b64).resize((canvas_size, canvas_size), Image.LANCZOS)
        bg_alpha = bg_img.getchannel("A").point(lambda v: int(v * max(0.0, min(1.0, req.bg_image_opacity))))
        bg_img.putalpha(bg_alpha)
        clipped = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        clipped.paste(bg_img, (0, 0), mask)
        canvas = Image.alpha_composite(canvas, clipped)

    # 4. Optional texture
    if req.bg_texture != "none" and req.texture_opacity > 0:
        tex = make_texture(req.bg_texture, size=canvas_size, seed=seed)
        # Darken: apply texture as alpha of a black overlay, clipped to shape.
        dark = Image.new("RGBA", canvas.size, (0, 0, 0, 255))
        scaled_tex = tex.point(lambda v: int(v * req.texture_opacity))
        # Clip via shape mask (multiply alpha)
        from PIL import ImageChops
        clipped_alpha = ImageChops.multiply(scaled_tex, mask)
        dark.putalpha(clipped_alpha)
        canvas = Image.alpha_composite(canvas, dark)

    # 5. Symbol (with optional shadow)
    extras = getattr(req, "extras", None) or {}
    if not isinstance(extras, dict):
        extras = {}
    shadow = extras.get("shadow")
    if symbol and material_font_path:
        symbol_color = parse_hex_color(req.symbol_color)
        _render_symbol_with_shadow(
            canvas=canvas,
            display_text=symbol.display_text,
            color=symbol_color,
            size_px=_scale(req.symbol_size, canvas_size),
            font_path=material_font_path,
            shadow=shadow,
        )

    # 6. Optional glow (from style preset)
    glow = extras.get("glow") if isinstance(extras, dict) else None
    if glow and symbol and material_font_path:
        glow_color_rgba = parse_hex_color(glow.get("color", req.symbol_color))
        glow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        _render_symbol(glow_layer, symbol.display_text, glow_color_rgba, _scale(req.symbol_size, canvas_size), material_font_path)
        glow_alpha = glow_layer.getchannel("A").point(lambda v: int(v * float(glow.get("alpha", 0.7))))
        glow_layer.putalpha(glow_alpha)
        glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=float(glow.get("blur", 40))))
        canvas = Image.alpha_composite(glow_layer, canvas)

    # 7. Text overlay
    if req.text_overlay:
        _render_text_overlay(canvas, req.text_overlay, symbol_present=symbol is not None)

    # 8. Optional stroke
    stroke = extras.get("stroke") if isinstance(extras, dict) else None
    if stroke:
        _apply_stroke(canvas, mask, stroke)

    return canvas
