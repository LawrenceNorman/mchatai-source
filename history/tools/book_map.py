#!/usr/bin/env python3
"""The book's places map: the places the landed stories name, pinned where the record allows.

Lawrence, 2026-10-08, looking at the Black Seattle book: "a map view (much like what we have for
seattle-landmarks) but with a places POI map that relates to each person. So we have the timeline
but also the POI that can be explored."

A place comes from a chapter's own words, read by the long list's place reader (survey.place_lens,
every sentence taken as set in the book's place unless it names somewhere else): a designated
landmark, a street address, a street corner, a named building a sentence puts someone at, or a
street. Only the first three get a pin, and each says what it rests on:
- a landmark: the landmark guide's own point;
- a corner: where the two streets cross on the guide's basemap (no lookup);
- an address: OpenStreetMap's geocoder (Nominatim), asked once by `geocode` and kept in
  stories/.cache/geocode.json, so a build never touches the network. Seattle has renamed and
  renumbered streets since many of these addresses were written, so a pin marks where the address
  is today, and the page says so.
- a park or a cemetery: found by its name the same way, since those stay put.
Any other named place gets no pin: an old name often belongs to a building that moved or is gone (the
University of Washington left downtown in 1895). A street is a line, not a point. Both stay in the
list under the map.

Each pin also carries pictures of the place, as it was or is (the author, 2026-10-08: "we really need
some photos of the place to come up so we can see the place as it was or is"):
- the stories' own pictures whose checked captions name it (its name, or its address);
- free photographs on Wikimedia Commons, asked once by `photos`: taken within a short distance of the
  pin or found by its name, with a licence the book may use, and a TITLE that names the place (or,
  for an address, its number and street). A title that only names a nearby street, an event or a
  neighbouring building is not a picture of the place. Kept in stories/.cache/place-photos.json with
  small copies beside it, so a build never touches the network.

    book_map.py geocode <stories-dir> <series-id> [--files]   look up addresses not yet in the cache
    book_map.py photos <stories-dir> <series-id> [--files]    look up Commons photographs of each place
    book_map.py list <stories-dir> <series-id> [--files]      every place: its pin, or why it has none
"""
import datetime
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import load_json, save_json  # noqa: E402
import cite  # noqa: E402
import maps  # noqa: E402
import survey  # noqa: E402

NOMINATIM = "https://nominatim.openstreetmap.org/search"
BOX = (47.48, -122.46, 47.74, -122.22)        # Seattle, roughly: south, west, north, east
M_PER_UNIT = 6371000 * math.cos(math.radians(47.6))   # a mercator unit in metres, near Seattle
ONE_PLACE = 250                               # metres: crossings or answers this close are one place
DIRS = {"n", "s", "e", "w", "ne", "nw", "se", "sw", "north", "south", "east", "west",
        "northeast", "northwest", "southeast", "southwest"}
ABBR = {"avenue": "ave", "av": "ave", "street": "st", "boulevard": "blvd", "place": "pl", "road": "rd",
        "drive": "dr", "court": "ct", "terrace": "ter", "lane": "ln"}
SUFFIX = set(ABBR.values()) | {"way"}
STAYS_PUT = re.compile(r"\b(?:Park|Playfield|Cemetery)$")   # a name the geocoder may place
ORDINAL = {"first": "1st", "second": "2nd", "third": "3rd", "fourth": "4th", "fifth": "5th", "sixth": "6th",
           "seventh": "7th", "eighth": "8th", "ninth": "9th", "tenth": "10th", "eleventh": "11th",
           "twelfth": "12th"}
_MATCHERS = None


# ── reading the chapters ────────────────────────────────────────────────────

def chapter_places(text, place, lens=None, born=None, died=None):
    """The places one chapter's plain text names, each with its sentence (survey.place_lens)."""
    global _MATCHERS
    if _MATCHERS is None:
        _MATCHERS = cite.landmark_patterns()
    lens = lens or {}
    paras = [p.strip() for p in re.split(r"\n\s*\n", text or "") if p.strip()]
    got = survey.place_lens(paras, [place], lens.get("areaTerms") or [], lens.get("elsewhereTerms") or [],
                            _MATCHERS, None, start_here=True, born=born, died=died)
    return [{k: v for k, v in p.items() if k != "url"} for p in got["places"]]


# ── streets and corners ─────────────────────────────────────────────────────

def street_base(name):
    """'29th Avenue', 'E. John Street', '29th Ave E' → '29th ave', 'john st': the name without its quarter."""
    words = re.sub(r"[^\w\s]", " ", (name or "").lower()).split()
    return " ".join(ORDINAL.get(w, ABBR.get(w, w)) for w in words if w not in DIRS)


def quarter(name):
    """The city quarter a street name carries ('E', 'S', 'NW'…), or '' for none."""
    words = re.sub(r"[^\w\s]", " ", (name or "").lower()).split()
    full = {"north": "n", "south": "s", "east": "e", "west": "w", "northeast": "ne", "northwest": "nw",
            "southeast": "se", "southwest": "sw"}
    return " ".join(sorted(full.get(w, w) for w in words if w in DIRS))


def same_street(text_base, map_base):
    """'john st' is 'john st'; a bare 'madison' (as in '23rd and Madison') is 'madison st'."""
    if text_base == map_base:
        return True
    t, m = text_base.split(), map_base.split()
    return bool(t) and t[-1] not in SUFFIX and len(m) > 1 and m[-1] in SUFFIX and m[:-1] == t


