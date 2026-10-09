#!/usr/bin/env python3
"""Pictures for a History Writer story, gathered while researching (images.json, voice.md §14).

  images.py find  <project> [--article "Wikipedia title" ...] [--commons "search words"] [--limit N]
                         candidates from the articles' pictures and a Commons search, with
                         licence, date, size and description → images/candidates.json.
                         Licences a paid story may not use are listed apart, never offered.
  images.py add   <project> "File:Name.jpg" --caption "…" --evidence "…" --chapter N
                  --after "words copied from the paragraph it follows"
                  [--evidence-source description|<source id>] [--credit "…"]
                         record it in images/index.json, save its description (the caption's
                         default source) and a copy of the picture
  images.py portrait <project> <id | "File:Name.jpg"> [--crop x,y,w,h]
                  [--caption "…" --evidence "…" [--evidence-source …] [--credit "…"]]
                         the story's portrait, on the book's cards and the story's first page: a
                         picture already placed (its id), or a Commons file shown only as the
                         portrait, never in a chapter, its caption checked like any picture's.
                         --crop takes one person out of a group photograph: fractions of the
                         picture, left, top, width, height. Recorded in project.json "portrait".
  images.py portrait <project> pd --url <image> --page <page> --published YYYY --credit "…"
                  --caption "…" --evidence "…" --evidence-source <source id> [--crop x,y,w,h]
                         a public-domain picture from outside Commons as the portrait: a book plate
                         or a newspaper cut published in the United States more than 95 years ago.
                         Its caption's evidence is a fetched source of the story, the page that
                         prints it (a 1926 autobiography's frontispiece, 2026-10-09).
  images.py portrait <project> permission --url <image> --page <item page> --describe-url <url>
                  --holder "Courtesy …" --caption "…" --evidence "…" [--date …] [--crop x,y,w,h]
                         a picture the author has permission to use, non-commercially, as the
                         portrait: its caption's evidence is the holder's own page about it. Its
                         licence reads "Used with permission (non-commercial)"; a paid edition must
                         clear each such picture again (images.json `permission`).
  images.py check <project>   licences, credits, captions checked against their sources,
                              placements that resolve to one paragraph, the voice's phrase rules
  images.py list  <project>   what is placed where
  images.py remove <project> <id>   take a placed picture out: its index entry, copy and description

Only real photographs, documents and maps from open archives: a caption is a fact like any
other, and a picture someone made up of a real person is the invention this product refuses.
Exit codes: 0 clean, 1 findings, 2 usage, 3 refused.
"""
import datetime
import html
import json
import os
import re
import sys
import types
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch  # noqa: E402
import voice_lint  # noqa: E402
from _hw import HISTORY, Project, finding, load_json, norm, report, save_json, words  # noqa: E402

API_UA = "mChatAI-HistoryWriter/1.0 (https://mchatai.com; history research tools)"
COMMONS = "https://commons.wikimedia.org/w/api.php"
WIKI = "https://en.wikipedia.org/w/api.php"
META = "LicenseShortName|LicenseUrl|Artist|Credit|DateTimeOriginal|ImageDescription|ObjectName"


class Refused(Exception):
    pass


def config():
    return load_json(os.path.join(HISTORY, "images.json"), {}) or {}


def reader_hosts():
    """Hosts StoryMaker's Read view may fetch pictures from (content/markdown-images.json), or
    None when that file is not beside history/. A picture from any other host shows as a link."""
    rules = load_json(os.path.join(os.path.dirname(HISTORY), "content", "markdown-images.json"), None)
    if not rules:
        return None
    return {h.lower() for h in rules.get("remoteHosts", [])}


# ── licences ─────────────────────────────────────────────────────────────────

def licence_verdict(name):
    """(allowed, why). NC and ND are refused whatever else the name says: "CC BY-NC" must
    never pass as "CC BY"."""
    lic = (name or "").strip()
    tokens = set(re.split(r"[\s\-_/.]+", lic.upper()))
    if not lic:
        return False, "no licence stated"
    if "NC" in tokens or "ND" in tokens:
        return False, f"{lic}: non-commercial or no-derivatives"
    if "FAIR" in tokens or "NONFREE" in tokens or "NON-FREE" in lic.upper():
        return False, f"{lic}: not a free licence"
    for allowed in config().get("allowedLicenses", []):
        if lic.upper().startswith(allowed.upper()):
            return True, ""
    return False, f"{lic}: not in images.json allowedLicenses"


