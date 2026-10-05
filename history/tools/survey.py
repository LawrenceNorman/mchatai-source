#!/usr/bin/env python3
"""A series' long list: the people a community's encyclopedias hold, with their dates, a line
about each, how strongly each is tied to the place, and where a history line falls.
(2026-10-05, Black Seattle: "a long list ... so I can see where there is a line".)

A survey is LEADS, never members. Who belongs in a series is decided by a dossier and the
identity check (PLAYBOOK §1); an encyclopedia filing a person under a topic is a lead, never
evidence of who they are. No model is called.

  survey.py run  <series-id> <out-dir> [--stories <dir>] [--roadmap "Name;Name"] [--fame <run-dir>]
                 fetch every source in the series' `survey` block; write <out-dir>/survey.json.
                 --stories marks who is written or scouted; --fame is the fame.py run folder
  survey.py show <out-dir> [--line N]
                 the list by era, with the history line drawn N years back (default: the
                 series' `historyLineYears`)

Sources (series.json `survey.sources`, each optional):
  historylink-topic  {topicId}  biographies filed under a HistoryLink topic ("Surname, Given
                                (dates)"); each essay is read for its summary and dated sentences
  blackpast-search   {term}     BlackPast entries for a person whose BODY names the place. The
                                encyclopedia is based in Seattle, so its search matches its own
                                address on 2,000 entries; the body never carries that
  fame-run           {run}      a fame.py run's ranked names and identity statements

Each person gets: names, born/died (conflicts kept), a summary sentence, a field (keywords), the
place's mentions in their entry, `notableFrom` (the earliest year a sentence ties a role or an
arrival to the place, with that sentence), Wikipedia pageviews for the last 60 days when an
article of that name exists, and our status (written, scouted, roadmap). Every estimate says
it is one.
"""
import datetime
import html
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import HISTORY, load_json, save_json  # noqa: E402
import cite  # noqa: E402
import fame  # noqa: E402
import fetch  # noqa: E402

YEAR = re.compile(r"\b(1[6-9]\d\d|20[0-4]\d)\b")
SENT = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"“])")
# "Barnett, Powell S. (1883-1971)", "Alley-Barnes, Royal (b. 1946)", "Lopes, Manuel (1812-?)"
HL_BIO = re.compile(r"^(?P<surname>[^,()]+),\s*(?P<given>[^()]+?)\s*\((?P<dates>[^)]*\d{4}[^)]*)\)\s*$")
# "Powell S. Barnett (1883-1971)", "Richard Gadson (1986-  )", "Seh-Dong-Hong-Beh (1835?-1860?)"
BP_BIO = re.compile(r"^(?P<name>[^()]+?)\s*\((?P<dates>(?:c\.\s*)?\d{4}\??\s*[-–]\s*(?:\d{4}\??)?\s*)\)\s*$")
NOT_A_PERSON = re.compile(r"\b(Church|Society|Association|League|Club|Company|School|University|College|"
                          r"Hospital|Union|Party|Council|Committee|Movement|Foundation|Institute|Center|"
                          r"Centre|Museum|Newspaper|Journal|Lodge|Temple|Mission|Inc\.?|Corporation|Band|"
                          r"Orchestra|Choir|Fund|Project|Alliance|Coalition|Organization|Bank)\b")
HONORIFIC = {"bishop", "rev", "reverend", "dr", "judge", "mother", "father", "sister", "brother",
             "elder", "deacon", "captain", "major", "general", "sir", "madame", "mrs", "mr", "ms", "miss"}
SUFFIX = {"jr", "sr", "ii", "iii", "iv"}
ROLE = re.compile(r"\b(elected|appointed|founded|co-founded|established|opened|organized|organised|became|"
                  r"served|led|hired|named|won|published|recorded|signed|played|performed|pastor|president|"
                  r"director|chair|first|joined|launched|built|owned|ran|taught|coached|began|started)\b", re.I)
