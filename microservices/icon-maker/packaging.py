"""Pure-Python multi-size icon packaging.

No `sips`/`iconutil` shell-outs — this must work on Linux/Cloud Run hosts.

.icns format (per Apple TN1206 + open-source implementations):
  magic 'icns' + u32be total_length + repeated { type(4) + u32be chunk_len + PNG_bytes }

Chunk types used (modern PNG-in-ICNS):
  ic10 = 1024×1024 (retina for 512)
  ic09 = 512×512
  ic08 = 256×256
  ic07 = 128×128
  ic13 = 256×256 @2x (512×512 data)  — optional
  icp6 = 64×64
  icp5 = 32×32
  icp4 = 16×16
"""

from __future__ import annotations

import io
import json
import struct
import zipfile
from typing import Dict


_ICNS_TYPES = {
    16: b"icp4",
    32: b"icp5",
    64: b"icp6",
    128: b"ic07",
    256: b"ic08",
    512: b"ic09",
    1024: b"ic10",
}


def build_icns(size_to_png: Dict[int, bytes]) -> bytes:
    """Build .icns bytes from {size: png_bytes}. Sizes not in _ICNS_TYPES are skipped."""
    chunks = []
    for size in sorted(size_to_png.keys()):
        icns_type = _ICNS_TYPES.get(size)
        if not icns_type:
            continue
        png = size_to_png[size]
        chunk = icns_type + struct.pack(">I", len(png) + 8) + png
        chunks.append(chunk)

    if not chunks:
        raise ValueError("no .icns-compatible sizes provided (need one of 16/32/64/128/256/512/1024)")

    body = b"".join(chunks)
    return b"icns" + struct.pack(">I", len(body) + 8) + body


def build_appiconset_zip(size_to_png: Dict[int, bytes]) -> bytes:
    """Build a zipped iOS AppIcon.appiconset/ directory.

    Standard iOS sizes (per @scale):
      iPhone Notification  20@2x/3x → 40, 60
      iPhone Settings      29@2x/3x → 58, 87
      iPhone Spotlight     40@2x/3x → 80, 120
      iPhone App           60@2x/3x → 120, 180
      iPad Notification    20@1x/2x → 20, 40
      iPad Settings        29@1x/2x → 29, 58
      iPad Spotlight       40@1x/2x → 40, 80
      iPad App             76@1x/2x → 76, 152
      iPad Pro App         83.5@2x  → 167
      App Store            1024@1x  → 1024

    We emit whichever we have; the caller fills gaps with the closest available size
    (Contents.json just references whatever filenames we wrote).
    """
    images = []
    files_to_write = {}

    # Build both the image entries AND the physical filenames we have bytes for.
    matrix = [
        ("iphone", "20x20", 2, 40, "notification-20@2x.png"),
        ("iphone", "20x20", 3, 60, "notification-20@3x.png"),
        ("iphone", "29x29", 2, 58, "settings-29@2x.png"),
        ("iphone", "29x29", 3, 87, "settings-29@3x.png"),
        ("iphone", "40x40", 2, 80, "spotlight-40@2x.png"),
        ("iphone", "40x40", 3, 120, "spotlight-40@3x.png"),
        ("iphone", "60x60", 2, 120, "app-60@2x.png"),
        ("iphone", "60x60", 3, 180, "app-60@3x.png"),
        ("ipad", "20x20", 1, 20, "ipad-notification-20@1x.png"),
        ("ipad", "20x20", 2, 40, "ipad-notification-20@2x.png"),
        ("ipad", "29x29", 1, 29, "ipad-settings-29@1x.png"),
        ("ipad", "29x29", 2, 58, "ipad-settings-29@2x.png"),
        ("ipad", "40x40", 1, 40, "ipad-spotlight-40@1x.png"),
        ("ipad", "40x40", 2, 80, "ipad-spotlight-40@2x.png"),
        ("ipad", "76x76", 1, 76, "ipad-app-76@1x.png"),
        ("ipad", "76x76", 2, 152, "ipad-app-76@2x.png"),
        ("ipad", "83.5x83.5", 2, 167, "ipad-pro-app-83.5@2x.png"),
        ("ios-marketing", "1024x1024", 1, 1024, "marketing-1024.png"),
    ]

    available_sizes = sorted(size_to_png.keys())

    def nearest_png(target: int) -> bytes:
        if target in size_to_png:
            return size_to_png[target]
        # Fall back to nearest larger, else nearest smaller
        larger = [s for s in available_sizes if s >= target]
        if larger:
            return size_to_png[larger[0]]
        return size_to_png[available_sizes[-1]]

    for idiom, dims, scale, px, filename in matrix:
        if not available_sizes:
            continue
        files_to_write[filename] = nearest_png(px)
        images.append(
            {
                "idiom": idiom,
                "size": dims,
                "scale": f"{scale}x",
                "filename": filename,
            }
        )

    contents = {"images": images, "info": {"version": 1, "author": "mchatai-icon-maker"}}

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("AppIcon.appiconset/Contents.json", json.dumps(contents, indent=2))
        for name, data in files_to_write.items():
            zf.writestr(f"AppIcon.appiconset/{name}", data)
    return buf.getvalue()
