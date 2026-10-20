#!/usr/bin/env python3
"""Maps of where an episode happened, as the places are today (Pivotal Histories, Phase PP.1).

  geomap.py geocode <project>   coordinates for the dossier's `places` that have none, from
                                OpenStreetMap's geocoder (one request a second, cached in
                                stories/.cache/geocode-world.json)
  geomap.py render  <project>   every map plan.json `maps` asks for, as images/maps/<id>.svg,
                                recorded in images/maps/index.json beside the landmark maps
  geomap.py check   <project>   each place sourced like a claim (its `evidence` verbatim in its
                                source and naming the place today), each map's places pinned
  geomap.py list    <project>   the places and the maps

The author, 2026-10-20: "snippets of maps so the reader can see where things exist in modern
times for the most significant places in the story", and on the web "tap on a map and explore the
modern day area". Two scales, drawn here at build time (a hosted page may load images only from
itself, so no tile server is ever called by a reader):

  region   the country around the places, from Natural Earth's public-domain outlines and rivers
  local    a few kilometres around one place: roads, rivers, water, woods and villages from
           OpenStreetMap (credited, ODbL), the same picture a reader finds on openstreetmap.org

A map is apparatus, like a note: it carries no claim of its own, is placed after the paragraph of
its chapter that first names one of its places, and links to openstreetmap.org at the place, so a
reader taps through to explore. `cite.py book` places it.

The dossier's `places`:  [{"id", "name", "today", "query", "source", "evidence", "lat"?, "lon"?}]
plan.json `maps`:        [{"id", "scale": "region"|"local", "title", "places": [ids], "chapter",
                           "center"? (local: the place it is drawn around), "spanKm"? (local, 8)}]
"""
import datetime
import hashlib
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import Project, finding, load_json, norm, report, save_json, thresholds, words  # noqa: E402

UA = "mChatAI-HistoryWriter/1.0 (https://mchatai.com; history research tools)"
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
NE_FILES = {"countries": "ne_50m_admin_0_countries.geojson", "rivers": "ne_50m_rivers_lake_centerlines.geojson"}
NOMINATIM = "https://nominatim.openstreetmap.org/search"
OVERPASS = "https://overpass-api.de/api/interpreter"
W, H = 960, 600

# The story maps' palette (maps.py, which keeps it in step with the landmark guide).
LAND, SEA = "#1c2421", "#1a3d4b"
BG, WATER, WOOD = "#12181a", "#1a3d4b", "#17221c"
BORDER, RIVER, ROAD1, ROAD2, ROAD3, RAIL = "#4a544f", "#2b5a6b", "#616b65", "#4a544f", "#333c39", "#3d4542"
LABEL, HALO, DIM, PIN = "#97a09a", "#12181a", "#96a59e", "#d98a70"
FONT = "-apple-system, system-ui, 'Helvetica Neue', Helvetica, sans-serif"
CREDIT = {"region": "Natural Earth (public domain)", "local": "© OpenStreetMap contributors (ODbL)"}


# ── data, fetched once and cached ────────────────────────────────────────────

def cache_dir(project):
    d = os.path.join(os.path.dirname(project.root), ".cache")
    os.makedirs(d, exist_ok=True)
    return d


def get(url, data=None, timeout=120):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def natural_earth(project, which):
    path = os.path.join(cache_dir(project), "naturalearth", NE_FILES[which])
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        raw = get(NE + NE_FILES[which])
        with open(path, "wb") as fh:
            fh.write(raw)
    return load_json(path)


def overpass(project, south, west, north, east):
    q = (f"[out:json][timeout:90];("
         f'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified)$"]({south},{west},{north},{east});'
         f'way["railway"="rail"]({south},{west},{north},{east});'
         f'way["waterway"~"^(river|stream|canal)$"]({south},{west},{north},{east});'
         f'way["natural"="water"]({south},{west},{north},{east});'
         f'way["landuse"="forest"]({south},{west},{north},{east});'
         f'way["natural"="wood"]({south},{west},{north},{east});'
         f'node["place"~"^(town|village|hamlet)$"]({south},{west},{north},{east});'
         f'node["natural"="peak"]({south},{west},{north},{east});'
         f");out geom;")
    key = hashlib.sha1(q.encode()).hexdigest()[:16]
    path = os.path.join(cache_dir(project), "overpass", f"{key}.json")
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        raw = get(OVERPASS, urllib.parse.urlencode({"data": q}).encode(), timeout=180)
        with open(path, "wb") as fh:
            fh.write(raw)
    return load_json(path)


# ── places ───────────────────────────────────────────────────────────────────

