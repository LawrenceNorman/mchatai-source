#!/usr/bin/env python3
"""What a narrated episode shows, line by line (Pivotal Histories, Phase VB.3).

  visuals.py things <project> <episode>          the one model pass, as a task: each line's things and
                                                 events that could be shown, IN THE LINE'S OWN WORDS,
                                                 with Commons search terms → video/things-<n>.json
  visuals.py things <project> <episode> --check  that file checked: every thing is words of its line
  visuals.py find <project> <episode> [--limit N] Commons pictures for what the story's own pictures do
                                                 not cover: a subject's own category first, then a
                                                 search; free licences only, wide enough for video,
                                                 captioned from the file's own record → video/broll.json
                                                 (kept between runs; a lookup is made once)
  visuals.py beats <project> <episode>           video/beats-<n>.json: a picture, map or card for every
                                                 line or two (5-15 s each), and why it was chosen
  visuals.py sheet <project> <episode> <out.html> a contact sheet for the author's approval: each beat's
                                                 words, picture, caption and licence
  visuals.py check <project>                     every video picture against its own record

docs/VISUAL_BEATS_ARCHITECTURE.md §4 is the design (the author, 2026-10-20: "we need a process for
identifying visual elements in the text and pull the correct corresponding image materials").

Every line is read for what it could show. Most of that comes from the story's own sourced data:
its cast (people and peoples, with their aliases), its places, the numbers, dates and quotations
in the line, and the pictures the book already places. Things and events ("scaling ladders", "a
trumpet call") come from one model pass, whose every answer must be words of its line; without
it, the domain's glossary (domains/<d>/visuals.json) stands in.

Each mention is resolved in a fixed order, cheapest and safest first: the picture the book places
there; a quotation's card; a person or people (their real likeness, never a generated face); a
map of the place; a Commons picture of the thing; a number's card; then the picture already up,
held with a new camera move. A Commons picture's caption is built from the file's own record and
checked against it word for word; it names the work, its maker and its year, so a painting of
1888 is never passed off as a picture of 52 BC. Video pictures are not the book's: they live in
video/broll.json and its folder, with their licence and credit.
"""
import base64
import html
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import HISTORY, Project, load_json, norm, save_json, thresholds, words  # noqa: E402


def cfg(project):
    v = thresholds(project).get("video") or {}
    b = v.get("beatSeconds") or {}
    return {"min": b.get("min", 5), "target": b.get("target", 9), "max": b.get("max", 15),
            "openingSeconds": v.get("openingSeconds", 30), "openingMax": v.get("openingMax", 7),
            "charsPerSecond": v.get("charsPerSecond", 15.0), "minPictureWidth": v.get("minPictureWidth", 1000),
            "videoWidth": v.get("pictureFetchWidth", 2400), "perSubject": v.get("commonsPerSubject", 2),
            "factEvery": v.get("factCardEverySeconds", 45), "quoteMaxWords": v.get("quoteMaxWords", 26),
            "maxLookups": v.get("commonsLookupsPerEpisode", 40)}


def glossary(project):
    meta = load_json(project.path("project.json"), {}) or {}
    dom = meta.get("domain") or ""
    g = load_json(os.path.join(HISTORY, "domains", dom, "visuals.json"), {}) if dom else {}
    return {k.lower(): v for k, v in ((g or {}).get("terms") or {}).items()}


# ── the episode's lines ──────────────────────────────────────────────────────

SPOKEN = ("open", "whoTitle", "who", "line", "credit")


def episode(project, n):
    """(episodes, episode, project.json, items): deck.walk's items, each spoken one numbered `i`."""
    import deck
    data, ep, meta, items = deck.walk(project, n)
    i = 0
    for it in items:
        if it["kind"] in SPOKEN and (it.get("text") or "").strip():
            it["i"] = i
            i += 1
    return data, ep, meta, items


def spoken_items(items):
    return [it for it in items if "i" in it]


# ── 1. mentions ──────────────────────────────────────────────────────────────

NUMBER_WORDS = ("one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|"
                "sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|"
                "hundred|thousand")
NUMW = r"(?:" + NUMBER_WORDS + r")\b"
FACT = re.compile(r"(?<![\w-])(\d[\d,]*(?:\.\d+)?\b|" + NUMW + r"(?:[\s-]+" + NUMW + r")*)"
                  r"((?:\s+(?:BC|AD|BCE|CE)\b)?)((?:\s+[A-Za-z][a-z]+){1,2})?", re.I)
QUOTE = re.compile(r"[“\"]([^”\"]{6,}?)[”\"]")
UNIT_STOP = {"and", "or", "but", "the", "a", "an", "of", "in", "on", "at", "to", "by", "for", "with", "from",
             "that", "which", "who", "was", "were", "had", "his", "their", "its", "he", "they", "it",
             "around", "about", "away", "apart", "each", "more", "less", "than", "before", "after", "later",
             "earlier", "ago", "long", "wide", "high", "deep", "old", "years", "days", "times"}


def cast(project):
    import storytelling
    return [(e, storytelling.key_pattern(e["keys"])) for e in storytelling.cast_entries(project)]


def places(project):
    out = []
    for p in (project.dossier or {}).get("places") or []:
        names = [p.get("name")] + list(p.get("aliases") or [])
        names = [x for x in names if x]
        if names:
            pat = re.compile(r"(?<![\w-])(?:" + "|".join(re.escape(x) for x in sorted(names, key=len, reverse=True)) + r")(?![\w-])")
            out.append((p, names, pat))
    return out


