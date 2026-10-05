#!/usr/bin/env python3
"""Map snippets for the landmarks a story names (images.json `maps`, voice.md §14, 2026-10-04).

Lawrence, reviewing the pilot: "include perhaps clickable map locations mini-map-screen-snippets
in these documents so that the reader can orientation and then quickly be brought into the
mchatai.com/seattle-landmarks".

One small street map per landmark the book links. It is drawn the way the Seattle Landmarks page
draws its own mini-map: the same basemap, colours, street labels and ringed marker (`draw` in
mchatai_macOS/scripts/tools/landmark-corpus/pipeline/build_web_html.py). A reader who clicks
through sees the same picture again at the bottom of the landmark's page. The basemap is that
site's public geo.json, OpenStreetMap streets and water simplified (ODbL: the credit is drawn on
every map and repeated under it). The output is SVG, small and sharp at any size, which
StoryMaker's Read view draws (AppKit reads SVG) and so does any browser.

    maps.py render <story-dir> [--id SL-0648 ...] [--basemap <file|url>]
    maps.py list <story-dir>

`render` draws a map for every landmark the book would link (cite.py's landmark patterns over
the gated chapters), or only the `--id`s given, into images/maps/<id>.svg, and records them in
images/maps/index.json. `cite.py book` places each one. Nothing here touches the prose.
"""
import datetime
import hashlib
import json
import math
import os
import re
import sys
import urllib.request
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import HISTORY, Project, load_json, save_json  # noqa: E402

UA = "mChatAI-HistoryWriter/1.0 (https://mchatai.com; history research tools)"

# The page's palette and line weights (build_web_html.py `draw`). Keep them in step: the point is
# that the story's map and the page's map are the same picture.
BG, WATER = "#12181a", "#1a3d4b"
STREET = {1: ("#616b65", lambda s: min(5, 1.1 + s / 620000)),
          2: ("#4a544f", lambda s: min(3.2, .85 + s / 900000)),
          3: ("#333c39", lambda s: min(2.2, .55 + s / 1400000))}
LABEL, HALO, DIM, PIN = "#97a09a", "#12181a", "#96a59e", "#d98a70"
FONT = "-apple-system, system-ui, 'Helvetica Neue', Helvetica, sans-serif"


def config():
    return (load_json(os.path.join(HISTORY, "images.json"), {}) or {}).get("maps") or {}


def links_config():
    return (load_json(os.path.join(HISTORY, "images.json"), {}) or {}).get("landmarkLinks") or {}


def places():
    """{id: place} from the landmark pack the links use."""
    pack = links_config().get("pack")
    if not pack:
        return {}
    root = os.path.dirname(os.path.realpath(HISTORY))
    data = load_json(os.path.join(root, "places", "packs", f"{pack}.json"), {}) or {}
    return {p["id"]: p for p in data.get("places", []) if p.get("lat") is not None and p.get("lon") is not None}


# ── the basemap ─────────────────────────────────────────────────────────────

def merc(lon, lat):
    return math.radians(lon), math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def unpack(g):
    """[lat0*1e5, lon0*1e5, dlat, dlon, …] → mercator points, as the page decodes them."""
    la, lo = g[0], g[1]
    out = [merc(lo / 1e5, la / 1e5)]
    for i in range(2, len(g) - 1, 2):
        la += g[i]
        lo += g[i + 1]
        out.append(merc(lo / 1e5, la / 1e5))
    return out