def places(project):
    return {p["id"]: p for p in (project.dossier or {}).get("places") or [] if p.get("id")}


def maps_wanted(project):
    return (project.plan or {}).get("maps") or []


def cmd_geocode(project):
    d = project.dossier
    cache_path = os.path.join(cache_dir(project), "geocode-world.json")
    cache = load_json(cache_path, {}) or {}
    changed = False
    for p in d.get("places") or []:
        if p.get("lat") is not None and p.get("lon") is not None:
            continue
        q = p.get("query") or p.get("today") or p.get("name")
        if q not in cache:
            time.sleep(1.1)                          # Nominatim's usage policy: one request a second
            raw = get(NOMINATIM + "?" + urllib.parse.urlencode({"q": q, "format": "json", "limit": 1}))
            hits = json.loads(raw)
            cache[q] = hits[0] if hits else None
            save_json(cache_path, cache)
        hit = cache.get(q)
        if not hit:
            print(f"{p['id']}: nothing found for {q!r}; give it a better `query`, or lat and lon by hand")
            continue
        p["lat"], p["lon"] = round(float(hit["lat"]), 5), round(float(hit["lon"]), 5)
        p["geocoded"] = {"query": q, "display": hit.get("display_name", "")[:160], "by": "nominatim"}
        changed = True
        print(f"{p['id']}: {p['lat']}, {p['lon']}  ({hit.get('display_name', '')[:90]})")
    if changed:
        save_json(project.path("dossier.json"), d)
    return 0


def place_findings(project):
    t = thresholds(project)
    out = []
    for p in places(project).values():
        text = project.source_text(str(p.get("source", "")))
        ev = p.get("evidence") or ""
        if text is None or words(ev) < t["minQuoteWords"] or norm(ev) not in norm(text):
            out.append(finding("place_unsourced", "hard",
                               f"place {p['id']}: its `evidence` is not a verbatim quote of {t['minQuoteWords']}+ words from "
                               f"source {p.get('source') or '(none)'}; where a place is today is a fact like any other"))
        elif p.get("today") and not any(norm(w) in norm(ev) for w in re.findall(r"[A-Z][\w'’-]{2,}", p["today"])):
            out.append(finding("place_today_unsourced", "soft",
                               f"place {p['id']}: its evidence names none of the words of {p['today']!r}"))
        if p.get("lat") is None or p.get("lon") is None:
            out.append(finding("place_unpinned", "hard", f"place {p['id']}: no coordinates; run geomap.py geocode"))
    known = places(project)
    for m in maps_wanted(project):
        for pid in m.get("places") or []:
            if pid not in known:
                out.append(finding("map_place_unknown", "hard", f"map {m.get('id')}: place {pid!r} is not in the dossier's places"))
        if m.get("scale") not in ("region", "local"):
            out.append(finding("map_scale_unknown", "hard", f"map {m.get('id')}: scale must be region or local"))
        if not project.plan_chapter(m.get("chapter", -1)) and int(m.get("chapter", -1)) != 0:
            out.append(finding("map_chapter_unknown", "hard", f"map {m.get('id')}: chapter {m.get('chapter')} is not in the plan"))
    return out


# ── drawing ──────────────────────────────────────────────────────────────────

class View:
    """Equirectangular, scaled by the cosine of the middle latitude: true enough at these scales."""

    def __init__(self, s, w, n, e):
        self.s, self.w, self.n, self.e = s, w, n, e
        self.k = math.cos(math.radians((s + n) / 2))
        span_x, span_y = (e - w) * self.k, n - s
        self.scale = min(W / span_x, H / span_y)
        self.ox = (W - span_x * self.scale) / 2
        self.oy = (H - span_y * self.scale) / 2

    def xy(self, lon, lat):
        return self.ox + (lon - self.w) * self.k * self.scale, self.oy + (self.n - lat) * self.scale

    def path(self, pts, close=False):
        out = []
        for i, (lon, lat) in enumerate(pts):
            x, y = self.xy(lon, lat)
            out.append(("M" if i == 0 else "L") + f"{x:.1f} {y:.1f}")
        return "".join(out) + ("Z" if close else "")


def fit_box(points, min_lat_span, aspect=W / H, pad=0.25):
    lats = [p[1] for p in points]
    lons = [p[0] for p in points]
    s, n, w, e = min(lats), max(lats), min(lons), max(lons)
    k = math.cos(math.radians((s + n) / 2))
    lat_span = max((n - s) * (1 + 2 * pad), min_lat_span)
    lon_span = max((e - w) * (1 + 2 * pad), lat_span * aspect / k)
    lat_span = max(lat_span, lon_span * k / aspect)
    cy, cx = (s + n) / 2, (w + e) / 2
    return cy - lat_span / 2, cx - lon_span / 2, cy + lat_span / 2, cx + lon_span / 2