ARRIVAL = re.compile(r"\b(arrived|moved|came|settled|relocated|returned)\b", re.I)
NOT_NOTABLE = re.compile(r"\b(born|graduated|graduating|attended|enrolled|studied|died|buried|retired)\b", re.I)
FIELDS = [   # first match wins; checked against the summary sentence, then the opening paragraph
    ("music", r"\b(jazz|musician|singer|vocalist|pianist|saxophon\w*|trumpet\w*|drummer|bandleader|composer|"
              r"rapper|hip.hop|guitarist|bluesman|blues|songwriter|record producer|music)\b"),
    ("government & law", r"\b(mayor|council\w*|legislat\w*|senator|representative|governor|judge|justice|"
                         r"attorney|lawyer|politician|commissioner|elected official|city official|police)\b"),
    ("civil rights & community", r"\b(civil rights|activist|NAACP|Urban League|organizer|organiser|community "
                                 r"leader|advocate|open housing|Black Panther|CORE)\b"),
    ("faith", r"\b(minister|pastor|bishop|reverend|church|clergy\w*|preacher|evangelist)\b"),
    ("education & scholarship", r"\b(teacher|educator|professor|historian|scholar|principal|librarian|school)\b"),
    ("medicine & science", r"\b(physician|doctor|nurse|dentist|surgeon|scientist|engineer|inventor|chemist|"
                           r"pharmacist|medical)\b"),
    ("press & letters", r"\b(journalist|editor|publisher|newspaper|writer|author|poet|novelist|reporter|"
                        r"broadcaster)\b"),
    ("arts", r"\b(artist|painter|sculptor|photographer|actor|actress|dancer|playwright|filmmaker|designer)\b"),
    ("sports", r"\b(basketball|football|baseball|boxer|athlete|NBA|NFL|Olympic|track|coach)\b"),
    ("business & labor", r"\b(business\w*|entrepreneur|owner|merchant|barber|restaurateur|hotel\w*|banker|"
                         r"union|labor|labour|developer|contractor)\b"),
    ("military", r"\b(soldier|veteran|army|navy|marine|airman|Buffalo Soldier|military)\b"),
]


def text_of(fragment):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment or ""))).strip()


CACHE_DIR = None        # <out-dir>/_cache during a run: a rerun reads what it already fetched


def get_text(url):
    """One polite GET (fetch.py's per-host clock, the tools' User-Agent), cached per run folder."""
    import hashlib
    path = os.path.join(CACHE_DIR, hashlib.sha1(url.encode()).hexdigest() + ".txt") if CACHE_DIR else None
    if path and os.path.isfile(path):
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    host = urllib.parse.urlparse(url).hostname or ""
    fetch.throttle(host, fetch.host_interval(host))
    req = urllib.request.Request(url, headers={"User-Agent": fame.API_UA})
    with urllib.request.urlopen(req, timeout=40) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    if path:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)
    return text


def life_dates(dates):
    """'1883-1971' → (1883, 1971, False); 'b. 1946' / '1986-  ' → (1946, None, True); '1812-?' → (1812, None, False)."""
    d = dates.replace("–", "-")
    years = [int(y) for y in YEAR.findall(d)]
    if re.match(r"^\s*b\.", d) or re.search(r"-\s*$", d):
        return (years[0] if years else None), None, True
    if "-" in d:
        born, died = d.split("-", 1)
        b = YEAR.search(born)
        x = YEAR.search(died)
        return (int(b.group(1)) if b else None), (int(x.group(1)) if x else None), False
    return (years[0] if years else None), None, False


def name_key(name, born):
    words = [w.strip(".,").lower() for w in re.sub(r"[\"“”'(][^\"“”')]*[\"“”')]", " ", name).split()]
    words = [w for w in words if w and w not in HONORIFIC]
    while words and words[-1] in SUFFIX:
        words = words[:-1]
    if not words:
        return None
    return (words[-1], words[0], born)


def sentences(text):
    """cite.py's splitter: an initial ("John T. Gayton") does not end a sentence."""
    return [text[a:b].strip() for a, b in cite.sentences(text) if text[a:b].strip()]


def notable_from(text, born, place_terms):
    """(year, sentence, basis): the earliest year a sentence ties a role or an arrival to the place.
    Birth, schooling and death sentences never count, nor years before age 15."""
    best = None
    floor = (born + 15) if born else 1800
    for s in sentences(text):
        if NOT_NOTABLE.search(s) and not ROLE.search(s):
            continue
        here = any(t.lower() in s.lower() for t in place_terms)
        if not here or not (ROLE.search(s) or ARRIVAL.search(s)):
            continue
        ys = [int(y) for y in YEAR.findall(s) if floor <= int(y) <= datetime.date.today().year]
        if ys and (best is None or min(ys) < best[0]):
            best = (min(ys), s[:300], "a dated sentence naming the place")
    return best