# ── the archives ─────────────────────────────────────────────────────────────

def get_json(base, **params):
    params.update(format="json", formatversion="2")
    url = base + "?" + urllib.parse.urlencode(params)
    host = urllib.parse.urlparse(url).hostname or ""
    fetch.throttle(host, fetch.host_interval(host))
    req = urllib.request.Request(url, headers={"User-Agent": API_UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise Refused(f"HTTP {e.code} from {host}")
    except (urllib.error.URLError, TimeoutError) as e:
        raise Refused(f"could not reach {host} ({e}); run the same command again later")


def plain(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value or ""))).strip()


SKIP = re.compile(r"\.(svg)$|commons-logo|wikiquote|wikisource|question_book|symbol_|icon|flag_of", re.I)


def article_files(title):
    d = get_json(WIKI, action="query", prop="images", imlimit=50, redirects=1, titles=title)
    pages = d.get("query", {}).get("pages", [])
    return [i["title"] for p in pages for i in p.get("images", []) if not SKIP.search(i["title"])]


def commons_search(query, limit):
    d = get_json(COMMONS, action="query", list="search", srsearch=query, srnamespace=6, srlimit=limit)
    return [r["title"] for r in d.get("query", {}).get("search", []) if not SKIP.search(r["title"])]


def file_info(titles):
    """{title: candidate} for files on Commons, then for files local to en.wikipedia."""
    width = config().get("thumbnailWidth", 1200)
    out, missing = {}, []
    for base in (COMMONS, WIKI):
        todo = list(dict.fromkeys(titles if base == COMMONS else missing))
        missing = []
        for i in range(0, len(todo), 40):
            d = get_json(base, action="query", prop="imageinfo", iiprop="url|size|mime|extmetadata",
                         iiurlwidth=width, iiextmetadatafilter=META, titles="|".join(todo[i:i + 40]))
            q = d.get("query", {})
            back = {x["to"]: x["from"] for x in q.get("normalized", [])}
            for p in q.get("pages", []):
                info = (p.get("imageinfo") or [None])[0]
                title = back.get(p.get("title"), p.get("title"))
                if not info:
                    missing.append(title)
                    continue
                md = info.get("extmetadata") or {}
                g = lambda k: plain((md.get(k) or {}).get("value", ""))
                ok, why = licence_verdict(g("LicenseShortName"))
                out[title] = {
                    "title": p.get("title"), "url": info.get("thumburl") or info.get("url"),
                    "originalUrl": info.get("url"), "pageUrl": info.get("descriptionurl"),
                    "width": info.get("width"), "height": info.get("height"), "mime": info.get("mime"),
                    "license": g("LicenseShortName"), "licenseUrl": g("LicenseUrl"),
                    "artist": g("Artist"), "credit": g("Credit"), "date": g("DateTimeOriginal"),
                    "objectName": g("ObjectName"), "description": g("ImageDescription"),
                    "repository": "commons" if base == COMMONS else "wikipedia",
                    "allowed": ok, "refusedWhy": why,
                }
    return out


