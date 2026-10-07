#!/usr/bin/env python3
"""A series' landed stories as one book: a small static site, in the order the subjects arrived.

The History Writer lands each story in StoryMaker on its own. This gathers a series into a
companion book for the place's landmark guide (2026-10-05, "Black Seattle"): a contents page
in parts by era, each story's chapters as pages, its notes and sources, a timeline of every
chapter, and the guide's landmarks each story names, linked both ways.

  series_book.py build <stories-dir> <series-id> <out-dir> [--files] [--publish | --review]
  series_book.py order <stories-dir> <series-id>        the stories in book order, and why
  series_book.py status <stories-dir> <series-id>       what is left to review: each story's waiting
                                                        suggestions (from StoryMaker) and sign-offs

The text is the author's. Each chapter is read from StoryMaker through ./mchatai, so what they
changed there is what the book shows; a chapter they added is in it, one they deleted is not.
--files reads book/ instead: no app needed, but it is what was landed, not what the author has
since changed. Every picture and map is copied next to the page, because a hosted page may load
images only from its own site; a picture with no record in images/index.json is a problem.

Order: each story is placed by the year its subject arrived in the place: the dossier's
earliest `arrival` event that names the place, else its earliest `arrival`, else its first
event. The series' `book` block in series.json holds the title, the introduction, the parts
(year ranges, so a new story files itself) and the companion guide.

Publishing (PLAYBOOK §6): without --publish every landed story is built, each marked as a draft,
for the author to read. --publish leaves a story out until project.json records the author's
review (`review.author`), and the community reader's (`review.community`) when
dossier.communityReview is true; it also refuses a story with editor suggestions still waiting
in StoryMaker, and any picture the page could not show once hosted.

--review builds the copy community readers are sent: only stories the author has signed off,
with nothing waiting, every page marked as a review copy, kept out of search engines, and
never linked from the landmark guide (its places.json says published: false).

Writes <out-dir>/index.html, <out-dir>/resources/ (pictures, maps) and
<out-dir>/resources/places.json (each landmark id, the stories and chapters that name it: what
the landmark guide reads to link back).
"""
import datetime
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import HISTORY, Project, load_json  # noqa: E402
from cite import find_shim, sentences, storymaker  # noqa: E402

READING_WPM = 230
PICTURE_BOX = (1100, 1300)       # fits a 40rem column at twice its width; a tall document stays legible
PORTRAIT_BOX = (480, 600)
JPEG_QUALITY = 72
# A hosted page (mchatai.com) is deployed as TEXT: MiniAppDeploySkill skips binary files, and caps
# a deploy at 200 files, 2 MB each and 16 MB in all. So for --publish and --review each picture
# also goes out as a data: URI in its own resources/pic/*.txt, fetched when the reader nears it
# (the hosted CSP allows data: images). Smaller than the local copies, to fit the cap.
HOSTED_BOX = (880, 1040)
HOSTED_QUALITY = 60
HOSTED_CAPS = {"files": 200, "fileBytes": 2_097_152, "totalBytes": 16_777_216}
YEAR = re.compile(r"\b(1[6-9]\d\d|20\d\d)\b")
SPAN = re.compile(r"(?:,\s*|\s+)(1[6-9]\d\d|20\d\d)(?:(?:\s*[-–]\s*|\s+to\s+)(1[6-9]\d\d|20\d\d))?\s*$")
# A link target may hold one level of parentheses: Wikipedia's "William_Grose_(pioneer)".
TARGET = r"((?:[^()\s]|\([^()\s]*\))+)"
# A picture may carry a size word as its Markdown title, set in StoryMaker: ![caption](url "small").
TITLE = r'(?:\s+"([^"]*)")?'
INLINE = re.compile(r"(!?)\[([^\]]*)\]\(" + TARGET + TITLE + r"\)")
LINKED_IMAGE = re.compile(r"^\[!\[([^\]]*)\]\(" + TARGET + TITLE + r"\)\]\(" + TARGET + r"\)$")
IMAGE = re.compile(r"^!\[([^\]]*)\]\(" + TARGET + TITLE + r"\)$")
SIZES = ("small", "medium", "large", "full")
NOTE = re.compile(r"^[“\"](.+?)[”\"]\s*:\s*([\d,\s]+)\.?\s*$")
SOURCE = re.compile(r"^(\d+)\.\s+(.*)$")
BARE_URL = re.compile(r"https?://[^\s<]+")
LANDMARK = re.compile(r"#/l/(SL-\d+)")
WORD = re.compile(r"[A-Za-z0-9’']+")


# ── text ─────────────────────────────────────────────────────────────────────

def esc(s):
    return html.escape(s or "", quote=True)


def plain(md):
    """Markdown → the words a reader sees: links keep their text, pictures and marks go."""
    md = re.sub(r"!\[[^\]]*\]\(" + TARGET + TITLE + r"\)", "", md)
    md = re.sub(r"\[([^\]]*)\]\(" + TARGET + TITLE + r"\)", r"\1", md)
    return re.sub(r"[*_`#>]", "", md).strip()


