#!/usr/bin/env python3
"""Numeric gates for authored ToonStudio content, from the rig authoring guide.

Checks raw JSON before it ever reaches the app: part ids, parenting, z bands,
viseme placement/sizing, palette tokens, clip/pose references, path grammar,
backdrop density and value structure. Complements (never replaces) the Swift
render harness — numbers first, then look at the pictures.
"""

import json
import os
import re
import sys

PATH_CMD = re.compile(r"[A-Za-df-z]")  # anything but numbers/e — check letters separately
ALLOWED_PATH = set("MLHVQCZmlhvqcz")


def fail(msgs, name, msg):
    msgs.append(f"  FAIL  {name}: {msg}")


def warn(msgs, name, msg):
    msgs.append(f"  warn  {name}: {msg}")


def shape_bbox(s):
    t = s.get("type", "")
    if t in ("ellipse", "circle", "ellipsis"):
        if "cx" in s:
            rx = s.get("rx", s.get("radius", 0)); ry = s.get("ry", s.get("radius", 0))
            return (s["cx"] - rx, s["cy"] - ry, 2 * rx, 2 * ry)
        return (s.get("x", 0), s.get("y", 0), s.get("w", 0), s.get("h", 0))
    if t == "rect":
        return (s.get("x", 0), s.get("y", 0), s.get("w", 0), s.get("h", 0))
    if t in ("polygon", "poly"):
        pts = s.get("pts", s.get("points", []))
        if not pts:
            return None
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        return (min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))
    if t == "path":
        nums = [float(v) for v in re.findall(r"-?\d+\.?\d*(?:[eE]-?\d+)?", s.get("d", s.get("path", "")))]
        if len(nums) < 4:
            return None
        xs = nums[0::2]; ys = nums[1::2]
        return (min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))
    return None


def tokens_used(obj, found):
    if isinstance(obj, dict):
        for v in obj.values():
            tokens_used(v, found)
    elif isinstance(obj, list):
        for v in obj:
            tokens_used(v, found)
    elif isinstance(obj, str) and obj.startswith("@"):
        found.add(obj[1:])


def check_paths(obj, msgs, name):
    if isinstance(obj, dict):
        d = obj.get("d") or obj.get("path")
        if isinstance(d, str):
            letters = set(c for c in d if c.isalpha())
            bad = letters - ALLOWED_PATH - set("eE")
            if bad:
                fail(msgs, name, f"path uses forbidden commands {sorted(bad)}")
        for v in obj.values():
            check_paths(v, msgs, name)
    elif isinstance(obj, list):
        for v in obj:
            check_paths(v, msgs, name)


def lint_puppet(path, msgs):
    name = os.path.basename(path)
    try:
        p = json.load(open(path))
    except Exception as e:
        fail(msgs, name, f"not valid JSON: {e}")
        return
    kind = (p.get("kind") or "character").lower()
    parts = {q.get("id"): q for q in p.get("parts", p.get("skeleton", []))}
    palette = set(p.get("palette", {}).keys())

    # Palette tokens all defined.
    used = set()
    tokens_used(p, used)
    missing = used - palette
    if missing:
        warn(msgs, name, f"@tokens not in palette (repair will invent them): {sorted(missing)}")
    check_paths(p, msgs, name)

    # Parenting.
    for pid, part in parts.items():
        parent = part.get("parent")
        if parent and parent not in parts:
            fail(msgs, name, f"part '{pid}' has dangling parent '{parent}'")

    poses = {q.get("id") for q in p.get("poses", [])}
    # Pose part references + sane rotations.
    for pose in p.get("poses", []):
        for pid, tf in (pose.get("parts") or {}).items():
            rot = tf.get("rotate", 0)
            if abs(rot) > 400:
                fail(msgs, name, f"pose '{pose.get('id')}' rotates {pid} by {rot}° — radians slip?")
    # Clips reference existing poses.
    clips = p.get("clips", p.get("animations", {})) or {}
    for cname, spec in clips.items():
        for key in spec.get("keys", []):
            if key.get("pose") not in poses:
                fail(msgs, name, f"clip '{cname}' key names missing pose '{key.get('pose')}'")
        turn = spec.get("turn")
        if turn and turn not in poses:
            warn(msgs, name, f"clip '{cname}' turn '{turn}' pose missing (repair nils it)")
    anim = p.get("animation")
    if anim:
        for key in anim.get("keys", []):
            if key.get("pose") not in poses:
                fail(msgs, name, f"animation key names missing pose '{key.get('pose')}'")

    if kind in ("prop", "effect"):
        if p.get("visemes"):
            warn(msgs, name, "prop/effect carries visemes")
        return

    # ---- character-only checks ----
    for required in ("body", "head", "mouth", "eyes"):
        if required not in parts:
            fail(msgs, name, f"missing required part '{required}'")
    mouth = parts.get("mouth", {})
    if not mouth.get("shapes") and not mouth.get("drawables"):
        if mouth.get("swap") != "viseme":
            fail(msgs, name, "art-less mouth without swap:'viseme' — repair DELETES it, lip-sync dies")
    if parts.get("eyes", {}).get("swap") != "eyes":
        warn(msgs, name, "eyes part lacks swap:'eyes' (blink squash)")

    # z audit: decoration ceiling from direct head children.
    ceiling = 0
    for pid, part in parts.items():
        if part.get("parent") == "head" and pid not in ("mouth", "eyes", "hair"):
            ceiling = max(ceiling, part.get("z", 0))
    mouth_z = mouth.get("z", 33)
    if ceiling >= mouth_z:
        warn(msgs, name, f"head decoration z {ceiling} ≥ mouth z {mouth_z} — repair lifts the face over it (check the look)")

    # hair must not overlap the mouth region.
    pivot = mouth.get("pivot", [0, 0.655])
    hair = parts.get("hair")
    if hair:
        for s in hair.get("shapes", hair.get("drawables", [])) or []:
            box = shape_bbox(s)
            if box and box[1] <= pivot[1] <= box[1] + box[3] and box[0] <= pivot[0] <= box[0] + box[2]:
                fail(msgs, name, f"'hair' art covers the mouth pivot {pivot} — exempt from the lift, occludes lip-sync forever")

    # Visemes: present, own art, at the mouth, size-ordered.
    vis = p.get("visemes", {}) or {}
    core = [k for k in vis if "/" not in k and not k.startswith("face_")]
    for req in ("X", "A", "C", "D", "F"):
        if req not in vis:
            fail(msgs, name, f"viseme '{req}' missing (repair grafts starter art at the WRONG height)")
    sizes = {}
    for key in ("B", "C", "D", "X"):
        boxes = [shape_bbox(s) for s in vis.get(key, []) if shape_bbox(s)]
        if boxes:
            sizes[key] = max(b[2] * max(b[3], 0.001) for b in boxes)
            midy = sum(b[1] + b[3] / 2 for b in boxes) / len(boxes)
            if abs(midy - pivot[1]) > 0.16:
                fail(msgs, name, f"viseme '{key}' art midY {midy:.2f} is {abs(midy-pivot[1]):.2f} from mouth pivot y {pivot[1]:.2f} — floating mouth")
    if sizes.get("D", 0) <= sizes.get("C", 0):
        warn(msgs, name, f"viseme D ({sizes.get('D', 0):.4f}) not larger than C ({sizes.get('C', 0):.4f}) — speech won't read")
    if "C" in sizes and "B" in sizes and sizes["C"] <= sizes["B"]:
        warn(msgs, name, "viseme C not larger than B")

    # Clips: walk and run under exactly those names.
    for want in ("walk", "run"):
        if want not in {c.lower() for c in clips}:
            fail(msgs, name, f"no '{want}' clip — story cues and drag-locomotion find nothing")
    if "talk" not in poses:
        warn(msgs, name, "no 'talk' pose — every spoken line resolves to nothing")

    h = p.get("height", 1.0)
    if not (0.1 < h <= 3):
        fail(msgs, name, f"height {h} outside (0.1, 3]")


