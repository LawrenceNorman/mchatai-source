#!/usr/bin/env python3
"""Save a source as bytes on disk — the only way a source enters a project (sourcing.md §1).

  fetch.py fetch <project> <url> --publisher P --kind K --license L [--id s7] [--date D] [--title T] [--own-words]
  fetch.py text  <project> --url U --publisher P --kind K --license L [--id ...] [--title T] < page.txt
  fetch.py file  <project> <path> --url U --publisher P --kind K --license L [--id ...]
  fetch.py list  <project>
  fetch.py get   <url>                     print a page or search reply, to FIND sources (records nothing)

fetch   GET the URL (no other method, ever), keep the raw bytes, extract text. PDFs go through
        pdftotext (or pypdf); HTML is reduced to its text with block breaks kept. Refuses — exit 3 —
        an HTTP error, a page that is blocked or rendered by script (under 50 words), and a "PDF"
        that is not one (a 200 is not a document).
text    the page text from somewhere else, on stdin: what AI Web read for a site that refuses
        scripts. Accepts plain text, or the JSON reply of `aiweb.getCurrentPage` (result.text).
file    a local file (a PDF or text) that IS a public record, with the URL it is published at.
list    every source in the project.

Each source becomes sources/<id>.txt plus a record in sources/index.json. Do NOT use the model's
own web-fetch tool for sources: it returns a summary written by a model, and a verbatim quote
cannot be checked against a summary.

kind:    primary | government | archive | encyclopedia | news | book | community | clue-only
license: pd | cc-by | facts-only | clue-only      (when in doubt: facts-only)
"""
import argparse
import datetime
import fcntl
import tempfile
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import Project, clean_source_text, load_json, save_json, words  # noqa: E402

KINDS = ["primary", "government", "archive", "encyclopedia", "news", "book", "community", "clue-only"]
LICENSES = ["pd", "cc-by", "facts-only", "clue-only"]
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/17.0 Safari/605.1.15")
MIN_WORDS = 50


class Refused(Exception):
    """A source that must not be recorded — say why and what to do instead."""


# ── HTML to text ─────────────────────────────────────────────────────────────

BLOCK = {"p", "div", "br", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "table",
         "section", "article", "header", "footer", "blockquote", "pre", "dd", "dt", "figcaption",
         "main", "aside", "hr", "td", "th"}
SKIP = {"script", "style", "noscript", "svg", "template", "iframe", "head",
        # Page furniture, not the document: menus, site banners, footers, sidebars, forms. Kept,
        # they counted as "words about the subject" whenever a name sat near a menu (2026-10-02).
        "nav", "footer", "aside", "form", "button", "select"}