def key(text):
    """Comparable form of a paragraph's opening: lower case, plain quotes, single spaces."""
    t = text.lower().translate(str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-"}))
    return " ".join(t.replace('"', " ").split())


def count_words(md):
    return len(WORD.findall(plain(md)))


def blocks(md):
    return [b.strip() for b in re.split(r"\n\s*\n", md.replace("\r\n", "\n")) if b.strip()]


def emphasis(s):
    s = re.sub(r"\*\*(?=\S)(.+?)(?<=\S)\*\*", r"<strong>\1</strong>", s)
    return re.sub(r"(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])", r"<em>\1</em>", s)


def link_attrs(url, ctx, words=True):
    """External and landmark links open beside the book; an in-book link stays. A landmark link
    is counted for the Places page, and marked with a pin when it is words, not a picture."""
    m = LANDMARK.search(url)
    if m and ctx is not None:
        ctx.setdefault("places", []).append(m.group(1))
        cls = ' class="lm"' if words else ""
        return f'{cls} data-l="{esc(m.group(1))}" target="_blank" rel="noopener"'
    if url.startswith("#"):
        return ""
    return ' target="_blank" rel="noopener"'


def safe_url(url):
    """Only addresses a reader's browser should follow: the web, mail, and the book's own routes."""
    return url.startswith(("https://", "http://", "mailto:", "#", "resources/", "file://"))


def inline(text, ctx=None):
    out, pos = [], 0
    for m in INLINE.finditer(text):
        out.append(emphasis(esc(text[pos:m.start()])))
        bang, label, url, _title = m.groups()
        if not safe_url(url):
            out.append(emphasis(esc(label)))       # the words stay; an address like javascript: does not
        elif bang:
            src = ctx["picture"](url, label) if ctx else url
            out.append(img_tag(src, label))
        else:
            out.append(f'<a href="{esc(url)}"{link_attrs(url, ctx)}>{emphasis(esc(label))}</a>')
        pos = m.end()
    out.append(emphasis(esc(text[pos:])))
    return "".join(out)


def img_tag(src, alt):
    """A copied picture is named by data-src and filled in by the page, so a hosted copy can load
    it from its text form; a remote one (a draft's) keeps its src."""
    attr = "data-src" if src.startswith("resources/") else "src"
    return f'<img {attr}="{esc(src)}" alt="{esc(alt)}" loading="lazy">'


def figure(alt, src, href, ctx, size=None):
    if not safe_url(src):
        return f"<p>{inline(alt)}</p>"
    if href and not safe_url(href):
        href = None
    shown = ctx["picture"](src, alt) if ctx else src
    img = img_tag(shown, alt)
    if href:
        img = f'<a href="{esc(href)}"{link_attrs(href, ctx, words=False)}>{img}</a>'
    cls = f' class="size-{size}"' if size in SIZES else ""
    return f'<figure{cls}>{img}<figcaption>{inline(alt)}</figcaption></figure>'


def markers(nums, slug):
    links = ",".join(f'<a href="#/p/{esc(slug)}/sources/{n}">{n}</a>' for n in nums)
    return f'<sup class="src" title="Sources">{links}</sup>'


def render(md, ctx=None, notes=None, slug=""):
    """One part's Markdown as HTML. `notes` [(opening words, [source numbers])] puts each
    paragraph's sources after it, matched on its opening words as the Notes key them."""
    notes = [(key(k), nums) for k, nums in (notes or [])]
    out = []
    for b in blocks(md):
        one = " ".join(b.split("\n"))
        m = LINKED_IMAGE.match(one)
        if m:
            out.append(figure(m.group(1), m.group(2), m.group(4), ctx, (m.group(3) or "").lower()))
            continue
        m = IMAGE.match(one)
        if m:
            out.append(figure(m.group(1), m.group(2), None, ctx, (m.group(3) or "").lower()))
            continue
        if one.startswith("#"):
            level = min(len(one) - len(one.lstrip("#")) + 1, 4)
            out.append(f"<h{level}>{inline(one.lstrip('#').strip(), ctx)}</h{level}>")
            continue
        lines = b.split("\n")
        if all(l.lstrip().startswith(">") for l in lines):
            inner = " ".join(l.lstrip()[1:].strip() for l in lines)
            out.append(f"<blockquote><p>{inline(inner, ctx)}</p></blockquote>")
            continue
        if all(re.match(r"^\s*[-*]\s+", l) for l in lines):
            items = "".join(f"<li>{inline(re.sub(r'^\s*[-*]\s+', '', l), ctx)}</li>" for l in lines)
            out.append(f"<ul>{items}</ul>")
            continue
        body = inline(one, ctx)
        opening = key(plain(one))
        for k, nums in notes:
            if k and opening.startswith(k):
                body += markers(nums, slug)
                break
        out.append(f"<p>{body}</p>")
    return "\n".join(out)


def parse_notes(text):
    """The Notes part → [(section title, [(opening words, [numbers])])], in order."""
    sections = []
    for line in [l.strip() for l in text.split("\n")]:
        if not line:
            continue
        m = NOTE.match(line)
        if m:
            nums = [int(n) for n in re.findall(r"\d+", m.group(2))]
            if not sections:
                sections.append(("", []))
            sections[-1][1].append((m.group(1), nums))
        elif line.lower() != "notes" and not line.endswith("."):
            sections.append((line, []))
    return [s for s in sections if s[1]]


def render_notes(sections, slug):
    out = []
    for title, rows in sections:
        out.append(f"<h3>{esc(title)}</h3>" if title else "")
        out.append("<ul class=\"notes\">" + "".join(
            f"<li><span class=\"open\">“{esc(words_)}”</span> {markers(nums, slug)}</li>" for words_, nums in rows)
            + "</ul>")
    return "\n".join(out)


def parse_sources(text):
    rows = []
    for b in blocks(text):
        m = SOURCE.match(" ".join(b.split()))
        if m:
            rows.append((int(m.group(1)), m.group(2)))
    return rows


def render_sources(rows):
    def linkify(s):
        out, pos = [], 0
        for m in BARE_URL.finditer(s):
            url = m.group(0).rstrip(".,;")
            out.append(esc(s[pos:m.start()]))
            out.append(f'<a href="{esc(url)}" target="_blank" rel="noopener">{esc(url)}</a>')
            pos = m.start() + len(url)
        out.append(esc(s[pos:]))
        return "".join(out)
    return "<ol class=\"sources\">" + "".join(
        f'<li id="s{n}" value="{n}">{linkify(body)}</li>' for n, body in rows) + "</ol>"


def span(title):
    """'Pioneer Square, 1859-1882' → ('Pioneer Square', 1859, 1882); no years → (title, None, None)."""
    m = SPAN.search(title or "")
    if not m:
        return title, None, None
    start = int(m.group(1))
    end = int(m.group(2)) if m.group(2) else start
    return title[:m.start()].strip(" ,"), start, end


def first_sentence(md, limit=240):
    for b in blocks(md):
        one = " ".join(b.split())
        if one.startswith(("#", ">")) or IMAGE.match(one) or LINKED_IMAGE.match(one):
            continue
        text = plain(one)
        spans = sentences(text)
        s = text[spans[0][0]:spans[0][1]].strip() if spans else text
        return s if len(s) <= limit else s[:limit].rsplit(" ", 1)[0] + "…"
    return ""


# ── a story ──────────────────────────────────────────────────────────────────

def year_of(value):
    m = YEAR.search(str(value or ""))
    return int(m.group(1)) if m else None


def arrival(project, place):
    """(year, why) for the year the subject arrived in the place."""
    d = project.dossier or {}
    events = [e for e in d.get("events", []) if year_of(e.get("date"))]
    arrivals = sorted((e for e in events if e.get("lifeStage") == "arrival"), key=lambda e: year_of(e["date"]))
    here = [e for e in arrivals if place and place.lower() in (e.get("what") or "").lower()]
    for pick, why in ((here, f"earliest arrival event naming {place}"), (arrivals, "earliest arrival event")):
        if pick:
            return year_of(pick[0]["date"]), f"{why} ({pick[0].get('id')})"
    first = year_of((d.get("computed") or {}).get("firstEventYear")) or year_of((d.get("lifespan") or {}).get("born"))
    return first, "no arrival event: the dossier's first year"


def story_parts(project, shim, use_files):
    """[{kind, title, text, edited}] in the book's order, and where the text came from."""
    meta = load_json(project.path("project.json"), {}) or {}
    man = load_json(project.path("book", "manifest.json"), {}) or {}
    pid = meta.get("storymakerProject")
    if not use_files and shim and pid:
        got = storymaker(shim, "getProject", projectID=pid)
        if got.get("status") == "ok":
            res = got.get("result") or {}
            intro_ids = {meta.get("introChapterID")} | {
                (c.get("storymaker") or {}).get("chapterID") for c in man.get("chapters", []) if c.get("n") == 0}
            parts = []
            for c in sorted(res.get("chapters", []), key=lambda c: c.get("index", 0)):
                cur = storymaker(shim, "getChapter", projectID=pid, chapterID=c["id"])
                text = (cur.get("result") or {}).get("text")
                if cur.get("status") != "ok" or text is None:
                    return None, f"StoryMaker getChapter {c.get('title')!r}: {cur.get('error')}", {}
                title = c.get("title") or ""
                kind = ("notes" if c["id"] == meta.get("notesChapterID") or title == "Notes" else
                        "sources" if c["id"] == meta.get("sourcesChapterID") or title == "Sources" else
                        "intro" if c["id"] in intro_ids else "chapter")
                parts.append({"kind": kind, "title": title, "text": text, "edited": bool(c.get("authorEdited"))})
            return parts, "StoryMaker", {"pendingSuggestions": res.get("pendingAgentSuggestions") or 0}
        if not use_files:
            return None, f"StoryMaker getProject: {got.get('error')}", {}
    parts = []
    for c in man.get("chapters", []):
        with open(project.path(c["file"]), encoding="utf-8") as fh:
            parts.append({"kind": "intro" if c.get("n") == 0 else "chapter", "title": c.get("title") or "",
                          "text": fh.read(), "edited": False})
    for a in man.get("appendices", []):
        with open(project.path(a["file"]), encoding="utf-8") as fh:
            parts.append({"kind": (a.get("title") or "").lower(), "title": a.get("title") or "",
                          "text": fh.read(), "edited": False})
    return parts, "book/ (as landed)", {}


def is_portrait(caption, names):
    """True when a caption's first clause is the subject's name, after at most a title:
    "William Grose, the second Black settler", "Seattle City Councilmember Sam Smith, June 1990".
    Not "Powell Barnett (second from left) shown…" (a group), not "Carver Gayton, …" (a grandson),
    not a building that carries the name. A caption that merely mentions the surname is not
    enough: on an identity series a wrong face is worse than none (2026-10-05)."""
    first = re.split(r",|;| — | – ", caption or "", maxsplit=1)[0].strip().rstrip(".")
    for n in names:
        if first == n:
            return True
        if first.endswith(" " + n):
            title = first[:-len(n)].split()
            if title and all(w[:1].isupper() for w in title):
                return True
    return False


def portrait_names(subject, dossier):
    """The subject's names of two words or more that carry the surname."""
    surname = subject.replace('"', " ").split()[-1].lower()
    names = [subject] + [a for a in dossier.get("aliases", []) if isinstance(a, str)]
    return sorted({n for n in names if len(n.split()) >= 2 and surname in n.lower()}, key=len, reverse=True)


def split_title_block(md):
    """The introduction opens with '# Name' and '*years · series*'. The page shows both in its
    own header, so they come off the body; the years line is kept for the contents."""
    bs = blocks(md)
    years = ""
    if bs and bs[0].startswith("# "):
        bs = bs[1:]
    if bs and re.fullmatch(r"\*[^*]+\*", bs[0]):
        years = bs[0].strip("*").split(" · ")[0].strip()
        bs = bs[1:]
    return "\n\n".join(bs), years


class Assets:
    """Copies what a story's text shows into resources/, and maps each URL to its copy."""

    def __init__(self, out, project, slug, problems, pool):
        self.out, self.project, self.slug, self.problems = out, project, slug, problems
        self.pool = pool          # {content hash: published path}: a picture two stories use is stored once
        rows = load_json(project.path("images", "index.json"), []) or []
        self.by_url = {}
        for r in rows:
            for u in (r.get("url"), (r.get("url") or "").split("?")[0], r.get("pageUrl")):
                if u:
                    self.by_url.setdefault(u, r)
        self.done = {}
        self.copied = []          # (images/index.json record, published path), in reading order

    def picture(self, url, alt):
        if url in self.done:
            return self.done[url]
        if url.startswith("file://"):
            path = urllib.parse.unquote(url[len("file://"):])
            maps = self.project.path("images", "maps")
            if os.path.abspath(path).startswith(os.path.abspath(maps) + os.sep) and os.path.isfile(path):
                rel = f"resources/maps/{self.slug}-{os.path.basename(path)}"
                os.makedirs(os.path.join(self.out, "resources", "maps"), exist_ok=True)
                shutil.copyfile(path, os.path.join(self.out, rel))
                self.done[url] = rel
                return rel
            self.problems.append(f"{self.slug}: a picture points at a file outside the story's maps: {url[:120]}")
            return url
        rec = self.by_url.get(url) or self.by_url.get(url.split("?")[0])
        src = self.project.path(rec["file"]) if rec and rec.get("file") else None
        if not src or not os.path.isfile(src):
            self.problems.append(f"{self.slug}: no local copy of the picture “{alt[:60]}” (not in images/index.json); "
                                 "a hosted page cannot show it")
            return url
        with open(src, "rb") as fh:
            digest = hashlib.sha1(fh.read()).hexdigest()
        rel = self.pool.get(digest)
        if rel is None:
            ext = os.path.splitext(src)[1].lower() or ".jpg"
            rel = f"resources/img/{self.slug}/{rec.get('id') or len(self.done)}{ext}"
            shrink(src, os.path.join(self.out, rel), PICTURE_BOX)
            self.pool[digest] = rel
        self.done[url] = rel
        self.copied.append((rec, rel))
        return rel


def dims(path):
    out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path], capture_output=True, text=True).stdout
    w, h = re.search(r"pixelWidth:\s*(\d+)", out), re.search(r"pixelHeight:\s*(\d+)", out)
    return (int(w.group(1)), int(h.group(1))) if w and h else (None, None)