def field_of(*texts):
    for t in texts:
        for name, pat in FIELDS:
            if t and re.search(pat, t, re.I):
                return name
    return "other"


# "drafted by the Seattle SuperSonics" ties a player to a team, not to the city: counted apart, so
# Bill Russell (who coached there and stayed) and a visiting quarterback can be told apart.
TEAM = re.compile(r"\bSeattle (?:Seahawks|SuperSonics|Sonics|Mariners|Storm|Sounders|Reign|Kraken|Pilots|"
                  r"Rainiers|Totems|Thunderbirds|Steelheads|Majestics|Dragons|Bombers)\b")


def place_count(text, place_terms):
    """Mentions of the place that are not a sports team's name."""
    plain = TEAM.sub(" ", text)
    return sum(len(re.findall(r"\b" + re.escape(t) + r"\b", plain)) for t in place_terms)


def team_count(text):
    return len(TEAM.findall(text))


# ── sources ──────────────────────────────────────────────────────────────────

def historylink_topic(src, place_terms, log):
    out, page = [], 1
    while True:
        url = ("https://www.historylink.org/Search/Results?" + urllib.parse.urlencode(
            {"TopicId": src["topicId"], "FilterTopic": "on", "SortBy": "Title", "PageSize": 100, "ResultsPage": page}))
        t = get_text(url)
        rows = [(m.group(1), text_of(m.group(2))) for m in re.finditer(r'href="(/File/\d+)"[^>]*>(.*?)</a>', t, re.S)]
        bios = [(href, title) for href, title in rows if HL_BIO.match(title) and not NOT_A_PERSON.search(title)]
        if not rows or not any("(" in title for _, title in rows):
            break
        for href, title in bios:
            m = HL_BIO.match(title)
            given, surname = m.group("given").strip(), m.group("surname").strip()
            suffix = ""
            sm = re.search(r"\b(Jr\.|Sr\.|II|III)$", given)
            if sm:
                given, suffix = given[:sm.start()].strip(), " " + sm.group(1)
            born, died, living = life_dates(m.group("dates"))
            out.append({"name": f"{given} {surname}{suffix}", "born": born, "died": died, "living": living,
                        "source": {"site": "HistoryLink", "url": "https://www.historylink.org" + href, "title": title}})
        log(f"HistoryLink topic {src['topicId']} page {page}: {len(bios)} biographies")
        if f"ResultsPage={page + 1}" not in t:
            break
        page += 1
    for p in out:                                   # each essay: its summary and its dated sentences
        try:
            t = get_text(p["source"]["url"])
        except Exception as e:                      # a missing essay is a gap, not a stop
            log(f"  could not read {p['source']['url']}: {e}")
            continue
        paras = []
        for raw in re.findall(r"<p>(.*?)</p>", t, re.S):
            s = text_of(raw)
            if s.startswith(("Sources", "Licensing", "©")) or "HistoryLink.org" in s:
                break
            if len(s) > 40:
                paras.append(s)
        body = " ".join(paras)
        p["summary"] = sentences(paras[0])[0] if paras else ""
        p["opening"] = paras[0] if paras else ""
        p["placeMentions"] = place_count(body, place_terms)
        p["teamMentions"] = team_count(body)
        p["notable"] = notable_from(TEAM.sub(" ", body), p["born"], place_terms)
    return out