SKIP_ROLES = {"navigation", "banner", "contentinfo", "search", "complementary", "menu", "menubar"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class _Text(HTMLParser):
    """Two streams: everything readable, and the part inside <main>/<article>. A page-level
    <header> (outside main/article) is furniture; one inside an article is its title."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.main_out, self.title, self.in_title = [], [], "", False
        self.stack = []          # (tag, skipping?) for every open non-void element
        self.skip = 0
        self.main = 0

    def _emit(self, s):
        self.out.append(s)
        if self.main:
            self.main_out.append(s)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        skipping = (tag in SKIP or (a.get("role") or "").lower() in SKIP_ROLES
                    or (a.get("aria-hidden") or "").lower() == "true"
                    or (tag == "header" and not self.main))
        if tag == "title":
            self.in_title = True
        if tag in VOID:
            if tag in BLOCK and not self.skip:
                self._emit("\n")
            return
        self.stack.append((tag, skipping, tag in ("main", "article")))
        if skipping:
            self.skip += 1
        if tag in ("main", "article") and not self.skip:
            self.main += 1
        if tag in BLOCK and not self.skip:
            self._emit("\n")

    def handle_startendtag(self, tag, attrs):
        if tag in BLOCK and not self.skip:
            self._emit("\n")

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag in VOID:
            return
        # Close back to the matching open tag; HTML in the wild leaves some unclosed.
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for t, skipping, is_main in reversed(self.stack[i:]):
                    if skipping and self.skip:
                        self.skip -= 1
                    elif is_main and self.main and not self.skip:
                        self.main -= 1
                del self.stack[i:]
                break
        if tag in BLOCK and not self.skip:
            self._emit("\n")

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        elif not self.skip:
            self._emit(data)


def _paragraphs(chunks):
    lines = [re.sub(r"[ \t\r\f\v\u00a0]+", " ", ln).strip() for ln in "".join(chunks).split("\n")]
    paras, cur = [], []
    for ln in lines:
        if ln:
            cur.append(ln)
        elif cur:
            paras.append(" ".join(cur))
            cur = []
    if cur:
        paras.append(" ".join(cur))
    return "\n\n".join(paras)


def html_to_text(raw):
    """(title, text): block elements become paragraph breaks, inline ones never split a line.
    When the page marks its document with <main> or <article> and that part holds a real text,
    only it is kept; menus, banners, footers, sidebars and forms are dropped either way."""
    p = _Text()
    p.feed(raw)
    whole, main = _paragraphs(p.out), _paragraphs(p.main_out)
    text = main if words(main) >= MIN_WORDS else whole
    return re.sub(r"\s+", " ", html.unescape(p.title)).strip(), text


def pdf_to_text(path):
    if shutil.which("pdftotext"):
        r = subprocess.run(["pdftotext", path, "-"], capture_output=True, text=True, timeout=120)
        if r.returncode == 0:
            return r.stdout
    try:
        from pypdf import PdfReader
        return "\n\n".join((page.extract_text() or "") for page in PdfReader(path).pages)
    except Exception as e:  # noqa: BLE001
        raise Refused(f"could not extract text from the PDF ({e}); install poppler (pdftotext) or pypdf")


# ── recording ────────────────────────────────────────────────────────────────

def next_id(project):
    used = [int(m.group(1)) for k in project.sources for m in [re.fullmatch(r"s(\d+)", k)] if m]
    return f"s{(max(used) + 1) if used else 1}"


def record(project, args, text, raw_bytes, raw_ext, extra):
    sid = args.id or next_id(project)
    if not re.fullmatch(r"[A-Za-z0-9_-]+", sid):
        raise Refused(f"source id {sid!r} must be letters, digits, '-' or '_'")
    n = words(text)
    if n < MIN_WORDS:
        raise Refused(f"only {n} words of text — a blocked, placeholder or script-rendered page. "
                      "Read it through AI Web (aiweb.openPage, then aiweb.getCurrentPage) and pipe the "
                      "reply into `fetch.py text`.")
    os.makedirs(project.path("sources"), exist_ok=True)
    text = clean_source_text(text)
    with open(project.path("sources", f"{sid}.txt"), "w", encoding="utf-8") as fh:
        fh.write(text)
    if raw_bytes is not None:
        with open(project.path("sources", f"{sid}.raw{raw_ext}"), "wb") as fh:
            fh.write(raw_bytes)
    rows = load_json(project.path("sources", "index.json"), [])
    if isinstance(rows, dict):
        rows = rows.get("sources", [])
    rows = [r for r in rows if str(r.get("id")) != sid]
    rec = {"id": sid, "url": args.url, "title": args.title or extra.get("title") or "",
           "publisher": args.publisher, "kind": args.kind, "license": args.license,
           "date": args.date or "", "file": f"sources/{sid}.txt", "words": n,
           "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
           "sha1": hashlib.sha1(raw_bytes if raw_bytes is not None else text.encode()).hexdigest()}
    if args.own_words:
        rec["ownWords"] = True
    rec.update({k: v for k, v in extra.items() if k != "title" and v})
    if getattr(args, "original_url", None):
        rec["originalURL"] = args.original_url
        rec["via"] = "wayback"
    rows.append(rec)
    save_json(project.path("sources", "index.json"), rows)
    print(f"{sid}  {args.publisher}  {rec['title'][:70]!r} — {n:,} words → sources/{sid}.txt")
    return sid


HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,application/json;q=0.8,*/*;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
}

CHALLENGE = re.compile(r"(just a moment\.\.\.|checking your browser|cf-browser-verification|cf_chl_|"
                       r"attention required! \| cloudflare|enable javascript and cookies to continue)", re.I)


def is_challenge(body):
    """A bot-check or rate-limit interstitial (Cloudflare and the like), not the document."""
    return bool(CHALLENGE.search(body[:20000]))


def clock_dir():
    """ONE folder every agent on this Mac shares. Not tempfile.gettempdir(): a CLI gives each of its
    agents a temp folder of its own, so a clock kept there was never shared and parallel scouts
    still burst the archive together (found by the scouts themselves, 2026-10-02)."""
    for d in (os.environ.get("HW_CLOCK_DIR"), "/tmp/hw-fetch-clocks", os.path.join(tempfile.gettempdir(), "hw-fetch-clocks")):
        if not d:
            continue
        try:
            os.makedirs(d, exist_ok=True)
            probe = os.path.join(d, ".probe")
            with open(probe, "w") as fh:
                fh.write("ok")
            return d
        except OSError:
            continue
    return tempfile.gettempdir()


def throttle(host, interval):
    """Space requests to one host across EVERY process on this Mac. Several scouts fetching from
    the same archive at once got it rate-limited (loc.gov, 2026-10-02); one shared clock per host
    keeps parallel agents polite without slowing different hosts."""
    path = os.path.join(clock_dir(), f"{re.sub(r'[^A-Za-z0-9.-]', '_', host)}.clock")
    with open(path, "a+") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        fh.seek(0)
        try:
            last = float(fh.read().strip() or 0)
        except ValueError:
            last = 0.0
        wait = last + interval - time.time()
        if wait > 0:
            time.sleep(wait)
        fh.seek(0)
        fh.truncate()
        fh.write(str(time.time()))
        fcntl.flock(fh, fcntl.LOCK_UN)


def host_interval(host):
    """Seconds between requests to this host (thresholds.json): a default, and stricter ones for
    hosts that rate-limit — the Library of Congress search blocked the scouts for over an hour after
    a burst of searches (2026-10-02)."""
    t = load_json(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "thresholds.json"), {}) or {}
    return float((t.get("fetchHostIntervals") or {}).get(host, t.get("fetchMinIntervalSeconds", 1.5)))


def wayback_snapshot(url):
    """The Internet Archive's closest snapshot of a page that is gone, or None. A dead page is often
    the only place a source survives (a college's local-history chapters quoting a 1976 oral
    history, found by the Thelma Dewitty scout)."""
    api = "https://archive.org/wayback/available?url=" + urllib.parse.quote(url, safe="")
    try:
        throttle("archive.org", host_interval("archive.org"))
        with urllib.request.urlopen(urllib.request.Request(api, headers=HEADERS), timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
        snap = ((data.get("archived_snapshots") or {}).get("closest") or {})
        if snap.get("available") and snap.get("url"):
            return snap["url"].replace("http://web.archive.org", "https://web.archive.org")
    except Exception:  # noqa: BLE001 — no snapshot is an ordinary answer here
        return None
    return None


def cmd_get(args):
    """GET a page or a search API reply and print it — to FIND sources, never to record one. Same
    browser headers and per-host spacing as `fetch`, so parallel agents searching an archive share
    one clock instead of each hammering it."""
    if not re.match(r"https?://", args.url):
        raise Refused("only http(s) URLs")
    host = urllib.parse.urlparse(args.url).hostname or ""
    throttle(host, host_interval(host))
    req = urllib.request.Request(args.url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            body = resp.read(25_000_000).decode(resp.headers.get_content_charset() or "utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise Refused(f"HTTP 429 from {host}: rate-limited. Wait several minutes before the next request to it")
        raise Refused(f"HTTP {e.code} from {args.url}")
    except (urllib.error.URLError, TimeoutError) as e:
        raise Refused(f"could not reach {args.url}: {e}")
    if is_challenge(body):
        raise Refused(f"{host} answered with a bot check or rate-limit page. Wait several minutes before the next request to it")
    sys.stdout.write(body)
    return 0


META_REFRESH = re.compile(r"<meta[^>]+http-equiv=[\x27\x22]?refresh[\x27\x22]?[^>]*content=[\x27\x22]?\s*\d+\s*;\s*url=([^\x27\x22>]+)", re.I)


def meta_refresh_target(body, base):
    """The page a meta-refresh stub forwards to, or None. Old site addresses often survive only as
    these stubs (UW's civil-rights project: every .htm forwards to a .shtml)."""
    m = META_REFRESH.search(body[:20000])
    if not m:
        return None
    return urllib.parse.urljoin(base, html.unescape(m.group(1).strip()))


def cmd_fetch(project, args, hops=0):
    if not re.match(r"https?://", args.url):
        raise Refused("only http(s) URLs")
    req = urllib.request.Request(args.url, headers=HEADERS)
    host = urllib.parse.urlparse(args.url).hostname or ""
    interval = host_interval(host)
    for attempt in (1, 2):
        throttle(host, interval)
        try:
            # 30 s, then 45 s: both attempts finish inside a CLI's two-minute command limit.
            with urllib.request.urlopen(req, timeout=15 + 15 * attempt) as resp:
                raw = resp.read(25_000_000)
                final = resp.geturl()
                ctype = resp.headers.get("Content-Type", "")
                charset = resp.headers.get_content_charset() or "utf-8"
            break
        except urllib.error.HTTPError as e:
            if e.code == 429:
                raise Refused(f"HTTP 429 from {host}: rate-limited. Wait a minute, fetch from this host one "
                              "page at a time, and retry; do not switch to another tool to get around it")
            if e.code in (404, 410) and hops == 0 and "web.archive.org" not in host:
                snap = wayback_snapshot(args.url)
                if snap:
                    print(f"{args.url} is gone (HTTP {e.code}); using the archived copy {snap}", file=sys.stderr)
                    args.original_url = args.url
                    args.url = snap
                    return cmd_fetch(project, args, hops + 1)
            raise Refused(f"HTTP {e.code} from {args.url} — if the site blocks scripts, read it through AI Web "
                          "(aiweb.openPage, then aiweb.getCurrentPage) and pipe the reply into `fetch.py text`")
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == 2:
                raise Refused(f"could not reach {args.url} ({e}). Try again later, or record a local copy of the "
                              "same document with `fetch.py file` and this URL")
            time.sleep(5)
    looks_pdf = raw[:5] == b"%PDF-"
    if (args.url.lower().split("?")[0].endswith(".pdf") or "pdf" in ctype.lower()) and not looks_pdf:
        raise Refused(f"{args.url} was expected to be a PDF and is not one ({ctype or 'no content type'}) — "
                      "a 200 is not a document")
    extra = {"finalURL": final if final != args.url else "", "contentType": ctype.split(";")[0], "via": "fetch"}
    if looks_pdf:
        tmp = project.path("sources", ".fetch.pdf")
        os.makedirs(project.path("sources"), exist_ok=True)
        with open(tmp, "wb") as fh:
            fh.write(raw)
        try:
            text = pdf_to_text(tmp)
        finally:
            os.remove(tmp)
        return record(project, args, text, raw, ".pdf", extra)
    body = raw.decode(charset, errors="replace")
    if is_challenge(body):
        raise Refused(f"{host} answered with a bot check or rate-limit page, not the document. Wait and retry "
                      "one page at a time, or read it through AI Web (aiweb.openPage, then aiweb.getCurrentPage)")
    if "json" in ctype.lower() or body.lstrip()[:1] in ("{", "["):
        text = json_text(body)
        if text is None:
            raise Refused(f"{args.url} returned JSON with no text field — it is an index or an API reply, "
                          "not a document. Read it to find the document, then fetch the document itself")
        return record(project, args, text, raw, ".json", extra)
    title, text = html_to_text(body)
    target = meta_refresh_target(body, final)
    if target and words(text) < MIN_WORDS and hops < 2:
        print(f"following meta refresh: {args.url} -> {target}", file=sys.stderr)
        args.url = target
        return cmd_fetch(project, args, hops + 1)
    extra["title"] = title
    return record(project, args, text, raw, ".html", extra)


TEXT_KEYS = ("full_text", "fulltext", "text", "ocr", "content", "body")


def json_text(body):
    """The document text inside a JSON reply — e.g. the Library of Congress OCR service answers
    {"<segment>": {"full_text": "..."}}. The longest string under a text-like key, or None.
    Saving the raw JSON instead would keep "\\n" escapes in the text, and a quote that spans a
    line break could never match it."""
    try:
        data = json.loads(body)
    except ValueError:
        return None
    best = None

    def walk(o):
        nonlocal best
        if isinstance(o, dict):
            for k, v in o.items():
                if isinstance(v, str) and k.lower() in TEXT_KEYS and (best is None or len(v) > len(best)):
                    best = v
                else:
                    walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(data)
    if best is None:
        best = fields_text(data)
    return best


def fields_text(data):
    """A catalogue record as text: the `fields: [{label, value}]` shape the UW digital-collections
    (CONTENTdm) item API returns. Captions there carry dated credits and the newspaper page a
    picture ran on — real dated events — and the scouts were flattening them by hand."""
    rows = []

    def walk(o):
        if isinstance(o, dict):
            if isinstance(o.get("fields"), list):
                for f in o["fields"]:
                    if isinstance(f, dict) and f.get("value") not in (None, "", []):
                        rows.append(f"{f.get('label') or f.get('key') or ''}: {f.get('value')}".strip())
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(data)
    return "\n".join(rows) if rows else None


def cmd_text(project, args):
    data = sys.stdin.read()
    text, via = data, "text"
    try:
        j = json.loads(data)
        res = j.get("result") if isinstance(j, dict) else None
        if isinstance(res, dict) and isinstance(res.get("text"), str):
            text, via = res["text"], "aiweb"
            args.title = args.title or res.get("title") or ""
    except ValueError:
        pass
    return record(project, args, text, None, "", {"via": via})


def cmd_file(project, args):
    path = os.path.expanduser(args.path)
    if not os.path.isfile(path):
        raise Refused(f"no file at {path}")
    with open(path, "rb") as fh:
        raw = fh.read()
    if raw[:5] == b"%PDF-":
        return record(project, args, pdf_to_text(path), raw, ".pdf", {"via": "file"})
    return record(project, args, raw.decode("utf-8", errors="replace"), raw, ".txt", {"via": "file"})


def cmd_list(project):
    rows = list(project.sources.values())
    if not rows:
        print("no sources yet")
        return 0
    for r in rows:
        print(f"{r['id']:<5} {r.get('publisher', '')[:24]:<24} {r.get('kind', ''):<12} {r.get('license', ''):<10} "
              f"{r.get('words', 0):>7,}  {r.get('title', '')[:60]}")
    return 0


def main(argv):
    ap = argparse.ArgumentParser(prog="fetch.py", description="Save a source as bytes on disk.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p, url_positional=False):
        p.add_argument("project")
        if url_positional:
            p.add_argument("url")
        p.add_argument("--publisher", required=True, help="the unit of independence, e.g. HistoryLink")
        p.add_argument("--kind", required=True, choices=KINDS)
        p.add_argument("--license", required=True, choices=LICENSES)
        p.add_argument("--id")
        p.add_argument("--date", help="the source's own date")
        p.add_argument("--title")
        p.add_argument("--own-words", action="store_true", help="the subject's own words: a letter, testimony, an oral history")

    common(sub.add_parser("fetch"), url_positional=True)
    t = sub.add_parser("text")
    common(t)
    t.add_argument("--url", required=True)
    f = sub.add_parser("file")
    f.add_argument("project")
    f.add_argument("path")
    f.add_argument("--url", required=True)
    for name, req in (("--publisher", True), ("--kind", True), ("--license", True)):
        f.add_argument(name, required=req, **({"choices": KINDS} if name == "--kind" else {"choices": LICENSES} if name == "--license" else {}))
    f.add_argument("--id")
    f.add_argument("--date")
    f.add_argument("--title")
    f.add_argument("--own-words", action="store_true")
    sub.add_parser("list").add_argument("project")
    g = sub.add_parser("get", help="print a page or search reply, to find sources (records nothing)")
    g.add_argument("url")

    args = ap.parse_args(argv[1:])
    if args.cmd == "get":
        try:
            return cmd_get(args)
        except Refused as e:
            print(f"REFUSED: {e}", file=sys.stderr)
            return 3
    project = Project(args.project)
    try:
        if args.cmd == "list":
            return cmd_list(project)
        {"fetch": cmd_fetch, "text": cmd_text, "file": cmd_file}[args.cmd](project, args)
        return 0
    except Refused as e:
        print(f"REFUSED: {e}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main(sys.argv))