def shrink(src, dst, box, quality=JPEG_QUALITY):
    """A copy that fits the box, re-encoded for a reader on a phone, with macOS sips when it is
    there (the tools are standard library only); elsewhere an exact copy. Never enlarged: sips
    scales a small picture UP to a -Z or --resampleWidth size (checked 2026-10-05)."""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if not shutil.which("sips"):
        shutil.copyfile(src, dst)
        return
    w, h = dims(src)
    args, resized = ["sips"], False
    if w and h:
        scale = min(box[0] / w, box[1] / h)
        if scale < 1:
            args += ["--resampleHeightWidth", str(max(1, round(h * scale))), str(max(1, round(w * scale)))]
            resized = True
    if os.path.splitext(dst)[1].lower() in (".jpg", ".jpeg"):
        args += ["-s", "formatOptions", str(quality)]
    r = subprocess.run(args + [src, "--out", dst], capture_output=True, text=True)
    if r.returncode != 0 or not os.path.isfile(dst) or (not resized and os.path.getsize(dst) >= os.path.getsize(src)):
        shutil.copyfile(src, dst)


def hosted_pictures(out, rels, problems):
    """Each copied picture as a data: URI text file; {picture path: text path}."""
    import base64
    import tempfile
    mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
            ".webp": "image/webp"}
    os.makedirs(os.path.join(out, "resources", "pic"), exist_ok=True)
    pics = {}
    for rel in sorted(rels):
        src = os.path.join(out, rel)
        ext = os.path.splitext(rel)[1].lower()
        if not os.path.isfile(src) or ext not in mime:
            problems.append(f"a picture the hosted page cannot carry: {rel}")
            continue
        with tempfile.TemporaryDirectory() as tmp:
            small = os.path.join(tmp, "p" + ext)
            shrink(src, small, HOSTED_BOX, HOSTED_QUALITY)
            with open(small, "rb") as fh:
                uri = f"data:{mime[ext]};base64," + base64.b64encode(fh.read()).decode("ascii")
        name = "resources/pic/" + hashlib.sha1(rel.encode()).hexdigest()[:16] + ".txt"
        with open(os.path.join(out, name), "w", encoding="ascii") as fh:
            fh.write(uri)
        pics[rel] = name
    return pics


def hosted_caps(out):
    """What the deploy would refuse or drop: the text files under resources/ against its caps."""
    files, total, over = 0, 0, []
    for root, _, names in os.walk(os.path.join(out, "resources")):
        if os.sep + "img" in root:                       # binaries: the deploy skips them anyway
            continue
        for n in names:
            size = os.path.getsize(os.path.join(root, n))
            files += 1
            total += size
            if size > HOSTED_CAPS["fileBytes"]:
                over.append(f"{os.path.relpath(os.path.join(root, n), out)} is {size:,} bytes")
    if files > HOSTED_CAPS["files"]:
        over.append(f"{files} files (the deploy takes {HOSTED_CAPS['files']})")
    if total > HOSTED_CAPS["totalBytes"]:
        over.append(f"{total:,} bytes in all (the deploy takes {HOSTED_CAPS['totalBytes']:,})")
    return files, total, over