def basemap(project, source=None):
    """The basemap JSON: a local file, or the configured URL fetched once into stories/.cache/."""
    src = source or config().get("basemap")
    if not src:
        raise SystemExit("no basemap: set maps.basemap in images.json or pass --basemap")
    if os.path.exists(src):
        with open(src, encoding="utf-8") as fh:
            return json.load(fh), src
    cache = os.path.join(os.path.dirname(project.root), ".cache",
                         "basemap-" + hashlib.sha1(src.encode()).hexdigest()[:12] + ".json")
    if not os.path.exists(cache):
        req = urllib.request.Request(src, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        json.loads(data)                       # refuse to cache anything that is not the basemap
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        with open(cache + ".part", "wb") as fh:
            fh.write(data)
        os.replace(cache + ".part", cache)
    with open(cache, encoding="utf-8") as fh:
        return json.load(fh), src


def prepared(geo):
    def bb(pts):
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        return (min(xs), min(ys), max(xs), max(ys))
    water = []
    for w in geo.get("water", []):
        pts = unpack(w["g"])
        water.append({"c": w.get("c", 0), "pts": pts, "bb": bb(pts)})
    streets = []
    for t in geo.get("streets", []):
        pts = unpack(t["g"])
        streets.append({"c": t.get("c"), "n": t.get("n") or "", "pts": pts, "bb": bb(pts)})
    return water, streets


# ── drawing ─────────────────────────────────────────────────────────────────

def text_width(s, size=10.5):
    """Roughly what the page's measureText gives for system-ui at this size."""
    w = 0.0
    for ch in s:
        if ch == " ":
            w += .28
        elif ch in "iljtfr.,'’!|":
            w += .3
        elif ch.isupper():
            w += .66
        else:
            w += .56
    return w * size


def svg_map(place, geo_prepared, others, cfg):
    """One landmark's map as SVG text."""
    W, H = int(cfg.get("width", 640)), int(cfg.get("height", 240))
    s = float(cfg.get("scale", 1900000))
    water, streets = geo_prepared
    cx, cy = merc(place["lon"], place["lat"])
    hw, hh = W / 2, H / 2

    def X(x):
        return (x - cx) * s + hw

    def Y(y):
        return hh - (y - cy) * s

    vx0, vx1 = cx - (hw + 40) / s, cx + (hw + 40) / s
    vy0, vy1 = cy - (hh + 40) / s, cy + (hh + 40) / s

    def near(b):
        return not (b[2] < vx0 or b[0] > vx1 or b[3] < vy0 or b[1] > vy1)

    def seg_near(a, b):
        return near((min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])))

    def runs(pts):
        """The polyline cut to the segments that can show, as runs of screen points."""
        out, cur = [], []
        for a, b in zip(pts, pts[1:]):
            if seg_near(a, b):
                if not cur:
                    cur = [a]
                cur.append(b)
            elif cur:
                out.append(cur)
                cur = []
        if cur:
            out.append(cur)
        return out

    def d_of(run, close=False):
        return "M" + "L".join(f"{X(p[0]):.1f} {Y(p[1]):.1f}" for p in run) + ("Z" if close else "")

    parts = [f'<rect width="{W}" height="{H}" fill="{BG}"/>']
    polys = [d_of(o["pts"], True) for o in water if o["c"] != 1 and len(o["pts"]) >= 3 and near(o["bb"])]
    if polys:
        parts.append(f'<path fill="{WATER}" d="{"".join(polys)}"/>')
    lines = [d_of(r) for o in water if o["c"] == 1 and near(o["bb"]) for r in runs(o["pts"])]
    if lines:
        parts.append(f'<path fill="none" stroke="{WATER}" stroke-width="{min(9, 2.2 + s / 420000):.2f}" '
                     f'stroke-linecap="round" stroke-linejoin="round" d="{"".join(lines)}"/>')
    for cl in (3, 2, 1):
        if (cl == 3 and s < 620000) or (cl == 2 and s < 190000):
            continue
        colour, width = STREET[cl]
        ds = [d_of(r) for t in streets if t["c"] == cl and near(t["bb"]) for r in runs(t["pts"])]
        if ds:
            parts.append(f'<path fill="none" stroke="{colour}" stroke-width="{width(s):.2f}" '
                         f'stroke-linecap="round" stroke-linejoin="round" d="{"".join(ds)}"/>')

    # Street names, placed as the page places them: the longest visible stretch, upright.
    if s > 260000:
        taken, seen, cap = [], {}, 0
        for t in streets:
            if cap >= 40:
                break
            if not t["n"] or not near(t["bb"]) or (t["c"] == 3 and s < 1000000) or (t["c"] == 2 and s < 380000):
                continue
            if seen.get(t["n"], 0) > 1:
                continue
            q, best, bl = t["pts"], -1, 0.0
            for j in range(len(q) - 1):
                ax, ay, bx, by = X(q[j][0]), Y(q[j][1]), X(q[j + 1][0]), Y(q[j + 1][1])
                if (ax < 0 and bx < 0) or (ax > W and bx > W) or (ay < 0 and by < 0) or (ay > H and by > H):
                    continue
                length = math.hypot(bx - ax, by - ay)
                if length > bl:
                    bl, best = length, j
            if best < 0 or bl < 58:
                continue
            x1, y1, x2, y2 = X(q[best][0]), Y(q[best][1]), X(q[best + 1][0]), Y(q[best + 1][1])
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            if mx < 24 or mx > W - 24 or my < 14 or my > H - 14:
                continue
            tw = text_width(t["n"])
            if tw > bl - 10 or any(abs(u[0] - mx) < (u[2] + tw) / 2 + 14 and abs(u[1] - my) < 15 for u in taken):
                continue
            ang = math.atan2(y2 - y1, x2 - x1)
            if ang > math.pi / 2:
                ang -= math.pi
            if ang < -math.pi / 2:
                ang += math.pi
            name = escape(t["n"])
            at = f'transform="translate({mx:.1f} {my:.1f}) rotate({math.degrees(ang):.1f})"'
            parts.append(f'<text {at} stroke="{HALO}" stroke-opacity=".9" stroke-width="3" stroke-linejoin="round" '
                         f'fill="none">{name}</text>')
            parts.append(f'<text {at} fill="{LABEL}">{name}</text>')
            taken.append((mx, my, tw))
            seen[t["n"]] = seen.get(t["n"], 0) + 1
            cap += 1

    # Every other landmark, faint; this one ringed.
    for o in others:
        if o["id"] == place["id"]:
            continue
        ox, oy = merc(o["lon"], o["lat"])
        x, y = X(ox), Y(oy)
        if -20 <= x <= W + 20 and -20 <= y <= H + 20:
            parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2.2" fill="{DIM}" fill-opacity=".3"/>')
    parts.append(f'<circle cx="{hw:.1f}" cy="{hh:.1f}" r="7" fill="{PIN}" stroke="{HALO}" stroke-opacity=".85" stroke-width="2.4"/>')
    parts.append(f'<circle cx="{hw:.1f}" cy="{hh:.1f}" r="12" fill="none" stroke="{PIN}" stroke-opacity=".55" stroke-width="1.6"/>')

    def corner(x, text, anchor):
        t = escape(text)
        common = f'x="{x}" y="{H - 9}" font-size="10" text-anchor="{anchor}"'
        return (f'<text {common} stroke="{HALO}" stroke-opacity=".9" stroke-width="3" stroke-linejoin="round" fill="none">{t}</text>'
                f'<text {common} fill="{DIM}" fill-opacity=".85">{t}</text>')
    if place.get("neighborhood"):
        parts.append(corner(10, place["neighborhood"], "start"))
    parts.append(corner(W - 10, "© OpenStreetMap contributors", "end"))

    title = escape(f"Map: {place.get('name', '')}, {place.get('address', '')}")
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img">'
            f'<title>{title}</title>'
            f'<g font-family="{FONT}" font-size="10.5" font-weight="500" text-anchor="middle" dominant-baseline="central">'
            + "".join(parts) + "</g></svg>\n")


