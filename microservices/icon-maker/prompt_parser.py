"""Freeform prompt → structured ComposeRequest params (deterministic v1).

The user types something like:
  "100pt 'M' Futura font in an icon centered with a circle material icon
   behind, the 'M' is white, dark red→black gradient background, 150pt
   recycle icon faded out behind the M"

We extract: bg color or gradient, symbol id (Material), text overlay,
font, sizes, style preset, etc. — and return a dict that is a valid
`ComposeRequest`.

Deterministic v1 — pure regex + keyword tables. No LLM call. Future
versions can swap the inner `parse_to_request()` for an LLM step that
returns the same dict shape; the rest of the pipeline doesn't change.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

# ── Color tables ──────────────────────────────────────────────────────────────

NAMED_COLORS: Dict[str, str] = {
    # CSS-ish basics
    "black": "#000000", "white": "#FFFFFF",
    "red": "#EF4444", "crimson": "#DC143C", "scarlet": "#FF2400",
    "orange": "#F97316", "amber": "#F59E0B",
    "yellow": "#EAB308", "gold": "#FFD700",
    "green": "#22C55E", "emerald": "#10B981", "lime": "#84CC16", "olive": "#808000",
    "teal": "#14B8A6", "cyan": "#06B6D4", "turquoise": "#40E0D0",
    "blue": "#3B82F6", "navy": "#1E3A8A", "indigo": "#6366F1", "azure": "#0EA5E9",
    "purple": "#A855F7", "violet": "#8B5CF6", "magenta": "#FF00FF",
    "pink": "#EC4899", "rose": "#F43F5E", "fuchsia": "#D946EF",
    "brown": "#92400E", "tan": "#D2B48C", "beige": "#F5F5DC",
    "grey": "#6B7280", "gray": "#6B7280", "silver": "#C0C0C0",
    "cream": "#FAF8F1", "ivory": "#FFFFF0",
    "charcoal": "#1F2937", "midnight": "#0F0F23", "obsidian": "#0B0B1A",
    # Vibe words (only ones that are unambiguously colors, not styles)
    "sunset": "#FF6B6B", "sunrise": "#F59E0B", "ocean": "#0EA5E9",
    "forest": "#14532D", "dark": "#1F2937", "light": "#F3F4F6",
    # NOTE: "neon", "electric", "cyber" are STYLE words, not colors —
    # they're handled in STYLE_KEYWORDS. Leaving them out here means a
    # phrase like "electric cyan glow on midnight" parses as
    # cyan(color) + midnight(color), not (neon-cyan + electric-cyan).
}

HEX_RE = re.compile(r"#?([0-9a-fA-F]{6})\b")
RGB_RE = re.compile(r"rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)", re.IGNORECASE)
GRAD_KEYWORDS = ("gradient", "fade", "fades", "fading", " to ", "→", "->", " - ")

# ── Style presets — reuse names from styles.py
STYLE_KEYWORDS: Dict[str, List[str]] = {
    "neon":       ["neon", "glow", "glowing", "fluorescent"],
    "3d":         ["3d", "three-d", "depth", "raised", "embossed"],
    "vintage":    ["vintage", "retro", "70s", "80s", "old-school", "film"],
    "glass":      ["glass", "frosted", "glassmorphic", "translucent"],
    "minimal":    ["minimal", "minimalist", "simple", "clean", "flat"],
    "gradient":   ["gradient", "vibrant", "colorful", "rainbow"],
    "pixel":      ["pixel", "8-bit", "8bit", "pixelated", "retro game"],
    "watercolor": ["watercolor", "painted", "artsy", "soft"],
    "sketch":     ["sketch", "hand-drawn", "pencil", "drawn"],
    "cyberpunk":  ["cyberpunk", "cyber", "synthwave", "vaporwave"],
    "clay":       ["clay", "claymation", "matte", "playful", "cartoon"],
    "flat":       ["flat", "no shadow", "no gradient"],
}

# ── Symbol keyword → Material Icons name (small high-signal map) ──────────────
SYMBOL_KEYWORDS: List[Tuple[str, str]] = [
    # AI / network / brain — these need to outrank generic "electric" matches
    ("synapse", "hub"), ("synaptic", "hub"),
    ("circuit", "memory"), ("neural", "psychology"), ("neuron", "psychology"),
    ("brain", "psychology"), ("mind", "psychology"),
    ("network", "hub"), ("graph", "hub"), ("nodes", "hub"),
    ("connection", "hub"), ("connect", "hub"),
    ("ai model", "psychology"), ("llm", "psychology"),
    ("mesh", "device_hub"), ("topology", "device_hub"),
    ("chip", "memory"), ("processor", "memory"), ("cpu", "memory"),
    ("recycle", "recycling"), ("recycling", "recycling"),
    ("flame", "whatshot"), ("fire", "local_fire_department"),
    ("star", "star"), ("heart", "favorite"), ("love", "favorite"),
    ("bolt", "bolt"), ("lightning", "bolt"),
    # NOTE: "electric" intentionally NOT mapped — it's a vibe word, not a glyph.
    # If the user wants a bolt they'll say "bolt" or "lightning".
    ("home", "home"), ("house", "home"),
    ("camera", "camera_alt"), ("photo", "image"),
    ("video", "videocam"), ("movie", "movie"), ("film", "movie"),
    ("music", "music_note"), ("audio", "music_note"), ("sound", "music_note"),
    ("mic", "mic"), ("microphone", "mic"),
    ("game", "sports_esports"), ("gamepad", "sports_esports"), ("controller", "sports_esports"),
    ("puzzle", "extension"),
    ("book", "menu_book"), ("read", "menu_book"),
    ("write", "edit"), ("edit", "edit"), ("note", "edit_note"),
    ("task", "check_circle"), ("todo", "check_circle"),
    ("calendar", "calendar_today"), ("date", "calendar_today"),
    ("timer", "timer"), ("clock", "schedule"), ("alarm", "alarm"),
    ("weather", "wb_sunny"), ("sun", "wb_sunny"), ("rain", "umbrella"),
    ("cloud", "cloud"),
    ("map", "map"), ("location", "location_on"), ("travel", "flight"),
    ("car", "directions_car"), ("bike", "directions_bike"),
    ("settings", "settings"), ("config", "settings"), ("gear", "settings"),
    ("search", "search"), ("magnify", "search"),
    ("shopping", "shopping_cart"), ("cart", "shopping_cart"), ("bag", "shopping_bag"),
    ("money", "payments"), ("finance", "attach_money"), ("budget", "attach_money"),
    ("workout", "fitness_center"), ("fitness", "fitness_center"), ("run", "directions_run"),
    ("food", "restaurant"), ("recipe", "restaurant_menu"),
    ("phone", "phone"), ("call", "phone"),
    ("chat", "chat_bubble"), ("message", "chat_bubble"), ("text", "chat_bubble"),
    ("mail", "email"), ("email", "email"), ("inbox", "inbox"),
    ("ai", "auto_awesome"), ("sparkle", "auto_awesome"), ("magic", "auto_fix_high"),
    ("terminal", "terminal"), ("code", "code"), ("dev", "code"),
    ("graph", "bar_chart"), ("chart", "show_chart"), ("data", "bar_chart"),
    ("lock", "lock"), ("key", "vpn_key"), ("shield", "shield"), ("security", "shield"),
    ("flag", "flag"), ("trophy", "emoji_events"), ("award", "emoji_events"),
    ("paint", "palette"), ("brush", "brush"), ("draw", "draw"), ("art", "palette"),
    ("circle", "circle"), ("square", "square"), ("triangle", "change_history"),
    ("eye", "visibility"),
    ("gift", "redeem"),
    ("leaf", "eco"), ("plant", "eco"), ("tree", "park"),
]

# ── Parsers ──────────────────────────────────────────────────────────────────


def _resolve_color(token: str) -> Optional[str]:
    """Return a #RRGGBB hex string from a color token (named or hex)."""
    t = token.strip().lower().rstrip(",.;:")
    if not t:
        return None
    # Hex first
    m = HEX_RE.fullmatch(t.lstrip("#"))
    if m:
        return f"#{m.group(1).upper()}"
    m = HEX_RE.search(t)
    if m and len(m.group(1)) == 6:
        return f"#{m.group(1).upper()}"
    # rgb(r,g,b)
    m = RGB_RE.fullmatch(t)
    if m:
        r, g, b = (max(0, min(255, int(x))) for x in m.groups())
        return f"#{r:02X}{g:02X}{b:02X}"
    # Named
    return NAMED_COLORS.get(t)