def build_story(project, shim, use_files, out, place, problems, pool):
    meta = load_json(project.path("project.json"), {}) or {}
    dossier = project.dossier or {}
    slug = meta.get("slug") or os.path.basename(project.root)
    parts, origin, extra = story_parts(project, shim, use_files)
    if parts is None:
        problems.append(f"{slug}: {origin}")
        return None
    assets = Assets(out, project, slug, problems, pool)
    ctx = {"picture": assets.picture}
    notes_sections = []
    for p in parts:
        if p["kind"] == "notes":
            notes_sections = parse_notes(p["text"])
    body = [p for p in parts if p["kind"] in ("intro", "chapter")]
    by_title = {key(t): rows for t, rows in notes_sections}

    def notes_for(i, title):
        rows = by_title.get(key(title))
        if rows is None and i < len(notes_sections) and len(notes_sections) == len(body):
            rows = notes_sections[i][1]          # a chapter the author renamed: the same place in order
        return rows or []

    intro, chapters, years, words_total, places = None, [], "", 0, {}
    for i, p in enumerate(body):
        text = p["text"]
        if p["kind"] == "intro":
            text, years = split_title_block(text)
        ctx["places"] = []
        rendered = render(text, ctx, notes_for(i, "Introduction" if p["kind"] == "intro" else p["title"]), slug)
        w = count_words(text)
        words_total += w
        name, start, end = span(p["title"])
        row = {"title": p["title"], "name": name, "start": start, "end": end, "html": rendered, "words": w,
               "edited": p["edited"]}
        if p["kind"] == "intro" and intro is None:
            row["summary"] = first_sentence(text)
            intro = row
        else:
            chapters.append(row)
        n = 0 if row is intro else len(chapters)
        for lid in dict.fromkeys(ctx["places"]):
            places.setdefault(lid, []).append(n)
    sources = next((parse_sources(p["text"]) for p in parts if p["kind"] == "sources"), [])
    subject = meta.get("subject") or meta.get("name") or dossier.get("subject") or slug
    # The author's pick (project.json "portrait": an image id, or null for none), else the first
    # picture in the story whose caption names the subject as its subject.
    if "portrait" in meta:
        portrait = next((rel for rec, rel in assets.copied if rec.get("id") == meta["portrait"]), None)
    else:
        names = portrait_names(subject, dossier)
        portrait = next((rel for rec, rel in assets.copied if is_portrait(rec.get("caption"), names)), None)
    if portrait:
        small = portrait.rsplit(".", 1)[0] + "-portrait." + portrait.rsplit(".", 1)[1]
        shrink(os.path.join(out, portrait), os.path.join(out, small), PORTRAIT_BOX)
        portrait = small
    life = dossier.get("lifespan") or {}
    if not years:
        b, d = year_of(life.get("born")), year_of(life.get("died"))
        years = f"{b or ''}–{d or ''}".strip("–") if (b or d) else ""
    arrived, why = arrival(project, place)
    review = meta.get("review") or {}
    return {
        "slug": slug, "name": subject, "years": years, "arrived": arrived, "arrivedWhy": why,
        "born": year_of(life.get("born")),
        "summary": (intro or {}).get("summary", ""), "portrait": portrait,
        "intro": intro, "chapters": chapters,
        "notes": render_notes(notes_sections, slug), "sources": render_sources(sources), "sourceCount": len(sources),
        "places": places, "words": words_total, "minutes": max(1, round(words_total / READING_WPM)),
        "origin": origin, "edited": sum(1 for p in parts if p["edited"]),
        "pendingSuggestions": extra.get("pendingSuggestions", 0),
        "review": {"author": review.get("author"), "community": review.get("community"),
                   "needsCommunity": bool(dossier.get("communityReview"))},
    }


def publishable(story, community=True):
    """Why a story may not be published yet ([] when it may). `community=False` asks only what a
    review copy needs: the author's sign-off, with nothing waiting."""
    why = []
    rv = story["review"]
    if not rv.get("author"):
        why.append("the author signs it off (review.author in project.json)")
    if community and rv.get("needsCommunity") and not rv.get("community"):
        why.append("a reader from the community has read it (review.community in project.json)")
    if story.get("pendingSuggestions"):
        n = story["pendingSuggestions"]
        why.append(f"the {n} editor suggestion{'s' if n != 1 else ''} waiting in StoryMaker are settled")
    return why


# ── the book ─────────────────────────────────────────────────────────────────

def series_entry(series_id):
    data = load_json(os.path.join(HISTORY, "series.json"), {}) or {}
    for s in data.get("series", []):
        if s.get("id") == series_id:
            return s, data.get("place") or ""
    return None, data.get("place") or ""


def landed_projects(stories_dir, series_id):
    out = []
    for name in sorted(os.listdir(stories_dir)):
        root = os.path.join(stories_dir, name)
        meta = load_json(os.path.join(root, "project.json"), None)
        if isinstance(meta, dict) and meta.get("series") == series_id and \
                os.path.isfile(os.path.join(root, "book", "manifest.json")):
            out.append(Project(root))
    return out


def part_for(year, parts):
    for i, p in enumerate(parts):
        lo, hi = p.get("from"), p.get("to")
        if year is not None and (lo is None or year >= lo) and (hi is None or year <= hi):
            return i
    return len(parts) - 1 if parts else 0


def order_key(story):
    return (story["arrived"] if story["arrived"] is not None else 9999, story["born"] or 9999, story["name"])


def companion_names(book):
    """{landmark id: (name, address)} from the companion guide's place pack (`companion.pack`, a
    path inside mchatai-source), so the Places page uses the guide's own names."""
    rel = (book.get("companion") or {}).get("pack") or ""
    data = load_json(os.path.join(os.path.dirname(HISTORY), rel), None) if rel else None
    rows = data.get("places", []) if isinstance(data, dict) else []
    return {r["id"]: (r.get("name") or r["id"], r.get("address") or "") for r in rows if r.get("id")}


def cmd_order(stories_dir, series_id):
    entry, place = series_entry(series_id)
    if not entry:
        print(f"no series {series_id!r} in series.json")
        return 2
    rows = []
    for project in landed_projects(stories_dir, series_id):
        meta = load_json(project.path("project.json"), {}) or {}
        year, why = arrival(project, place)
        life = (project.dossier or {}).get("lifespan") or {}
        name = meta.get("subject") or meta.get("name") or (project.dossier or {}).get("subject") or os.path.basename(project.root)
        rows.append((year if year is not None else 9999, year_of(life.get("born")) or 9999, name, why))
    parts = (entry.get("book") or {}).get("parts", [])
    for year, _, name, why in sorted(rows):
        part = parts[part_for(year, parts)]["title"] if parts else ""
        print(f"{year if year != 9999 else '????'}  {name:<28} {part:<28} {why}")
    return 0


def cmd_status(stories_dir, series_id):
    """One line per landed story: suggestions waiting in StoryMaker, parts the author edited, and
    the sign-offs project.json records. "Is everything reviewed?" without opening each project
    (Lawrence, 2026-10-05: "there is no global way of knowing if all of the review items have
    been completed")."""
    projects = landed_projects(stories_dir, series_id)
    if not projects:
        print(f"no landed stories of {series_id!r} under {stories_dir}")
        return 2
    shim = find_shim(projects[0])
    waiting_total = 0
    for project in projects:
        meta = load_json(project.path("project.json"), {}) or {}
        name = meta.get("subject") or meta.get("name") or os.path.basename(project.root)
        waiting = edited = parts = "?"
        if shim and meta.get("storymakerProject"):
            got = storymaker(shim, "getProject", projectID=meta["storymakerProject"])
            res = got.get("result") or {}
            if got.get("status") == "ok":
                waiting = res.get("pendingAgentSuggestions") or 0
                chapters = res.get("chapters", [])
                edited, parts = sum(1 for c in chapters if c.get("authorEdited")), len(chapters)
                waiting_total += waiting
        rv = meta.get("review") or {}
        needs = bool((project.dossier or {}).get("communityReview"))
        signs = [f"author {rv['author']}" if rv.get("author") else "author: not yet"]
        if needs:
            signs.append(f"community {rv['community'].get('date', '')}".strip() if isinstance(rv.get("community"), dict)
                         else "community reader: not yet")
        print(f"{name:<30} {str(waiting):>3} waiting   edited {edited}/{parts}   " + " · ".join(signs))
    print("\nnothing waiting in StoryMaker" if waiting_total == 0 else f"\n{waiting_total} suggestion(s) waiting in all")
    return 0