def expand_count(backdrop):
    n = 0
    for layer in backdrop.get("layers", []):
        for s in layer.get("shapes", layer.get("drawables", [])) or []:
            rep = s.get("repeat")
            n += min(rep.get("count", rep.get("n", 1)), 240) if rep else 1
    return n


def lint_backdrop(path, msgs):
    name = os.path.basename(path)
    try:
        b = json.load(open(path))
    except Exception as e:
        fail(msgs, name, f"not valid JSON: {e}")
        return
    check_paths(b, msgs, name)
    used = set()
    tokens_used(b, used)
    missing = used - set(b.get("palette", {}).keys())
    if missing:
        warn(msgs, name, f"@tokens not in palette: {sorted(missing)}")

    layers = b.get("layers", [])
    if len(layers) < 3:
        fail(msgs, name, f"only {len(layers)} layers (need ≥3)")
    n = expand_count(b)
    if n < 170:
        fail(msgs, name, f"only {n} expanded paths — reads as flat slabs (target 250+)")
    elif n < 250:
        warn(msgs, name, f"{n} expanded paths — below the 250 target")

    # Ground plane spans the overscan.
    ground = None
    for layer in layers:
        if abs(layer.get("parallax", 0) - 1.0) < 0.01 or layer.get("parallax", 0) >= 0.85:
            for s in layer.get("shapes", []) or []:
                box = shape_bbox(s)
                if box and box[2] >= 4.0 and box[1] <= 0.05:
                    ground = box
    if not ground:
        warn(msgs, name, "no wide ground-plane rect found spanning x≈-3..3 at y≤0.05")

    # Horizon / eye band: strong horizontal edges in the dead band.
    for layer in layers:
        par = layer.get("parallax", 1)
        if par <= 0.35:
            for s in layer.get("shapes", []) or []:
                box = shape_bbox(s)
                if box and s.get("type") == "rect" and box[2] > 2.0:
                    top = box[1] + box[3]
                    if 0.41 <= top <= 0.51 and not s.get("repeat"):
                        warn(msgs, name, f"far-layer horizontal edge at y={top:.2f} sits in the eye band 0.41-0.51")
    print_stats = f"{name}: layers={len(layers)} expanded={n}"
    msgs.append(f"  ok    {print_stats}")


def main():
    base = sys.argv[1]
    msgs = []
    puppet_dir = os.path.join(base, "puppets")
    for f in sorted(os.listdir(puppet_dir)):
        if f.endswith(".json"):
            lint_puppet(os.path.join(puppet_dir, f), msgs)
    bd_dir = os.path.join(base, "backdrops")
    for f in sorted(os.listdir(bd_dir)):
        if f.endswith(".json"):
            lint_backdrop(os.path.join(bd_dir, f), msgs)
    fails = [m for m in msgs if "FAIL" in m]
    warns = [m for m in msgs if "warn" in m]
    for m in msgs:
        print(m)
    print(f"\n{len(fails)} failures, {len(warns)} warnings")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