# ── commands ────────────────────────────────────────────────────────────────

def index(project):
    return load_json(project.path("images", "maps", "index.json"), []) or []


def linked_ids(project):
    """The landmarks `cite.py book` would link, in the order the book first names them."""
    import cite
    pats = cite.landmark_patterns()
    order = []
    for n in cite.book_numbers(project):
        text = (project.chapter(n) or {}).get("text", "")
        hits = sorted((m.start(), lid) for lid, _, rx in pats for m in [rx.search(text)] if m)
        for _, lid in hits:
            if lid not in order:
                order.append(lid)
    return order


def prune(project, keep):
    """Drop the maps of landmarks the story no longer names (a mention cut, or an address that
    turned out to be another building): `cite.py book` would never place them, and `list` would
    still show them."""
    rows = index(project)
    stale = [r for r in rows if r["id"] not in keep]
    for r in stale:
        path = project.path(r.get("file") or "")
        if r.get("file") and os.path.isfile(path):
            os.remove(path)
        print(f"{r['id']}  {r.get('name')} — dropped: the story no longer names it")
    if stale:
        save_json(project.path("images", "maps", "index.json"), [r for r in rows if r["id"] in keep])


def cmd_render(project, ids, source):
    cfg = config()
    known = places()
    if not ids:
        ids = linked_ids(project)
        prune(project, set(ids))              # a full render is the whole set; --id adds to it
    if not ids:
        print("no landmarks named in this story; no maps")
        return 0
    missing = [i for i in ids if i not in known]
    if missing:
        print("not in the landmark pack, or no coordinates: " + ", ".join(missing))
        return 1
    geo, src = basemap(project, source)
    prep = prepared(geo)
    template = links_config().get("url", "")
    rows = {r["id"]: r for r in index(project)}
    for lid in ids:
        place = known[lid]
        svg = svg_map(place, prep, list(known.values()), cfg)
        rel = os.path.join("images", "maps", f"{lid}.svg")
        os.makedirs(project.path("images", "maps"), exist_ok=True)
        with open(project.path(rel), "w", encoding="utf-8") as fh:
            fh.write(svg)
        rows[lid] = {"id": lid, "name": place.get("name"), "address": place.get("address"),
                     "neighborhood": place.get("neighborhood"), "lat": place["lat"], "lon": place["lon"],
                     "file": rel, "url": template.replace("{id}", lid) if template else None,
                     "label": links_config().get("label", "Landmarks"), "credit": cfg.get("credit"),
                     "basemap": src,
                     "renderedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")}
        print(f"{lid}  {place.get('name')} — {len(svg) // 1024} KB → {rel}")
    save_json(project.path("images", "maps", "index.json"), [rows[k] for k in sorted(rows)])
    return 0


def cmd_list(project):
    rows = index(project)
    if not rows:
        print("no maps drawn yet (maps.py render <story-dir>)")
        return 0
    for r in rows:
        print(f"{r['id']}  {r.get('name')}, {r.get('address')}  {r.get('file')}  → {r.get('url')}")
    return 0


def flags(argv, name):
    return [argv[i + 1] for i, a in enumerate(argv) if a == name and i + 1 < len(argv)]


def main(argv):
    if len(argv) >= 3 and argv[1] == "render":
        src = flags(argv, "--basemap")
        return cmd_render(Project(argv[2]), flags(argv, "--id"), src[0] if src else None)
    if len(argv) >= 3 and argv[1] == "list":
        return cmd_list(Project(argv[2]))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