def blackpast_search(src, place_terms, log):
    out, page = [], 1
    while True:
        url = ("https://www.blackpast.org/wp-json/wp/v2/posts?" + urllib.parse.urlencode(
            {"search": src["term"], "per_page": 100, "page": page, "_fields": "title,link,content"}))
        try:
            rows = json.loads(get_text(url))
        except urllib.error.HTTPError as e:
            if e.code == 400:                       # past the last page
                break
            raise
        if not rows:
            break
        kept = 0
        for r in rows:
            title = html.unescape(r["title"]["rendered"]).strip()
            m = BP_BIO.match(title)
            if not m or "/african-american-history/" not in r["link"] or NOT_A_PERSON.search(m.group("name")):
                continue
            # A picture's credit line ("Image Ownership: Public Domain") is not the entry.
            body = text_of(re.sub(r"<figure.*?</figure>|<figcaption.*?</figcaption>", " ", r["content"]["rendered"], flags=re.S))
            body = re.sub(r"^[“\"]?Image (?:Ownership|Courtesy|Source)[^”\"]*[”\"]?\s*", "", body)
            n, teams = place_count(body, place_terms), team_count(body)
            if not n and not teams:
                continue
            born, died, living = life_dates(m.group("dates"))
            first = sentences(body)[0] if body else ""
            out.append({"name": m.group("name").strip(), "born": born, "died": died, "living": living,
                        "summary": first, "opening": body[:600], "placeMentions": n, "teamMentions": teams,
                        "notable": notable_from(TEAM.sub(" ", body), born, place_terms),
                        "source": {"site": "BlackPast", "url": r["link"], "title": title}})
            kept += 1
        log(f"BlackPast '{src['term']}' page {page}: {kept} people whose entry names the place")
        page += 1
    return out


def fame_run(src, place_terms, log, run_dir):
    """The fame.py run's screened names (identity statements) from its run folder, when given."""
    out = []
    screen = load_json(os.path.join(run_dir, "screen.json"), {}) if run_dir else {}
    for r in screen.get("rows", []):
        if not r.get("identity"):
            continue
        out.append({"name": r["title"].split(" (")[0], "born": None, "died": None, "living": None,
                    "summary": "", "opening": "", "placeMentions": r.get("localMentions", 0), "notable": None,
                    "identityStatement": r["identity"][0],
                    "source": {"site": "Wikipedia", "url": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(r["title"].replace(" ", "_")),
                               "title": r["title"]}})
    log(f"fame run {src['run']}: {len(out)} names with an identity statement")
    return out


# ── the list ─────────────────────────────────────────────────────────────────

def same_given(a, b):
    """'norm' and 'norman', 'sam' and 'samuel', 'manuel' and 'emanuel'. Only ever asked about two
    rows with the same surname AND the same birth year."""
    short, long_ = sorted((a, b), key=len)
    return (len(short) >= 3 and long_.startswith(short)) or (len(short) >= 4 and short in long_)


def middle_initials(name):
    """The initials between the first name and the surname: 'John T. Gayton' → 't'."""
    words = [w.strip(".,").lower() for w in name.split() if w.strip(".,").lower() not in HONORIFIC | SUFFIX]
    return "".join(w[0] for w in words[1:-1] if w and not w.startswith(("“", '"')))


def merge(rows):
    people = {}
    for r in rows:
        k = name_key(r["name"], r["born"])
        loose = name_key(r["name"], None)
        hit = people.get(k) or next((p for kk, p in people.items()
                                     if kk[:2] == (loose[:2] if loose else None)
                                     and (kk[2] is None or r["born"] is None or abs(kk[2] - r["born"]) <= 1)), None)
        if hit is None and loose and r["born"]:
            hit = next((p for kk, p in people.items() if kk[0] == loose[0] and kk[2] == r["born"]
                        and same_given(kk[1], loose[1])), None)
        if hit is None:
            hit = people[k] = {"name": r["name"], "names": [], "born": r["born"], "died": r["died"],
                               "living": r["living"], "summary": "", "opening": "", "placeMentions": 0,
                               "notable": None, "sources": [], "conflicts": []}
        if r["name"] not in hit["names"]:
            hit["names"].append(r["name"])
        for f in ("born", "died"):
            if r[f] and hit[f] and r[f] != hit[f]:
                hit["conflicts"].append(f"{f}: {hit[f]} or {r[f]} ({r['source']['site']})")
            hit[f] = hit[f] or r[f]
        if r["living"] is not None and hit["living"] is None:
            hit["living"] = r["living"]
        if r.get("summary") and (not hit["summary"] or r["source"]["site"] == "HistoryLink"):
            hit["summary"], hit["opening"] = r["summary"], r.get("opening", "")
        hit["placeMentions"] = max(hit["placeMentions"], r.get("placeMentions") or 0)
        hit["teamMentions"] = max(hit.get("teamMentions", 0), r.get("teamMentions") or 0)
        if r.get("notable") and (not hit["notable"] or r["notable"][0] < hit["notable"][0]):
            hit["notable"] = r["notable"]
        if r.get("identityStatement"):
            hit["identityStatement"] = r["identityStatement"]
        hit["sources"].append(r["source"])
    return list(people.values())