def cmd_build(stories_dir, series_id, out, use_files=False, publish=False, review=False):
    entry, place = series_entry(series_id)
    if not entry or not entry.get("book"):
        print(f"series.json has no `book` block for {series_id!r}")
        return 2
    book = entry["book"]
    projects = landed_projects(stories_dir, series_id)
    if not projects:
        print(f"no landed stories of {series_id!r} under {stories_dir}")
        return 2
    shim = None if use_files else find_shim(projects[0])
    if not use_files and not shim:
        print("no ./mchatai shim above the stories (run with --files to build from book/)")
        return 2
    res = os.path.join(out, "resources")
    if os.path.isdir(res):
        if not os.path.isfile(os.path.join(res, "places.json")):
            print(f"{res} exists and is not a book's (no places.json): choose another out-dir")
            return 2
        shutil.rmtree(res)
    os.makedirs(os.path.join(out, "resources"), exist_ok=True)
    problems, stories, held, pool = [], [], [], {}
    for project in projects:
        story = build_story(project, shim, use_files, out, place, problems, pool)
        if story is None:
            continue
        why = publishable(story, community=not review)
        if (publish or review) and why:
            held.append((story["name"], why))
            continue
        story["draft"] = bool(why)
        story["draftWhy"] = why
        stories.append(story)
    stories.sort(key=order_key)
    parts_cfg = book.get("parts", [])
    parts = [{"title": p.get("title", ""), "from": p.get("from"), "to": p.get("to"), "stories": []} for p in parts_cfg]
    if not parts:
        parts = [{"title": "", "from": None, "to": None, "stories": []}]
    for s in stories:
        parts[part_for(s["arrived"], parts_cfg)]["stories"].append(s["slug"])
    names = companion_names(book)
    places = {}
    for s in stories:
        for lid, chapter_ns in s["places"].items():
            for n in chapter_ns:
                places.setdefault(lid, {"name": names.get(lid, (lid, ""))[0], "address": names.get(lid, ("", ""))[1],
                                        "refs": []})
                ref = [s["slug"], n]
                if ref not in places[lid]["refs"]:
                    places[lid]["refs"].append(ref)
    generated = datetime.date.today().isoformat()
    pics = {}
    if publish or review:
        used = set(pool.values()) | {s["portrait"] for s in stories if s.get("portrait")}
        pics = hosted_pictures(out, used, problems)
    data = {
        "pics": pics,
        "book": {"title": book.get("title") or entry.get("title"), "subtitle": book.get("subtitle", ""),
                 "place": place,
                 "intro": book.get("intro", ""), "companion": book.get("companion") or {},
                 "canonical": book.get("canonical", "") if publish else "", "generated": generated,
                 "publish": publish, "reviewCopy": review},
        "parts": [p for p in parts if p["stories"]],
        "stories": {s["slug"]: {k: v for k, v in s.items() if k not in ("review", "arrivedWhy", "origin", "born")}
                    for s in stories},
        "order": [s["slug"] for s in stories],
        "places": places,
    }
    base = (book.get("canonical") or "").rstrip("/") + "/" if book.get("canonical") else ""
    index = {lid: {"name": p["name"], "stories": [
        {"name": data["stories"][slug]["name"], "slug": slug, "chapter": n,
         "title": (data["stories"][slug]["intro"] or {}).get("title", "Introduction") if n == 0
         else data["stories"][slug]["chapters"][n - 1]["title"],
         "url": f"{base}#/p/{slug}" + (f"/{n}" if n else "")} for slug, n in p["refs"]]}
        for lid, p in places.items()}
    with open(os.path.join(out, "resources", "places.json"), "w", encoding="utf-8") as fh:
        json.dump({"book": data["book"]["title"], "url": base, "generated": generated, "published": publish,
                   "places": index},
                  fh, ensure_ascii=False, indent=1)
    with open(os.path.join(out, "index.html"), "w", encoding="utf-8") as fh:
        fh.write(page(data))
    if publish or review:
        files, total, over = hosted_caps(out)
        print(f"hosted copy: {files} text files, {total:,} bytes ({len(pics)} pictures as text)")
        problems += [f"over the deploy's cap: {o}" for o in over]
    print(f"{len(stories)} stories, {sum(len(s['chapters']) for s in stories)} chapters, "
          f"{sum(s['words'] for s in stories):,} words, {len(places)} landmarks → {out}")
    for s in stories:
        flag = "draft" if s["draft"] else "ready"
        extra = []
        if s["edited"]:
            extra.append(f"{s['edited']} part(s) edited by the author")
        if s["pendingSuggestions"]:
            extra.append(f"{s['pendingSuggestions']} suggestion(s) waiting")
        print(f"  {s['arrived'] or '????'}  {s['name']:<28} {flag:<6} {s['origin']}"
              + (f"; {', '.join(extra)}" if extra else ""))
    for name, why in held:
        print(f"  held   {name}: {'; '.join(why)}")
    for p in problems:
        print(f"  problem: {p}")
    if (publish or review) and problems:
        print("refused: a published book or a review copy cannot carry these problems")
        return 1
    return 0


# ── the page ─────────────────────────────────────────────────────────────────

def page(data):
    book = data["book"]
    desc = book.get("subtitle") or book.get("intro", "")[:160]
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    canonical = book.get("canonical") or ""
    return (TEMPLATE.replace("__TITLE__", esc(book["title"]))
            .replace("__DESC__", esc(desc))
            .replace("__CANONICAL__", f'<link rel="canonical" href="{esc(canonical)}">' if canonical else "")
            .replace("__ROBOTS__", "" if book.get("publish") else '<meta name="robots" content="noindex">')
            .replace("__DATA__", payload))


TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>__TITLE__</title>
<meta name="description" content="__DESC__">
__CANONICAL__
__ROBOTS__
<meta property="og:type" content="book">
<meta property="og:title" content="__TITLE__">
<meta property="og:description" content="__DESC__">
<meta name="color-scheme" content="light dark">
<style>
:root{
  --ground:#f6f4ee; --panel:#fffdf8; --ink:#1c2227; --muted:#5d6970; --line:#e3ddd0;
  --accent:#0b6e8c; --accent-soft:#e3eff3; --mark:#8a6a1f; --draft:#f4eeda;
  --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,"Helvetica Neue",Arial,sans-serif;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme=light]){
    --ground:#12161a; --panel:#181d22; --ink:#e7e5df; --muted:#9aa5ac; --line:#2a3239;
    --accent:#5cb8d6; --accent-soft:#15303b; --mark:#d8b55e; --draft:#2a2415;
  }
}
:root[data-theme=dark]{
  --ground:#12161a; --panel:#181d22; --ink:#e7e5df; --muted:#9aa5ac; --line:#2a3239;
  --accent:#5cb8d6; --accent-soft:#15303b; --mark:#d8b55e; --draft:#2a2415;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--ground);color:var(--ink);font:16px/1.5 var(--sans);-webkit-text-size-adjust:100%}
a{color:var(--accent)}
.top{position:sticky;top:0;z-index:5;background:var(--ground);background:color-mix(in srgb,var(--ground) 92%,transparent);
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.top .in{max-width:62rem;margin:0 auto;padding:10px 16px;display:flex;gap:6px 18px;align-items:baseline;flex-wrap:wrap}
.brand{font:600 18px/1.2 var(--serif);color:var(--ink);text-decoration:none;margin-right:auto}
.top nav{display:flex;gap:4px 16px;flex-wrap:wrap;font-size:14px}
.top nav a{text-decoration:none;color:var(--muted)}
.top nav a[aria-current=page]{color:var(--ink);font-weight:600}
.top nav a:hover{color:var(--accent)}
main{max-width:62rem;margin:0 auto;padding:28px 16px 64px}
.kicker{margin:0 0 10px;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.kicker a{color:inherit;text-decoration:none}.kicker a:hover{color:var(--accent)}
h1{font:600 clamp(30px,5vw,44px)/1.1 var(--serif);margin:0;letter-spacing:-.01em}
.years{margin:8px 0 0;color:var(--muted);font:italic 17px/1.4 var(--serif)}
.cover{padding:14px 0 26px;border-bottom:1px solid var(--line);margin-bottom:8px}
.cover h1{font-size:clamp(40px,8vw,64px)}
.cover .sub{margin:10px 0 0;font:italic 20px/1.4 var(--serif);color:var(--muted);max-width:40rem}
.cover .lede{margin:18px 0 0;font:18px/1.6 var(--serif);max-width:40rem}
.cover .meta{margin:14px 0 0;font-size:13.5px;color:var(--muted)}
.part{margin-top:30px}
.part h2{display:flex;gap:4px 12px;align-items:baseline;flex-wrap:wrap;margin:0 0 6px;font:600 23px/1.25 var(--serif)}
.part h2 .pn{font:600 12px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--mark)}
.part h2 .yrs{font:italic 400 17px/1 var(--serif);color:var(--muted)}
.people{list-style:none;margin:0;padding:0;display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,27rem),1fr))}
.person{display:grid;grid-template-columns:92px 1fr;gap:14px;padding:14px;background:var(--panel);border:1px solid var(--line);
  border-radius:12px;text-decoration:none;color:inherit;height:100%}