def facts(text):
    """Numbers and dates said in the line, each with up to three words after it ("fourteen Roman
    miles", "52 BC"), skipping a lone "one" (a pronoun as often as a number)."""
    out = []
    for m in FACT.finditer(text):
        value = (m.group(1) + (m.group(2) or "")).strip()
        if value.lower() in ("one", "two", "three", "a", "") or (value.isdigit() and int(value.replace(",", "") or 0) < 4 and not m.group(2)):
            continue                  # "two rings", "three days": a count, not a fact worth a card
        unit = []
        for w in (m.group(3) or "").split():
            if w.lower() in UNIT_STOP:
                break
            unit.append(w)
        out.append({"type": "fact", "text": (value + (" " + " ".join(unit) if unit else "")).strip(),
                    "value": value, "label": " ".join(unit)})
    return out


def mentions(project, text, things=(), rows=None):
    """What this line could show, in the order found. `things` are the model pass's (or the
    glossary's) for this line; `rows` the (cast, places) patterns, read once per episode."""
    cast_rows, place_rows = rows or (cast(project), places(project))
    out = []
    for q in QUOTE.findall(text):
        out.append({"type": "quote", "text": q.strip()})
    for e, pat in cast_rows:
        m = pat.search(text)
        if m:
            out.append({"type": e["kind"], "key": e["name"], "text": m.group(0), "who": e.get("who") or "",
                        "at": m.start()})
    for p, names, pat in place_rows:
        m = pat.search(text)
        if m:
            out.append({"type": "place", "key": p.get("name"), "text": m.group(0), "at": m.start()})
    for t in things:
        out.append({"type": "thing", "key": t["thing"].lower(), "text": t["thing"], "queries": t.get("queries") or [],
                    "match": t.get("match") or None})
    out += facts(text)
    return out


# ── the model pass (things and events) ───────────────────────────────────────

THINGS_TASK = """For each numbered line of narration below, list up to 3 THINGS or EVENTS a viewer could
be shown a picture of while the line is read: objects (weapons, coins, standards, siege works),
groups (horsemen, legionaries), events (a battle, a surrender), landscapes. Not people or places by
name (the story's cast and places are found already), and nothing the line does not say.

Rules:
- `thing` is WORDS COPIED FROM THE LINE, exactly (e.g. "scaling ladders", "a trumpet call").
- `queries` are 1-3 Wikimedia Commons search terms that would find a real picture of it: a
  Commons category ("Category:Carnyx") or plain words ("Roman siege ladder engraving"). Prefer
  period artworks, artefacts in museums, reconstructions and photographs of real places.
- `match` (optional) are words a picture's Commons record must contain to be OF the thing: the
  thing's own words and their synonyms and stems in English, Latin and French ("legio",
  "legionary", "légionnaire" for "each Roman soldier"). Without it, the thing's own words are used.
- A line with nothing to show gets no entry.

Write JSON to {out}:
{{"episode": {n}, "lines": {{"<line number>": [{{"thing": "...", "queries": ["..."], "match": ["..."]}}]}}}}

Lines:
"""


def things_path(project, n):
    return project.path("video", f"things-{int(n)}.json")


def check_things(project, n):
    """[(line, problem)] for video/things-<n>.json; an empty list is clean."""
    _, _, _, items = episode(project, n)
    lines = {it["i"]: it["text"] for it in spoken_items(items)}
    data = load_json(things_path(project, n), None)
    if data is None:
        return [(-1, "no video/things file: run `visuals.py things` and answer it")]
    problems = []
    for k, rows in (data.get("lines") or {}).items():
        try:
            i = int(k)
        except ValueError:
            problems.append((-1, f"line key {k!r} is not a number"))
            continue
        if i not in lines:
            problems.append((i, "no such line"))
            continue
        if len(rows) > 3:
            problems.append((i, "more than 3 things"))
        for r in rows:
            thing = (r.get("thing") or "").strip()
            if not thing or norm(thing) not in norm(lines[i]):
                problems.append((i, f"“{thing}” is not words of the line"))
            qs = r.get("queries") or []
            if not qs or not all(isinstance(q, str) and q.strip() and len(q.split()) <= 8 for q in qs):
                problems.append((i, f"“{thing}”: 1-3 short search terms needed"))
            mt = r.get("match")
            if mt is not None and not (isinstance(mt, list) and all(isinstance(x, str) and len(x.strip()) >= 3 for x in mt)):
                problems.append((i, f"“{thing}”: `match` is a list of words a picture's record must contain"))
    return problems


def things_for(project, n):
    """{line: [thing]}: the checked model pass, else the domain glossary's terms found in the line."""
    _, _, _, items = episode(project, n)
    data = load_json(things_path(project, n), None)
    out = {}
    if data is not None and not check_things(project, n):
        for k, rows in (data.get("lines") or {}).items():
            out[int(k)] = [{"thing": r["thing"].strip(), "queries": r.get("queries") or [], "match": r.get("match") or None}
                           for r in rows]
        return out
    terms = glossary(project)
    for it in spoken_items(items):
        found = []
        for term, queries in terms.items():
            m = re.search(r"(?<![\w-])" + re.escape(term) + r"(?![\w-])", it["text"], re.I)
            if m:
                found.append({"thing": m.group(0), "queries": list(queries)})
        if found:
            out[it["i"]] = found[:3]
    return out


# ── 2. materials ─────────────────────────────────────────────────────────────

def story_pictures(project):
    import images
    return [r for r in images.index(project) if r.get("file") and os.path.exists(project.path(r["file"]))]


def likeness(project, name, guard=None):
    """The story's own picture of a person or people: its caption names them (a coin, a bust, a
    statue, a painting). Never generated. `guard(rec)` true skips a picture (too early)."""
    import storytelling
    keys = next((e["keys"] for e in storytelling.cast_entries(project) if e["name"] == name), [name])
    pat = re.compile(r"(?<![\w-])(?:" + "|".join(re.escape(k) for k in sorted(keys, key=len, reverse=True)) + r")", re.I)
    for r in story_pictures(project):
        if r.get("portraitOnly"):
            continue
        # What the picture IS: the caption up to its first full stop or relative clause. "A bust of
        # Julius Caesar, who led the Roman legions" is Caesar, never the legions.
        subject = re.split(r"[.;]|,\s*(?:who|which|whose|where)\b|\s+who\s", r.get("caption") or "")[0]
        if pat.search(subject) and not (guard and guard(r)):
            return r
    return None