def rings(geom):
    t, c = geom.get("type"), geom.get("coordinates") or []
    if t == "Polygon":
        return c
    if t == "MultiPolygon":
        return [r for poly in c for r in poly]
    if t == "LineString":
        return [c]
    if t == "MultiLineString":
        return c
    return []


def in_box(ring, s, w, n, e, margin=1.0):
    return any(w - margin <= x <= e + margin and s - margin <= y <= n + margin for x, y in ring[:: max(1, len(ring) // 50)] + ring[-1:])


def label(x, y, text, size=13, fill=LABEL, weight=500, anchor="middle"):
    t = escape(text)
    common = f'x="{x:.1f}" y="{y:.1f}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}"'
    return (f'<text {common} stroke="{HALO}" stroke-opacity=".9" stroke-width="3.5" stroke-linejoin="round" fill="none">{t}</text>'
            f'<text {common} fill="{fill}">{t}</text>')


def pin(x, y):
    return (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="{PIN}" stroke="{HALO}" stroke-opacity=".85" stroke-width="2.2"/>'
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="11" fill="none" stroke="{PIN}" stroke-opacity=".5" stroke-width="1.5"/>')


def svg(parts, title, credit):
    parts = parts + [label(W - 12, H - 12, credit, size=11, fill=DIM, weight=400, anchor="end")]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img">'
            f'<title>{escape(title)}</title><g font-family="{FONT}" dominant-baseline="central">' + "".join(parts) + "</g></svg>\n")


class Labels:
    """Boxes already taken on the map, so no label lands on another or on a pin."""

    def __init__(self):
        self.boxes = []

    @staticmethod
    def box(x, y, text, size, anchor="middle"):
        w = 0.56 * size * len(text) + 6
        x0 = x - w / 2 if anchor == "middle" else (x - w if anchor == "end" else x)
        return (x0, y - size * 0.7, x0 + w, y + size * 0.7)

    def free(self, b):
        inside = 4 <= b[0] and b[2] <= W - 4 and 4 <= b[1] and b[3] <= H - 24
        return inside and not any(b[0] < o[2] and o[0] < b[2] and b[1] < o[3] and o[1] < b[3] for o in self.boxes)

    def take(self, b):
        self.boxes.append(b)

    def place(self, x, y, text, size, **kw):
        """The label at (x, y) if the space is free, else nothing."""
        b = self.box(x, y, text, size, kw.get("anchor", "middle"))
        if not self.free(b):
            return ""
        self.take(b)
        return label(x, y, text, size=size, **kw)


def plain(s):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD", s or "") if not unicodedata.combining(c)).lower()


def place_labels(view, pts, taken):
    """Each place: its pin, its name, and its name today, at the first of four positions where both
    lines fit; the pins are reserved first so no label covers one."""
    out = []
    xy = [view.xy(p["lon"], p["lat"]) for p in pts]
    for x, y in xy:
        taken.take((x - 13, y - 13, x + 13, y + 13))
        out.append(pin(x, y))
    for p, (x, y) in zip(pts, xy):
        today = p.get("today") if p.get("today") and plain(p["today"]) != plain(p["name"]) else ""
        for dx, dy, anchor in ((0, -1, "middle"), (0, 1, "middle"), (1, 0, "start"), (-1, 0, "end")):
            if dy:
                ny, ty = (y - 26, y - 44) if dy < 0 else (y + 24, y + 41)
                name_at, today_at = (x, ny), (x, ty if today else None)
                if dy < 0 and today:                        # above: the name nearest the pin, today above it
                    name_at, today_at = (x, y - 26), (x, y - 43)
            else:
                nx = x + 18 * dx
                name_at, today_at = (nx, y - (8 if today else 0)), (nx, y + 10 if today else None)
            boxes = [taken.box(*name_at, p["name"], 15, anchor)]
            if today:
                boxes.append(taken.box(today_at[0], today_at[1], today, 12, anchor))
            if all(taken.free(b) for b in boxes):
                for b in boxes:
                    taken.take(b)
                out.append(label(*name_at, p["name"], size=15, fill="#e8ece6", weight=600, anchor=anchor))
                if today:
                    out.append(label(today_at[0], today_at[1], today, size=12, fill=DIM, weight=400, anchor=anchor))
                break
        else:                                              # nowhere free: the name alone, above, over whatever is there
            out.append(label(x, y - 26, p["name"], size=15, fill="#e8ece6", weight=600))
    return out


def draw_region(project, m, pts):
    s, w, n, e = fit_box([(p["lon"], p["lat"]) for p in pts], m.get("minLatSpan", 7.5))
    v = View(s, w, n, e)
    parts = [f'<rect width="{W}" height="{H}" fill="{SEA}"/>']
    countries = natural_earth(project, "countries")["features"]
    land, names = [], []
    for f in countries:
        rs = [r for r in rings(f.get("geometry") or {}) if in_box(r, s, w, n, e, 4)]
        if not rs:
            continue
        land.append("".join(v.path(r, True) for r in rs))
        props = f.get("properties") or {}
        lx, ly = props.get("LABEL_X"), props.get("LABEL_Y")
        if lx is not None and w + 0.5 < lx < e - 0.5 and s + 0.4 < ly < n - 0.4:
            names.append((lx, ly, props.get("NAME_EN") or props.get("NAME") or ""))
    parts.append(f'<path fill="{LAND}" stroke="{BORDER}" stroke-width="1.1" stroke-linejoin="round" d="{"".join(land)}"/>')
    rivers = [f for f in natural_earth(project, "rivers")["features"] if (f.get("properties") or {}).get("featurecla", "").startswith("River")]
    rd = "".join(v.path(r) for f in rivers for r in rings(f.get("geometry") or {}) if in_box(r, s, w, n, e, 1))
    if rd:
        parts.append(f'<path fill="none" stroke="{RIVER}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="{rd}"/>')
    taken = Labels()
    labels = place_labels(v, pts, taken)
    for lx, ly, name in names:
        x, y = v.xy(lx, ly)
        parts.append(taken.place(x, y, name.upper(), 12, fill=DIM, weight=400))
    parts += labels
    return svg(parts, m.get("title") or "", CREDIT["region"])


def draw_local(project, m, center, pts):
    km = float(m.get("spanKm", 8))
    dlat = km / 111.0
    dlon = dlat * (W / H) / math.cos(math.radians(center["lat"]))
    s, n = center["lat"] - dlat / 2, center["lat"] + dlat / 2
    w, e = center["lon"] - dlon / 2, center["lon"] + dlon / 2
    v = View(s, w, n, e)
    data = overpass(project, s, w, n, e)
    parts = [f'<rect width="{W}" height="{H}" fill="{BG}"/>']
    els = data.get("elements") or []
    geom = [e_ for e_ in els if e_.get("type") == "way" and e_.get("geometry")]

    def pts_of(x):
        return [(g["lon"], g["lat"]) for g in x["geometry"]]
    woods = "".join(v.path(pts_of(x), True) for x in geom if (x.get("tags") or {}).get("landuse") == "forest"
                    or (x.get("tags") or {}).get("natural") == "wood")
    if woods:
        parts.append(f'<path fill="{WOOD}" d="{woods}"/>')
    water = "".join(v.path(pts_of(x), True) for x in geom if (x.get("tags") or {}).get("natural") == "water")
    if water:
        parts.append(f'<path fill="{WATER}" d="{water}"/>')
    for kind, colour, width in (("stream", WATER, 1.6), ("canal", WATER, 2.4), ("river", WATER, 3.6)):
        d = "".join(v.path(pts_of(x)) for x in geom if (x.get("tags") or {}).get("waterway") == kind)
        if d:
            parts.append(f'<path fill="none" stroke="{colour}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round" d="{d}"/>')
    rail = "".join(v.path(pts_of(x)) for x in geom if (x.get("tags") or {}).get("railway") == "rail")
    if rail:
        parts.append(f'<path fill="none" stroke="{RAIL}" stroke-width="1.6" stroke-dasharray="5 4" d="{rail}"/>')
    for classes, colour, width in ((("unclassified", "tertiary"), ROAD3, 1.4), (("secondary",), ROAD2, 2.2),
                                   (("primary", "trunk", "motorway"), ROAD1, 3.0)):
        d = "".join(v.path(pts_of(x)) for x in geom if (x.get("tags") or {}).get("highway") in classes)
        if d:
            parts.append(f'<path fill="none" stroke="{colour}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round" d="{d}"/>')
    # Rivers named, once each, at the middle of their longest stretch inside the frame.
    taken = Labels()
    labels = place_labels(v, pts, taken)
    named = {}
    for x in geom:
        tags = x.get("tags") or {}
        if tags.get("waterway") == "river" and tags.get("name"):
            q = [v.xy(*p) for p in pts_of(x)]
            q = [p for p in q if 30 < p[0] < W - 30 and 30 < p[1] < H - 40]
            if len(q) > len(named.get(tags["name"], [])):
                named[tags["name"]] = q
    for name, q in named.items():
        if len(q) >= 4:
            for k in (len(q) // 2, len(q) // 3, 2 * len(q) // 3):
                x, y = q[k]
                got = taken.place(x, y + 14, name, 12, fill="#6f9fb0", weight=500)
                if got:
                    parts.append(got)
                    break
    pinned = {(round(p["lat"], 3), round(p["lon"], 3)) for p in pts}
    order = {"town": 0, "village": 1, "hamlet": 2}
    nodes = sorted((x for x in els if x.get("type") == "node" and (x.get("tags") or {}).get("name")),
                   key=lambda x: order.get((x.get("tags") or {}).get("place"), 3))
    for x in nodes:
        tags = x.get("tags") or {}
        if (round(x["lat"], 3), round(x["lon"], 3)) in pinned or tags.get("place") == "hamlet":
            continue
        px, py = v.xy(x["lon"], x["lat"])
        size = 13 if tags.get("place") == "town" else 12
        got = taken.place(px, py - 13, tags["name"], size, fill=LABEL, weight=400)
        if got:
            parts.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="2.4" fill="{DIM}"/>')
            parts.append(got)
    parts += labels
    return svg(parts, m.get("title") or "", CREDIT["local"])


def osm_link(lat, lon, zoom):
    return f"https://www.openstreetmap.org/?mlat={lat:.5f}&mlon={lon:.5f}#map={zoom}/{lat:.5f}/{lon:.5f}"


def caption(m, pts):
    listing = "; ".join(f"{p['name']}, today {p['today']}" if p.get("today") and p["today"] != p["name"] else p["name"]
                        for p in pts)
    return f"{m.get('title') or 'Where it happened'}: {listing}"


def cmd_render(project):
    known = places(project)
    wanted = maps_wanted(project)
    if not wanted:
        print("plan.json has no `maps`")
        return 0
    rows = {r["id"]: r for r in load_json(project.path("images", "maps", "index.json"), []) or []}
    os.makedirs(project.path("images", "maps"), exist_ok=True)
    problems = 0
    for m in wanted:
        pts = [known[i] for i in m.get("places") or [] if i in known and known[i].get("lat") is not None]
        if not pts:
            print(f"{m.get('id')}: none of its places is pinned; run geomap.py geocode")
            problems += 1
            continue
        if m.get("scale") == "local":
            center = known.get(m.get("center")) or pts[0]
            body, zoom = draw_local(project, m, center, pts), 13
        else:
            center = {"lat": sum(p["lat"] for p in pts) / len(pts), "lon": sum(p["lon"] for p in pts) / len(pts)}
            body, zoom = draw_region(project, m, pts), 6
        rel = os.path.join("images", "maps", f"{m['id']}.svg")
        with open(project.path(rel), "w", encoding="utf-8") as fh:
            fh.write(body)
        names = sorted({n for p in pts for n in [p.get("name")] + list(p.get("aliases") or []) if n}, key=len, reverse=True)
        rows[m["id"]] = {"id": m["id"], "kind": "geo", "scale": m.get("scale"), "name": caption(m, pts), "address": "",
                         "neighborhood": "", "names": names, "chapter": int(m.get("chapter", 0)),
                         "lat": round(center["lat"], 5), "lon": round(center["lon"], 5), "file": rel,
                         "url": osm_link(center["lat"], center["lon"], zoom), "label": "OpenStreetMap",
                         "credit": CREDIT[m.get("scale", "region")],
                         "renderedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")}
        print(f"{m['id']}  ({m.get('scale')}) {len(body) // 1024} KB → {rel}  · chapter {m.get('chapter')}")
    save_json(project.path("images", "maps", "index.json"), [rows[k] for k in sorted(rows)])
    return 1 if problems else 0


def cmd_list(project):
    for p in places(project).values():
        at = f"{p['lat']}, {p['lon']}" if p.get("lat") is not None else "NOT PINNED"
        print(f"{p['id']}: {p.get('name')} — today {p.get('today')} — {at}")
    for m in maps_wanted(project):
        print(f"map {m.get('id')} ({m.get('scale')}, chapter {m.get('chapter')}): {', '.join(m.get('places') or [])}")
    return 0


def main(argv):
    if len(argv) >= 3 and argv[1] in ("geocode", "render", "check", "list"):
        project = Project(argv[2])
        if argv[1] == "geocode":
            return cmd_geocode(project)
        if argv[1] == "render":
            return cmd_render(project)
        if argv[1] == "list":
            return cmd_list(project)
        return report("places", place_findings(project))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