.person:hover{border-color:var(--accent)}
.person h3{margin:0;font:600 20px/1.2 var(--serif)}
.person .when{margin:3px 0 0;font-size:13px;color:var(--muted)}
.person .sum{margin:8px 0 0;font:15.5px/1.5 var(--serif)}
.person .len{margin:8px 0 0;font-size:12.5px;color:var(--muted)}
.ph{width:92px;height:112px;border-radius:8px;object-fit:cover;object-position:center 22%;background:var(--accent-soft);display:block}
.mono{width:92px;height:112px;border-radius:8px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;
  font:600 30px/1 var(--serif)}
.story{max-width:40rem;margin:0 auto}
.story header{margin-bottom:26px}
.draft{margin:16px 0 0;padding:9px 12px;border-radius:8px;background:var(--draft);font-size:13.5px;color:var(--ink)}
.draft ul{margin:4px 0 0;padding-left:1.2em}
.review{max-width:40rem;margin:0 auto 22px;padding:10px 14px;border-radius:10px;background:var(--accent-soft);font-size:14px;line-height:1.5}
.prose{font:19px/1.68 var(--serif)}
.prose p{margin:0 0 1.05em}
.prose h2,.prose h3{font:600 22px/1.3 var(--serif);margin:1.6em 0 .6em}
.prose blockquote{margin:1.2em 0;padding:0 0 0 1em;border-left:3px solid var(--line);color:var(--muted)}
.prose figure{margin:1.6em 0}
.prose figure img{display:block;max-width:100%;max-height:min(70vh,520px);width:auto;height:auto;margin:0 auto;border-radius:6px;background:var(--panel)}
/* The author's size (StoryMaker's Picture size, the image's Markdown title): a share of the column
   whatever the picture's own resolution, then no taller than that size allows; the same rule as
   StoryMaker's reader, so the book shows what the author set. */