def pageviews(people, log):
    """Last 60 days of views for each person whose name is THEIR Wikipedia article: not a
    disambiguation page, and its opening names their birth or death year (or, with neither known,
    Seattle). "George Bush" (1790-1863) otherwise counts another man's readers."""
    names = sorted({p["name"] for p in people})
    titles = fame.resolve_titles(names)
    intros = {}
    cand = sorted({t for t in titles.values() if t})
    for i in range(0, len(cand), 20):
        q = fame.wiki(action="query", titles="|".join(cand[i:i + 20]), prop="pageprops|extracts", exintro=1,
                      explaintext=1, exlimit=20, ppprop="disambiguation").get("query", {})
        for pg in q.get("pages", []):
            if "disambiguation" not in (pg.get("pageprops") or {}):
                intros[pg["title"]] = pg.get("extract") or ""
    for p in people:
        t = titles.get(p["name"])
        intro = intros.get(t)
        years = [str(y) for y in (p.get("born"), p.get("died")) if y]
        if intro is None or (years and not any(y in intro for y in years)) or (not years and "Seattle" not in intro):
            titles[p["name"]] = None
    wanted = sorted({t for t in titles.values() if t})
    views = {}
    for i in range(0, len(wanted), 50):
        params = dict(action="query", prop="pageviews", titles="|".join(wanted[i:i + 50]), pvipdays=60)
        while True:              # the API answers a batch in parts: follow `continue` to the end
            r = fame.wiki(**params)
            for pg in r.get("query", {}).get("pages", []):
                pv = pg.get("pageviews")
                if pv:
                    views[pg["title"]] = sum(v or 0 for v in pv.values())
            if "continue" not in r:
                break
            params.update(r["continue"])
    for p in people:
        t = titles.get(p["name"])
        if t:
            p["wikipedia"] = {"title": t, "views60": views.get(t)}
    log(f"Wikipedia: {sum(1 for p in people if p.get('wikipedia'))} of {len(people)} names are articles")


def status_of(people, stories_dir, roadmap):
    have = {}
    if stories_dir and os.path.isdir(stories_dir):
        for slug in os.listdir(stories_dir):
            meta = load_json(os.path.join(stories_dir, slug, "project.json"), None)
            if not isinstance(meta, dict):
                continue
            d = load_json(os.path.join(stories_dir, slug, "dossier.json"), {}) or {}
            names = [meta.get("subject"), meta.get("name"), d.get("subject")] + list(d.get("aliases") or [])
            state = "written" if os.path.isfile(os.path.join(stories_dir, slug, "book", "manifest.json")) else "scouted"
            born = fame_year((d.get("lifespan") or {}).get("born"))
            known = [n for n in names if isinstance(n, str) and n.strip()]
            for n in known:
                k = name_key(n, None)
                if k:
                    have.setdefault(k[:2], []).append((state, slug, born, known))
    for p in people:
        for n in p["names"]:
            k = name_key(n, None)
            for state, slug, born, known in have.get(k[:2] if k else None, []):
                if born is not None and p["born"] is not None and abs(born - p["born"]) > 1:
                    continue
                # A son or grandson shares a name: with no birth year to tell them apart, the
                # middle initials must agree (John T. Gayton is not John Jacob or John Cyrus).
                mi = middle_initials(n)
                if born is None and mi and not any(middle_initials(x) in ("", mi) and middle_initials(x) == mi
                                                   for x in known):
                    continue
                p["status"], p["story"] = state, slug
        if "status" not in p and any(name_key(n, None) and name_key(n, None)[:2] == name_key(r, None)[:2]
                                     for n in p["names"] for r in roadmap):
            p["status"] = "roadmap"
    for r in roadmap:                               # on the roadmap but in no source we read
        if not any(p.get("status") == "roadmap" for p in people if name_key(r, None)[:2] in
                   [name_key(n, None)[:2] for n in p["names"] if name_key(n, None)]):
            people.append({"name": r, "names": [r], "born": None, "died": None, "living": False, "summary": "",
                           "opening": "", "placeMentions": 0, "notable": None, "sources": [], "conflicts": [],
                           "status": "roadmap"})