def map_for(project, place):
    import cite
    for mid, r in cite.map_records(project).items():
        if place in (r.get("names") or []) or place == r.get("name"):
            return r
    return None


def episode_chapter(project, ep):
    """The plan chapter an episode reads: 0 for the introduction."""
    if ep.get("title") == "Introduction":
        return 0
    for c in (project.plan or {}).get("chapters") or []:
        if c.get("title") == ep.get("title"):
            return int(c.get("n") or c.get("chapter") or 0)
    return 0


def outcome_chapters(project):
    """The chapters that tell how the story ends: those holding the dossier's outcome events."""
    events = set(((project.dossier or {}).get("outcome") or {}).get("events") or [])
    return {int(c.get("n") or c.get("chapter") or 0) for c in (project.plan or {}).get("chapters") or []
            if events & set(c.get("events") or [])}


def spoiler_words(project):
    """Words that show the ending: the dossier's outcome phrases and the domain glossary's `spoilers`."""
    found = list(((project.dossier or {}).get("outcome") or {}).get("phrases") or [])
    meta = load_json(project.path("project.json"), {}) or {}
    dom = meta.get("domain") or ""
    g = load_json(os.path.join(HISTORY, "domains", dom, "visuals.json"), {}) if dom else {}
    found += (g or {}).get("spoilers") or []
    return [fold(w) for w in found if w]


def too_early(rec, ep_chapter, outcome, spoils):
    """A picture of how the story ends, before the episode that tells it. The introduction keeps the
    ending back (voice.md's cold open), and so do its pictures: Royer's 1899 surrender painting waits
    for the chapter the book places it in."""
    if not outcome or ep_chapter >= min(outcome):
        return False
    ch = rec.get("chapter")
    if isinstance(ch, int) and ch in outcome and ch > ep_chapter:
        return True
    text = fold(record_text(rec) + " " + (rec.get("caption") or ""))
    return any(w in text for w in spoils)


def broll(project):
    return load_json(project.path("video", "broll.json"), []) or []


def broll_for(project, key, guard=None):
    no = rejected(project)
    return [r for r in broll(project) if r.get("key") == key and r.get("id") not in no and r.get("title") not in no
            and not (guard and guard(r))]


# ── 3. the checker (one for every video picture) ─────────────────────────────

YEAR = re.compile(r"(?<!\d)(1[0-9]{3}|20[0-2][0-9])(?!\d)")
TEMPLATE_WORDS = {"by", "the", "a", "an", "of", "and", "in", "at", "on"}


def file_title(title):
    t = re.sub(r"^File:", "", title or "")
    t = re.sub(r"\.(jpe?g|png|tiff?|gif|webp)$", "", t, flags=re.I)
    return re.sub(r"\s+", " ", t.replace("_", " ")).strip()


def year_of(rec):
    for field in ("date", "objectName", "description"):
        m = YEAR.search(rec.get(field) or "")
        if m:
            return m.group(1)
    return ""


def maker(rec):
    """The maker's name alone: Commons' author field can run on ("Du Locle, Camille (1832-1903).
    Librettiste Flaubert, Gustave (1821-1880). Auteur"), and a frame's credit wants one name."""
    a = re.split(r"[\n;(]|\.\s|\s{2,}", (rec.get("artist") or "").strip())[0].strip(" ,.")
    if not a or re.search(r"unknown|anonymous|^author$", a, re.I):
        return ""
    return a[:60]


def caption_from_record(rec):
    """The work's own name, its maker and its year, as its Commons record gives them."""
    name = (rec.get("objectName") or "").strip()
    if not name or "QS:" in name or re.match(r"^[A-Z][a-z]+:\s", name):
        name = file_title(rec.get("title"))         # a label soup ("German: … title QS:P1476") reads worse
    name = re.sub(r"\s*[\(\[]?\b(1[0-9]{3}|20[0-2][0-9])\b[\)\]]?\s*$", "", name).strip(" ,;-") or name
    who, year = maker(rec), year_of(rec)
    if who and norm(who) in norm(name):
        who = ""                       # the work's name already says who made it
    if year and year in name:
        year = ""
    tail = ", ".join(x for x in (who, year) if x)
    return name + (" — " + tail if tail else "")


def record_text(rec):
    return norm(" ".join(str(rec.get(k) or "") for k in ("title", "objectName", "description", "artist", "date")))


def caption_problems(caption, rec):
    """Words of a video caption that the file's own record does not have. A caption may say only
    what the record says (its name, maker and year), so no picture is captioned as more than it is."""
    have = record_text(rec)
    bad = []
    for w in re.findall(r"[\w'’-]+", caption):
        if len(w) < 3 or w.lower() in TEMPLATE_WORDS:
            continue
        if norm(w) not in have:
            bad.append(w)
    return bad


def fold(text):
    """norm(), accents dropped: "Alésia" is "alesia", "légion" is "legion"."""
    import unicodedata
    return unicodedata.normalize("NFKD", norm(text)).encode("ascii", "ignore").decode()


def stem(w):
    w = fold(w)
    return w[:-1] if len(w) > 4 and w.endswith("s") else w