.prose figure[class^="size-"] img{height:auto;object-fit:contain}
.prose figure.size-small img{width:35%;max-height:260px}
.prose figure.size-medium img{width:55%;max-height:420px}
.prose figure.size-large img{width:80%;max-height:640px}
.prose figure.size-full img{width:100%;max-height:860px}
.story header.lead{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 22px;align-items:end}
.story header.lead .hero{grid-row:1/span 4;grid-column:2;width:150px;height:184px;object-fit:cover;object-position:center 22%;border-radius:12px;background:var(--accent-soft)}
.prose figcaption{margin-top:8px;font:13.5px/1.45 var(--sans);color:var(--muted)}
.prose figcaption a{color:inherit}
.prose a.lm{text-decoration:none;border-bottom:1px dotted var(--accent);color:var(--ink)}
.prose a.lm::after{content:"";display:inline-block;width:.62em;height:.62em;margin:0 0 0 .18em;background:var(--accent);
  -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M5 0C3 0 1.5 1.5 1.5 3.4 1.5 6 5 10 5 10S8.5 6 8.5 3.4C8.5 1.5 7 0 5 0zm0 4.8a1.4 1.4 0 110-2.8 1.4 1.4 0 010 2.8z'/%3E%3C/svg%3E") center/contain no-repeat;
  mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M5 0C3 0 1.5 1.5 1.5 3.4 1.5 6 5 10 5 10S8.5 6 8.5 3.4C8.5 1.5 7 0 5 0zm0 4.8a1.4 1.4 0 110-2.8 1.4 1.4 0 010 2.8z'/%3E%3C/svg%3E") center/contain no-repeat}
.prose a.lm:hover{color:var(--accent)}
sup.src{font:11px/1 var(--sans);margin-left:3px;white-space:nowrap}
sup.src a{color:var(--muted);text-decoration:none;padding:0 1px}
sup.src a:hover{color:var(--accent)}
.toc{margin-top:28px;padding-top:18px;border-top:1px solid var(--line)}
.toc h2,.side h2{margin:0 0 10px;font:600 12px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.toc ol{margin:0;padding:0;list-style:none;counter-reset:ch}
.toc li{counter-increment:ch;border-bottom:1px solid var(--line)}
.toc li a{display:flex;gap:12px;padding:11px 2px;text-decoration:none;color:var(--ink);font:17px/1.35 var(--serif)}
.toc li a::before{content:counter(ch);min-width:1.4em;color:var(--mark);font:600 14px/1.6 var(--sans)}
.toc li a span{margin-left:auto;color:var(--muted);font:italic 15px/1.5 var(--serif);white-space:nowrap}
.toc li a:hover{color:var(--accent)}
.toc .more{margin:12px 0 0;font-size:14px}
.btn{display:inline-block;margin-top:22px;padding:10px 16px;border-radius:999px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;font-size:14.5px}
:root[data-theme=dark] .btn{color:#0e161c}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .btn{color:#0e161c}}
.pager{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:34px;padding-top:18px;border-top:1px solid var(--line)}
.pager a{display:block;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--panel);text-decoration:none;color:var(--ink)}
.pager a:hover{border-color:var(--accent)}
.pager small{display:block;font-size:12px;color:var(--muted);letter-spacing:.04em;text-transform:uppercase}
.pager b{display:block;margin-top:3px;font:600 16px/1.3 var(--serif)}
.pager .nx{text-align:right;grid-column:2}
.side{margin-top:30px}
.places{list-style:none;margin:0;padding:0}
.places li{padding:12px 0;border-bottom:1px solid var(--line)}
.places h3{margin:0;font:600 18px/1.3 var(--serif)}
.places p{margin:3px 0 0;font-size:14px;color:var(--muted)}
.places .refs{margin:6px 0 0;font:15.5px/1.5 var(--serif);color:var(--ink)}
.notes{list-style:none;margin:0 0 1em;padding:0;font:16px/1.5 var(--serif)}
.notes li{padding:4px 0}
.notes .open{color:var(--ink)}
.sources{padding-left:1.6em;font:15.5px/1.5 var(--serif)}
.sources li{margin:0 0 .7em;overflow-wrap:anywhere;scroll-margin-top:80px}
.sources li.hit{background:var(--accent-soft);border-radius:6px;padding:2px 6px;margin-left:-6px}
.tl{list-style:none;margin:0;padding:0}
.tl h2{margin:26px 0 6px;font:600 22px/1.2 var(--serif);color:var(--mark)}
.tl li.row a{display:grid;grid-template-columns:7.2em 1fr;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);text-decoration:none;color:var(--ink)}
.tl .when{color:var(--muted);font:italic 15px/1.5 var(--serif);font-variant-numeric:tabular-nums}
.tl .what{font:17px/1.4 var(--serif)}
.tl .who{display:block;font:13px/1.4 var(--sans);color:var(--muted)}
.tl li.row a:hover .what{color:var(--accent)}
.lede-s{max-width:40rem;font:17px/1.6 var(--serif);color:var(--muted);margin:10px 0 0}
footer{max-width:62rem;margin:0 auto;padding:22px 16px 40px;color:var(--muted);font-size:13px;border-top:1px solid var(--line)}
footer p{margin:0 0 6px;max-width:44rem}
@media (max-width:560px){
  .prose{font-size:18px}
  .story header.lead .hero{width:96px;height:118px}
  .person{grid-template-columns:72px 1fr;gap:12px}
  .ph,.mono{width:72px;height:88px}
  .tl li.row a{grid-template-columns:5.6em 1fr}
  .pager{grid-template-columns:1fr}.pager .nx{grid-column:1}
}
</style>
</head>
<body>
<header class="top"><div class="in">
  <a class="brand" href="#/" id="brand"></a>
  <nav id="nav"></nav>
</div></header>
<main id="view" tabindex="-1"></main>
<footer id="foot"></footer>
<script id="data" type="application/json">__DATA__</script>
<script>
const D = JSON.parse(document.getElementById("data").textContent);
const B = D.book, S = D.stories, ORDER = D.order;
const el = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ORD = ["One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten"];
const COMP = B.companion || {};
const compHref = id => (COMP.url || "") + (id ? "#/l/" + id : "");

el("brand").textContent = B.title;
const REVIEW_NOTE = B.reviewCopy
  ? `<p class="review"><b>Review copy.</b> These stories are shared for review before they are published. If you see an error, or know a source that belongs here, please tell the person who sent you this link.</p>`
  : "";
document.title = B.title;
function nav(cur){
  const items = [["#/","Contents","home"],["#/timeline","Timeline","timeline"],["#/places","Places","places"]];
  el("nav").innerHTML = items.map(([h,t,k]) => `<a href="${h}"${k===cur?' aria-current="page"':""}>${t}</a>`).join("")
    + (COMP.url ? `<a href="${esc(COMP.url)}" target="_blank" rel="noopener">${esc(COMP.title || "Landmarks")} ↗</a>` : "");
}
el("foot").innerHTML = `<p>Every story here is told from the public record. Each paragraph's sources are numbered after it and listed with the story, and every picture is credited in its caption.</p>`
  + (COMP.url ? `<p>Places named in the stories link to <a href="${esc(COMP.url)}" target="_blank" rel="noopener">${esc(COMP.title || "the landmark guide")}</a>.</p>` : "")
  + `<p>Built ${esc(B.generated)}.</p>`;

function partOf(slug){ return D.parts.findIndex(p => p.stories.includes(slug)); }
function portrait(s){
  if (s.portrait) return `<img class="ph" data-src="${esc(s.portrait)}" alt="" loading="lazy">`;
  const ini = s.name.replace(/["“”]/g,"").split(/\s+/).filter(w => /^[A-Z]/.test(w));
  return `<div class="mono" aria-hidden="true">${esc((ini[0]||"")[0] || "")}${esc((ini[ini.length-1]||"")[0] || "")}</div>`;
}
function draftNote(s){
  if (!s.draft) return "";
  const why = (s.draftWhy || []).map(w => `<li>${esc(w)}</li>`).join("");
  return `<div class="draft"><b>Draft for the author's review.</b> Not published until:<ul>${why}</ul></div>`;
}
function partLabel(i){
  const p = D.parts[i]; if (!p) return "";
  const yrs = p.from && p.to ? `${p.from}–${p.to}` : p.from ? `${p.from} on` : "";
  return {n: D.parts.length > 1 ? `Part ${ORD[i] || i+1}` : "", t: p.title, y: yrs};
}
function chapLink(slug, n){ return `#/p/${slug}` + (n ? `/${n}` : ""); }
function chapName(s, n){ return n === 0 ? "Introduction" : (s.chapters[n-1] || {}).title || ""; }

function home(){
  nav("home");
  const nStories = ORDER.length, nCh = ORDER.reduce((a,k) => a + S[k].chapters.length, 0);
  const mins = ORDER.reduce((a,k) => a + S[k].minutes, 0);
  const hours = mins >= 90 ? `about ${Math.round(mins/60)} hours of reading` : `${mins} minutes of reading`;
  let h = `<section class="cover">
    ${COMP.title ? `<p class="kicker">A companion to ${esc(COMP.title)}</p>` : ""}
    <h1>${esc(B.title)}</h1>
    ${B.subtitle ? `<p class="sub">${esc(B.subtitle)}</p>` : ""}
    ${B.intro ? `<p class="lede">${esc(B.intro)}</p>` : ""}
    <p class="meta">${nStories} ${nStories === 1 ? "life" : "lives"} · ${nCh} chapters · ${hours}</p>
  </section>`;
  D.parts.forEach((p, i) => {
    const L = partLabel(i);
    h += `<section class="part"><h2>${L.n ? `<span class="pn">${L.n}</span>` : ""}${esc(L.t)}${L.y ? `<span class="yrs">${L.y}</span>` : ""}</h2>
      <ol class="people">${p.stories.map(k => { const s = S[k]; return `<li><a class="person" href="#/p/${k}">${portrait(s)}<div>
        <h3>${esc(s.name)}</h3>
        <p class="when">${s.arrived ? `Arrived ${s.arrived}` : ""}${s.arrived && s.years ? " · " : ""}${esc(s.years)}</p>
        ${s.summary ? `<p class="sum">${esc(s.summary)}</p>` : ""}
        <p class="len">${s.chapters.length} chapters · ${s.minutes} min${s.draft ? " · draft" : ""}</p>
      </div></a></li>`; }).join("")}</ol></section>`;
  });
  return h;
}

function person(slug){
  const s = S[slug]; if (!s) return notFound();
  nav("");
  const i = partOf(slug), L = partLabel(i);
  const toc = s.chapters.map((c, n) => `<li><a href="${chapLink(slug, n+1)}">${esc(c.name || c.title)}${c.start ? `<span>${c.start}${c.end && c.end !== c.start ? "–" + c.end : ""}</span>` : ""}</a></li>`).join("");
  return `<article class="story"><header${s.portrait ? ' class="lead"' : ""}>
    ${s.portrait ? `<img class="hero" data-src="${esc(s.portrait)}" alt="${esc(s.name)}">` : ""}
    <p class="kicker"><a href="#/">${esc(B.title)}</a>${L.t ? ` · ${esc(L.n ? L.n + ": " : "")}${esc(L.t)}` : ""}</p>
    <h1>${esc(s.name)}</h1>
    <p class="years">${esc(s.years)}${s.arrived ? `${s.years ? " · " : ""}arrived in ${esc(B.place || "the city")} ${s.arrived}` : ""}</p>
    ${draftNote(s)}
  </header>
  <div class="prose">${s.intro ? s.intro.html : ""}</div>
  <nav class="toc" aria-label="Chapters"><h2>Chapters</h2><ol>${toc}</ol>
    <p class="more"><a href="#/p/${slug}/notes">Notes</a> · <a href="#/p/${slug}/sources">Sources (${s.sourceCount})</a>${placesLine(s)}</p></nav>
  ${s.chapters.length ? `<a class="btn" href="${chapLink(slug, 1)}">Begin: ${esc(s.chapters[0].name || s.chapters[0].title)} →</a>` : ""}
  ${neighbours(slug)}
  </article>`;
}
function placesLine(s){
  const n = Object.keys(s.places).length;
  return n ? ` · <a href="#/places/${s.slug}">${n} ${n === 1 ? "place" : "places"} in ${esc(COMP.title || "the guide")}</a>` : "";
}
function neighbours(slug){
  const k = ORDER.indexOf(slug), prev = ORDER[k-1], next = ORDER[k+1];
  if (!prev && !next) return "";
  return `<nav class="pager" aria-label="Lives">${prev ? `<a href="#/p/${prev}"><small>← Earlier</small><b>${esc(S[prev].name)}</b></a>` : ""}${next ? `<a class="nx" href="#/p/${next}"><small>Later →</small><b>${esc(S[next].name)}</b></a>` : ""}</nav>`;
}

function chapter(slug, n){
  const s = S[slug]; if (!s || !s.chapters[n-1]) return notFound();
  nav("");
  const c = s.chapters[n-1];
  const prev = n > 1 ? [chapLink(slug, n-1), `Chapter ${n-1}`, chapName(s, n-1)] : [chapLink(slug, 0), "Introduction", s.name];
  const next = n < s.chapters.length ? [chapLink(slug, n+1), `Chapter ${n+1}`, chapName(s, n+1)]
    : [`#/p/${slug}/notes`, "Notes and sources", s.name];
  return `<article class="story"><header>
    <p class="kicker"><a href="#/p/${slug}">${esc(s.name)}</a> · Chapter ${n} of ${s.chapters.length}</p>
    <h1>${esc(c.name || c.title)}</h1>
    ${c.start ? `<p class="years">${c.start}${c.end && c.end !== c.start ? "–" + c.end : ""}</p>` : ""}
    ${draftNote(s)}
  </header>
  <div class="prose">${c.html}</div>
  <nav class="pager" aria-label="Chapters"><a href="${prev[0]}"><small>← ${esc(prev[1])}</small><b>${esc(prev[2])}</b></a><a class="nx" href="${next[0]}"><small>${esc(next[1])} →</small><b>${esc(next[2])}</b></a></nav>
  </article>`;
}

function apparatus(slug, which, hit){
  const s = S[slug]; if (!s) return notFound();
  nav("");
  const k = ORDER.indexOf(slug), later = ORDER[k+1];
  const body = which === "notes"
    ? `<p class="lede-s">Each note is keyed to the opening words of a paragraph. The numbers are the sources that paragraph rests on.</p><div class="prose">${s.notes}</div>`
    : `<div class="prose">${s.sources}</div>`;
  return `<article class="story"><header>
    <p class="kicker"><a href="#/p/${slug}">${esc(s.name)}</a></p>
    <h1>${which === "notes" ? "Notes" : "Sources"}</h1>
    <p class="years">${which === "notes" ? `<a href="#/p/${slug}/sources">Sources</a>` : `<a href="#/p/${slug}/notes">Notes</a>`}</p>
  </header>${body}
  <nav class="pager" aria-label="Lives"><a href="#/p/${slug}"><small>← Back to</small><b>${esc(s.name)}</b></a>${later ? `<a class="nx" href="#/p/${later}"><small>Later in the book →</small><b>${esc(S[later].name)}</b></a>` : ""}</nav>
  </article>`;
}

function timeline(){
  nav("timeline");
  const rows = [];
  ORDER.forEach(k => S[k].chapters.forEach((c, i) => { if (c.start) rows.push({k, n: i+1, c}); }));
  rows.sort((a, b) => a.c.start - b.c.start || (a.c.end || 0) - (b.c.end || 0));
  let h = `<header class="story" style="max-width:none"><p class="kicker">${esc(B.title)}</p><h1>Timeline</h1>
    <p class="lede-s">Every chapter in the book, by the years it covers. Lives overlap: the city each person knew was the same city.</p></header><ol class="tl">`;
  let dec = null;
  rows.forEach(r => {
    const d = Math.floor(r.c.start / 10) * 10;
    if (d !== dec){ dec = d; h += `<li><h2>${d}s</h2></li>`; }
    h += `<li class="row"><a href="${chapLink(r.k, r.n)}"><span class="when">${r.c.start}${r.c.end && r.c.end !== r.c.start ? "–" + r.c.end : ""}</span>
      <span class="what">${esc(r.c.name || r.c.title)}<span class="who">${esc(S[r.k].name)} · Chapter ${r.n}</span></span></a></li>`;
  });
  return h + `</ol>`;
}

function places(only, focus){
  nav("places");
  const ids = Object.keys(D.places).filter(id => !only || D.places[id].refs.some(r => r[0] === only))
    .sort((a, b) => D.places[a].name.localeCompare(D.places[b].name));
  const who = only && S[only] ? S[only].name : "";
  let h = `<header class="story" style="max-width:none"><p class="kicker">${esc(B.title)}${who ? ` · <a href="#/p/${only}">${esc(who)}</a>` : ""}</p>
    <h1>${focus && D.places[focus] ? esc(D.places[focus].name) : "Places"}</h1>
    <p class="lede-s">${focus ? "The chapters that name this place." : `Landmarks ${who ? "in " + esc(who) + "'s story" : "named in these stories"}, each with its page in ${esc(COMP.title || "the landmark guide")}.`}</p></header>
    <ul class="places">`;
  (focus ? [focus].filter(id => D.places[id]) : ids).forEach(id => {
    const p = D.places[id];
    const refs = p.refs.map(([k, n]) => `<a href="${chapLink(k, n)}">${esc(S[k].name)}: ${esc(chapName(S[k], n))}</a>`).join("<br>");
    h += `<li><h3>${esc(p.name)}</h3>${p.address ? `<p>${esc(p.address)}</p>` : ""}<p class="refs">${refs}</p>
      ${COMP.url ? `<p><a href="${esc(compHref(id))}" target="_blank" rel="noopener">Open in ${esc(COMP.title || "the guide")} ↗</a></p>` : ""}</li>`;
  });
  if (focus && !D.places[focus]) h += `<li><p>None of these stories names that place yet.</p></li>`;
  return h + `</ul>`;
}

function notFound(){ nav(""); return `<p>That page is not in this book. <a href="#/">Back to the contents</a>.</p>`; }

function route(){
  const parts = (location.hash || "#/").replace(/^#\/?/, "").split("/").filter(Boolean);
  let html, hit = null;
  if (!parts.length) html = home();
  else if (parts[0] === "timeline") html = timeline();
  else if (parts[0] === "places") html = places(parts[1] || null, null);
  else if (parts[0] === "l" && parts[1]) html = places(null, parts[1]);
  else if (parts[0] === "p" && parts[1]){
    const slug = parts[1], sub = parts[2];
    if (!sub) html = person(slug);
    else if (sub === "notes" || sub === "sources"){ html = apparatus(slug, sub); hit = sub === "sources" ? parts[3] : null; }
    else if (/^\d+$/.test(sub)) html = +sub === 0 ? person(slug) : chapter(slug, +sub);
    else html = notFound();
  } else html = notFound();
  el("view").innerHTML = REVIEW_NOTE + html;
  pictures(el("view"));
  const s = parts[0] === "p" ? S[parts[1]] : null;
  document.title = s ? `${s.name} · ${B.title}` : B.title;
  if (hit){
    const li = document.getElementById("s" + hit);
    if (li){ li.classList.add("hit"); li.scrollIntoView({block: "center"}); return; }
  }
  window.scrollTo(0, 0);
}
// A copied picture: from its text form on a hosted copy (the deploy carries no binary files),
// else the file beside the page. Loaded when it comes near the screen.
const PICS = D.pics || {};
const fill = img => {
  const src = img.getAttribute("data-src"); img.removeAttribute("data-src");
  const pic = PICS[src];
  if (!pic){ img.src = src; return; }
  fetch(pic).then(r => r.ok ? r.text() : Promise.reject(r.status)).then(uri => { img.src = uri; })
    .catch(() => { img.src = src; });
};
const near = "IntersectionObserver" in window
  ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting){ near.unobserve(e.target); fill(e.target); } }),
                             {rootMargin: "800px 0px"})
  : null;
function pictures(root){ root.querySelectorAll("img[data-src]").forEach(img => near ? near.observe(img) : fill(img)); }
window.addEventListener("hashchange", route);
route();
</script>
</body>
</html>
"""


def main(argv):
    if len(argv) >= 4 and argv[1] == "order":
        return cmd_order(argv[2], argv[3])
    if len(argv) >= 4 and argv[1] == "status":
        return cmd_status(argv[2], argv[3])
    if len(argv) >= 5 and argv[1] == "build":
        if "--publish" in argv and "--review" in argv:
            print("--publish or --review, not both")
            return 2
        return cmd_build(argv[2], argv[3], argv[4], use_files="--files" in argv, publish="--publish" in argv,
                         review="--review" in argv)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