def _extract_colors(prompt: str) -> List[str]:
    """Find all colors in order of appearance — both named and hex."""
    found: List[Tuple[int, str]] = []
    lower = prompt.lower()
    # Named colors via word boundaries
    for name in NAMED_COLORS:
        for m in re.finditer(rf"\b{re.escape(name)}\b", lower):
            hex_ = NAMED_COLORS[name]
            found.append((m.start(), hex_))
    # Hex codes
    for m in HEX_RE.finditer(prompt):
        if len(m.group(1)) == 6:
            found.append((m.start(), f"#{m.group(1).upper()}"))
    found.sort()
    # Dedupe consecutive duplicates
    out: List[str] = []
    for _, c in found:
        if not out or out[-1] != c:
            out.append(c)
    return out


def _extract_gradient(prompt: str) -> Optional[Dict]:
    """If the prompt mentions a gradient OR has 'X to Y' color phrasing, return a GradientSpec dict."""
    lower = prompt.lower()
    has_gradient_word = any(k in lower for k in GRAD_KEYWORDS)
    colors = _extract_colors(prompt)
    if not has_gradient_word and len(colors) < 2:
        return None
    if len(colors) < 2:
        return None
    # Angle: look for "diagonal", "horizontal", "vertical", or explicit deg
    angle = -45.0
    if "horizontal" in lower:
        angle = 0.0
    elif "vertical" in lower:
        angle = -90.0
    elif "radial" in lower:
        # Pillow gradient is linear; closest approximation is a steep diagonal.
        angle = -45.0
    m = re.search(r"(-?\d{1,3})\s*(?:°|deg|degrees)", lower)
    if m:
        try:
            angle = float(m.group(1))
        except ValueError:
            pass
    return {"start": colors[0], "end": colors[1], "angle": angle}