def context_words(project):
    """Words that tie a picture to this story: its cast's and places' names, the domain's context
    words (glossary `context`) and the story's own (`video/context.json`, a list: "carnyx" and
    "oppidum" belong to Alesia, not to every pivotal history), folded."""
    out = set()
    for e, _ in cast(project):
        for k in e["keys"]:
            out |= {stem(w) for w in re.findall(r"[^\W\d_]{4,}", k)}
    for p, names, _ in places(project):
        for x in names:
            out |= {stem(w) for w in re.findall(r"[^\W\d_]{4,}", x)}
    meta = load_json(project.path("project.json"), {}) or {}
    dom = meta.get("domain") or ""
    g = load_json(os.path.join(HISTORY, "domains", dom, "visuals.json"), {}) if dom else {}
    out |= {stem(w) for w in (g or {}).get("context") or []}
    own = load_json(project.path("video", "context.json"), []) or []
    out |= {stem(w) for w in own if isinstance(w, str)}
    return {w for w in out if len(w) >= 4}


def subject_words(subject, query="", match=None, context=()):
    """What a picture's record must say to be OF the subject. The model pass may give `match` (the
    subject's own words and synonyms: "legio", "legionary" for "each Roman soldier"). Otherwise the
    subject's words and a category's name, less the story's own words: "a council of all Gaul" must
    say "council", since naming Gaul proves nothing in a story about Gaul."""
    if match:
        return {fold(m) for m in match if len(m.strip()) >= 3}
    text = subject + " " + (query[len("Category:"):] if query.lower().startswith("category:") else "")
    ws = {stem(w) for w in re.findall(r"[^\W\d_]{4,}", text) if w.lower() not in UNIT_STOP}
    return (ws - set(context)) or ws


def relevant(rec, subject_ws, context_ws, need_context):
    """A picture OF the subject: its record names it, and (for a search, which matches loosely) also
    something of this story. A curated category's files need only name the subject."""
    text = fold(record_text(rec))
    if not any(w in text for w in subject_ws):
        return False
    return not need_context or any(w in text for w in context_ws)


def rejected(project):
    """The author's rejections from the contact sheet (video/broll-rejected.json): titles or ids."""
    return set(load_json(project.path("video", "broll-rejected.json"), []) or [])


def credit(rec):
    lic = (rec.get("license") or "").strip()
    return " · ".join(x for x in (maker(rec) or "", lic, "Wikimedia Commons") if x)


# ── Commons lookups ──────────────────────────────────────────────────────────

def category_files(cat, limit=50):
    import images
    d = images.get_json(images.COMMONS, action="query", list="categorymembers", cmtitle=cat, cmtype="file",
                        cmlimit=limit)
    return [r["title"] for r in d.get("query", {}).get("categorymembers", []) if not images.SKIP.search(r["title"])]


def story_words(project):
    """The story's own names (its cast's and places'), folded: the strongest sign a picture is of it."""
    out = set()
    for e, _ in cast(project):
        for k in e["keys"]:
            out |= {stem(w) for w in re.findall(r"[^\W\d_]{4,}", k)}
    for p, names, _ in places(project):
        for x in names:
            out |= {stem(w) for w in re.findall(r"[^\W\d_]{4,}", x)}
    return {w for w in out if len(w) >= 4 and w not in UNIT_STOP}


def relevance(rec, words_, context=(), story=()):
    text = record_text(rec)
    score = sum(2 for w in words_ if norm(w) in text)
    # Of this story first: its own names count most (a carnyx found in Gaul before a reenactor
    # dressed as a Briton), the domain's context words less.
    folded = fold(text)
    score += 3 * min(2, sum(1 for w in story if w in folded))
    score += min(2, sum(1 for w in context if w in folded and w not in story))
    if re.search(r"[^\x00-\u024f\s\W]", caption_from_record(rec)):
        score -= 4                     # a caption in a script most viewers cannot read
    if year_of(rec):
        score += 1
    if maker(rec):
        score += 1
    return score


def lookup(project, query, subject, c, context=None, skip=(), match=None):
    """Checked Commons candidates for one query, best first: free, wide enough, captioned from their
    own record, OF the subject (and of this story, for a search), and not a file in `skip` (the
    book's own pictures, the author's rejections)."""
    import images
    try:
        titles = category_files(query) if query.lower().startswith("category:") else images.commons_search(query, 25)
    except images.Refused as e:
        print(f"  {query}: {e}", file=sys.stderr)
        return []
    if not titles:
        return []
    try:
        info = images.file_info(titles[:40], width=c["videoWidth"])
    except images.Refused as e:
        print(f"  {query}: {e}", file=sys.stderr)
        return []
    keep = []
    want = [w for w in re.findall(r"[A-Za-z]{4,}", subject + " " + query.replace("Category:", "")) if w.lower() not in UNIT_STOP]
    context_ws = context if context is not None else context_words(project)
    story_ws = story_words(project)
    subject_ws = subject_words(subject, query, match, context_ws)
    is_category = query.lower().startswith("category:")
    for t, rec in info.items():
        if not rec.get("allowed") or rec.get("title") in skip:
            continue
        if not relevant(rec, subject_ws, context_ws, need_context=not is_category):
            continue
        if (rec.get("width") or 0) < c["minPictureWidth"] or not str(rec.get("mime") or "").startswith("image/"):
            continue
        if "svg" in str(rec.get("mime") or ""):
            continue
        rec["caption"] = caption_from_record(rec)
        if caption_problems(rec["caption"], rec):
            continue
        rec["score"] = relevance(rec, want, context_ws, story_ws)
        keep.append(rec)
    return sorted(keep, key=lambda r: -r["score"])