class Streets:
    """The basemap's named streets, for finding where two of them cross."""

    def __init__(self, geo):
        self.by = {}
        for t in geo.get("streets", []):
            if t.get("n"):
                pts = maps.unpack(t["g"])
                xs, ys = [p[0] for p in pts], [p[1] for p in pts]
                self.by.setdefault(street_base(t["n"]), []).append((pts, (min(xs), min(ys), max(xs), max(ys))))

    def named(self, text):
        base = street_base(text)
        return [line for b, lines in self.by.items() if same_street(base, b) for line in lines]


def cross(p1, p2, q1, q2):
    d = (p2[0] - p1[0]) * (q2[1] - q1[1]) - (p2[1] - p1[1]) * (q2[0] - q1[0])
    if d == 0:
        return None
    t = ((q1[0] - p1[0]) * (q2[1] - q1[1]) - (q1[1] - p1[1]) * (q2[0] - q1[0])) / d
    u = ((q1[0] - p1[0]) * (p2[1] - p1[1]) - (q1[1] - p1[1]) * (p2[0] - p1[0])) / d
    if -1e-9 <= t <= 1 + 1e-9 and -1e-9 <= u <= 1 + 1e-9:
        return (p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1]))
    return None


def gap(pt, a, b):
    """Distance from pt to segment a–b, and the nearest point on it."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    n = dx * dx + dy * dy
    t = 0 if n == 0 else max(0.0, min(1.0, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / n))
    q = (a[0] + t * dx, a[1] + t * dy)
    return math.hypot(pt[0] - q[0], pt[1] - q[1]), q


def groups(points, radius):
    out = []
    for p in points:
        home = [g for g in out if any(math.hypot(p[0] - q[0], p[1] - q[1]) <= radius for q in g)]
        merged = [p] + [q for g in home for q in g]
        out = [g for g in out if g not in home] + [merged]
    return out


def latlon(x, y):
    return round(math.degrees(2 * math.atan(math.exp(y)) - math.pi / 2), 6), round(math.degrees(x), 6)


def corner(streets, text):
    """Where the two streets of 'Xth Avenue and Y Street' cross on the basemap: ((lat, lon), None) or (None, why)."""
    names = re.split(r"\s+(?:and|&)\s+", text, maxsplit=1)
    if len(names) != 2:
        return None, "not two streets"
    a, b = streets.named(names[0]), streets.named(names[1])
    if not a or not b:
        return None, f"no street called {(names[1] if a else names[0]).strip()} on today's map"
    near = lambda u, v, pad=0: not (u[2] + pad < v[0] or v[2] + pad < u[0] or u[3] + pad < v[1] or v[3] + pad < u[1])  # noqa: E731
    hits = []
    for p, pb in a:
        for q, qb in b:
            if not near(pb, qb):
                continue
            for i in range(len(p) - 1):
                for j in range(len(q) - 1):
                    x = cross(p[i], p[i + 1], q[j], q[j + 1])
                    if x:
                        hits.append(x)
    if not hits:                               # simplified lines can stop just short of each other
        reach = 30 / M_PER_UNIT
        for one, other in ((a, b), (b, a)):
            for p, pb in one:
                for q, qb in other:
                    if not near(pb, qb, reach):
                        continue
                    for end in (p[0], p[-1]):
                        for j in range(len(q) - 1):
                            d, at = gap(end, q[j], q[j + 1])
                            if d <= reach:
                                hits.append(at)
    if not hits:
        return None, "the two streets do not meet on today's map"
    found = groups(hits, ONE_PLACE / M_PER_UNIT)
    if len(found) > 1:
        return None, f"the two streets meet in {len(found)} places on today's map"
    g = found[0]
    return latlon(sum(h[0] for h in g) / len(g), sum(h[1] for h in g) / len(g)), None


# ── addresses ───────────────────────────────────────────────────────────────

def address_key(text):
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def query_form(address):
    """'1223 Seventh Avenue' → '1223 7th Avenue': OpenStreetMap writes the numbers."""
    return " ".join(ORDINAL.get(w.lower(), w) for w in (address or "").split())


def lookup(text, place, named=False):
    """Nominatim's answers for one street address (or a park's or cemetery's name) in the place.
    The network: `geocode` only."""
    params = ({"q": f"{text}, {place}, Washington"} if named else
              {"street": query_form(text), "city": place, "state": "Washington", "country": "United States"})
    params.update({"format": "jsonv2", "addressdetails": 1, "limit": 5})
    req = urllib.request.Request(NOMINATIM + "?" + urllib.parse.urlencode(params),
                                 headers={"User-Agent": maps.UA, "Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=30) as r:
        rows = json.loads(r.read())
    return [{"lat": float(x["lat"]), "lon": float(x["lon"]), "name": x.get("name") or "",
             "type": x.get("type") or "", "number": (x.get("address") or {}).get("house_number", ""),
             "road": (x.get("address") or {}).get("road", "")} for x in rows]


def decide(address, rows):
    """A pin from the geocoder's answers, or why not: inside the city, the same number on the same
    street in the same quarter, and one place. In Seattle the quarter is part of the address:
    1223 Seventh Avenue is downtown, 1223 7th Avenue West is on Queen Anne."""
    number, _, street = (address or "").partition(" ")
    ok = [r for r in rows if BOX[0] <= r["lat"] <= BOX[2] and BOX[1] <= r["lon"] <= BOX[3]
          and r.get("number", "").split("-")[0] == number.split("-")[0]
          and same_street(street_base(street), street_base(r.get("road", "")))
          and quarter(street) == quarter(r.get("road", ""))]
    if not ok:
        return None, "OpenStreetMap has no such address in the city today"
    pts = [(math.radians(r["lon"]), maps.merc(r["lon"], r["lat"])[1]) for r in ok]
    if len(groups(pts, ONE_PLACE / M_PER_UNIT)) > 1:
        return None, "more than one street of that name has that number today"
    return (round(ok[0]["lat"], 6), round(ok[0]["lon"], 6)), None


def decide_named(name, rows):
    """A park's or a cemetery's pin: inside the city, that kind of place, the same name, one place."""
    want = re.sub(r"^the ", "", name.lower())
    ok = [r for r in rows if BOX[0] <= r["lat"] <= BOX[2] and BOX[1] <= r["lon"] <= BOX[3]
          and r.get("type") in ("park", "cemetery", "grave_yard", "recreation_ground", "pitch", "nature_reserve")
          and re.sub(r"^the ", "", (r.get("name") or "").lower()) == want]
    if not ok:
        return None, "OpenStreetMap has no park or cemetery of that name in the city today"
    pts = [(math.radians(r["lon"]), maps.merc(r["lon"], r["lat"])[1]) for r in ok]
    if len(groups(pts, ONE_PLACE / M_PER_UNIT)) > 1:
        return None, "more than one place of that name today"
    return (round(ok[0]["lat"], 6), round(ok[0]["lon"], 6)), None


def lookups(row):
    """The cache key a place is looked up under, or None: addresses, and parks and cemeteries by name."""
    if row.get("kind") == "address":
        return address_key(row["name"])
    if row.get("kind") == "named" and STAYS_PUT.search(row["name"]):
        return "name:" + address_key(row["name"])
    return None


def cache_path(stories_dir):
    return os.path.join(stories_dir, ".cache", "geocode.json")


# ── pictures of the places ──────────────────────────────────────────────────

COMMONS = "https://commons.wikimedia.org/w/api.php"
PHOTO_RADIUS = {"landmark": 120, "named": 400, "address": 60, "corner": 60}   # metres: a cemetery is large
PHOTOS_PER_PLACE = 2
NAME_STOP = {"the", "of", "and", "a", "at", "in", "seattle", "washington", "wa", "building", "street", "st", "avenue",
             "ave", "way", "north", "south", "east", "west", "n", "s", "e", "w"}


def photo_cache_path(stories_dir):
    return os.path.join(stories_dir, ".cache", "place-photos.json")


def place_words(name):
    """The words a picture's title must carry to be of this place: 'Mount Zion Baptist Church' →
    mount, zion, baptist, church; '1st African Methodist Episcopal Church' → first, african, …"""
    words = re.sub(r"[^\w\s]", " ", (name or "").lower().replace("#", " ")).split()
    return [ORDINAL_WORD.get(w, w) for w in words if w not in NAME_STOP]


ORDINAL_WORD = {v: k for k, v in ORDINAL.items()}


def names_place(row, text):
    """Does this title (or caption) name the place itself? A landmark, park or cemetery: all its
    distinctive words, or at least three of them. An address: its number and street. A corner:
    both streets."""
    low = " " + re.sub(r"[^\w\s]", " ", (text or "").lower()) + " "
    low = re.sub(r"\b(\d+)(st|nd|rd|th)\b", lambda m: " " + (ORDINAL_WORD.get(m.group(0), m.group(0))) + " ", low)
    low = re.sub(r" mt ", " mount ", low)
    has = lambda w: f" {w} " in low  # noqa: E731
    if row["kind"] == "address":
        number, _, street = row["name"].partition(" ")
        words = place_words(street)
        return has(number.lower()) and bool(words) and all(has(w) for w in words)
    if row["kind"] == "corner":
        parts = re.split(r"\s+(?:and|&)\s+", row["name"], maxsplit=1)
        return len(parts) == 2 and all(place_words(p) and all(has(w) for w in place_words(p)) for p in parts)
    words = place_words(row["name"])
    hits = sum(has(w) for w in words)
    return bool(words) and (hits == len(words) or hits >= 3)


def leads_with(row, title):
    """A picture OF the place opens with its name ("Seattle - Mount Pleasant Cemetery - …", "Rainier Club
    exterior …"); one that names it later is of something there ("William F. Burris grave, Lake View
    Cemetery", "Lake Washington Villas, … Seward Park")."""
    norm = lambda s: [ORDINAL_WORD.get(w, "mount" if w == "mt" else w)  # noqa: E731
                      for w in re.sub(r"[^\w\s]", " ", s.lower().replace("#", " ")).split() if w != "the"]
    name = norm(row["name"])
    rest = re.sub(r"^\s*seattle\s*[-–:,]\s*", "", title, flags=re.I)
    return bool(name) and norm(rest)[:1] == name[:1]


def tidy_title(title):
    """A Commons file name as a caption: 'Mount Zion Baptist Church2 HRHP100002407 King County, WA' →
    'Mount Zion Baptist Church'; 'Seattle - Garfield High School, circa 1965 (50019290713)' →
    'Garfield High School, circa 1965'."""
    return tidy_text(os.path.splitext(title.split(":", 1)[-1])[0])


def tidy_text(t):
    """The cleaning tidy_title does, for a picture's own title (which has no file extension)."""
    t = (t or "").replace("_", " ")
    t = re.sub(r"\s*\(\d{6,}\)", "", t)                    # a Flickr id
    t = re.sub(r"\b[NH]RHP\s*\d+\b", "", t)                 # a register number
    t = re.sub(r"\bKing County,?\s*WA\b", "", t)
    t = re.sub(r"(?<=[a-z])\d+\b", "", t)                    # "Church2"
    t = re.sub(r"\s+\d{1,3}$", "", t.strip())                # "… 05"
    t = re.sub(r"^Seattle\s*[-–]\s*", "", t)
    t = re.sub(r"\s+[-–]\s+", ", ", t)
    return re.sub(r"\s{2,}", " ", t).strip(" ,-–")


def commons_query(**params):
    params.update(format="json", formatversion=2)
    req = urllib.request.Request(COMMONS + "?" + urllib.parse.urlencode(params), headers={"User-Agent": maps.UA})
    time.sleep(0.6)                            # Commons asks for an unhurried pace
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def commons_photos(row, lat, lon, cross=()):
    """Free Commons photographs of one place: near the pin or found by name, the title naming it."""
    import images
    titles = []
    geo = commons_query(action="query", list="geosearch", gscoord=f"{lat}|{lon}",
                        gsradius=PHOTO_RADIUS.get(row["kind"], 80), gsnamespace=6, gslimit=40)
    titles += [g["title"] for g in (geo.get("query") or {}).get("geosearch", [])]
    if row["kind"] in ("landmark", "named"):
        found = commons_query(action="query", list="search", srsearch=f'"{row["name"]}" Seattle', srnamespace=6, srlimit=20)
        titles += [s["title"] for s in (found.get("query") or {}).get("search", [])]
    titles = list(dict.fromkeys(titles))
    near = set()
    if row["kind"] == "address" and cross:
        # The street, then: no photograph names a house number, but many name the street and the one
        # crossing it there ("Second from Columbia, Seattle, circa 1906"). Shown as the street nearby.
        street = place_words(row["name"].partition(" ")[2])
        crowd = re.compile(r"\b(march|protest|rally|parade|festival|celebrat\w*|crowd|demonstrat\w*|poses?|portrait)\b", re.I)
        for t in titles:
            low = set(place_words(os.path.splitext(t.split(":", 1)[-1])[0]))
            if street and set(street) <= low and any(set(c) <= low for c in cross) and not crowd.search(t):
                near.add(t)
    titles = [t for t in titles if re.search(r"\.(jpe?g|png|gif|tiff?)$", t, re.I) and (t in near or (
              names_place(row, os.path.splitext(t.split(":", 1)[-1])[0])
              and (row["kind"] not in ("landmark", "named") or leads_with(row, t.split(":", 1)[-1]))))]
    if not titles:
        return []
    info = images.file_info(titles)
    out = []
    for t in titles:
        r = info.get(t)
        if not r or not r.get("allowed") or not r.get("url"):
            continue
        year = next((int(y) for y in re.findall(r"\b(1[89]\d\d|20[0-2]\d)\b", (r.get("date") or "") + " " + t)), None)
        name = (r.get("objectName") or "").strip()
        caption = tidy_text(name) if name and len(name) <= 120 and leads_with(row, name) else tidy_title(t)
        out.append({"title": t, "url": r["url"], "pageUrl": r.get("pageUrl"), "license": r.get("license"),
                    "artist": images.credit_name(r.get("artist") or ""), "year": year, "caption": caption,
                    **({"near": True} if t in near else {})})
    # The building itself before people at it, as it was before as it is.
    eventish = re.compile(r"\b(poses?|posing|with|rally|speak\w*|celebrat\w*|meeting|visit\w*|ceremony|award\w*|crowd)\b", re.I)
    out.sort(key=lambda p: (1 if eventish.search(p["title"]) else 0, 0 if (p["year"] or 9999) < 1990 else 1,
                            p["year"] or 9999))
    return out[:PHOTOS_PER_PLACE]


def load_cache(stories_dir):
    return (load_json(cache_path(stories_dir), {}) or {}).get("addresses") or {}


# ── the map ─────────────────────────────────────────────────────────────────

def locate(row, landmarks, streets, cache):
    """(lat, lon) and None, or None and why the place has no pin."""
    if row["kind"] == "landmark":
        p = landmarks.get(row["landmark"])
        return ((p["lat"], p["lon"]), None) if p else (None, "the guide has no point for it")
    if row["kind"] == "corner":
        return corner(streets, row["name"]) if streets else (None, "no basemap")
    k = lookups(row)
    if k:
        hit = cache.get(k)
        if not hit or "rows" not in hit:
            return None, "not looked up yet (book_map.py geocode)"
        return decide(row["name"], hit["rows"]) if row["kind"] == "address" else decide_named(row["name"], hit["rows"])
    if row["kind"] == "street":
        return None, "a street, not one point on it"
    return None, "a name, not an address: what it named may have moved or gone"


def map_data(stories, landmarks, streets, cache):
    """{"pins": [...], "unplaced": [...]}: each place once, with every chapter that names it."""
    rows = {}
    for s in stories:
        for n, p in s.get("mapPlaces") or []:
            lid = p.get("landmark") or ""
            k = ("landmark", lid) if lid else (p.get("kind") or "named", survey.place_key(p["name"]))
            row = rows.setdefault(k, {"name": (landmarks.get(lid) or {}).get("name") or p["name"],
                                      "kind": "landmark" if lid else (p.get("kind") or "named"),
                                      "landmark": lid, "refs": []})
            ref = [s["slug"], n, p.get("year"), (p.get("s") or "")[:300]]
            if ref not in row["refs"]:
                row["refs"].append(ref)
    pins, unplaced = [], []
    for row in sorted(rows.values(), key=lambda r: r["name"].lower()):
        at, why = locate(row, landmarks, streets, cache)
        out = {"n": row["name"], "k": row["kind"], "l": row["landmark"], "r": row["refs"]}
        if at:
            out["y"], out["x"] = at
            pins.append(out)
        else:
            out["why"] = why
            unplaced.append(out)
    return {"pins": pins, "unplaced": unplaced}


def story_photos(row, landmarks, pictures):
    """The stories' own pictures of this place: those whose checked caption names it, or (for a
    landmark) its guide address. `pictures` is [(record, published path)] from the book's build."""
    addr = (landmarks.get(row["landmark"]) or {}).get("address") if row["kind"] == "landmark" else ""
    out, seen = [], set()
    for rec, rel in pictures:
        cap = rec.get("caption") or ""
        if rel in seen or not (names_place(row, cap) or (addr and names_place({"kind": "address", "name": addr}, cap))):
            continue
        seen.add(rel)
        out.append({"src": rel, "cap": cap, "credit": credit_of(rec), "href": rec.get("pageUrl") or ""})
    return out[:PHOTOS_PER_PLACE]


def credit_of(rec):
    import images
    return images.credit_line(rec)


def attach_photos(data, landmarks, pictures, stories_dir, out):
    """Each pin's pictures: the stories' own first, then the cached Commons photographs, copied
    beside the page. Returns the published paths, for a hosted build to carry as text."""
    import shutil
    cache = load_json(photo_cache_path(stories_dir), {}) or {}
    used = []
    for pin in data["pins"]:
        row = {"name": pin["n"], "kind": pin["k"], "landmark": pin["l"]}
        photos = story_photos(row, landmarks, pictures)
        guide = (cache.get(pin_key(row)) or {}).get("guide")
        if guide and guide.get("file") and os.path.isfile(os.path.join(stories_dir, ".cache", "place-photos", guide["file"])):
            rel = f"resources/places/{guide['file']}"
            os.makedirs(os.path.join(out, "resources", "places"), exist_ok=True)
            shutil.copyfile(os.path.join(stories_dir, ".cache", "place-photos", guide["file"]), os.path.join(out, rel))
            photos.insert(0, {"src": rel, "cap": guide.get("caption", ""), "credit": guide.get("credit", ""),
                              "href": guide.get("pageUrl", "")})
        for p in (cache.get(pin_key(row)) or {}).get("photos", []):
            if len(photos) >= PHOTOS_PER_PLACE + (1 if guide else 0):
                break
            src = os.path.join(stories_dir, ".cache", "place-photos", p.get("file") or "")
            if not p.get("file") or not os.path.isfile(src):
                continue
            rel = f"resources/places/{p['file']}"
            os.makedirs(os.path.join(out, "resources", "places"), exist_ok=True)
            shutil.copyfile(src, os.path.join(out, rel))
            credit = ", ".join(x for x in (p.get("artist"), p.get("license")) if x)
            photos.append({"src": rel, "cap": ("The street nearby: " if p.get("near") else "") + p.get("caption", ""),
                           "credit": credit, "href": p.get("pageUrl") or ""})
        lot = (cache.get(pin_key(row)) or {}).get("lot")
        if lot:
            pin["lot"] = {k: v for k, v in lot.items() if k not in ("photo", "photoAsked")}
            src = os.path.join(stories_dir, ".cache", "place-photos", lot.get("photo") or "")
            if lot.get("photo") and os.path.isfile(src):
                rel = f"resources/places/{lot['photo']}"
                os.makedirs(os.path.join(out, "resources", "places"), exist_ok=True)
                shutil.copyfile(src, os.path.join(out, rel))
                lid = landmark_of_lot(lot, landmarks)
                what = (landmarks.get(lid) or {}).get("name") or lot.get("name") or "the building"
                # A landmark's own dates are the guide's: the Assessor can list only a newer building on the
                # lot (First A.M.E. Church, a 1912 landmark, reads 1988).
                when = ", a designated landmark" if lid else f", built {lot['yearBuilt']}"
                photos.append({"src": rel, "credit": "King County Assessor", "href": lot.get("page", ""),
                               "cap": (f"A building at this corner today: {what}{when}" if lot.get("corner")
                                       else f"On this lot today: {what}{when}")})
            lid = landmark_of_lot(lot, landmarks)
            if lid:                                # name it as the guide does, and link its page there
                pin["lot"]["landmark"] = lid
                pin["lot"]["name"] = (landmarks.get(lid) or {}).get("name") or pin["lot"].get("name")
        if photos:
            pin["p"] = photos
            used += [p["src"] for p in photos]
    return used


def address_form(addr):
    """'1522 14th Ave' and '1522 14Th Ave' alike: the number, the street without its suffix words, the quarter."""
    number, _, street = (addr or "").strip().partition(" ")
    return (number.lower(), tuple(w for w in place_words(street) if w not in SUFFIX), quarter(street))


def is_landmark_lot(lot, landmarks):
    """Is the building on this lot a designated landmark? Its Assessor site address is a landmark's
    address in the guide (First A.M.E. Church: 1522 14th Ave)."""
    return bool(landmark_of_lot(lot, landmarks))


def landmark_of_lot(lot, landmarks):
    """The landmark id whose guide address is this lot's site address (number and street; the quarter
    can differ: the Assessor writes 1522 14th Ave E, the guide 1522 14th Ave), or None."""
    site = address_form(lot.get("site"))
    if not site[0] or not site[1]:
        return None
    return next((lid for lid, p in landmarks.items()
                 if p.get("address") and address_form(p.get("address"))[:2] == site[:2]), None)


def pin_key(row):
    return ("landmark:" + row["landmark"]) if row.get("landmark") else f"{row['kind']}:{survey.place_key(row['name'])}"


def build(stories, project, out, problems):
    """The page's map data, and the guide's basemap copied beside the page; None with no basemap."""
    try:
        geo, _ = maps.basemap(project)
    except (SystemExit, OSError, ValueError) as e:
        problems.append(f"the places map has no basemap: {e}")
        return None
    with open(os.path.join(out, "resources", "basemap.json"), "w", encoding="utf-8") as fh:
        json.dump(geo, fh, separators=(",", ":"))
    landmarks = maps.places()
    data = map_data(stories, landmarks, Streets(geo), load_cache(os.path.dirname(project.root)))
    pictures = [pic for s in stories for pic in s.get("mapPictures") or []]
    data["_photosUsed"] = attach_photos(data, landmarks, pictures, os.path.dirname(project.root), out)
    cfg = maps.config()
    data.update({"basemap": "resources/basemap.json", "credit": cfg.get("credit") or "",
                 "hoods": {k: v for k, v in (cfg.get("hoodNames") or {}).items() if not k.startswith("_")}})
    return data


# ── the commands ────────────────────────────────────────────────────────────

def book_places(stories_dir, series_id, use_files):
    """[(story slug, [(chapter, place)])] for the landed stories, read as the book reads them."""
    import series_book as sb
    entry, place = sb.series_entry(series_id)
    lens = (entry or {}).get("survey") or {}
    projects = sb.landed_projects(stories_dir, series_id)
    shim = None if use_files or not projects else sb.find_shim(projects[0])
    out = []
    for project in projects:
        parts, origin, _ = sb.story_parts(project, shim, use_files or not shim)
        if parts is None:
            print(f"  {os.path.basename(project.root)}: {origin}")
            continue
        life = (project.dossier or {}).get("lifespan") or {}
        born, died = sb.year_of(life.get("born")), sb.year_of(life.get("died"))
        found, chapters, intro = [], 0, False
        for p in parts:                        # numbered as the book numbers them: the introduction 0
            if p["kind"] not in ("intro", "chapter"):
                continue
            text = sb.split_title_block(p["text"])[0] if p["kind"] == "intro" else p["text"]
            if p["kind"] == "intro" and not intro:
                intro, n = True, 0
            else:
                chapters += 1
                n = chapters
            found += [(n, x) for x in chapter_places(sb.plain(text), place, lens, born, died)]
        out.append((os.path.basename(project.root), found))
    return out, projects


def cmd_geocode(stories_dir, series_id, use_files):
    import series_book as sb
    _, place = sb.series_entry(series_id)
    path = cache_path(stories_dir)
    cache = load_json(path, {}) or {}
    addrs = cache.setdefault("addresses", {})
    cache["_comment"] = ("book_map.py: OpenStreetMap Nominatim's answers for the street addresses the book's "
                         "chapters name. Asked once, 1 request a second; a build reads only this file.")
    todo = sorted({(lookups(p), p["name"], p["kind"]) for _, found in book_places(stories_dir, series_id, use_files)[0]
                   for _, p in found if lookups(p) and lookups(p) not in addrs})
    for i, (k, a, kind) in enumerate(todo):
        if i:
            time.sleep(1.1)                    # Nominatim's usage policy: one request a second at most
        try:
            addrs[k] = {"q": a, "at": datetime.date.today().isoformat(), "rows": lookup(a, place, kind != "address")}
        except (OSError, ValueError) as e:
            print(f"  {a}: {type(e).__name__} (try again later)")
            continue
        at, why = (decide if kind == "address" else decide_named)(a, addrs[k]["rows"])
        print(f"  {a}: {at if at else why}")
    save_json(path, cache)
    print(f"{len(todo)} looked up, {len(addrs)} in {path}")
    return 0


def cmd_photos(stories_dir, series_id, use_files):
    """Commons photographs of each pinned place, looked up once (one request every 0.6 s)."""
    found, projects = book_places(stories_dir, series_id, use_files)
    if not projects:
        print("no landed stories")
        return 2
    geo, _ = maps.basemap(projects[0])
    streets = Streets(geo)
    data = map_data([{"slug": slug, "mapPlaces": places} for slug, places in found], maps.places(), streets,
                    load_cache(stories_dir))
    path = photo_cache_path(stories_dir)
    cache = load_json(path, {}) or {}
    cache["_comment"] = ("book_map.py photos: free Commons photographs of each pinned place, the title naming it. "
                         "Small copies in place-photos/; a build reads only these.")
    folder = os.path.join(stories_dir, ".cache", "place-photos")
    os.makedirs(folder, exist_ok=True)
    asked = 0
    for pin in data["pins"]:
        row = {"name": pin["n"], "kind": pin["k"], "landmark": pin["l"]}
        k = pin_key(row)
        if row["kind"] == "landmark" and k in cache and "guide" not in cache[k]:
            cache[k]["guide"] = guide_photo(row, folder)
        if row["kind"] == "address" and k in cache and not (cache[k].get("lot") or {}).get("photoAsked"):
            cache[k]["lot"] = lot_record(pin["y"], pin["x"], folder=folder)
            if cache[k]["lot"]:
                cache[k]["lot"]["photoAsked"] = True
        if row["kind"] == "corner" and k in cache and "lot" not in cache[k]:
            cache[k]["lot"] = corner_lot(pin["y"], pin["x"], [r[3] for r in pin["r"]], folder)
        if k in cache and not (row["kind"] == "address" and not cache[k].get("nearAsked")):
            continue
        if k in cache:                             # an address asked before the street-nearby rule: ask again
            del cache[k]
        try:
            photos = commons_photos(row, pin["y"], pin["x"], cross_streets(streets, row, pin["y"], pin["x"]))
        except (OSError, ValueError) as e:
            print(f"  {pin['n']}: {type(e).__name__} (try again later)")
            continue
        asked += 1
        for p in photos:
            name = re.sub(r"[^\w.-]+", "_", p["title"].split(":", 1)[-1])[:90]
            name = os.path.splitext(name)[0] + ".jpg"
            try:
                thumb = p["url"]
                req = urllib.request.Request(thumb, headers={"User-Agent": maps.UA})
                with urllib.request.urlopen(req, timeout=60) as r:
                    raw = r.read(8_000_000)
                if not is_image(raw):
                    print(f"    {p['title']}: the answer was not an image; left out")
                    continue
                with open(os.path.join(folder, name + ".orig"), "wb") as fh:
                    fh.write(raw)
                import series_book as sb
                sb.shrink(os.path.join(folder, name + ".orig"), os.path.join(folder, name), PLACE_PHOTO_BOX, 62)
                os.remove(os.path.join(folder, name + ".orig"))
                p["file"] = name
            except (OSError, ValueError) as e:
                print(f"    {p['title']}: not copied ({type(e).__name__})")
        cache[k] = {"place": pin["n"], "at": datetime.date.today().isoformat(), "photos": photos}
        if row["kind"] == "landmark":
            cache[k]["guide"] = guide_photo(row, folder)
        if row["kind"] == "address":
            cache[k]["nearAsked"] = True
            cache[k]["lot"] = lot_record(pin["y"], pin["x"], folder=folder)
            if cache[k]["lot"]:
                cache[k]["lot"]["photoAsked"] = True
        if row["kind"] == "corner":
            cache[k]["lot"] = corner_lot(pin["y"], pin["x"], [r[3] for r in pin["r"]], folder)
        print(f"  {pin['n']}: " + ("; ".join(f"{p['caption'][:60]} ({p.get('license')})" for p in photos) or "none"))
    save_json(path, cache)
    print(f"{asked} places asked, {len(cache) - 1} in {path}")
    return 0


PLACE_PHOTO_BOX = (520, 400)


def cross_streets(streets, row, lat, lon, radius=70):
    """The names of the streets that pass within `radius` metres of an address's pin, other than its
    own: the cross street a photograph of the block would name ("Second from Columbia")."""
    if row["kind"] != "address" or not streets:
        return []
    own = street_base(row["name"].partition(" ")[2])
    x, y = math.radians(lon), maps.merc(lon, lat)[1]
    reach = radius / M_PER_UNIT
    out = []
    for base, lines in streets.by.items():
        if same_street(own, base) or base in out:
            continue
        for pts, bb in lines:
            if bb[0] - reach > x or bb[2] + reach < x or bb[1] - reach > y or bb[3] + reach < y:
                continue
            if any(gap((x, y), pts[j], pts[j + 1])[0] <= reach for j in range(len(pts) - 1)):
                out.append(base)
                break
    return [[w for w in place_words(b) if w not in SUFFIX] for b in out]


ASSESSOR = "https://blue.kingcounty.com/Assessor/eRealProperty/"


def parcels_at(lat, lon, reach=0):
    """King County parcel numbers at a point, or within `reach` metres of it (a corner's four lots)."""
    params = {"geometry": f"{lon},{lat}", "geometryType": "esriGeometryPoint", "inSR": 4326,
              "spatialRel": "esriSpatialRelIntersects", "outFields": "PIN", "returnGeometry": "false", "f": "json"}
    if reach:
        params.update({"distance": reach, "units": "esriSRUnit_Meter"})
    req = urllib.request.Request("https://gismaps.kingcounty.gov/arcgis/rest/services/Property/KingCo_Parcels/"
                                 "MapServer/0/query?" + urllib.parse.urlencode(params), headers={"User-Agent": maps.UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return [f["attributes"]["PIN"] for f in json.loads(r.read()).get("features") or []]


def lot_record(lat, lon, pin=None, folder=None):
    """What stands on a lot today, from the King County Assessor: its parcel, name, year built and the
    Assessor's own photograph of it. The author, 2026-10-09, of 214 Columbia Street: "was this building
    leveled?", and "every pin ideally would have a photo". """
    try:
        pin = pin or (parcels_at(lat, lon) or [None])[0]
        if not pin:
            return None
        page = f"{ASSESSOR}Detail.aspx?ParcelNbr={pin}"
        time.sleep(1.0)
        with urllib.request.urlopen(urllib.request.Request(page, headers={"User-Agent": maps.UA}), timeout=40) as r:
            text = r.read().decode("utf-8", "replace")
    except (OSError, ValueError, KeyError) as e:
        print(f"    the lot was not looked up ({type(e).__name__})")
        return None
    found = parse_lot(text)
    if not found:
        return None
    rec = {"parcel": pin, "page": page, **found}
    media = re.search(r'src="(MediaHandler\.aspx\?Media=\d+)"', text)
    if media and folder:
        try:
            time.sleep(1.0)
            req = urllib.request.Request(ASSESSOR + media.group(1), headers={"User-Agent": maps.UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read(8_000_000)
            if is_image(data):
                name = f"lot-{pin}.jpg"
                with open(os.path.join(folder, name + ".orig"), "wb") as fh:
                    fh.write(data)
                import series_book as sb
                sb.shrink(os.path.join(folder, name + ".orig"), os.path.join(folder, name), PLACE_PHOTO_BOX, 62)
                os.remove(os.path.join(folder, name + ".orig"))
                rec["photo"] = name
        except (OSError, ValueError):
            pass
    return rec


def corner_lot(lat, lon, sentences, folder):
    """The lot at a corner the chapters mean: of the lots within 30 metres of the crossing, the one whose
    name shares a word with what the chapters say happened there ("the YMCA's Service Men's Club at
    23rd Avenue and Olive Street"), else the oldest building there."""
    try:
        pins = parcels_at(lat, lon, reach=30)[:6]
    except (OSError, ValueError, KeyError):
        return None
    lots = [x for x in (lot_record(lat, lon, pin=p) for p in pins) if x]
    if not lots:
        return None
    said = set(re.findall(r"[a-z]{3,}", " ".join(sentences).lower())) - {"the", "and", "avenue", "street", "seattle", "was", "for"}
    named = [x for x in lots if said & set(re.findall(r"[a-z]{3,}", (x.get("name") or "").lower()))]
    pick = (named or sorted(lots, key=lambda x: x["yearBuilt"]))[0]
    full = lot_record(lat, lon, pin=pick["parcel"], folder=folder)
    if full:
        full["corner"] = True
    return full


def parse_lot(page_html):
    """{yearBuilt, name, site} from an eRealProperty page; a lot with no property name has name ""."""
    import html as _html
    text = re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", " ", page_html)))
    get = lambda label, pat: (re.search(re.escape(label) + r"\s+" + pat, text) or [None, None])[1]  # noqa: E731
    # A lot can hold several buildings, each with its own "Year Built": the oldest says how long the
    # lot has looked as it does (First A.M.E. Church's lot lists a 1988 building first).
    years = [int(y) for y in re.findall(r"Year Built\s+(\d{4})", text)]
    name = (get("Property Name", r"(.*?)\s*Jurisdiction\b") or "").strip()
    site = get("Site Address", r"(.+?)\s+\d{5}\b")
    if not years:
        return None
    return {"yearBuilt": min(years), "name": name.title(), "site": (site or "").strip().title()}


def is_image(data):
    """JPEG, PNG, GIF or WebP by their opening bytes: a site that turns a script away answers with a
    web page, and a web page saved as .jpg reached a deploy (2026-10-09, seattle.gov)."""
    return data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n" or data[:6] in (b"GIF87a", b"GIF89a") \
        or (data[:4] == b"RIFF" and data[8:12] == b"WEBP")


_GUIDE = None


def guide_images():
    """{landmark id: (data: URI, credit)}: the landmark guide's own 256-pixel photographs, from its
    published files (resources/n/<k>.json), the same pictures its pages show."""
    global _GUIDE
    if _GUIDE is None:
        _GUIDE = {}
        base = ((maps.links_config() or {}).get("url") or "").split("#")[0]
        for k in range(64):
            try:
                req = urllib.request.Request(f"{base}resources/n/{k}.json", headers={"User-Agent": maps.UA})
                with urllib.request.urlopen(req, timeout=60) as r:
                    chunk = json.loads(r.read())
            except (OSError, ValueError):
                break
            for lid, x in chunk.items():
                pc = x.get("pc") or {}
                credit = ", ".join(v for v in (pc.get("short") or pc.get("by"), pc.get("lic")) if v)
                if x.get("im"):
                    _GUIDE[lid] = (x["im"], credit)
            time.sleep(0.3)
    return _GUIDE


def guide_photo(row, folder):
    """The landmark guide's own photograph of a landmark, as its page shows it, credited as the guide
    credits it, linked to the landmark's page there. The author, 2026-10-09: the guide's photos are
    ones "we can definitely use here as well"."""
    import base64
    hit = guide_images().get(row["landmark"])
    if not hit:
        return None
    uri, credit = hit
    try:
        data = base64.b64decode(uri.split(",", 1)[1])
    except (IndexError, ValueError):
        return None
    if not is_image(data):
        print(f"    {row['name']}: the guide's picture is not an image; left out")
        return None
    name = f"{row['landmark']}-guide.jpg"
    with open(os.path.join(folder, name), "wb") as fh:
        fh.write(data)
    credit = credit or maps.config().get("guidePhotoCredit") or ""
    link = ((maps.links_config() or {}).get("url") or "").replace("{id}", row["landmark"])
    place = maps.places().get(row["landmark"]) or {}
    print(f"  {row['name']}: the guide's photo ({credit})")
    return {"file": name, "credit": credit, "caption": place.get("name") or row["name"], "pageUrl": link}


def cmd_list(stories_dir, series_id, use_files):
    found, projects = book_places(stories_dir, series_id, use_files)
    if not projects:
        print("no landed stories")
        return 2
    stories = [{"slug": slug, "mapPlaces": places} for slug, places in found]
    geo, _ = maps.basemap(projects[0])
    data = map_data(stories, maps.places(), Streets(geo), load_cache(stories_dir))
    print(f"{len(data['pins'])} pinned, {len(data['unplaced'])} not:")
    for p in data["pins"]:
        print(f"  pin  {p['k']:<8} {p['n']}  ({p['y']}, {p['x']})  · {len(p['r'])} ref(s)")
    for p in data["unplaced"]:
        print(f"  --   {p['k']:<8} {p['n']}: {p['why']}")
    return 0


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    use_files = "--files" in argv
    if len(args) == 3 and args[0] == "geocode":
        return cmd_geocode(args[1], args[2], use_files)
    if len(args) == 3 and args[0] == "photos":
        return cmd_photos(args[1], args[2], use_files)
    if len(args) == 3 and args[0] == "list":
        return cmd_list(args[1], args[2], use_files)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