def merge_candidates(project, rows):
    """Add rows to images/candidates.json, by title, under a lock, and return everything held.
    It used to overwrite the file on every search, so the third story's four parallel writers
    would have raced on it, and its pictures were skipped (2026-10-04)."""
    import fcntl
    os.makedirs(project.path("images"), exist_ok=True)
    with open(project.path("images", ".candidates.lock"), "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        held = {r["title"]: r for r in load_json(project.path("images", "candidates.json"), []) or []}
        held.update({r["title"]: r for r in rows})
        merged = sorted(held.values(), key=lambda r: (not r.get("allowed"), r["title"]))
        save_json(project.path("images", "candidates.json"), merged)
    return merged


def cmd_find(project, articles, query, limit):
    titles = []
    for a in articles:
        titles += article_files(a)
    if query:
        titles += commons_search(query, limit)
    if not titles:
        print("nothing found: name an article (--article) or search Commons (--commons)")
        return 1
    found = file_info(list(dict.fromkeys(titles)))
    rows = sorted(found.values(), key=lambda r: (not r["allowed"], r["title"]))
    held = merge_candidates(project, rows)
    usable = [r for r in rows if r["allowed"] and (r.get("mime") or "").startswith("image/")]
    print(f"{len(usable)} usable picture(s) of {len(rows)} found; images/candidates.json now holds {len(held)}")
    for r in usable:
        print(f"\n{r['title']}\n  {r['license']} · {r['date'] or 'no date'} · {r['width']}×{r['height']}"
              f" · {r['artist'] or 'no author named'}\n  {r['description'][:240]}")
    refused = [r for r in rows if not r["allowed"]]
    if refused:
        print("\nnot usable: " + "; ".join(f"{r['title']} ({r['refusedWhy']})" for r in refused[:20]))
    return 0


# ── placing a picture ────────────────────────────────────────────────────────

def index(project):
    return load_json(project.path("images", "index.json"), []) or []


UNKNOWN_AUTHOR = re.compile(r"^(?:unknown(?:\s+(?:author|photographer|artist))?[\s,;.]*)+$", re.I)


UNKNOWN_PHRASE = re.compile(r"\bunknown\s+(?:author|photographer|artist)\b", re.I)


def credit_name(who):
    """The artist as a caption should name them. Commons' HTML can repeat a name ("Unknown author
    Unknown author" in six captions, 2026-10-05): a name said twice is said once, and an unknown
    author beside a real credit ("Unknown author Unknown author , reprinted by Asahel Curtis")
    leaves only the real one ("Reprinted by Asahel Curtis")."""
    words = (who or "").split()
    half = len(words) // 2
    if words and len(words) % 2 == 0 and words[:half] == words[half:]:
        words = words[:half]
    name = " ".join(words)
    if UNKNOWN_PHRASE.search(name) and not UNKNOWN_AUTHOR.match(name):
        name = re.sub(r"\s+", " ", UNKNOWN_PHRASE.sub(" ", name)).strip(" ,;.")
        name = name[:1].upper() + name[1:]
    return name


def credit_line(rec):
    """'Joe Mabel, CC BY-SA 4.0' / 'Public domain'. An unknown author is left out."""
    who = credit_name((rec.get("creditOverride") or rec.get("artist") or "").strip())
    lic = (rec.get("license") or "").strip()
    if who and not UNKNOWN_AUTHOR.match(who):
        return f"{who}, {lic}" if lic else who
    return lic


def cmd_add(project, title, caption, evidence, evidence_source, chapter, after, credit, portrait_only=False):
    cands = {r["title"]: r for r in load_json(project.path("images", "candidates.json"), []) or []}
    rec = cands.get(title) or file_info([title]).get(title)
    if not rec:
        raise Refused(f"{title}: not found on Commons or Wikipedia")
    if not rec.get("allowed"):
        raise Refused(f"{title}: {rec.get('refusedWhy')}")
    rows = index(project)
    nums = [int(m.group(1)) for r in rows for m in [re.fullmatch(r"img(\d+)", r.get("id", ""))] if m]
    rid = f"img{(max(nums) + 1) if nums else 1}"
    os.makedirs(project.path("images"), exist_ok=True)
    desc = "\n".join(x for x in (rec.get("objectName"), rec.get("description"), rec.get("date"), rec.get("artist")) if x)
    with open(project.path("images", f"{rid}.description.txt"), "w", encoding="utf-8") as fh:
        fh.write(desc + "\n")
    ext = os.path.splitext(urllib.parse.urlparse(rec["url"]).path)[1] or ".jpg"
    local = f"images/{rid}{ext}"
    try:
        host = urllib.parse.urlparse(rec["url"]).hostname or ""
        fetch.throttle(host, fetch.host_interval(host))
        req = urllib.request.Request(rec["url"], headers={"User-Agent": API_UA})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read(16_000_000)
        with open(project.path(local), "wb") as fh:
            fh.write(data)
    except (urllib.error.URLError, TimeoutError) as e:
        local = ""
        print(f"note: the picture was recorded but not copied ({e}); the story uses its URL", file=sys.stderr)
    rows = [r for r in rows if r.get("title") != rec["title"]]
    rows.append({**{k: rec.get(k) for k in ("title", "url", "pageUrl", "license", "licenseUrl", "artist", "date", "width", "height")},
                 "id": rid, "caption": caption.strip(), "evidence": evidence.strip(),
                 "evidenceSource": evidence_source or "description", "chapter": int(chapter),
                 "after": after.strip(), "file": local, "creditOverride": credit or "",
                 **({"portraitOnly": True} if portrait_only else {}),
                 "addedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")})
    save_json(project.path("images", "index.json"), rows)
    where = "the story's portrait only" if portrait_only else f"chapter {chapter}, after “{after[:50]}”"
    print(f"{rid}  {rec['title']}  → {where}  ({credit_line(rows[-1])})")
    return 0