def download(project, rec, bid):
    import fetch
    import images
    url = rec.get("url")
    ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower() or ".jpg"
    if ext not in (".jpg", ".jpeg", ".png"):
        ext = ".jpg"
    rel = f"video/broll/{bid}{ext}"
    os.makedirs(project.path("video", "broll"), exist_ok=True)
    if os.path.exists(project.path(rel)):
        return rel
    host = urllib.parse.urlparse(url).hostname or ""
    fetch.throttle(host, fetch.host_interval(host))
    req = urllib.request.Request(url, headers={"User-Agent": images.API_UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read(20_000_000)
    with open(project.path(rel), "wb") as fh:
        fh.write(data)
    return rel


def needs(project, n):
    """What episode n needs from Commons: [(subject key, queries, why)], each subject once."""
    _, _, _, items = episode(project, n)
    th = things_for(project, n)
    terms = glossary(project)
    rows = (cast(project), places(project))
    kinds = {e["name"]: e["kind"] for e, _ in rows[0]}
    out, seen = [], set()
    for it in spoken_items(items):
        found = mentions(project, it["text"], th.get(it["i"], ()), rows)
        if it["kind"] == "who" and it["name"] in kinds:
            # A Who's who row by the cast's own name: the narration may say it otherwise
            # ("Napoleon the Third" for "Napoleon III").
            found = [{"type": kinds[it["name"]], "key": it["name"], "text": it["name"]}] + found
        for m in found:
            key = m.get("key")
            if not key or key in seen:
                continue
            if m["type"] in ("person", "people"):
                if likeness(project, key):
                    continue
                bare = re.sub(r"\s*\(.*?\)\s*", " ", key).strip()
                bare = re.sub(r"^the\s+", "", bare, flags=re.I)
                qs = list(terms.get(bare.lower()) or [])
                if m["type"] == "person":
                    # Every spelling the cast gives: "Vergasillaunus (Vercassivellaunus)"; a person's
                    # portraits often sit in a sub-category, so a search for them too.
                    spellings = [bare] + re.findall(r"\(([^)]+)\)", key)
                    qs = [f"Category:{x}" for x in spellings] + [f"{x} portrait" for x in spellings] + qs
                if qs:
                    names = [bare] + re.findall(r"\(([^)]+)\)", key) if m["type"] == "person" else None
                    out.append((key, qs, m["type"], names))
                    seen.add(key)
            elif m["type"] == "thing" and m.get("queries"):
                out.append((key, m["queries"], "thing", m.get("match")))
                seen.add(key)
    return out


def cmd_find(project, n, limit=None):
    c = cfg(project)
    rows = broll(project)
    have = {(r.get("key"), r.get("title")) for r in rows}
    done_keys = {r.get("key") for r in rows}
    asked = load_json(project.path("video", "commons-asked.json"), {}) or {}
    todo = needs(project, n)
    budget = limit or c["maxLookups"]
    made = 0
    context = context_words(project)
    skip = {r.get("title") for r in story_pictures(project)} | rejected(project)
    by_title = {r.get("title"): r for r in rows}

    def near_copy(rec, chosen):
        """The same work under another file name ("… (1)", another scan): same caption, digits aside."""
        key_ = re.sub(r"[\d\W_]+", " ", fold(rec["caption"])).strip()[:40]
        return any(re.sub(r"[\d\W_]+", " ", fold(x.get("caption") or "")).strip()[:40] == key_ for x in chosen)
    for key, queries, why, match in todo:
        if key in done_keys or key in asked:
            continue
        if made >= budget:
            print(f"lookup budget ({budget}) reached; run again for the rest")
            break
        got = []
        for q in queries:
            for r in lookup(project, q, key, c, context, skip, match):
                if (key, r["title"]) in have or r["title"] in {g["title"] for g in got}:
                    continue
                if near_copy(r, got) or near_copy(r, [x for x in rows if x.get("key") == key]):
                    continue
                got.append(r)
            made += 1
            if len(got) >= c["perSubject"]:
                break
        asked[key] = {"queries": queries, "found": len(got)}
        for rec in got[:c["perSubject"]]:
            bid = "b%d" % (max([int(r["id"][1:]) for r in rows if re.fullmatch(r"b\d+", r.get("id") or "")] or [0]) + 1)
            if rec["title"] in by_title:                # found already for another subject: one copy
                rel = by_title[rec["title"]]["file"]
            else:
                try:
                    rel = download(project, rec, bid)
                except (urllib.error.URLError, TimeoutError) as e:
                    print(f"  {rec['title']}: not copied ({e})", file=sys.stderr)
                    continue
            row = {k: rec.get(k) for k in ("title", "url", "pageUrl", "license", "licenseUrl", "artist", "date",
                                           "width", "height", "objectName", "description")}
            row.update({"id": bid, "key": key, "why": why, "query": rec.get("query") or queries,
                        "caption": rec["caption"], "evidence": record_text(rec)[:600], "credit": credit(rec),
                        "file": rel, "year": year_of(rec)})
            rows.append(row)
            by_title.setdefault(rec["title"], row)
            have.add((key, rec["title"]))
            print(f"  {bid}  {key}: {rec['caption'][:90]}  [{rec.get('license')}]")
        if not got:
            print(f"  {key}: nothing free and wide enough ({'; '.join(queries)})")
    save_json(project.path("video", "broll.json"), rows)
    save_json(project.path("video", "commons-asked.json"), asked)
    print(f"{len(rows)} video pictures ({made} lookups this run)")
    return 0


# ── 4. beats ─────────────────────────────────────────────────────────────────

def seconds(text, c):
    return round(len(text or "") / c["charsPerSecond"], 1)


def picture_material(project, rec, source):
    import images
    if rec.get("kind") == "geo":
        source = "map"
    f = rec.get("file") or ""
    if f.endswith(".svg"):
        import deck
        png = deck.png_of(project.path(f), project.path("video", "maps"))
        f = os.path.relpath(png, project.root) if png else f
    return {"kind": "picture", "source": source, "id": rec.get("id"), "file": f,
            "page": rec.get("pageUrl") or rec.get("url") or "",
            "caption": rec.get("caption") or rec.get("name") or "",
            "credit": (images.credit_line(rec) if source == "story" else rec.get("credit") or rec.get("label") or "")}


SAYS = re.compile(r"^(?:As\s+)?((?:[A-Z][\w.'’-]+)(?:\s+(?:[A-Z][\w.'’-]+|of|the|de|von))*)\s+(?:called|wrote|said|says|"
                  r"described|recorded|noted|reported|put it|tells|told|added|claimed)\b")


def speaker(text):
    """Whom a quotation belongs to, only where the line says it: "Plutarch called the danger … '…'".
    Never guessed from a name elsewhere in the line (the first run credited Plutarch's words to Caesar)."""
    m = SAYS.match(text.strip())
    return m.group(1) if m else ""


def card(layout, **fields):
    return {"kind": "card", "layout": layout, **{k: v for k, v in fields.items() if v}}


def plan_beats(project, n):
    """Episode n's beats: [{lines, text, seconds, material, why, title?}] in order, every spoken line
    in exactly one beat."""
    c = cfg(project)
    data, ep, meta, items = episode(project, n)
    th = things_for(project, n)
    rows = (cast(project), places(project))
    ep_ch, outcome, spoils = episode_chapter(project, ep), outcome_chapters(project), spoiler_words(project)
    guard = lambda r: too_early(r, ep_ch, outcome, spoils)
    like = lambda name: likeness(project, name, guard)
    rolls = lambda key: broll_for(project, key, guard)
    place_names = [fold(x) for _, names, _ in rows[1] for x in names]
    seen_people, shown_maps = set(), set()
    beats = []
    pending = None          # the picture the book places before the next paragraph
    last_fact = -1e9
    t = 0.0

    def start(material, it, why, title=None):
        nonlocal t
        b = {"lines": [it["i"]], "text": it["text"], "seconds": seconds(it["text"], c), "start": round(t, 1),
             "material": material, "why": why}
        if title:
            b["title"] = title[:1].upper() + title[1:]      # "The Gauls" on screen, "the Gauls" in the cast
        beats.append(b)
        t += b["seconds"]

    def extend(it):
        nonlocal t
        b = beats[-1]
        b["lines"].append(it["i"])
        b["text"] += " " + it["text"]
        s = seconds(it["text"], c)
        b["seconds"] = round(b["seconds"] + s, 1)
        t += s

    def cap():
        return c["openingMax"] if t < c["openingSeconds"] else c["max"]

    opening_file = next((it["rec"].get("file") for it in items if it["kind"] == "open" and it.get("rec")), None)
    cast_names = {e["name"].casefold(): e["name"] for e, _ in rows[0]}

    def least_used(options):
        uses = lambda r: sum(1 for b in beats if b["material"].get("file") == r.get("file"))
        unreadable = lambda r: bool(re.search(r"[^\x00-\u024f\s\W]", r.get("caption") or ""))
        return min(options, key=lambda r: (unreadable(r), uses(r)))   # a caption the viewer can read first

    def last_seen(f):
        return max([k for k, b in enumerate(beats) if b["material"].get("file") == f] or [-1])

    def hold_for(ms):
        """What a line with nothing new to show holds on, never a thing's picture away from its own
        line (a carnyx held over the news crossing Gaul, 2026-10-20):
        1. what the line names, even if shown before: a person's or people's picture, a place's map;
        2. the episode's ground: the story's maps and its own pictures of the place, the least
           recently shown, never the one just up (and nothing that shows the ending too early);
        3. the picture just up, with a new move."""
        for m in ms:
            if m["type"] in ("person", "people"):
                rec, got = like(m["key"]), rolls(m["key"])
                if rec:
                    return picture_material(project, rec, "story"), f"held on {m['key']}, whom the line names"
                if got:
                    return picture_material(project, least_used(got), "commons"), f"held on {m['key']}, whom the line names"
            if m["type"] == "place":
                r = map_for(project, m["key"])
                if r:
                    return picture_material(project, r, "map"), f"held on the map: {m['key']}"
        import cite
        prev = beats[-1]["material"].get("file") if beats else None
        ground = [picture_material(project, r, "map") for r in cite.map_records(project).values()]
        ground += [picture_material(project, r, "story") for r in story_pictures(project)
                   if not r.get("portraitOnly") and not guard(r)
                   and any(x in fold(r.get("caption") or "") for x in place_names)]
        ground = [g for g in ground if g.get("file") and g.get("file") != prev]
        if ground:
            return min(ground, key=lambda g: last_seen(g.get("file"))), "held: the ground of the story"
        last = next((dict(b["material"]) for b in reversed(beats) if b["material"].get("kind") == "picture"), None)
        return (last, "held: the picture again, a new move") if last else (None, "")

    for it in items:
        kind = it["kind"]
        if kind == "picture":
            if not (opening_file and it["rec"].get("file") == opening_file and len(beats) <= 1):
                pending = it["rec"]          # the opening picture already carries the title card
            continue
        if "i" not in it:
            continue
        text = it["text"]
        if kind == "open":
            rec = it.get("rec")
            total = len(data["episodes"])
            intro = ((thresholds(project).get("video") or {}).get("intro") or {}).get("subtitle")
            sub = it["sub"]
            if sub.startswith(f"Part {ep['n']}:"):
                sub = f"Part {ep['n']} of {total}:" + sub[len(f"Part {ep['n']}:"):]
            elif intro:
                sub = intro.format(n=ep["n"], total=total, sub=sub)
            m = picture_material(project, rec, "story") if rec else card("title", title=it["title"], subtitle=sub)
            if rec:
                m["title"], m["subtitle"] = it["title"], sub
            start(m, it, "the story's opening picture under its title")
            continue
        if kind == "whoTitle":
            start(card("section", title=it["title"]), it, "the Who's who opens")
            continue
        if kind == "who":
            name = cast_names.get(it["name"].casefold(), it["name"])   # "The Gauls" row, "the Gauls" cast
            rec = like(name)
            got = rolls(name)
            if rec:
                start(picture_material(project, rec, "story"), it, f"{name}: the story's own picture", title=it["name"])
            elif got:
                start(picture_material(project, least_used(got), "commons"), it, f"{name}: a Commons picture", title=it["name"])
            else:
                start(card("section", title=it["name"], subtitle=it.get("who")), it, f"{name}: no picture, a name card")
            seen_people.add(name)
            continue
        ms = mentions(project, text, th.get(it["i"], ()), rows)
        choice = None
        if pending is not None:
            choice = (picture_material(project, pending, "story"), "the book places this picture here", None)
            pending = None
        if not choice:
            q = next((m for m in ms if m["type"] == "quote" and words(m["text"]) <= c["quoteMaxWords"]), None)
            if q:
                choice = (card("quote", quote=q["text"], attribution=speaker(text)), "a quotation in the line", None)
        if not choice:
            for m in ms:
                if m["type"] in ("person", "people") and m["key"] not in seen_people:
                    rec = like(m["key"])
                    got = rolls(m["key"])
                    if rec or got:
                        mat = picture_material(project, rec, "story") if rec else picture_material(project, least_used(got), "commons")
                        choice = (mat, f"first mention of {m['key']}", m["key"])
                        seen_people.add(m["key"])
                        break
        if not choice:
            for m in ms:
                if m["type"] == "place":
                    r = map_for(project, m["key"])
                    if r:
                        first = r.get("id") not in shown_maps
                        shown_maps.add(r.get("id"))
                        choice = (picture_material(project, r, "map"), f"the map: {m['key']}", m["key"] if first else None)
                        break
        if not choice:
            for m in ms:
                if m["type"] == "thing":
                    got = rolls(m["key"])
                    if got:
                        choice = (picture_material(project, least_used(got), "commons"), f"the thing: {m['text']}", None)
                        break
        if not choice and t - last_fact >= c["factEvery"]:
            f = next((m for m in ms if m["type"] == "fact" and m["label"]), None)
            if f:
                choice = (card("bigFact", fact=f["value"][:1].upper() + f["value"][1:], label=f["label"]),
                          f"a number said in the line: {f['text']}", None)
                last_fact = t
        if choice:
            mat, why, title = choice
            if beats and beats[-1]["material"] == mat and beats[-1]["seconds"] + seconds(text, c) <= cap() and not title:
                extend(it)
            else:
                start(mat, it, why, title)
            continue
        # Nothing new to show: stay on the picture already up while the beat has room, else show
        # it again as a new beat (the renderer gives it a different move).
        if beats and beats[-1]["seconds"] + seconds(text, c) <= cap():
            extend(it)
        elif beats:
            again, why = hold_for(ms)
            again = dict(again or beats[-1]["material"])
            again.pop("title", None)
            again.pop("subtitle", None)           # the opening picture again is not the title card again
            start(again, it, why or "held: the picture again, a new move")
        else:
            start(card("title", title=meta.get("subject") or ""), it, "nothing to show yet")
    # The end card: one spoken line pointing on (series navigation, not history), held for YouTube's
    # end screen (the outro's holdSeconds go to the Video Recorder as closingHold).
    o = (thresholds(project).get("video") or {}).get("outro") or {}
    if o:
        import narration
        from _hw import series_entry
        total = len(data["episodes"])
        series = ((series_entry(meta.get("series") or "")[0] or {}).get("title")) or "Pivotal Histories"
        subject = meta.get("subject") or ""
        if ep["n"] < total:
            nxt = data["episodes"][ep["n"]]["title"]
            say = o.get("say", "").format(next=ep["n"] + 1, total=total, next_title=nxt, subject=subject, series=series)
            title = o.get("title", "").format(next=ep["n"] + 1, total=total, next_title=nxt, subject=subject, series=series)
        else:
            say = o.get("sayLast", "").format(subject=subject, series=series)
            title = o.get("titleLast", "").format(subject=subject, series=series)
        if say:
            say = narration.spoken(say, narration.cfg(project)["say"])
            beats.append({"lines": [], "text": say, "seconds": seconds(say, c), "start": round(t, 1), "extra": True,
                          "material": card("title", title=title, subtitle=o.get("subtitle", "").format(series=series)),
                          "why": "the end card: what comes next"})
            t += seconds(say, c)
    out = {"episode": ep["n"], "title": ep["title"], "lines": sum(len(b["lines"]) for b in beats),
           "seconds": round(t), "beats": beats, "closingHold": o.get("holdSeconds")}
    os.makedirs(project.path("video"), exist_ok=True)
    save_json(project.path("video", f"beats-{ep['n']}.json"), out)
    return out


def cmd_beats(project, n):
    d = plan_beats(project, n)
    secs = [b["seconds"] for b in d["beats"]]
    kinds = {}
    for b in d["beats"]:
        k = b["material"].get("source") or b["material"].get("layout")
        kinds[k] = kinds.get(k, 0) + 1
    print(f"episode {d['episode']} · {d['title']}: {len(d['beats'])} beats over ~{d['seconds'] // 60}:{d['seconds'] % 60:02d}, "
          f"{min(secs)}-{max(secs)} s each (mean {sum(secs) / len(secs):.1f}) · " + ", ".join(f"{v} {k}" for k, v in sorted(kinds.items())))
    for k, b in enumerate(d["beats"], 1):
        m = b["material"]
        what = m.get("caption") or m.get("quote") or m.get("fact") or m.get("title") or ""
        print(f"  {k:>2}. {b['start']:>6.1f}s {b['seconds']:>5.1f}s  [{m.get('source') or m.get('layout')}] {what[:56]}  ← {b['why']}")
    return 0


# ── 5. the contact sheet ─────────────────────────────────────────────────────

def thumb_uri(project, rel, width=420):
    if not rel:
        return ""
    src = project.path(rel)
    if not os.path.exists(src):
        return ""
    tmp = project.path("video", ".thumbs")
    os.makedirs(tmp, exist_ok=True)
    out = os.path.join(tmp, re.sub(r"[^\w.-]", "_", rel) + ".jpg")
    if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(src):
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "70", "-Z", str(width), src, "--out", out],
                       capture_output=True)
    if not os.path.exists(out):
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(open(out, "rb").read()).decode()


