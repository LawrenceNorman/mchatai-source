#!/usr/bin/env python3
"""vf-slice.py — cut a fighter sprite sheet into the versus-fighter atlas.

    python3 tools/vf-slice.py sprites/ava/map.json /path/to/AvaLee-sheet.gif

Reads the base's map.json (cell pitch, columns, background, named frame lists), keeps only the
mapped frames, and writes next to map.json:
  atlas.png   the used cells packed in a grid, background made transparent
  atlas.json  frames (atlas rect, hurt box, hit box), animations (frame lists), and the base's
              recolor groups ("palette") and feel (push-box width, walk and jump speed)

Coordinates in atlas.json are pixels relative to the ANCHOR, the fighter's feet: x grows in the
facing direction (the sheet faces right), y grows downward, so a box above the feet has negative y.
Boxes are [x0, y0, x1, y1].

map.json "source":
  cell       [w, h] pitch of the sheet's grid; may be fractional (a sheet exported at 198.8 px
             per column): cell i starts at round(column * w), round(row * h)
  columns    cells per sheet row
  background "black" (opaque sheet, black = empty) or omitted (the sheet has alpha)
  scale      resample every cell (0.5 for a sheet drawn at twice the size the runtime draws)
  alphaMin   alpha a pixel needs to count for boxes (soft-edged renders: about 96)

map.json "trim": true packs each frame's own bounding box instead of whole cells (each frame then
carries its own "anchor"), and "drawScale" sets how large the runtime draws the base (default 2; a
sheet kept at full size draws at 1). "upscale": 2 or 4 runs Scale2x (EPX) once or twice over each
packed frame: pixel art keeps its colours and gains smooth diagonals, so it stays sharp when the
runtime draws it at screen resolution (anchors and boxes scale with it; halve "drawScale" per
step). "colors": n stores the atlas as an n-colour palette PNG.

An animation lists its sheet frames as "range": [first, last] (with "step": n to keep every n-th),
or as "frames": [...]. "reverse" plays them backwards (walk back = the walk reversed); "pingpong"
plays them forth and back (a seamless idle from a one-way breath). "per" sets the ticks per frame
of a non-attack animation (the runtime has defaults per name).

Hurt box: the frame's opaque pixels. Hit box: only on an attack's ACTIVE frames, which map.json
names by hand ("active": [first, last] positions in the animation's frame list) because they
decide how the move feels. Their box is the pixels past the stance the move starts from, in the
move's "region": front, up (above the head) or around. Startup and recovery are the frames before
and after. Any frame's box can be overridden by hand in map.json ("hit": {"<sheet frame>": [...]}).
"""
import json
import math
import sys
from pathlib import Path

from PIL import Image
import numpy as np

Image.MAX_IMAGE_PIXELS = None
STANCE_MARGIN = 3       # px of slack around the reference stance before a pixel counts as reaching out

# Each attack is measured against the stance it starts from (a crouching body is wider than a
# standing one, so measured against the idle stance a crouch punch looks extended all the time).
REFERENCE = {"crouch_punch": "crouch", "crouch_kick": "crouch", "sweep": "crouch",
             "jump_kick": "jump_air", "jump_punch": "jump_air"}


def scale2x(a):
    """EPX / Scale2x on an RGBA array: doubles it, rounding diagonal steps, adding no colours."""
    h, w = a.shape[:2]
    p = np.pad(a, ((1, 1), (1, 1), (0, 0)), mode="edge")
    E = p[1:-1, 1:-1]; B = p[:-2, 1:-1]; D = p[1:-1, :-2]; F = p[1:-1, 2:]; H = p[2:, 1:-1]

    def eq(x, y):
        return np.all(x == y, axis=2)
    c = ~eq(B, H) & ~eq(D, F)
    out = np.zeros((h * 2, w * 2, a.shape[2]), a.dtype)
    out[0::2, 0::2] = np.where((c & eq(D, B))[..., None], D, E)
    out[0::2, 1::2] = np.where((c & eq(B, F))[..., None], F, E)
    out[1::2, 0::2] = np.where((c & eq(D, H))[..., None], D, E)
    out[1::2, 1::2] = np.where((c & eq(H, F))[..., None], F, E)
    return out