def fame_year(v):
    m = YEAR.search(str(v or ""))
    return int(m.group(1)) if m else None


def cmd_run(series_id, out_dir, stories_dir=None, roadmap=(), fame_dir=None):
    series = next((s for s in (load_json(os.path.join(HISTORY, "series.json"), {}) or {}).get("series", [])
                   if s.get("id") == series_id), None)
    cfg = (series or {}).get("survey")
    if not cfg:
        print(f"series.json has no `survey` block for {series_id!r}")
        return 2
    place_terms = cfg.get("placeTerms") or ["Seattle"]
    os.makedirs(out_dir, exist_ok=True)
    global CACHE_DIR
    CACHE_DIR = os.path.join(out_dir, "_cache")
    log = lambda s: print(s, flush=True)       # noqa: E731
    rows = []
    for src in cfg.get("sources", []):
        kind = src.get("kind")
        try:
            if kind == "historylink-topic":
                rows += historylink_topic(src, place_terms, log)
            elif kind == "blackpast-search":
                rows += blackpast_search(src, place_terms, log)
            elif kind == "fame-run":
                rows += fame_run(src, place_terms, log, fame_dir)
        except (fame.Refused, urllib.error.URLError, TimeoutError) as e:
            log(f"{kind}: stopped early ({e}); the list holds what was read before it")
    people = merge(rows)
    try:
        pageviews(people, log)
    except fame.Refused as e:
        log(f"pageviews: {e}")
    status_of(people, stories_dir, list(roadmap))
    for p in people:
        p["field"] = field_of(p.get("summary"), p.get("opening"))
        n = p.get("notable")
        p["notableFrom"] = n[0] if n else None
        p["notableEvidence"] = n[1] if n else ""
        p.pop("notable", None)
        p["tie"] = ("strong" if p["placeMentions"] >= 2 else "named" if p["placeMentions"] == 1
                    else "team" if p.get("teamMentions") else "none found")
    people.sort(key=lambda p: (p.get("notableFrom") or (p["born"] + 30 if p["born"] else 9999), p["name"]))
    save_json(os.path.join(out_dir, "survey.json"), {
        "series": series_id, "generated": datetime.date.today().isoformat(),
        "historyLineYears": series.get("historyLineYears"), "placeTerms": place_terms,
        "note": "Leads, not members: each needs a dossier and the identity check before it can be written.",
        "people": people})
    print(f"{len(people)} people → {os.path.join(out_dir, 'survey.json')}")
    return 0


def cmd_show(out_dir, line=None):
    data = load_json(os.path.join(out_dir, "survey.json"), None)
    if not data:
        print("no survey.json: run first")
        return 2
    years = line or data.get("historyLineYears") or 30
    cut = datetime.date.today().year - years
    by = {}
    for p in data["people"]:
        era = p.get("notableFrom") or ((p["born"] + 30) if p.get("born") else None)
        by.setdefault((era // 10 * 10) if era else None, []).append((era, p))
    print(f"{len(data['people'])} people; history line {years} years: notable by {cut}")
    for dec in sorted(by, key=lambda d: d if d is not None else 9999):
        print(f"\n{dec or 'undated'}s" if dec else "\nundated")
        for era, p in by[dec]:
            mark = " " if era and era <= cut else "›"
            st = f" [{p['status']}]" if p.get("status") else ""
            yrs = f"{p.get('born') or '?'}–{'' if p.get('living') else (p.get('died') or '?')}"
            print(f" {mark} {p['name']} ({yrs}) · {p['field']} · {p['tie']}{st}")
    return 0


def main(argv):
    def flag(name):
        return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else None
    if len(argv) >= 4 and argv[1] == "run":
        roadmap = [n.strip() for n in (flag("--roadmap") or "").split(";") if n.strip()]
        return cmd_run(argv[2], argv[3], flag("--stories"), roadmap, flag("--fame"))
    if len(argv) >= 3 and argv[1] == "show":
        return cmd_show(argv[2], int(flag("--line")) if flag("--line") else None)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