def cmd_sheet(project, n, out_html):
    d = load_json(project.path("video", f"beats-{int(n)}.json")) or plan_beats(project, n)
    meta = load_json(project.path("project.json"), {}) or {}
    rows = []
    for k, b in enumerate(d["beats"], 1):
        m = b["material"]
        e = html.escape
        if m.get("kind") == "picture":
            img = thumb_uri(project, m.get("file"))
            pic = f'<img src="{img}" alt="">' if img else '<div class="card">picture missing</div>'
            what = e(m.get("caption") or "")
            cred = e(m.get("credit") or "")
            src = {"story": "the book's own picture", "map": "the story's map", "commons": "Wikimedia Commons"}.get(m.get("source"), "")
        else:
            pic = '<div class="card"><b>' + e(m.get("title") or m.get("fact") or "") + "</b>" + \
                  (f'<i>“{e(m["quote"])}”</i>' if m.get("quote") else "") + \
                  e(" " + (m.get("label") or m.get("subtitle") or m.get("attribution") or "")) + "</div>"
            what, cred, src = e(m.get("layout") or ""), "", "a card"
        title = f'<div class="name">{e(b["title"])}</div>' if b.get("title") else ""
        rows.append(f'<article><div class="pic">{pic}</div><div class="txt"><div class="meta"><span class="n">{k}</span>'
                    f'<span>{b["start"]:.0f}s · {b["seconds"]:.0f}s</span><span class="src">{src}</span></div>{title}'
                    f'<p class="said">{e(b["text"])}</p><p class="cap">{what}</p><p class="cred">{cred}</p>'
                    f'<p class="why">why: {e(b["why"])}</p></div></article>')
    page = f"""<title>Alesia video beats</title>
<style>
:root{{--bg:#f6f4ef;--ink:#1d1b18;--muted:#6b665d;--line:#d9d4c9;--accent:#8a4b1f;--card:#fff}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#151412;--ink:#ece8e0;--muted:#a39d92;--line:#34312c;--accent:#e0a36a;--card:#1f1d1a;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#151412;--ink:#ece8e0;--muted:#a39d92;--line:#34312c;--accent:#e0a36a;--card:#1f1d1a;color-scheme:dark}}
body{{background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,system-ui,sans-serif;padding-inline:16px;max-width:1100px;margin:0 auto}}
h1{{font-size:22px;margin:24px 0 4px}} .lede{{color:var(--muted);margin:0 0 20px}}
article{{display:grid;grid-template-columns:minmax(0,320px) 1fr;gap:16px;padding:14px 0;border-top:1px solid var(--line)}}
@media (max-width:640px){{article{{grid-template-columns:1fr}}}}
.pic img{{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;display:block}}
.card{{aspect-ratio:16/9;background:#111317;color:#f2efe9;border-radius:6px;display:flex;flex-direction:column;justify-content:center;padding:14px;gap:6px;font-size:14px}}
.card b{{font-size:20px}} .meta{{display:flex;gap:10px;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}}
.n{{color:var(--accent);font-weight:700}} .name{{font-weight:700;font-size:17px;margin-top:4px}}
.said{{margin:6px 0}} .cap{{margin:4px 0;font-size:13px}} .cred,.why{{margin:2px 0;font-size:12px;color:var(--muted)}}
</style>
<h1>{html.escape(meta.get("subject") or "")} · episode {d['episode']}: {html.escape(d['title'])}</h1>
<p class="lede">{len(d['beats'])} beats over about {d['seconds'] // 60}:{d['seconds'] % 60:02d}. Each row: what is shown, while which words are read, and why it was chosen. Commons pictures are captioned only with what their own record says.</p>
<p class="lede">To change one, give its number: drop a picture (another is chosen, or the one before holds), or say what to look for instead. Nothing here is published.</p>
{''.join(rows)}
"""
    with open(out_html, "w", encoding="utf-8") as fh:
        fh.write(page)
    print(f"contact sheet: {out_html} ({len(rows)} beats)")
    return 0