def _extract_text_overlay(prompt: str) -> Optional[Dict]:
    """Detect quoted text or 'letter X' phrasing.

    Examples:
      "100pt 'M'"      → {text: "M", size: 100}
      'a "Pro" badge'  → {text: "Pro"}
      "letter A"       → {text: "A"}
    """
    text = None
    # Quoted strings — straight or curly quotes
    m = re.search(r"['\"\u2018\u201C]([A-Za-z0-9 +\-_.]{1,12})['\"\u2019\u201D]", prompt)
    if m:
        text = m.group(1).strip()
    if not text:
        m = re.search(r"\bletter\s+([A-Za-z])\b", prompt, re.IGNORECASE)
        if m:
            text = m.group(1).upper()
    if not text:
        return None

    overlay: Dict = {"text": text, "color": "#FFFFFF", "position": "below"}

    # Hero detection — words that mark the text as the centerpiece, not a label.
    is_hero = (
        len(text) <= 2
        or bool(re.search(r"\b(centerpiece|hero|big|huge|large|main|primary)\b", prompt, re.IGNORECASE))
        or bool(re.search(rf"['\"\u2018\u201C]{re.escape(text)}['\"\u2019\u201D]\s+(?:in the\s+)?center", prompt, re.IGNORECASE))
    )

    # Size: "100pt", "50 pt", "size 80"
    m = re.search(r"(\d{2,3})\s*(?:pt|px|point|points|size)", prompt, re.IGNORECASE)
    if m:
        overlay["size"] = float(m.group(1))
        if is_hero:
            overlay["position"] = "center"
    elif is_hero:
        overlay["size"] = 600.0   # big monogram — fills most of the canvas
        overlay["position"] = "center"
    else:
        overlay["size"] = 90.0
    overlay["_is_hero"] = is_hero  # consumed by parse_to_request to gate symbol selection

    # Font family: "Futura", "Helvetica", "Times" etc.
    for font in ("Futura", "Helvetica", "Arial", "Times", "Georgia", "Courier",
                 "Menlo", "Monaco", "SF Pro", "SF Mono", "Palatino", "Avenir",
                 "Optima", "Baskerville", "Didot", "Verdana", "Comic Sans"):
        if re.search(rf"\b{re.escape(font)}\b", prompt, re.IGNORECASE):
            overlay["font"] = font
            break

    # Text color override: "white text", "M is black", "in red"
    m = re.search(
        r"(?:text\s+is|letter\s+is|the\s+['\"\u2018\u201C].['\"\u2019\u201D]\s+is|"
        r"text\s+color|in)\s+(\w+)",
        prompt, re.IGNORECASE
    )
    if m:
        c = _resolve_color(m.group(1))
        if c:
            overlay["color"] = c

    return overlay


