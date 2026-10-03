#!/usr/bin/env python3
"""Famous lives, local places: a light job beside a series (history/offspin.json, OFFSPIN.md).

Well-known people from a community, ranked by how many readers already know the name
(Wikipedia pageviews), each tied back to the places of their lives with a checked quote per
tie. Shallow on purpose: the encyclopedia article and at most two more sources per person.
The places are often not landmarks, which is the point: a famous name brings readers to a
place no designation recorded.

  fame.py candidates <run-dir> <run-id>   seeds + categories, ranked by 12 months of pageviews
  fame.py screen     <run-dir> [--top N]  read the top N articles; print the sentences that state
                                          the run's identity terms, and how often each names the city
  fame.py person     <run-dir> <title> [--identity "<verbatim words from the article>"]
                                          start one person's project with the article saved as
                                          source `wp`; --identity is refused unless the words are
                                          in it and name the identity. Without it, record the
                                          statement from another fetched source in project.json
  fame.py places     <project>            place mentions in the person's sources, landmarks first,
                                          with the passages around them
  fame.py check      <project>            project.json identity + ties.json: every quote verbatim,
                                          every quote names its place
  fame.py gate       <project> [n]        a sub-story chapter: quotes, voice, numbers, corrections
                                          and the run's word range (no plan, no ledger)
  fame.py merge      <run-dir>            every person's checked ties -> places.json + places.csv
                                          (Ledger-ready: id, name, lat, lon, ...), coordinates from
                                          the landmark pack or the place's Wikipedia article

Network calls share fetch.py's per-host clock and send an identifying User-Agent, as Wikimedia
asks of API clients. Exit codes: 0 clean, 1 hard findings, 2 usage, 3 refused.
"""
import csv
import datetime
import io
import json
import math
import os
import re
import sys
import types
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import checks  # noqa: E402
import fetch  # noqa: E402
import quotes  # noqa: E402
import richness  # noqa: E402
import voice_lint  # noqa: E402
from _hw import HISTORY, Project, finding, load_json, norm, report, save_json, thresholds, words  # noqa: E402

API_UA = "mChatAI-HistoryWriter/1.0 (https://mchatai.com; history research tools)"
WIKI_API = "https://en.wikipedia.org/w/api.php"
VIEWS = ("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia.org/"
         "all-access/user/{}/monthly/{}/{}")
YEAR = re.compile(r"\b(1[5-9]\d\d|20\d\d)(?=s?\b)")


class Refused(Exception):
    pass


# ── content ──────────────────────────────────────────────────────────────────

def config():
    return load_json(os.path.join(HISTORY, "offspin.json"))


def run_config(run_id):
    for r in config()["runs"]:
        if r["id"] == run_id:
            return r
    raise Refused(f"offspin.json has no run {run_id!r} (runs: {', '.join(r['id'] for r in config()['runs'])})")


def caps():
    return config()["caps"]


def landmarks(run):
    """{id: place} from the run's landmark pack. The pack sits beside history/ in mchatai-source;
    realpath, because the Workbench folder links history/ in from the app's cache."""
    pack = run.get("landmarkPack")
    if not pack:
        return {}
    root = os.path.dirname(os.path.realpath(HISTORY))
    data = load_json(os.path.join(root, "places", "packs", f"{pack}.json"), {}) or {}
    return {p["id"]: p for p in data.get("places", [])}


def slugify(title):
    title = re.sub(r"\s*\([^)]*\)\s*$", "", title)            # "Garfield High School (Seattle)" -> name
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def subject_of(title):
    return re.sub(r"\s*\([^)]*\)\s*$", "", title).strip()


def term_hits(text, terms):
    """A single capitalised word is matched case-sensitively ("Black" the identity, not "black"
    the colour); every other term case-insensitively ("African-American" however it is cased)."""
    for t in terms:
        flags = 0 if (t[:1].isupper() and not re.search(r"[\s-]", t)) else re.I
        if re.search(r"\b" + re.escape(t) + r"\b", text or "", flags):
            yield t