def cmd_check(project):
    bad = 0
    for r in broll(project):
        probs = caption_problems(r.get("caption") or "", r)
        import images
        ok, why = images.licence_verdict(r.get("license"))
        if probs or not ok:
            bad += 1
            print(f"{r.get('id')} {r.get('title')}: " + "; ".join(([f"caption words not in its record: {probs}"] if probs else [])
                                                            + ([why] if not ok else [])))
    print("video pictures: " + ("CLEAN" if not bad else f"{bad} with findings"))
    return 1 if bad else 0


def cmd_things(project, n, check):
    if check:
        probs = check_things(project, n)
        for i, p in probs:
            print(f"  line {i}: {p}")
        print("things: " + ("CLEAN" if not probs else f"{len(probs)} findings"))
        return 1 if probs else 0
    _, _, _, items = episode(project, n)
    print(THINGS_TASK.format(out=things_path(project, n), n=int(n)))
    for it in spoken_items(items):
        print(f"{it['i']}: {it['text']}")
    return 0


def main(argv):
    if len(argv) >= 4 and argv[1] == "things":
        return cmd_things(Project(argv[2]), argv[3], "--check" in argv)
    if len(argv) >= 4 and argv[1] == "find":
        lim = None
        if "--limit" in argv:
            lim = int(argv[argv.index("--limit") + 1])
        return cmd_find(Project(argv[2]), argv[3], lim)
    if len(argv) >= 4 and argv[1] == "beats":
        return cmd_beats(Project(argv[2]), argv[3])
    if len(argv) >= 5 and argv[1] == "sheet":
        return cmd_sheet(Project(argv[2]), argv[3], argv[4])
    if len(argv) >= 3 and argv[1] == "check":
        return cmd_check(Project(argv[2]))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