def parse_crop(text):
    """'0.2,0.1,0.3,0.6' → [0.2, 0.1, 0.3, 0.6]: left, top, width, height, as fractions inside the picture."""
    try:
        box = [float(v) for v in text.split(",")]
    except ValueError:
        box = []
    if (len(box) != 4 or min(box) < 0 or min(box[2:]) <= 0
            or box[0] + box[2] > 1.0001 or box[1] + box[3] > 1.0001):
        raise Refused("--crop is left,top,width,height as fractions of the picture, inside it (0.2,0.1,0.3,0.6)")
    return box


PERMISSION = "Used with permission (non-commercial)"


def permission_ok(rec):
    """A picture the author has permission to use (2026-10-09: "I have gotten permission to use the
    photos of these folks for non-commercial purposes"): it carries the grant itself, and the book
    must say it is non-commercial. A paid edition must clear each one again."""
    p = rec.get("permission") or {}
    return rec.get("license") == PERMISSION and all(p.get(k) for k in ("holder", "scope", "statedBy", "date"))


def page_text(url):
    """The words of the holder's own page about a picture (HTML or JSON), for its caption's evidence."""
    host = urllib.parse.urlparse(url).hostname or ""
    fetch.throttle(host, fetch.host_interval(host))
    req = urllib.request.Request(url, headers={"User-Agent": API_UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read(4_000_000).decode("utf-8", "replace")
    try:
        data = json.loads(raw)
        lines = []

        def walk(v, key=""):
            if isinstance(v, dict):
                for k, x in v.items():
                    walk(x, k)
            elif isinstance(v, list):
                for x in v:
                    walk(x, key)
            elif isinstance(v, str) and v.strip():
                lines.append(f"{key}: {plain(v)}" if key else plain(v))
        walk(data)
        return "\n".join(lines)
    except ValueError:
        raw = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", raw)
        raw = re.sub(r"(?is)<img\b[^>]*\balt=\"([^\"]*)\"[^>]*>", r" \1 ", raw)   # a picture's alt text is its caption
        raw = re.sub(r"(?is)<a\b[^>]*\btitle=\"([^\"]*)\"[^>]*>", lambda m: " " + html.unescape(m.group(1)) + " ", raw)  # HistoryLink: caption + credit
        return re.sub(r"\s+", " ", plain(raw)).strip()


def cmd_portrait_permission(project, url, page, describe_url, holder, caption, evidence, date, crop):
    """A picture used by permission, recorded only as the portrait. Its caption's evidence is the
    holder's own page about it (--describe-url, fetched and kept as the picture's description)."""
    if not all((url, page, describe_url, holder, caption, evidence)):
        raise Refused("permission needs --url, --page, --describe-url, --holder, --caption and --evidence")
    box = parse_crop(crop) if crop else None
    desc = page_text(describe_url)
    if words(evidence) < config().get("minCaptionEvidenceWords", 6) or norm(evidence) not in norm(desc):
        raise Refused("--evidence must be words copied from the holder's page (--describe-url)")
    rows = index(project)
    nums = [int(m.group(1)) for r in rows for m in [re.fullmatch(r"img(\d+)", r.get("id", ""))] if m]
    rid = f"img{(max(nums) + 1) if nums else 1}"
    os.makedirs(project.path("images"), exist_ok=True)
    with open(project.path("images", f"{rid}.description.txt"), "w", encoding="utf-8") as fh:
        fh.write(f"{describe_url}\n{desc}\n")
    local = f"images/{rid}{os.path.splitext(urllib.parse.urlparse(url).path)[1].lower() or '.jpg'}"
    if local.endswith((".php", ".aspx", ".json")) or "." not in os.path.basename(local):
        local = f"images/{rid}.jpg"
    host = urllib.parse.urlparse(url).hostname or ""
    fetch.throttle(host, fetch.host_interval(host))
    req = urllib.request.Request(url, headers={"User-Agent": API_UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read(16_000_000)
    with open(project.path(local), "wb") as fh:
        fh.write(data)
    rows.append({"id": rid, "title": f"Permission: {page}", "url": url, "pageUrl": page, "license": PERMISSION,
                 "permission": {"holder": holder.strip(), "scope": "non-commercial", "statedBy": "the author",
                                "date": datetime.date.today().isoformat(),
                                "note": "the author: \"I have gotten permission to use the photos of these folks for non-commercial purposes\""},
                 "artist": "", "date": date or "", "caption": caption.strip(), "evidence": evidence.strip(),
                 "evidenceSource": "description", "chapter": -1, "after": "", "file": local,
                 "creditOverride": holder.strip(), "portraitOnly": True,
                 "addedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")})
    save_json(project.path("images", "index.json"), rows)
    meta = load_json(project.path("project.json"), {}) or {}
    meta["portrait"] = {"image": rid, "crop": box} if box else rid
    save_json(project.path("project.json"), meta)
    print(f"portrait: {rid} (by permission)" + (f", cropped to {box}" if box else "") + f"  ({credit_line(rows[-1])})")
    return 0


def cmd_portrait_pd(project, url, page, published, credit, caption, evidence, evidence_source, crop):
    """A public-domain picture from outside Commons, recorded only as the portrait. Public domain
    by date: published in the United States more than 95 years ago (a 1926 book entered it in
    2022). Its caption is checked like any picture's, against a source the story has fetched, so
    the page that prints the picture must be one of the story's sources."""
    if not all((url, page, published, credit, caption, evidence, evidence_source)):
        raise Refused("pd needs --url, --page, --published, --credit, --caption, --evidence and --evidence-source")
    try:
        year = int(published)
    except ValueError:
        raise Refused(f"--published {published!r}: a year")
    if year + 95 >= datetime.date.today().year:
        raise Refused(f"published {year}: not yet public domain in the United States")
    if project.source_text(evidence_source) is None:
        raise Refused(f"{evidence_source}: not a fetched source of this story")
    box = parse_crop(crop) if crop else None
    rows = index(project)
    nums = [int(m.group(1)) for r in rows for m in [re.fullmatch(r"img(\d+)", r.get("id", ""))] if m]
    rid = f"img{(max(nums) + 1) if nums else 1}"
    os.makedirs(project.path("images"), exist_ok=True)
    local = f"images/{rid}{os.path.splitext(urllib.parse.urlparse(url).path)[1] or '.jpg'}"
    host = urllib.parse.urlparse(url).hostname or ""
    fetch.throttle(host, fetch.host_interval(host))
    req = urllib.request.Request(url, headers={"User-Agent": API_UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read(16_000_000)
    with open(project.path(local), "wb") as fh:
        fh.write(data)
    rows.append({"id": rid, "title": f"Public domain ({year}): {page}", "url": url, "pageUrl": page,
                 "license": "Public domain", "artist": "", "date": str(year), "caption": caption.strip(),
                 "evidence": evidence.strip(), "evidenceSource": evidence_source, "chapter": -1, "after": "",
                 "file": local, "creditOverride": credit.strip(), "portraitOnly": True,
                 "publicDomainBasis": f"published in the United States in {year}",
                 "addedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")})
    save_json(project.path("images", "index.json"), rows)
    meta = load_json(project.path("project.json"), {}) or {}
    meta["portrait"] = {"image": rid, "crop": box} if box else rid
    save_json(project.path("project.json"), meta)
    print(f"portrait: {rid} (public domain, {year})" + (f", cropped to {box}" if box else "") + f"  ({credit_line(rows[-1])})")
    return 0


def cmd_portrait(project, ident, caption, evidence, evidence_source, crop, credit):
    """The story's portrait (2026-10-08, the author: "we need photos for everyone if we can get
    them"). A picture already placed in a chapter, by id, or a Commons file recorded only as the
    portrait: the book shows it on its cards and the story's first page and never in a chapter,
    so a portrait reaches a story the author has already edited without touching their text."""
    box = parse_crop(crop) if crop else None
    hit = next((r for r in index(project) if r.get("id") == ident), None)
    if hit is None:
        if not ident.startswith("File:"):
            raise Refused(f"{ident}: neither a picture's id (images.py list) nor a Commons File: name")
        if not (caption and evidence):
            raise Refused("a new portrait needs --caption and --evidence, checked like any picture's")
        cmd_add(project, ident, caption, evidence, evidence_source, -1, "", credit, portrait_only=True)
        hit = index(project)[-1]
    meta = load_json(project.path("project.json"), {}) or {}
    meta["portrait"] = {"image": hit["id"], "crop": box} if box else hit["id"]
    save_json(project.path("project.json"), meta)
    print(f"portrait: {hit['id']}" + (f", cropped to {box}" if box else "") + f"  ({credit_line(hit)})")
    return 0


def evidence_text(project, rec):
    src = rec.get("evidenceSource") or "description"
    if src == "description":
        p = project.path("images", f"{rec.get('id')}.description.txt")
        return open(p, encoding="utf-8").read() if os.path.exists(p) else None
    return project.source_text(src)


def paragraph_index(project, n, after):
    """The one paragraph of chapter n holding `after`, or None."""
    ch = project.chapter(n) or {}
    paras = [p.strip() for p in re.split(r"\n\s*\n", ch.get("text", "")) if p.strip()]
    hits = [i for i, p in enumerate(paras) if after and norm(after) in norm(p)]
    return hits[0] if len(hits) == 1 else None


def image_findings(project):
    cfg = config()
    floor = cfg.get("minCaptionEvidenceWords", 6)
    hosts = reader_hosts()
    out, per = [], {}
    for rec in index(project):
        label = rec.get("id", "?")
        url = urllib.parse.urlparse(rec.get("url", ""))
        # A portrait only is never in StoryMaker's text, so its host need not be one the Read view shows.
        if hosts is not None and not rec.get("portraitOnly") and (url.scheme != "https" or (url.hostname or "").lower() not in hosts):
            out.append(finding("image_host_unlisted", "hard",
                               f"{label}: {url.hostname or rec.get('url')!r} is not an https host in content/markdown-images.json, "
                               "so StoryMaker's Read view shows a link instead of the picture. Use a copy from a listed "
                               "host, or add the host to that file by PR"))
        ok, why = (True, "") if permission_ok(rec) else licence_verdict(rec.get("license"))
        if not ok:
            out.append(finding("image_licence", "hard", f"{label}: {why}"))
        if cfg.get("creditRequired", True) and not credit_line(rec):
            out.append(finding("image_uncredited", "hard", f"{label}: no credit"))
        cap = rec.get("caption", "")
        if not cap:
            out.append(finding("image_uncaptioned", "hard", f"{label}: no caption"))
        ev = rec.get("evidence", "")
        text = evidence_text(project, rec)
        if text is None:
            out.append(finding("image_evidence_missing", "hard", f"{label}: evidence source {rec.get('evidenceSource')!r} has no text"))
        elif words(ev) < floor or norm(ev) not in norm(text):
            out.append(finding("image_caption_unverified", "hard",
                               f"{label}: the caption's evidence is not a verbatim quote of {floor}+ words from {rec.get('evidenceSource')}", ev[:120]))
        n = rec.get("chapter")
        if rec.get("portraitOnly"):
            pass                                # the story's portrait: shown on its first page, never in a chapter
        elif project.chapter(n) is None:
            out.append(finding("image_chapter_missing", "hard", f"{label}: chapter {n} does not exist"))
        elif paragraph_index(project, n, rec.get("after", "")) is None:
            out.append(finding("image_unplaced", "hard",
                               f"{label}: `after` must be words copied from exactly one paragraph of chapter {n}"))
        if not rec.get("portraitOnly"):
            per[n] = per.get(n, 0) + 1
        for f in voice_lint.phrase_findings(cap):
            if f["severity"] == "hard":
                out.append(finding("image_caption_" + f["rule"], "hard", f"{label}: caption — {f['message']}", cap[:120]))
    for n, k in per.items():
        if k > cfg.get("maxPerChapter", 3):
            out.append(finding("too_many_images", "soft", f"chapter {n} has {k} pictures; keep the strongest {cfg.get('maxPerChapter', 3)}"))
    return out


def cmd_remove(project, rid):
    """Undo a placement through the tool, so images/index.json and the files agree (a picture
    placer deleted the files by hand and left the entry behind, 2026-10-05)."""
    rows = index(project)
    hit = [r for r in rows if r.get("id") == rid]
    if not hit:
        print(f"{rid}: no such picture in images/index.json (images.py list shows the ids)")
        return 2
    rec = hit[0]
    for p in [rec.get("file"), f"images/{rid}.description.txt"]:
        if p and os.path.isfile(project.path(p)):
            os.remove(project.path(p))
    save_json(project.path("images", "index.json"), [r for r in rows if r.get("id") != rid])
    print(f"{rid}  {rec.get('title')} removed from chapter {rec.get('chapter')}")
    return 0


def cmd_list(project):
    rows = index(project)
    if not rows:
        print("no pictures placed yet")
        return 0
    for r in sorted(rows, key=lambda r: (r.get("chapter", 0), r.get("id"))):
        print(f"ch{r.get('chapter')}  {r.get('id')}  {r.get('title')}\n    after “{r.get('after', '')[:60]}”\n    {r.get('caption')} ({credit_line(r)})")
    return 0


def flag(argv, name, default=None):
    if name in argv:
        i = argv.index(name)
        if i + 1 < len(argv):
            return argv[i + 1]
    return default


def flags(argv, name):
    return [argv[i + 1] for i, a in enumerate(argv) if a == name and i + 1 < len(argv)]


def main(argv):
    try:
        if len(argv) >= 3 and argv[1] == "find":
            return cmd_find(Project(argv[2]), flags(argv, "--article"), flag(argv, "--commons"),
                            int(flag(argv, "--limit", 20)))
        if len(argv) >= 4 and argv[1] == "add":
            need = {k: flag(argv, k) for k in ("--caption", "--evidence", "--chapter", "--after")}
            if not all(need.values()):
                print("add needs --caption, --evidence, --chapter and --after")
                return 2
            return cmd_add(Project(argv[2]), argv[3], need["--caption"], need["--evidence"],
                           flag(argv, "--evidence-source"), need["--chapter"], need["--after"], flag(argv, "--credit"))
        if len(argv) >= 4 and argv[1] == "portrait" and argv[3] == "permission":
            return cmd_portrait_permission(Project(argv[2]), flag(argv, "--url"), flag(argv, "--page"),
                                           flag(argv, "--describe-url"), flag(argv, "--holder"), flag(argv, "--caption"),
                                           flag(argv, "--evidence"), flag(argv, "--date"), flag(argv, "--crop"))
        if len(argv) >= 4 and argv[1] == "portrait" and argv[3] == "pd":
            return cmd_portrait_pd(Project(argv[2]), flag(argv, "--url"), flag(argv, "--page"), flag(argv, "--published"),
                                   flag(argv, "--credit"), flag(argv, "--caption"), flag(argv, "--evidence"),
                                   flag(argv, "--evidence-source"), flag(argv, "--crop"))
        if len(argv) >= 4 and argv[1] == "portrait":
            return cmd_portrait(Project(argv[2]), argv[3], flag(argv, "--caption"), flag(argv, "--evidence"),
                                flag(argv, "--evidence-source"), flag(argv, "--crop"), flag(argv, "--credit"))
        if len(argv) >= 3 and argv[1] == "check":
            return report("images", image_findings(Project(argv[2])))
        if len(argv) >= 3 and argv[1] == "list":
            return cmd_list(Project(argv[2]))
        if len(argv) >= 4 and argv[1] == "remove":
            return cmd_remove(Project(argv[2]), argv[3])
    except (Refused, fetch.Refused) as e:
        print(f"REFUSED: {e}")
        return 3
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