def _extract_symbol(prompt: str) -> Optional[str]:
    """First keyword hit wins. Returns a Material Icons name or None."""
    lower = prompt.lower()
    for keyword, material_name in SYMBOL_KEYWORDS:
        if re.search(rf"\b{re.escape(keyword)}\b", lower):
            return material_name
    return None


def _extract_style_preset(prompt: str) -> Optional[str]:
    lower = prompt.lower()
    for preset, keywords in STYLE_KEYWORDS.items():
        if any(k in lower for k in keywords):
            return preset
    return None


def _extract_shape(prompt: str) -> Optional[str]:
    lower = prompt.lower()
    if "circle icon" in lower or "circular" in lower or "round icon" in lower:
        return "circle"
    if "squircle" in lower or "ios style" in lower:
        return "squircle"
    return None


def _extract_corner_radius(prompt: str) -> Optional[float]:
    lower = prompt.lower()
    if "square corner" in lower or "no rounding" in lower or "sharp corner" in lower:
        return 0.0
    if "very rounded" in lower or "very round" in lower or "fully rounded" in lower:
        return 240.0
    if "slightly rounded" in lower:
        return 80.0
    return None


def _extract_symbol_color(prompt: str) -> Optional[str]:
    """Heuristic — 'symbol is X', 'glyph is X', 'icon is X'."""
    m = re.search(
        r"(?:symbol|glyph|icon)\s+(?:is|in)\s+(\w+)",
        prompt, re.IGNORECASE
    )
    if m:
        return _resolve_color(m.group(1))
    # "white M centered" — color before single-letter
    m = re.search(r"\b(\w+)\s+['\"\u2018\u201C].['\"\u2019\u201D]\b", prompt)
    if m:
        return _resolve_color(m.group(1))
    return None


def parse_to_request(prompt: str) -> Dict:
    """Top-level: turn freeform prompt into a ComposeRequest dict.

    Always returns SOMETHING valid (a request that will render). The fewer
    cues the prompt gives, the more we lean on defaults + a sane style preset.
    """
    request: Dict = {
        "symbol_set": "material",
        "sizes": [1024, 512, 256, 128, 64, 32, 16],
    }

    # Text overlay — extract first so we can decide whether to also add a symbol.
    overlay = _extract_text_overlay(prompt)
    text_is_hero = bool(overlay and overlay.pop("_is_hero", False))
    if overlay:
        request["text_overlay"] = overlay

    # Symbol — skip when the user wants a single letter as the centerpiece
    # (otherwise we'd render a competing glyph behind the hero monogram).
    symbol = _extract_symbol(prompt)
    if symbol and not text_is_hero:
        request["symbol_id"] = symbol
    elif text_is_hero:
        # Hero text: use the symbol decoration (if any) as a faded background
        # via the texture system. Style preset will still apply glow/etc to text.
        request["symbol_set"] = "none"

    # Symbol color
    sym_color = _extract_symbol_color(prompt)
    if sym_color:
        request["symbol_color"] = sym_color

    # Background — gradient takes precedence over solid
    gradient = _extract_gradient(prompt)
    if gradient:
        request["bg_gradient"] = gradient
    else:
        # First color found becomes background unless it was already used as text/symbol color
        colors = _extract_colors(prompt)
        if colors:
            # Skip the first color if it matches the text/symbol color (likely meant for that)
            bg = next(
                (c for c in colors if c != request.get("symbol_color")),
                colors[0],
            )
            request["bg_color"] = bg

    # Shape + corner radius
    shape = _extract_shape(prompt)
    if shape:
        request["shape"] = shape
    cr = _extract_corner_radius(prompt)
    if cr is not None:
        request["corner_radius"] = cr

    # Style preset — fallback to "gradient" if user gave 0 specific cues.
    preset = _extract_style_preset(prompt)
    if preset:
        request["style_preset"] = preset

    return request
