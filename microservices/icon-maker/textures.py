"""Six procedural textures returned as L-mode grayscale 1024px tiles.

Each function takes a size + seed and returns a PIL.Image in mode 'L'
(0=transparent, 255=opaque). Callers composite via ImageOps.multiply or
Image.composite with the desired opacity.
"""

from __future__ import annotations

import math
from typing import Callable, Dict, List

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def _blank(size: int) -> Image.Image:
    return Image.new("L", (size, size), 0)


def noise_tile(size: int = 1024, seed: int = 0) -> Image.Image:
    rng = np.random.default_rng(seed)
    arr = rng.integers(0, 255, (size, size), dtype=np.uint8)
    img = Image.fromarray(arr, mode="L")
    return img.filter(ImageFilter.GaussianBlur(radius=1))


def dots_tile(size: int = 1024, seed: int = 0) -> Image.Image:
    img = _blank(size)
    draw = ImageDraw.Draw(img)
    spacing = max(16, size // 32)
    radius = max(3, size // 170)
    for y in range(spacing // 2, size, spacing):
        for x in range(spacing // 2, size, spacing):
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=255)
    return img


def grid_tile(size: int = 1024, seed: int = 0) -> Image.Image:
    img = _blank(size)
    draw = ImageDraw.Draw(img)
    spacing = max(16, size // 32)
    width = max(1, size // 1024)
    for v in range(0, size + 1, spacing):
        draw.line([(v, 0), (v, size)], fill=255, width=width)
        draw.line([(0, v), (size, v)], fill=255, width=width)
    return img


def stripes_tile(size: int = 1024, seed: int = 0) -> Image.Image:
    img = _blank(size)
    draw = ImageDraw.Draw(img)
    spacing = max(16, size // 42)
    width = max(1, size // 680)
    for i in range(-size, 2 * size, spacing):
        draw.line([(i, 0), (i + size, size)], fill=255, width=width)
    return img


def crosshatch_tile(size: int = 1024, seed: int = 0) -> Image.Image:
    img = stripes_tile(size, seed)
    rev = _blank(size)
    draw = ImageDraw.Draw(rev)
    spacing = max(16, size // 42)
    width = max(1, size // 680)
    for i in range(-size, 2 * size, spacing):
        draw.line([(i, size), (i + size, 0)], fill=255, width=width)
    # Combine — lighten blend (max of the two channels).
    return Image.eval(ImageFilter.MaxFilter, img) if False else Image.fromarray(
        np.maximum(np.array(img), np.array(rev)), mode="L"
    )


def waves_tile(size: int = 1024, seed: int = 0) -> Image.Image:
    img = _blank(size)
    draw = ImageDraw.Draw(img)
    period = max(64, size // 8)
    amp = max(4, size // 170)
    step = max(2, size // 256)
    width = max(1, size // 680)
    for base in range(-amp, size + amp, max(12, size // 85)):
        pts: List[tuple] = []
        for x in range(0, size + 1, step):
            y = base + amp * math.sin(2 * math.pi * x / period)
            pts.append((x, y))
        draw.line(pts, fill=255, width=width)
    return img


TEXTURE_FNS: Dict[str, Callable[[int, int], Image.Image]] = {
    "noise": noise_tile,
    "dots": dots_tile,
    "grid": grid_tile,
    "stripes": stripes_tile,
    "crosshatch": crosshatch_tile,
    "waves": waves_tile,
}


def make_texture(name: str, size: int = 1024, seed: int = 0) -> Image.Image:
    if name == "none":
        return Image.new("L", (size, size), 0)
    fn = TEXTURE_FNS.get(name)
    if fn is None:
        return Image.new("L", (size, size), 0)
    return fn(size, seed)


def list_texture_names() -> List[str]:
    return ["none"] + sorted(TEXTURE_FNS.keys())
