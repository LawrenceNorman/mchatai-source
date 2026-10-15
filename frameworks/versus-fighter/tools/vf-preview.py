#!/usr/bin/env python3
"""vf-preview.py — draw every animation of a base as a strip, with its boxes, to check a mapping.

    python3 tools/vf-preview.py sprites/komato out.png [scale] [anim,anim,...]

One row per animation, frames in play order, on a ground line at the anchor. Hurt boxes are green,
hit boxes red (only on attack frames inside the active window). Labels give the animation name
and each frame's sheet index.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw


def main(base_dir: str, out: str, scale: float = 1.0, only: str = "") -> None:
    d = Path(base_dir)
    atlas = json.loads((d / "atlas.json").read_text())
    img = Image.open(d / "atlas.png").convert("RGBA")
    # Every frame is pasted so its anchor (its own, for a trimmed atlas) lands on one ground point.
    fa = lambda f: f.get("anchor") or atlas["anchor"]
    ax = max(fa(f)[0] for f in atlas["frames"]); ay = max(fa(f)[1] for f in atlas["frames"])
    cw = ax + max(f["rect"][2] - fa(f)[0] for f in atlas["frames"])
    ch = ay + max(f["rect"][3] - fa(f)[1] for f in atlas["frames"])
    anims = atlas["anims"]
    if only:
        anims = {n: a for n, a in anims.items() if n in only.split(",")}
    cols = max(len(a["frames"]) for a in anims.values())
    fw, fh = int(cw * scale), int(ch * scale)
    label_w = 110
    sheet = Image.new("RGBA", (label_w + cols * fw, len(anims) * fh), (34, 38, 46, 255))
    dr = ImageDraw.Draw(sheet)
    for row, (name, a) in enumerate(anims.items()):
        y0 = row * fh
        flags = " ".join(k for k in ("loop", "hold") if a.get(k))
        dr.text((4, y0 + 4), name, fill=(255, 230, 90, 255))
        dr.text((4, y0 + 18), f"{len(a['frames'])} fr {flags}", fill=(170, 180, 200, 255))
        if a.get("attack"):
            dr.text((4, y0 + 32), f"active {a.get('active')}", fill=(255, 120, 120, 255))
        win = a.get("active") or [-1, -1]
        for k, fi in enumerate(a["frames"]):
            f = atlas["frames"][fi]
            x0 = label_w + k * fw
            rx, ry, rw, rh = f["rect"]
            cell = Image.new("RGBA", (cw, ch))
            cell.alpha_composite(img.crop((rx, ry, rx + rw, ry + rh)), (ax - fa(f)[0], ay - fa(f)[1]))
            sheet.alpha_composite(cell.resize((fw, fh), Image.NEAREST), (x0, y0))
            gx, gy = x0 + ax * scale, y0 + ay * scale
            dr.line([x0, gy, x0 + fw - 1, gy], fill=(80, 90, 110, 255))

            def box(b, color):
                if b:
                    dr.rectangle([gx + b[0] * scale, gy + b[1] * scale, gx + b[2] * scale, gy + b[3] * scale], outline=color)
            box(f["hurt"], (90, 220, 120, 255))
            if a.get("attack") and win[0] <= k <= win[1]:
                box(f["hit"], (255, 70, 70, 255))
            dr.text((x0 + 2, y0 + 2), str(f["src"]), fill=(200, 200, 210, 255))
            dr.rectangle([x0, y0, x0 + fw - 1, y0 + fh - 1], outline=(56, 62, 76, 255))
    sheet.convert("RGB").save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 1.0, sys.argv[4] if len(sys.argv) > 4 else "")
