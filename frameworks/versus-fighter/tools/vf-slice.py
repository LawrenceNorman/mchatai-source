#!/usr/bin/env python3
"""vf-slice.py — cut a fighter sprite sheet into the versus-fighter atlas.

    python3 tools/vf-slice.py sprites/ava/map.json /path/to/AvaLee-sheet.gif

Reads the base's map.json (cell size, columns, background, named frame ranges), keeps only the
mapped frames, and writes next to map.json:
  atlas.png   the used cells packed in a grid, background made transparent
  atlas.json  frames (atlas rect, hurt box, hit box) and animations (frame lists)

Coordinates in atlas.json are pixels relative to the ANCHOR, the fighter's feet: x grows in the
facing direction (the sheet faces right), y grows downward, so a box above the feet has negative y.
Boxes are [x0, y0, x1, y1].

Hurt box: the frame's opaque pixels. Hit box: only on an attack's ACTIVE frames, which map.json
names by hand ("active": [first, last] offsets inside the animation) because they decide how the
move feels. Their box is the pixels past the stance the move starts from, in the move's "region":
front, up (above the head) or around. Startup and recovery are the frames before and after.
Any frame's box can be overridden by hand in map.json ("hit": {"<sheet frame>": [x0,y0,x1,y1]}).
"""
import json
import math
import sys
from pathlib import Path

from PIL import Image
import numpy as np

STANCE_MARGIN = 3       # px of slack around the reference stance before a pixel counts as reaching out

# Each attack is measured against the stance it starts from (a crouching body is wider than a
# standing one, so measured against the idle stance a crouch punch looks extended all the time).
REFERENCE = {"crouch_punch": "crouch", "crouch_kick": "crouch", "sweep": "crouch",
             "jump_kick": "jump_air", "jump_punch": "jump_air"}


def main(map_path: str, sheet_path: str) -> None:
    map_file = Path(map_path)
    spec = json.loads(map_file.read_text())
    src = spec["source"]
    cw, ch = src["cell"]
    cols = src["columns"]

    sheet = np.array(Image.open(sheet_path).convert("RGBA"))
    if src.get("background") == "black":
        opaque = sheet[:, :, :3].astype(int).sum(axis=2) > 30
        sheet[:, :, 3] = np.where(opaque, 255, 0)
    else:
        opaque = sheet[:, :, 3] > 0

    def cell(i):
        r, c = divmod(i, cols)
        return r * ch, c * cw

    def cell_mask(i):
        y, x = cell(i)
        return opaque[y:y + ch, x:x + cw]

    # Anchor = the feet of the first idle frame: bottom of its pixels, centre of its body.
    idle0 = spec["anims"]["idle"]["range"][0]
    m0 = cell_mask(idle0)
    ys, xs = np.where(m0)
    ax, ay = int(round(xs.mean())), int(ys.max())
    stance = [int(xs.min()) - ax, int(ys.min()) - ay, int(xs.max()) - ax, int(ys.max()) - ay]

    used = []
    for a in spec["anims"].values():
        lo, hi = a["range"]
        used.extend(range(lo, hi + 1))
    used = sorted(set(used))

    per_row = 16
    rows = math.ceil(len(used) / per_row)
    atlas = np.zeros((rows * ch, per_row * cw, 4), dtype=np.uint8)
    frames, where = [], {}

    def box_of(i):
        fy, fx = np.where(cell_mask(i))
        return [int(fx.min()) - ax, int(fy.min()) - ay, int(fx.max()) - ax, int(fy.max()) - ay]

    def ref_box(anim_name):
        ref = spec["anims"][anim_name].get("ref") or REFERENCE.get(anim_name, "idle")
        r = spec["anims"][ref]["range"]
        return box_of(r[1] if ref == "crouch" else r[0])   # crouch: the fully-down frame

    overrides = {int(k): v for k, v in spec.get("hit", {}).items()}

    # Hand-picked active windows (map.json "active": [first, last] frame offsets) decide WHEN a
    # move hits; the pixels decide WHERE. "region": front (past the stance's leading edge),
    # up (above its top), around (anywhere outside it). Measured against the stance the move
    # starts from (REFERENCE), with no minimum reach: a thin fist is still a fist.
    active_region = {}
    for name, a in spec["anims"].items():
        if a.get("attack") and a.get("active"):
            lo = a["range"][0]
            rb = ref_box(name)
            for off in range(a["active"][0], a["active"][1] + 1):
                active_region[lo + off] = (rb, a.get("region", "front"))

    for k, i in enumerate(used):
        y, x = cell(i)
        r, c = divmod(k, per_row)
        atlas[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] = sheet[y:y + ch, x:x + cw]
        m = cell_mask(i)
        fy, fx = np.where(m)
        hurt = None
        if len(fx):
            hurt = [int(fx.min()) - ax, int(fy.min()) - ay, int(fx.max()) - ax, int(fy.max()) - ay]
        hit = overrides.get(i)
        if hit is None and i in active_region and len(fx):
            rb, region = active_region[i]
            gx, gy = fx - ax, fy - ay
            front = gx > rb[2] - STANCE_MARGIN
            up = gy < rb[1] + STANCE_MARGIN
            outside = (gx < rb[0]) | (gx > rb[2]) | (gy < rb[1])
            sel = {"front": front, "up": up, "around": outside}[region]
            if sel.sum() < 3:           # nothing past the stance: strike with the leading half
                sel = gx > 0
            hx, hy = gx[sel], gy[sel]
            hit = [int(hx.min()), int(hy.min()), int(hx.max()), int(hy.max())]
        where[i] = len(frames)
        frames.append({"src": i, "rect": [c * cw, r * ch, cw, ch], "hurt": hurt, "hit": hit})

    anims = {}
    for name, a in spec["anims"].items():
        lo, hi = a["range"]
        entry = {"frames": [where[i] for i in range(lo, hi + 1)]}
        for flag in ("loop", "hold", "attack"):
            if a.get(flag):
                entry[flag] = True
        if a.get("attack"):
            entry["active"] = a.get("active")
        anims[name] = entry

    out_dir = map_file.parent
    Image.fromarray(atlas).save(out_dir / "atlas.png", optimize=True)
    (out_dir / "atlas.json").write_text(json.dumps({
        "base": spec["base"],
        "cell": [cw, ch],
        "anchor": [ax, ay],
        "stance": stance,
        "facing": spec.get("facing", "right"),
        "credit": f'{spec["name"]}: {src["author"]}, {src["license"]} ({src["url"]})',
        "frames": frames,
        "anims": anims,
    }, separators=(",", ":")))
    missing = [n for n, a in anims.items() if a.get("attack") and not a.get("active")]
    print(f"{spec['base']}: {len(frames)} frames, {len(anims)} animations, atlas {atlas.shape[1]}x{atlas.shape[0]}")
    if missing:
        print("attacks with no hit box (need a hand override in map.json):", ", ".join(missing))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
