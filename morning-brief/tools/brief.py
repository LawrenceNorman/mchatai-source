#!/usr/bin/env python3
"""Morning Brief: today's stories for one city and a few topics, chosen without a model.

Reads news feeds (a news search per section, plus any feeds the person added),
keeps what is recent, drops what an earlier brief already used (the seen-ledger
in ./state), and writes today's candidates as items.json and items.md: headline,
source, link and a short snippet, grouped by section. The assistant writes the
brief from those items only. Nothing here calls a model, and no story is rehosted:
an item is a headline, at most a short snippet, and a link to the source.

  python3 brief.py collect --config brief.json --out today [--state state] [--hours 36] [--per-section 6]
  python3 brief.py mark-seen --items today/items.json [--state state]   # after the brief is published
  python3 brief.py selftest                                              # offline fixtures, no network

brief.json:
  {"city": "Tucson, Arizona", "topics": ["water", {"name": "High school sports", "query": "Tucson high school sports"}],
   "feeds": [{"name": "A local paper", "url": "https://example.com/rss", "section": "Around town"}],
   "language": "en-US", "country": "US", "localHeadlines": true}
"""
from __future__ import annotations

import argparse
import datetime as dt
import email.utils
import hashlib
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

UA = "mChatAI-MorningBrief/1 (+https://mchatai.com)"
TIMEOUT = 20
MAX_BYTES = 2_000_000
SNIPPET = 200
SEEN_DAYS = 30
SEARCH = "https://news.google.com/rss/search?q={q}&hl={hl}&gl={gl}&ceid={gl}:{lang}"
TRACKING = re.compile(r"^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ocid$|cmpid$)")


# ---------------------------------------------------------------- config

def load_config(path: Path) -> dict:
    cfg = json.loads(path.read_text(encoding="utf-8"))
    city = str(cfg.get("city") or "").strip()
    topics = []
    for t in cfg.get("topics") or []:
        if isinstance(t, str) and t.strip():
            topics.append({"name": t.strip(), "query": t.strip()})
        elif isinstance(t, dict) and str(t.get("name") or "").strip():
            topics.append({"name": t["name"].strip(), "query": str(t.get("query") or t["name"]).strip()})
    feeds = [f for f in cfg.get("feeds") or [] if isinstance(f, dict) and safe_url(f.get("url"))]
    if not city and not topics and not feeds:
        raise SystemExit("brief: the config names no city, no topics and no feeds")
    lang_tag = str(cfg.get("language") or "en-US")
    return {"city": city, "topics": topics[:8], "feeds": feeds[:20], "hl": lang_tag,
            "lang": lang_tag.split("-")[0], "gl": str(cfg.get("country") or "US").upper(),
            "localHeadlines": cfg.get("localHeadlines", True) is not False}


def sections(cfg: dict) -> list[dict]:
    out = []

    def search(name, query):
        url = SEARCH.format(q=urllib.parse.quote_plus(f"{query} when:2d"), hl=cfg["hl"], gl=cfg["gl"],
                            lang=cfg["lang"])
        out.append({"name": name, "query": query, "urls": [url]})
    if cfg["city"] and cfg["localHeadlines"]:
        search(f"Around {cfg['city'].split(',')[0]}", cfg["city"])
    for t in cfg["topics"]:
        search(t["name"], t["query"])
    for f in cfg["feeds"]:
        name = str(f.get("section") or f.get("name") or "From your feeds").strip()
        existing = next((s for s in out if s["name"].lower() == name.lower()), None)
        if existing:
            existing["urls"].append(safe_url(f["url"]))
        else:
            out.append({"name": name, "query": "", "urls": [safe_url(f["url"])]})
    return out


# ---------------------------------------------------------------- feeds

def safe_url(value) -> str:
    if not isinstance(value, str):
        return ""
    u = value.strip()
    return u if urllib.parse.urlparse(u).scheme in ("http", "https") else ""


def canonical(url: str) -> str:
    p = urllib.parse.urlparse(url)
    query = [(k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True) if not TRACKING.match(k)]
    return urllib.parse.urlunparse((p.scheme.lower(), p.netloc.lower().removeprefix("www."), p.path.rstrip("/"),
                                    "", urllib.parse.urlencode(query), ""))