# ── network ──────────────────────────────────────────────────────────────────

def get_json(url):
    host = urllib.parse.urlparse(url).hostname or ""
    fetch.throttle(host, fetch.host_interval(host))
    req = urllib.request.Request(url, headers={"User-Agent": API_UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        if e.code == 429:
            raise Refused(f"HTTP 429 from {host}: rate-limited. Wait a minute and run the same command again; "
                          "finished work is cached")
        raise Refused(f"HTTP {e.code} from {url}")
    except (urllib.error.URLError, TimeoutError) as e:
        raise Refused(f"could not reach {host} ({e}); run the same command again later")


def wiki(**params):
    params.update(format="json", formatversion="2")
    return get_json(WIKI_API + "?" + urllib.parse.urlencode(params)) or {}


def resolve_titles(names):
    """{name: canonical article title, or None when there is no such article}."""
    out = {}
    for i in range(0, len(names), 50):
        batch = names[i:i + 50]
        q = wiki(action="query", titles="|".join(batch), redirects=1).get("query", {})
        normal = {x["from"]: x["to"] for x in q.get("normalized", [])}
        redirect = {x["from"]: x["to"] for x in q.get("redirects", [])}
        missing = {p["title"] for p in q.get("pages", []) if p.get("missing") or p.get("invalid")}
        for n in batch:
            t = normal.get(n, n)
            t = redirect.get(t, t)
            out[n] = None if t in missing else t
    return out


def category_members(category):
    titles, cont = [], {}
    while True:
        d = wiki(action="query", list="categorymembers", cmtitle="Category:" + category,
                 cmnamespace=0, cmlimit=500, **cont)
        titles += [m["title"] for m in d.get("query", {}).get("categorymembers", [])]
        if "continue" not in d:
            return titles
        cont = {"cmcontinue": d["continue"]["cmcontinue"]}


def month_window(months, today=None):
    """The last `months` COMPLETE months: a ranking made on the 2nd and the 29th agrees."""
    today = today or datetime.date.today()
    end = today.replace(day=1) - datetime.timedelta(days=1)
    y, m = end.year, end.month - months + 1
    while m <= 0:
        m += 12
        y -= 1
    start = datetime.date(y, m, 1)
    return start.strftime("%Y%m%d00"), end.strftime("%Y%m%d00"), f"{start:%Y-%m}..{end:%Y-%m}"


def pageviews(title, start, end):
    d = get_json(VIEWS.format(urllib.parse.quote(title.replace(" ", "_"), safe=""), start, end))
    return sum(i.get("views", 0) for i in (d or {}).get("items", []))


def article(title):
    """(plain text, revision id, canonical title, raw reply bytes) of one article."""
    d = wiki(action="query", prop="extracts|revisions", explaintext=1, rvprop="ids|timestamp",
             redirects=1, titles=title)
    pages = d.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing"):
        raise Refused(f"Wikipedia has no article {title!r}")
    p = pages[0]
    rev = (p.get("revisions") or [{}])[0]
    return p.get("extract") or "", rev.get("revid"), p.get("title", title), json.dumps(d).encode()


def coordinates(titles):
    """{title: (lat, lon)} for the articles that carry primary coordinates."""
    out = {}
    titles = [t for t in dict.fromkeys(titles) if t]
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        q = wiki(action="query", prop="coordinates", titles="|".join(batch), redirects=1).get("query", {})
        back = {}
        for x in q.get("normalized", []) + q.get("redirects", []):
            back[x["to"]] = back.get(x["from"], x["from"])
        for p in q.get("pages", []):
            c = (p.get("coordinates") or [None])[0]
            if c:
                out[back.get(p["title"], p["title"])] = (round(c["lat"], 6), round(c["lon"], 6))
                out[p["title"]] = out[back.get(p["title"], p["title"])]
    return out


# ── candidates and screening ─────────────────────────────────────────────────

def cmd_candidates(run_dir, run_id):
    run = run_config(run_id)
    os.makedirs(run_dir, exist_ok=True)
    path = os.path.join(run_dir, "candidates.json")
    start, end, label = month_window(caps()["pageviewMonths"])
    old = load_json(path, {}) or {}
    cached = {c["title"]: c for c in old.get("candidates", [])} if old.get("window") == label else {}
    found = {}
    seeds = resolve_titles(run.get("seeds", []))
    for name, title in seeds.items():
        if title is None:
            print(f"seed {name!r}: no Wikipedia article by that name — give its exact title in offspin.json")
            continue
        found.setdefault(title, set()).add("seed")
    for cat in run.get("categories", []):
        members = category_members(cat)
        if not members:
            print(f"category {cat!r}: empty or missing")
        for t in members:
            found.setdefault(t, set()).add("category:" + cat)
    rows = []
    for i, (title, sources) in enumerate(sorted(found.items())):
        views = cached[title]["views"] if title in cached else pageviews(title, start, end)
        rows.append({"title": title, "views": views, "from": sorted(sources)})
        if (i + 1) % 100 == 0:
            # Saved as it goes: on a flaky network a rerun resumes instead of starting over.
            save_json(path, {"run": run_id, "window": label, "partial": True,
                             "candidates": rows + [c for t, c in cached.items() if t not in {r["title"] for r in rows}]})
            print(f"  … {i + 1}/{len(found)} ranked", file=sys.stderr)
    rows.sort(key=lambda r: (-r["views"], r["title"]))
    save_json(path, {"run": run_id, "window": label, "generatedAt": now(), "candidates": rows})
    print(f"{len(rows)} candidates for {run_id}, ranked by pageviews {label}:")
    for k, r in enumerate(rows[:40], 1):
        print(f"  {k:3}. {r['views']:>11,}  {r['title']}" + ("   (seed)" if "seed" in r["from"] else ""))
    return 0


SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"“(])|\n+")
HEADING = re.compile(r"^\s*=+[^=]+=+\s*$")


def sentences(text):
    """Sentences, with paragraph breaks as boundaries and "== Heading ==" lines dropped."""
    return [x.strip() for x in SENTENCE.split(text or "") if x.strip() and not HEADING.match(x)]


def cmd_screen(run_dir, top=None):
    data = load_json(os.path.join(run_dir, "candidates.json"))
    if not data:
        raise Refused("run `fame.py candidates` first")
    run = run_config(data["run"])
    top = top or caps()["candidatesToRead"]
    rows = data["candidates"]
    chosen = rows[:top] + [r for r in rows[top:] if "seed" in r["from"]]
    cache_dir = os.path.join(run_dir, "_screen")
    os.makedirs(cache_dir, exist_ok=True)
    out, silent = [], []
    for r in chosen:
        cache = os.path.join(cache_dir, slugify(r["title"]) + ".json")
        hit = load_json(cache)
        if not hit:
            text, revid, title, _ = article(r["title"])
            hit = {"title": title, "revid": revid, "text": text}
            save_json(cache, hit)
        parts = sentences(hit["text"])
        ident = [x for x in parts if any(term_hits(x, run["identityTerms"]))]
        local = [x for x in parts if any(term_hits(x, run.get("localTerms", [])))]
        row = {"title": r["title"], "views": r["views"], "seed": "seed" in r["from"],
               "identity": [s[:300] for s in ident[:3]], "localMentions": len(local)}
        (out if ident else silent).append(row)
    save_json(os.path.join(run_dir, "screen.json"), {"run": data["run"], "read": len(chosen), "rows": out + silent})
    print(f"read {len(chosen)} articles; {len(out)} state one of: {', '.join(run['identityTerms'])}. "
          "Confirm each statement is ABOUT the person before you include them.")
    for r in out:
        print(f"\n{r['views']:>11,}  {r['title']}  · names the city {r['localMentions']}×" + ("  (seed)" if r["seed"] else ""))
        for s in r["identity"]:
            print(f"    «{s}»")
    if silent:
        print("\nno identity statement found (not candidates unless another source states it): "
              + ", ".join(f"{r['title']} ({r['views']:,})" for r in silent))
    return 0


def cmd_person(run_dir, title, identity=None):
    """Start a person. With --identity, the article's own statement is checked at once. Without
    it the project starts with identity unrecorded: when the article does not state it, fetch a
    source that does and record identityEvidence + identitySource in project.json. `check`
    refuses the person until one is recorded either way."""
    data = load_json(os.path.join(run_dir, "candidates.json"))
    if not data:
        raise Refused("run `fame.py candidates` first")
    run = run_config(data["run"])
    t = thresholds()
    if identity is not None and words(identity) < t["minQuoteWords"]:
        raise Refused(f"--identity must quote at least {t['minQuoteWords']} words of the article")
    text, revid, canonical, raw = article(title)
    if identity is not None and norm(identity) not in norm(text):
        raise Refused(f"--identity is not verbatim in the article {canonical!r}; copy it from `fame.py screen`")
    if identity is not None and not any(term_hits(identity, run["identityTerms"])):
        raise Refused(f"--identity does not state any of: {', '.join(run['identityTerms'])}")
    slug = slugify(canonical)
    project = Project(os.path.join(run_dir, slug))
    os.makedirs(project.root, exist_ok=True)
    args = types.SimpleNamespace(id="wp", url="https://en.wikipedia.org/wiki/" + urllib.parse.quote(canonical.replace(" ", "_")),
                                 title=canonical, publisher="Wikipedia", kind="encyclopedia", license="facts-only",
                                 date="", own_words=False, original_url=None)
    fetch.record(project, args, text, raw, ".json", {"revision": revid, "via": "wikipedia-api"})
    pj = load_json(project.path("project.json"), {}) or {}
    pj.update({"slug": slug, "subject": subject_of(canonical), "wikipedia": canonical, "run": data["run"],
               "series": run.get("series")})
    if identity is not None:
        pj.update({"identityEvidence": identity, "identitySource": "wp"})
    save_json(project.path("project.json"), pj)
    print(f"{slug}: project started; next `fame.py places {project.root}`")
    if identity is None and not pj.get("identityEvidence"):
        print("  identity NOT recorded: the article does not state it. Fetch a source that does (fetch.py), then set "
              "identityEvidence (verbatim) and identitySource (its id) in project.json. Never infer it.")
    return 0


# ── places ───────────────────────────────────────────────────────────────────

PLACE_NOUN = (r"(?:High School|Junior High School|Junior High|Elementary School|Middle School|School|College|"
              r"University|Club|Hall|Church|Cathedral|Temple|Park|Playfield|Theatre|Theater|Hotel|Ballroom|"
              r"Cemetery|Arena|Auditorium|Coliseum|Center|Centre|Building|Tavern|Café|Cafe|Restaurant|Library|"
              r"Studios?|Market|Station|Hospital|Stadium|Armory|Lounge|Inn|Pavilion|Gardens?|Museum|Gallery|"
              r"Terrace|Homes)")
# A name word: an initial ("H."), "St.", or a capitalised word with no full stop in it, so a name
# never runs across the end of a sentence ("Handel Hendrix House. The Electric Lady Studio").
CAP = r"(?:St\.|[A-Z]\.|[A-Z][\w'’&-]*)"
SP = r"[ \t]+"                       # never a line break: a name sits on one line
GENERIC = re.compile(r"\b(" + CAP + r"(?:" + SP + r"(?:" + CAP + r"|of|the|and|&))" + r"{0,4}?" + SP + PLACE_NOUN + r")\b")
STREET = re.compile(r"\b((?:\d{1,5}½?" + SP + r")?(?:(?:North|South|East|West|N\.|S\.|E\.|W\.)" + SP + r")?"
                    r"(?:[A-Z][\w'’-]*|\d+(?:st|nd|rd|th))" + SP + r"(?:Street|Avenue|Way|Boulevard|Road|Drive|Place))\b")


def sentence_of(text, start, end):
    """The sentence holding text[start:end]: from the last sentence end or line break before it
    to the next one after it."""
    left = max(text.rfind("\n", 0, start), *(text.rfind(p + " ", 0, start) for p in ".!?"))
    stops = [i for i in (text.find("\n", end), *(text.find(p + " ", end) for p in ".!?")) if i != -1]
    return text[left + 1:(min(stops) + 1) if stops else len(text)]


def clean_name(name, place_terms=()):
    """A matched name as a place: leading "The", "In", "Seattle's" and a leading neighbourhood
    term dropped ("Central District Jimi Hendrix Park" -> "Jimi Hendrix Park")."""
    name = re.sub(r"^(?:(?:The|the|In|At|On|From|Seattle's)\s+)+", "", name.strip())
    for term in sorted(place_terms, key=len, reverse=True):
        if name.lower().startswith(term.lower() + " ") and len(name) > len(term) + 1:
            name = name[len(term) + 1:]
            break
    return name.strip()


def landmark_names(marks):
    """{lowercased name variant: landmark id}. Two-word names and up only: one-word names match
    too much ordinary prose."""
    out = {}
    for lid, p in marks.items():
        name = p.get("name", "")
        for v in {name, re.sub(r"^The\s+", "", name), re.sub(r"\s*\([^)]*\)\s*$", "", name)}:
            if len(v.split()) >= 2:
                out.setdefault(v.lower(), lid)
    return out


def place_mentions(project, run, marks):
    """{key: {"name", "landmark"?, "kind": landmark|term|local|other, "sources": {sid: count}}}."""
    names = landmark_names(marks)
    found = {}
    local_terms = list(run.get("localTerms", [])) + list(run.get("placeTerms", []))

    def add(key, name, kind, sid, landmark=None):
        row = found.setdefault(key, {"name": name, "kind": kind, "sources": {}})
        if landmark:
            row["landmark"] = landmark
        rank = ["landmark", "term", "local", "other"]
        if rank.index(kind) < rank.index(row["kind"]):
            row["kind"] = kind
        row["sources"][sid] = row["sources"].get(sid, 0) + 1

    for sid in sorted(project.sources):
        text = project.source_text(sid) or ""
        low = text.lower()
        for v, lid in names.items():
            for _ in re.finditer(r"\b" + re.escape(v) + r"\b", low):
                add("lm:" + lid, marks[lid]["name"], "landmark", sid, lid)
        for term in run.get("placeTerms", []):
            for _ in term_hits(text, [term]):
                add("t:" + term.lower(), term, "term", sid)
        for rx in (GENERIC, STREET):
            for m in rx.finditer(text):
                name = clean_name(m.group(1), run.get("placeTerms", []))
                key = name.lower()
                if any(key == k.split(":", 1)[1] for k in found if k.startswith("t:")) or key in names:
                    continue
                # Local only when its OWN sentence names the city or a neighbourhood: a 400-character
                # window marked London's 23 Brook Street local (the next paragraph named Seattle).
                kind = "local" if any(term_hits(sentence_of(text, m.start(), m.end()), local_terms)) else "other"
                add("g:" + key, name, kind, sid)
    return found


def cmd_places(project_root, budget=5000):
    project = Project(project_root)
    pj = load_json(project.path("project.json"), {}) or {}
    run = run_config(pj.get("run", ""))
    marks = landmarks(run)
    found = place_mentions(project, run, marks)
    order = {"landmark": 0, "term": 1, "local": 2, "other": 3}
    rows = sorted(found.values(), key=lambda r: (order[r["kind"]], -sum(r["sources"].values()), r["name"]))
    shown = 0
    print(f"{pj.get('subject', '?')}: {len(rows)} place name(s) in {len(project.sources)} source(s). "
          "Tie a place only when a quote you can copy NAMES it.")
    rest = []
    for r in rows:
        if r["kind"] == "other" or shown > budget:
            rest.append(r["name"])
            continue
        lm = marks.get(r.get("landmark") or "", {})
        head = f"\n== {r['name']}" + (f" — landmark {r['landmark']}, {lm.get('address', '')}" if lm else f" — {r['kind']}")
        print(head + " · " + ", ".join(f"{s}×{n}" for s, n in r["sources"].items()) + " ==")
        terms = [lm.get("name", r["name"])] if lm else [r["name"]]
        for sid in list(r["sources"])[:2]:
            text = project.source_text(sid) or ""
            toks, spans = richness.mention_spans(text, terms, window=35)
            for first, last, _ in spans[:2]:
                passage = " ".join(m.group(0) for m in toks[first:last + 1])
                print(f"  [{sid} words {first + 1}-{last + 1}] {passage}")
                shown += last - first + 1
    if rest:
        print("\nalso named, probably not local (read them only if one matters): " + ", ".join(rest[:80])
              + (f", and {len(rest) - 80} more" if len(rest) > 80 else ""))
    return 0


# ── checks ───────────────────────────────────────────────────────────────────

def tie_findings(project):
    t = thresholds()
    cfg = config()
    pj = load_json(project.path("project.json"), {}) or {}
    try:
        run = run_config(pj.get("run", ""))
    except Refused as e:
        return [finding("run_unknown", "hard", str(e))]
    out = []
    ev = (pj.get("identityEvidence") or "").strip()
    src = project.source_text(pj.get("identitySource", "wp")) or ""
    if not ev:
        out.append(finding("identity_missing", "hard", "project.json has no identityEvidence — start the person with `fame.py person`"))
    elif words(ev) < t["minQuoteWords"] or norm(ev) not in norm(src):
        out.append(finding("identity_not_verbatim", "hard", "identityEvidence is not a verbatim quote of its source"))
    elif not any(term_hits(ev, run["identityTerms"])):
        out.append(finding("identity_term_missing", "hard", f"identityEvidence states none of: {', '.join(run['identityTerms'])}"))
    ties = (load_json(project.path("ties.json"), {}) or {}).get("ties", [])
    if not ties:
        out.append(finding("ties_missing", "hard", "ties.json has no ties"))
    marks = landmarks(run)
    seen = set()
    for i, tie in enumerate(ties, 1):
        label = tie.get("id") or f"tie {i}"
        place = (tie.get("place") or "").strip()
        if not place:
            out.append(finding("tie_place_missing", "hard", f"{label}: no place"))
            continue
        if tie.get("kind") not in cfg["tieKinds"]:
            out.append(finding("tie_kind", "hard", f"{label}: kind {tie.get('kind')!r} is not one of {', '.join(cfg['tieKinds'])}"))
        lid = tie.get("landmark")
        if lid and lid not in marks:
            out.append(finding("landmark_unknown", "hard", f"{label}: landmark {lid!r} is not in the {run.get('landmarkPack')} pack"))
        text = project.source_text(str(tie.get("source", "")))
        quote = (tie.get("evidence") or "").strip()
        if text is None:
            out.append(finding("source_missing", "hard", f"{label}: source {tie.get('source')!r} has no fetched text"))
        elif words(quote) < t["minQuoteWords"]:
            out.append(finding("quote_too_short", "hard", f"{label}: evidence under {t['minQuoteWords']} words cannot be verified"))
        elif norm(quote) not in norm(text):
            out.append(finding("quote_not_found", "hard", f"{label}: evidence is not verbatim in source {tie.get('source')}", quote[:160]))
        else:
            names = [place] + list(tie.get("placeAliases") or []) + ([tie["address"]] if tie.get("address") else [])
            if lid in marks:
                names.append(marks[lid]["name"])
            if not any(norm(n) in norm(quote) for n in names if n):
                out.append(finding("tie_place_unnamed", "hard",
                                   f"{label}: the quote never names {place!r} — a tie is proved by a quote that names its place "
                                   "(add the name the source uses to placeAliases)", quote[:160]))
        if not YEAR.search(str(tie.get("date", ""))):
            out.append(finding("tie_undated", "soft", f"{label}: no year — the map can show it, the sub-story cannot place it in time"))
        key = (place.lower(), tie.get("kind"), str(tie.get("date", "")))
        if key in seen:
            out.append(finding("tie_duplicate", "soft", f"{label}: the same place, kind and date as an earlier tie"))
        seen.add(key)
    c = caps()
    if len(ties) > c["tiesPerPerson"]:
        out.append(finding("too_many_ties", "soft", f"{len(ties)} ties; keep the strongest {c['tiesPerPerson']}"))
    if len(project.sources) > c["sourcesPerPerson"]:
        out.append(finding("too_many_sources", "soft", f"{len(project.sources)} sources; this job reads at most {c['sourcesPerPerson']} per person"))
    return out


def vignette_findings(project, n):
    """A sub-story chapter: the chapter gate minus what needs a plan (growth, ceilings), plus the
    run's word range."""
    ch = project.chapter(n)
    if ch is None:
        return [finding("chapter_missing", "hard", f"chapters/{int(n):02d}.json does not exist")]
    out = (quotes.claim_findings(project, n) + quotes.copy_findings(project, n)
           + voice_lint.chapter_findings(project, n) + checks.number_findings(project, n)
           + checks.correction_findings(project, n))
    lo, hi = caps()["vignetteWords"]
    n_words = words(ch.get("text", ""))
    if n_words > hi:
        out.append(finding("over_ceiling", "hard", f"{n_words} words over the sub-story ceiling of {hi} — cut, do not reword"))
    elif n_words < lo:
        out.append(finding("under_floor", "soft", f"{n_words} words, under the {lo}-word floor"))
    return out


# ── merge ────────────────────────────────────────────────────────────────────

def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def place_key(tie):
    if tie.get("landmark"):
        return "lm:" + tie["landmark"]
    return "p:" + re.sub(r"[^a-z0-9]+", " ", re.sub(r"^the\s+", "", tie["place"].lower())).strip()


def cmd_merge(run_dir, lookup=coordinates):
    data = load_json(os.path.join(run_dir, "candidates.json"), {}) or {}
    run = run_config(data.get("run", ""))
    marks = landmarks(run)
    places, skipped = {}, []
    for name in sorted(os.listdir(run_dir)):
        root = os.path.join(run_dir, name)
        if not os.path.isfile(os.path.join(root, "project.json")):
            continue
        project = Project(root)
        hard = [f for f in tie_findings(project) if f["severity"] == "hard"]
        if hard:
            skipped.append(f"{name} ({len(hard)} hard finding(s); run fame.py check)")
            continue
        subject = (load_json(project.path("project.json"), {}) or {}).get("subject", name)
        for tie in (load_json(project.path("ties.json"), {}) or {}).get("ties", []):
            p = places.setdefault(place_key(tie), {"ties": []})
            p["ties"].append({**tie, "person": subject})
    wanted = [t.get("wikipedia") for p in places.values() for t in p["ties"] if t.get("wikipedia") and not t.get("landmark")]
    coords = lookup(wanted) if wanted else {}
    anchor = run.get("region", {})
    out, unplaced, elsewhere = [], [], []
    for key, p in sorted(places.items()):
        ties = p["ties"]
        first = ties[0]
        lid = first.get("landmark")
        lm = marks.get(lid or "", {})
        row = {"id": lid or ("fl-" + re.sub(r"[^a-z0-9]+", "-", key.split(":", 1)[1]).strip("-")),
               "name": lm.get("name") or first["place"],
               "address": lm.get("address") or next((t["address"] for t in ties if t.get("address")), ""),
               "category": "Landmark" if lm else "Not a landmark",
               "landmark": lid or "",
               "wikipedia": next((t["wikipedia"] for t in ties if t.get("wikipedia")), ""),
               "people": sorted({t["person"] for t in ties}),
               "ties": [{k: t.get(k) for k in ("person", "kind", "date", "what", "source", "evidence")} for t in ties]}
        if lm:
            row["lat"], row["lon"], row["coordsFrom"] = lm.get("lat"), lm.get("lon"), f"landmark pack {run.get('landmarkPack')}"
        elif row["wikipedia"] in coords:
            row["lat"], row["lon"] = coords[row["wikipedia"]]
            row["coordsFrom"] = "Wikipedia: " + row["wikipedia"]
        else:
            given = next((t for t in ties if t.get("lat") is not None and t.get("lon") is not None), None)
            if given:
                row["lat"], row["lon"], row["coordsFrom"] = given["lat"], given["lon"], given.get("coordsFrom", "given")
        if row.get("lat") is None:
            unplaced.append(row)
            continue
        if anchor.get("anchorLat") is not None and km((row["lat"], row["lon"]), (anchor["anchorLat"], anchor["anchorLon"])) > anchor.get("radiusKm", 40):
            elsewhere.append(row)
            continue
        out.append(row)
    save_json(os.path.join(run_dir, "places.json"), {"run": data.get("run"), "generatedAt": now(), "places": out,
                                                     "unplaced": unplaced, "elsewhere": elsewhere, "skipped": skipped})
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "name", "lat", "lon", "address", "category", "landmark", "people", "text", "wikipedia", "coordsFrom"])
    for r in out + unplaced:
        text = "; ".join(f"{t['person']}: {t.get('what') or t.get('kind')} ({t.get('date') or 'undated'})" for t in r["ties"])
        w.writerow([r["id"], r["name"], r.get("lat", ""), r.get("lon", ""), r["address"], r["category"], r["landmark"],
                    ", ".join(r["people"]), text, r["wikipedia"], r.get("coordsFrom", "")])
    with open(os.path.join(run_dir, "places.csv"), "w", encoding="utf-8", newline="") as fh:
        fh.write(buf.getvalue())
    marks_n = sum(1 for r in out if r["landmark"])
    print(f"{len(out)} place(s) on the map: {marks_n} landmark(s), {len(out) - marks_n} not landmarks. "
          f"{len(unplaced)} without coordinates (in places.csv with empty lat/lon), {len(elsewhere)} outside the region.")
    for r in out + unplaced:
        print(f"  {r['category']:<15} {r['name'][:48]:<48} {', '.join(r['people'])[:60]}")
    for s in skipped:
        print(f"  skipped {s}")
    return 0


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def flag(argv, name, default=None):
    if name in argv:
        i = argv.index(name)
        if i + 1 < len(argv):
            return argv[i + 1]
    return default


def main(argv):
    try:
        if len(argv) >= 4 and argv[1] == "candidates":
            return cmd_candidates(argv[2], argv[3])
        if len(argv) >= 3 and argv[1] == "screen":
            top = flag(argv, "--top")
            return cmd_screen(argv[2], int(top) if top else None)
        if len(argv) >= 4 and argv[1] == "person":
            return cmd_person(argv[2], argv[3], flag(argv, "--identity"))
        if len(argv) >= 3 and argv[1] == "places":
            return cmd_places(argv[2])
        if len(argv) >= 3 and argv[1] == "check":
            return report("ties", tie_findings(Project(argv[2])))
        if len(argv) >= 3 and argv[1] == "gate":
            n = argv[3] if len(argv) >= 4 else 1
            return report(f"sub-story ch{n}", vignette_findings(Project(argv[2]), n))
        if len(argv) >= 3 and argv[1] == "merge":
            return cmd_merge(argv[2])
    except (Refused, fetch.Refused) as e:
        print(f"REFUSED: {e}")
        return 3
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