def frames_of(a):
    if "frames" in a:
        fl = list(a["frames"])
    else:
        lo, hi = a["range"]
        fl = list(range(lo, hi + 1, a.get("step", 1)))
    if a.get("reverse"):
        fl = fl[::-1]
    if a.get("pingpong"):
        fl = fl + fl[-2:0:-1]
    return fl


def main(map_path: str, sheet_path: str) -> None:
    map_file = Path(map_path)
    spec = json.loads(map_file.read_text())
    src = spec["source"]
    pw, ph = src["cell"]
    cols = src["columns"]
    scale = src.get("scale", 1)
    alpha_min = src.get("alphaMin", 1)
    cw0, ch0 = math.ceil(pw), math.ceil(ph)
    cw, ch = (int(round(cw0 * scale)), int(round(ch0 * scale))) if scale != 1 else (cw0, ch0)

    sheet = Image.open(sheet_path).convert("RGBA")
    black = src.get("background") == "black"
    cache = {}

    def cell(i):
        """The (resampled) cell as an RGBA array."""
        if i not in cache:
            r, c = divmod(i, cols)
            x, y = int(round(c * pw)), int(round(r * ph))
            im = sheet.crop((x, y, x + cw0, y + ch0))
            if black:
                arr = np.array(im)
                arr[:, :, 3] = np.where(arr[:, :, :3].astype(int).sum(axis=2) > 30, 255, 0)
                im = Image.fromarray(arr)
            if scale != 1:
                im = im.resize((cw, ch), Image.LANCZOS)
            cache[i] = np.array(im)
        return cache[i]

    def cell_mask(i):
        return cell(i)[:, :, 3] >= alpha_min

    anims_spec = spec["anims"]
    lists = {name: frames_of(a) for name, a in anims_spec.items()}

    # Anchor = the feet of the first idle frame: bottom of its pixels, centre of its body.
    m0 = cell_mask(lists["idle"][0])
    ys, xs = np.where(m0)
    ax, ay = int(round(xs.mean())), int(ys.max())
    stance = [int(xs.min()) - ax, int(ys.min()) - ay, int(xs.max()) - ax, int(ys.max()) - ay]

    used = sorted({i for fl in lists.values() for i in fl})

    # Atlas layout: a grid of whole cells, or (trim) each frame's own box, shelf-packed.
    trim = spec.get("trim", False)
    up = int(spec.get("upscale", 1))    # 1, 2 or 4: Scale2x passes over every packed frame
    assert up in (1, 2, 4), "upscale is 1, 2 or 4"
    place = {}                          # sheet frame -> (atlas x, atlas y, cell x0, cell y0, w, h), atlas units
    if trim:
        boxes = {}
        for i in used:
            ys, xs = np.where(cell(i)[:, :, 3] > 0)
            if len(xs):
                x0, y0 = max(0, int(xs.min()) - 1), max(0, int(ys.min()) - 1)
                boxes[i] = (x0, y0, min(cw, int(xs.max()) + 2) - x0, min(ch, int(ys.max()) + 2) - y0)
            else:
                boxes[i] = (0, 0, 1, 1)
        area = sum(b[2] * b[3] for b in boxes.values())
        aw = max(max(b[2] for b in boxes.values()), min(2048, int(math.ceil(math.sqrt(area) * 1.15 / 64)) * 64))
        x = y = shelf = 0
        aw *= up
        for i in sorted(used, key=lambda i: (-boxes[i][3], i)):
            bx, by, w, h = boxes[i]
            w, h = w * up, h * up
            if x + w > aw:
                x, y, shelf = 0, y + shelf, 0
            place[i] = (x, y, bx, by, w, h)
            x, shelf = x + w, max(shelf, h)
        atlas = np.zeros((y + shelf, aw, 4), dtype=np.uint8)
    else:
        per_row = 16
        for k, i in enumerate(used):
            r, c = divmod(k, per_row)
            place[i] = (c * cw * up, r * ch * up, 0, 0, cw * up, ch * up)
        atlas = np.zeros((math.ceil(len(used) / per_row) * ch * up, per_row * cw * up, 4), dtype=np.uint8)
    frames, where = [], {}

    def box_of(i):
        fy, fx = np.where(cell_mask(i))
        return [int(fx.min()) - ax, int(fy.min()) - ay, int(fx.max()) - ax, int(fy.max()) - ay]

    def ref_box(anim_name):
        ref = anims_spec[anim_name].get("ref") or REFERENCE.get(anim_name, "idle")
        fl = lists[ref]
        return box_of(fl[-1] if ref == "crouch" else fl[0])   # crouch: the fully-down frame

    overrides = {int(k): v for k, v in spec.get("hit", {}).items()}

    # Hand-picked active windows (map.json "active": [first, last] positions in the frame list)
    # decide WHEN a move hits; the pixels decide WHERE. "region": front (past the stance's leading
    # edge), up (above its top), around (anywhere outside it). Measured against the stance the
    # move starts from (REFERENCE), with no minimum reach: a thin fist is still a fist.
    active_region = {}
    for name, a in anims_spec.items():
        if a.get("attack") and a.get("active"):
            fl = lists[name]
            rb = ref_box(name)
            for off in range(a["active"][0], a["active"][1] + 1):
                active_region[fl[off]] = (rb, a.get("region", "front"))

    def scaled(b):
        return [v * up for v in b] if b else b

    for i in used:
        px, py, bx, by, w, h = place[i]
        piece = cell(i)[by:by + h // up, bx:bx + w // up]
        for _ in range({1: 0, 2: 1, 4: 2}[up]):
            piece = scale2x(piece)
        atlas[py:py + h, px:px + w] = piece
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
            above = gy < rb[1] + STANCE_MARGIN
            outside = (gx < rb[0]) | (gx > rb[2]) | (gy < rb[1])
            sel = {"front": front, "up": above, "around": outside}[region]
            if sel.sum() < 3:           # nothing past the stance: strike with the leading half
                sel = gx > 0
            hx, hy = gx[sel], gy[sel]
            hit = [int(hx.min()), int(hy.min()), int(hx.max()), int(hy.max())]
        where[i] = len(frames)
        fr = {"src": i, "rect": [px, py, w, h], "hurt": scaled(hurt), "hit": scaled(hit)}
        if trim:
            fr["anchor"] = [(ax - bx) * up, (ay - by) * up]
        frames.append(fr)

    anims = {}
    for name, a in anims_spec.items():
        entry = {"frames": [where[i] for i in lists[name]]}
        for flag in ("loop", "hold", "attack"):
            if a.get(flag):
                entry[flag] = True
        if a.get("attack"):
            entry["active"] = a.get("active")
        if a.get("per"):
            entry["per"] = a["per"]
        anims[name] = entry

    out_dir = map_file.parent
    img = Image.fromarray(atlas)
    if spec.get("colors"):              # palette PNG: exact when the atlas has that few colours,
        flat = atlas.reshape(-1, 4)     # else quantized (soft-edged renders compress 3-4x)
        flat = np.where(flat[:, 3:4] == 0, 0, flat)             # one "transparent" entry
        uniq, inv = np.unique(flat, axis=0, return_inverse=True)
        if len(uniq) <= spec["colors"]:
            img = Image.fromarray(inv.reshape(atlas.shape[:2]).astype(np.uint8), "P")
            img.putpalette(uniq[:, :3].astype(np.uint8).flatten().tolist())
            img.info["transparency"] = bytes(uniq[:, 3].astype(np.uint8).tolist())
        else:
            img = img.quantize(colors=spec["colors"], method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    img.save(out_dir / "atlas.png", optimize=True)
    out = {
        "base": spec["base"],
        "cell": [cw * up, ch * up],
        "anchor": [ax * up, ay * up],
        "stance": scaled(stance),
        "facing": spec.get("facing", "right"),
        "credit": f'{spec["name"]}: {src["author"]}, {src["license"]} ({src["url"]})',
        "frames": frames,
        "anims": anims,
    }
    for key in ("palette", "feel", "drawScale"):
        if spec.get(key):
            out[key] = spec[key]
    (out_dir / "atlas.json").write_text(json.dumps(out, separators=(",", ":")))
    missing = [n for n, a in anims.items() if a.get("attack") and not a.get("active")]
    print(f"{spec['base']}: {len(frames)} frames, {len(anims)} animations, atlas {atlas.shape[1]}x{atlas.shape[0]}, "
          f"{(out_dir / 'atlas.png').stat().st_size // 1024} KB")
    if missing:
        print("attacks with no hit box (need a hand override in map.json):", ", ".join(missing))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