def plain(s: str) -> str:
    s = re.sub(r"(?s)<[^>]+>", " ", html.unescape(s or ""))
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def title_key(title: str, source: str) -> str:
    t = title
    if source and t.lower().endswith(" - " + source.lower()):
        t = t[: -(len(source) + 3)]
    return " ".join(re.findall(r"[a-z0-9]+", t.lower()))


def when(value: str) -> dt.datetime | None:
    if not value:
        return None
    try:
        t = email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError):
        try:
            t = dt.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)


def local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_feed(body: str, feed_url: str) -> list[dict]:
    try:
        root = ET.fromstring(body.encode("utf-8") if isinstance(body, str) else body)
    except ET.ParseError:
        return []
    items = []
    for node in root.iter():
        kind = local(node.tag)
        if kind not in ("item", "entry"):
            continue
        fields = {local(c.tag): c for c in node}
        title = plain(fields["title"].text or "") if "title" in fields else ""
        link = ""
        if "link" in fields:
            link = (fields["link"].text or "").strip() or fields["link"].get("href", "")
        for c in node:
            if local(c.tag) == "link" and c.get("rel", "alternate") == "alternate" and c.get("href"):
                link = c.get("href")
                break
        link = safe_url(urllib.parse.urljoin(feed_url, link))
        source = ""
        if "source" in fields:
            source = plain(fields["source"].text or "")
        if not source:
            source = urllib.parse.urlparse(link).netloc.removeprefix("www.")
        desc = ""
        for key in ("description", "summary", "content"):
            if key in fields and (fields[key].text or "").strip():
                desc = plain(fields[key].text)
                break
        if desc and title_key(desc, source).startswith(title_key(title, source)):
            desc = ""          # news-search descriptions repeat the headline; drop them
        if len(desc) > SNIPPET:
            desc = desc[: SNIPPET - 1].rsplit(" ", 1)[0] + "…"
        stamp = ""
        for key in ("pubDate", "published", "updated", "date"):
            if key in fields and (fields[key].text or "").strip():
                stamp = fields[key].text.strip()
                break
        if title and link:
            items.append({"title": title, "link": link, "source": source, "snippet": desc,
                          "published": stamp})
    return items


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml,application/atom+xml,*/*"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return r.read(MAX_BYTES).decode("utf-8", "replace")


# ---------------------------------------------------------------- seen-ledger

def load_seen(state: Path) -> dict:
    p = state / "seen.json"
    if not p.is_file():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except ValueError:
        return {}


def keys_of(item: dict) -> list[str]:
    return ["u:" + hashlib.sha1(canonical(item["link"]).encode()).hexdigest()[:16],
            "t:" + hashlib.sha1(title_key(item["title"], item.get("source", "")).encode()).hexdigest()[:16]]


# ---------------------------------------------------------------- collect

def collect(cfg: dict, seen: dict, now: dt.datetime, hours: int, per_section: int, fetcher=fetch) -> dict:
    cutoff = now - dt.timedelta(hours=hours)
    taken: set[str] = set()
    out, errors, skipped = [], [], {"alreadyUsed": 0, "older": 0, "repeat": 0}
    for sec in sections(cfg):
        pool = []
        for url in sec["urls"]:
            try:
                pool += parse_feed(fetcher(url), url)
            except Exception as e:  # noqa: BLE001 — reported, never fatal
                errors.append(f"{sec['name']}: could not read a feed ({type(e).__name__}: {e})"[:240])
        pool.sort(key=lambda i: when(i["published"]) or now, reverse=True)
        items = []
        for item in pool:
            t = when(item["published"])
            if t and t < cutoff:
                skipped["older"] += 1
                continue
            ks = keys_of(item)
            if any(k in seen for k in ks):
                skipped["alreadyUsed"] += 1
                continue
            if any(k in taken for k in ks):
                skipped["repeat"] += 1
                continue
            taken.update(ks)
            item["id"] = ks[0][2:12]
            items.append(item)
            if len(items) >= per_section:
                break
        out.append({"name": sec["name"], "query": sec["query"], "items": items})
    return {"date": now.date().isoformat(), "city": cfg["city"], "sections": out,
            "skipped": skipped, "errors": errors}


def to_markdown(result: dict) -> str:
    d = dt.date.fromisoformat(result["date"])
    lines = [f"# Candidates for {d:%A}, {d:%B} {d.day}" + (f" — {result['city']}" if result["city"] else ""), ""]
    for sec in result["sections"]:
        lines += [f"## {sec['name']}", ""]
        if not sec["items"]:
            lines += ["(nothing new)", ""]
            continue
        for i in sec["items"]:
            lines.append(f"- [{i['id']}] [{i['title']}]({i['link']}) — {i['source']}"
                         + (f": {i['snippet']}" if i["snippet"] else ""))
        lines.append("")
    s = result["skipped"]
    lines.append(f"Left out: {s['alreadyUsed']} already used in an earlier brief, {s['older']} older, "
                 f"{s['repeat']} repeats.")
    for e in result["errors"]:
        lines.append(f"Problem: {e}")
    return "\n".join(lines) + "\n"


def mark_seen(items_path: Path, state: Path, today: dt.date, used: set[str] | None = None) -> int:
    """Record the stories a published brief used (`used` = their ids; None = every candidate)."""
    result = json.loads(items_path.read_text(encoding="utf-8"))
    seen = load_seen(state)
    n = 0
    for sec in result.get("sections", []):
        for item in sec.get("items", []):
            if used is not None and item.get("id") not in used:
                continue
            for k in keys_of(item):
                seen[k] = today.isoformat()
            n += 1
    floor = (today - dt.timedelta(days=SEEN_DAYS)).isoformat()
    seen = {k: v for k, v in seen.items() if v >= floor}
    state.mkdir(parents=True, exist_ok=True)
    (state / "seen.json").write_text(json.dumps(seen, indent=1, sort_keys=True), encoding="utf-8")
    return n


# ---------------------------------------------------------------- selftest

def rss(items: list[tuple[str, str, str, str]]) -> str:
    parts = []
    for t, l, d, s in items:
        desc = html.escape('<a href="%s">%s</a>' % (l, t))   # news search: the headline again, as a link
        parts.append("<item><title>%s</title><link>%s</link><pubDate>%s</pubDate>"
                     '<source url="https://x">%s</source><description>%s</description></item>'
                     % (html.escape(t), html.escape(l), d, html.escape(s), desc))
    return '<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>%s</channel></rss>' % "".join(parts)


def selftest() -> int:
    import tempfile
    fails, ran = [], []

    def check(name, ok):
        ran.append(name)
        if not ok:
            fails.append(name)

    now = dt.datetime(2030, 3, 5, 7, 0, tzinfo=dt.timezone.utc)
    fresh = email.utils.format_datetime(now - dt.timedelta(hours=3))
    old = email.utils.format_datetime(now - dt.timedelta(days=4))
    city_feed = rss([("Council votes on bus lanes - Daily Times", "https://daily.example/bus?utm_source=x", fresh,
                      "Daily Times"),
                     ("Bridge closes for repairs - Metro Wire", "https://wire.example/bridge", fresh, "Metro Wire"),
                     ("Last week's storm - Daily Times", "https://daily.example/storm", old, "Daily Times")])
    topic_feed = rss([("Council votes on bus lanes - Daily Times", "https://daily.example/bus", fresh,
                       "Daily Times"),
                      ("New library opens downtown - Metro Wire", "https://wire.example/library", fresh,
                       "Metro Wire")])
    atom = ("<?xml version=\"1.0\"?><feed xmlns=\"http://www.w3.org/2005/Atom\"><entry><title>Neighborhood "
            "market returns</title><link rel=\"alternate\" href=\"/market\"/><updated>"
            + (now - dt.timedelta(hours=1)).isoformat() + "</updated><summary>" + "Stalls " * 80
            + "</summary></entry></feed>")

    def fake(url):
        if "news.google.com" in url and "transit" in urllib.parse.unquote_plus(url):
            return topic_feed
        if "news.google.com" in url:
            return city_feed
        if url == "https://blog.example/feed":
            return atom
        raise OSError("offline fixture")

    with tempfile.TemporaryDirectory() as d:
        cfg_path = Path(d) / "brief.json"
        cfg_path.write_text(json.dumps({"city": "Testville, Oregon", "topics": ["transit", {"name": "", "query": "x"}],
                                        "feeds": [{"name": "Blog", "url": "https://blog.example/feed",
                                                   "section": "From your feeds"},
                                                  {"name": "Dead", "url": "https://dead.example/rss"},
                                                  {"name": "Bad", "url": "file:///etc/passwd"}]}))
        cfg = load_config(cfg_path)
        names = [s["name"] for s in sections(cfg)]
        check("sections: city, topic, feeds; blank topic and non-http feed ignored",
              names == ["Around Testville", "transit", "From your feeds", "Dead"])
        check("search url carries the query and a two-day window",
              "q=transit+when%3A2d" in sections(cfg)[1]["urls"][0])
        result = collect(cfg, {}, now, 36, 6, fake)
        by = {s["name"]: s for s in result["sections"]}
        city_titles = [i["title"] for i in by["Around Testville"]["items"]]
        check("older than the window left out", "Last week's storm - Daily Times" not in city_titles
              and result["skipped"]["older"] == 1)
        check("a story in two sections appears once (tracking parameters ignored)",
              [i["title"] for i in by["transit"]["items"]] == ["New library opens downtown - Metro Wire"]
              and result["skipped"]["repeat"] == 1)
        check("descriptions that only repeat the headline are dropped",
              all(i["snippet"] == "" for i in by["Around Testville"]["items"]))
        blog = by["From your feeds"]["items"]
        check("atom entry: relative link resolved, snippet cut short",
              blog and blog[0]["link"] == "https://blog.example/market" and len(blog[0]["snippet"]) <= SNIPPET)
        check("an unreadable feed is reported, not fatal", any("Dead" in e for e in result["errors"]))
        md = to_markdown(result)
        check("markdown lists ids and links", "[Bridge closes for repairs - Metro Wire](https://wire.example/bridge)" in md)
        items_path = Path(d) / "items.json"
        items_path.write_text(json.dumps(result))
        state = Path(d) / "state"
        bridge = next(i for i in by["Around Testville"]["items"] if "Bridge" in i["title"])
        check("mark-seen --used records only the stories the brief used",
              mark_seen(items_path, Path(d) / "state-used", now.date(), {bridge["id"]}) == 1
              and len(load_seen(Path(d) / "state-used")) == 2)
        n = mark_seen(items_path, state, now.date())
        again = collect(cfg, load_seen(state), now, 36, 6, fake)
        check("after mark-seen, the same stories are not offered again",
              n == 4 and all(not s["items"] for s in again["sections"]) and again["skipped"]["alreadyUsed"] >= 4)
        seen = load_seen(state)
        seen["u:ancient"] = "2029-01-01"
        (state / "seen.json").write_text(json.dumps(seen))
        mark_seen(items_path, state, now.date())
        check("seen-ledger forgets after 30 days", "u:ancient" not in load_seen(state))
    print(f"selftest: {len(ran) - len(fails)}/{len(ran)} passed" + (f"; FAILED: {fails}" if fails else ""))
    return 1 if fails else 0


# ---------------------------------------------------------------- main

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("collect", help="today's candidate stories, new since the last brief")
    c.add_argument("--config", required=True, type=Path)
    c.add_argument("--out", required=True, type=Path)
    c.add_argument("--state", type=Path, default=Path("state"))
    c.add_argument("--hours", type=int, default=36)
    c.add_argument("--per-section", type=int, default=6)
    m = sub.add_parser("mark-seen", help="record the stories a published brief used")
    m.add_argument("--items", required=True, type=Path)
    m.add_argument("--state", type=Path, default=Path("state"))
    m.add_argument("--used", help="the ids the brief used, comma-separated, or a .json file with a list; "
                                  "default: every candidate")
    sub.add_parser("selftest", help="offline fixtures")
    args = ap.parse_args(argv)
    if args.cmd == "selftest":
        return selftest()
    if args.cmd == "mark-seen":
        used = None
        if args.used:
            p = Path(args.used)
            used = set(json.loads(p.read_text(encoding="utf-8"))) if p.suffix == ".json" and p.is_file() \
                else {x.strip() for x in args.used.split(",") if x.strip()}
        n = mark_seen(args.items, args.state, dt.date.today(), used)
        print(f"marked {n} stories as used; they will not be offered again for {SEEN_DAYS} days")
        return 0
    cfg = load_config(args.config)
    now = dt.datetime.now().astimezone()
    result = collect(cfg, load_seen(args.state), now, max(6, min(args.hours, 96)), max(1, min(args.per_section, 12)))
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "items.json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    (args.out / "items.md").write_text(to_markdown(result), encoding="utf-8")
    total = sum(len(s["items"]) for s in result["sections"])
    print(f"{total} new stories in {len(result['sections'])} sections -> {args.out / 'items.md'}")
    for e in result["errors"]:
        print(f"problem: {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
