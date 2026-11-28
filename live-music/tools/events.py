#!/usr/bin/env python3
"""Live Music: this week's shows from the venues a person follows, as one page.

Deterministic on purpose. It reads each venue's own calendar page, keeps the
events the page itself publishes in a machine-readable form (schema.org Event
data inside the page, or an .ics calendar), cuts them to the week, and renders
a plain static page where every show links back to the venue's own listing.
It never guesses a date, a time or a price. A venue whose page publishes no
such data is listed in needs-reading.json; the assistant reads that page and
adds what it finds to manual.json, each show with the link it came from.

  python3 events.py collect --venues venues.json --out week [--days 7] [--start YYYY-MM-DD] [--tz Area/City]
  python3 events.py page --week week --out site --city "Portland" [--picks week/picks.json]
  python3 events.py selftest        # offline fixtures, no network

venues.json is a list of {"venue": ..., "url": ...} (other keys are kept), or
the rows of a Ledger table with "Venue" and "Calendar URL" columns. Runs on the
person's Mac with the standard library only; nothing here calls a model.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

UA = "mChatAI-LiveMusic/1 (+https://mchatai.com)"
MAX_BYTES = 3_000_000
TIMEOUT = 20
MAX_PICKS = 5
EVENT_TYPES = re.compile(r"(^|[:/])(\w*Event|Festival)$")
STARTER_LINK = "com.sevenhillsstudio.mchatai://workbench/assistant?id=live-music&draft=" + urllib.parse.quote(
    "Set me up. Ask me which city I'm in and what music I like, suggest venues near me, "
    "then make this week's page of shows.")
MAKE_YOUR_OWN = "https://mchatai.com/open/?to=" + urllib.parse.quote(STARTER_LINK, safe="")


# ---------------------------------------------------------------- time

def zone(name: str | None):
    if not name:
        return dt.datetime.now().astimezone().tzinfo
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(name)
    except Exception:
        raise SystemExit(f"events: unknown time zone {name!r} (use a name like America/Chicago)")


def parse_when(value, tz) -> tuple[dt.date | None, str]:
    """An ISO 8601 or iCalendar date/time -> (local date, "HH:MM" or "")."""
    if not isinstance(value, str) or not value.strip():
        return None, ""
    s = value.strip()
    ics = re.fullmatch(r"(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?", s)
    if ics:
        y, m, d, hh, mm, _ss, z = ics.groups()
        if hh is None:
            return dt.date(int(y), int(m), int(d)), ""
        t = dt.datetime(int(y), int(m), int(d), int(hh), int(mm))
        if z:
            t = t.replace(tzinfo=dt.timezone.utc).astimezone(tz)
        return t.date(), t.strftime("%H:%M")
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        try:
            return dt.date.fromisoformat(s), ""
        except ValueError:
            return None, ""
    s = s.replace("Z", "+00:00")
    s = re.sub(r"([+-]\d{2})(\d{2})$", r"\1:\2", s)       # +0500 -> +05:00
    try:
        t = dt.datetime.fromisoformat(s)
    except ValueError:
        return None, ""
    if t.tzinfo is not None:
        t = t.astimezone(tz)
    return t.date(), t.strftime("%H:%M")


# ---------------------------------------------------------------- extraction

def text(value) -> str:
    if isinstance(value, list):
        value = value[0] if value else ""
    if isinstance(value, dict):
        value = value.get("name") or ""
    return re.sub(r"\s+", " ", html.unescape(str(value))).strip()


def safe_url(value, base: str = "") -> str:
    if isinstance(value, list):
        value = value[0] if value else ""
    if isinstance(value, dict):
        value = value.get("url") or value.get("@id") or ""
    if not isinstance(value, str) or not value.strip():
        return ""
    u = urllib.parse.urljoin(base, value.strip())
    return u if urllib.parse.urlparse(u).scheme in ("http", "https") else ""


def walk(node):
    if isinstance(node, list):
        for item in node:
            yield from walk(item)
    elif isinstance(node, dict):
        yield node
        for key in ("@graph", "itemListElement", "item", "subEvent", "event", "events"):
            if key in node:
                yield from walk(node[key])


def is_event(node: dict) -> bool:
    types = node.get("@type")
    types = types if isinstance(types, list) else [types]
    return any(isinstance(t, str) and EVENT_TYPES.search(t) for t in types)


def jsonld_events(page: str, venue: dict, tz) -> list[dict]:
    out = []
    for block in re.findall(r"<script[^>]+application/ld\+json[^>]*>(.*?)</script>", page, re.S | re.I):
        try:
            data = json.loads(block.strip())
        except ValueError:
            continue
        for node in walk(data):
            if not is_event(node):
                continue
            status = text(node.get("eventStatus"))
            if re.search(r"Cancel|Postpon", status):
                continue
            day, at = parse_when(node.get("startDate"), tz)
            title = text(node.get("name"))
            if not day or not title:
                continue
            performers = node.get("performer") or []
            performers = performers if isinstance(performers, list) else [performers]
            offers = node.get("offers") or {}
            offers = offers[0] if isinstance(offers, list) and offers else offers
            price = ""
            if isinstance(offers, dict):
                low, high = offers.get("lowPrice") or offers.get("price"), offers.get("highPrice")
                cur = offers.get("priceCurrency") or ""
                if low not in (None, ""):
                    price = f"{low}" + (f"–{high}" if high not in (None, "", low) else "") + (f" {cur}" if cur else "")
            out.append(event(venue, title, day, at,
                              safe_url(node.get("url"), venue["url"]) or safe_url(offers, venue["url"]) or venue["url"],
                              price=price, performers=[text(p) for p in performers if text(p)], method="page data"))
    return out


def unfold_ics(body: str) -> list[str]:
    lines: list[str] = []
    for raw in body.replace("\r\n", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return lines


def ics_value(s: str) -> str:
    return s.replace("\\n", " ").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\").strip()


def ics_events(body: str, venue: dict, tz) -> list[dict]:
    out, cur = [], None
    for line in unfold_ics(body):
        if line == "BEGIN:VEVENT":
            cur = {}
        elif line == "END:VEVENT" and cur is not None:
            if "CANCELLED" not in cur.get("STATUS", "").upper():
                # A UTC time (…Z) is shown in the city's zone; a TZID or floating time is the
                # venue's own wall clock and is shown as written.
                day, at = parse_when(cur.get("DTSTART", ""), tz)
                title = ics_value(cur.get("SUMMARY", ""))
                if day and title:
                    out.append(event(venue, title, day, at, safe_url(ics_value(cur.get("URL", "")), venue["url"])
                                     or venue["url"], method="calendar file"))
            cur = None
        elif cur is not None and ":" in line:
            key, value = line.split(":", 1)
            cur[key.partition(";")[0].upper()] = value
    return out


def event(venue: dict, title: str, day: dt.date, at: str, url: str, price: str = "",
          performers: list[str] | None = None, method: str = "") -> dict:
    key = f"{venue['venue']}|{day.isoformat()}|{at}|{title.lower()}"
    return {"id": hashlib.sha1(key.encode()).hexdigest()[:10], "venue": venue["venue"], "title": title,
            "date": day.isoformat(), "time": at, "url": url, "price": price,
            "performers": performers or [], "neighborhood": venue.get("neighborhood", ""), "method": method}


def calendar_links(page: str, base: str) -> list[str]:
    hrefs = re.findall(r"""href=["']([^"']+)["']""", page, re.I)
    found = []
    for h in hrefs:
        h = html.unescape(h)
        if h.lower().startswith("webcal://"):
            h = "https://" + h[len("webcal://"):]
        if re.search(r"\.ics(\?|$)|[?&](ical|ics)=|/ical/?$", h, re.I):
            u = safe_url(h, base)
            if u and u not in found:
                found.append(u)
    return found[:2]


def fetch(url: str) -> tuple[str, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,text/calendar,*/*"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        body = r.read(MAX_BYTES + 1)[:MAX_BYTES]
        ctype = r.headers.get("Content-Type", "")
    charset = re.search(r"charset=([\w-]+)", ctype)
    return body.decode(charset.group(1) if charset else "utf-8", "replace"), ctype


def page_text(page: str, base: str) -> str:
    """Visible text with every link kept as `text (url)`: what the assistant reads, and what
    a show it adds by hand is checked against."""
    s = re.sub(r"(?is)<(script|style|noscript|svg|template)\b.*?</\1>", " ", page)
    s = re.sub(r"(?is)<!--.*?-->", " ", s)

    def link(m):
        u = safe_url(html.unescape(m.group(1)), base)
        inner = re.sub(r"(?s)<[^>]+>", " ", m.group(2))
        return f" {inner} ({u}) " if u else f" {inner} "
    s = re.sub(r"""(?is)<a\b[^>]*?href=["']([^"']+)["'][^>]*>(.*?)</a>""", link, s)
    s = re.sub(r"(?i)<(br|/p|/div|/li|/h\d|/tr|/article|/section)\b[^>]*>", "\n", s)
    s = re.sub(r"(?s)<[^>]+>", " ", s)
    s = html.unescape(s)
    lines = [re.sub(r"[ \t ]+", " ", ln).strip() for ln in s.split("\n")]
    return "\n".join(ln for ln in lines if ln)[:200_000]


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60] or "venue"


def read_venue(venue: dict, tz, fetcher=fetch) -> tuple[list[dict], dict, str]:
    status = {"venue": venue["venue"], "url": venue["url"], "events": 0, "how": "", "problem": ""}
    try:
        body, ctype = fetcher(venue["url"])
    except Exception as e:  # noqa: BLE001 — every failure is reported, none is fatal
        status["problem"] = f"could not open the page ({type(e).__name__}: {e})"[:240]
        return [], status, ""
    if "calendar" in ctype or body.lstrip().startswith("BEGIN:VCALENDAR"):
        found = ics_events(body, venue, tz)
        status["how"] = "calendar file"
    else:
        found = jsonld_events(body, venue, tz)
        status["how"] = "page data"
        if not found:
            for link in calendar_links(body, venue["url"]):
                try:
                    cal, _ = fetcher(link)
                except Exception:  # noqa: BLE001
                    continue
                found = ics_events(cal, venue, tz)
                if found:
                    status["how"] = "calendar file"
                    break
    status["events"] = len(found)
    snapshot = ""
    if not found:
        status["problem"] = "the page publishes no event data; read its snapshot and add its shows to manual.json"
        snapshot = page_text(body, venue["url"]) if "calendar" not in ctype else ""
    return found, status, snapshot


# ---------------------------------------------------------------- collect

def load_venues(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("rows") or data.get("venues") or []
    venues = []
    for row in data:
        if not isinstance(row, dict):
            continue
        low = {str(k).strip().lower(): v for k, v in row.items()}
        name = text(low.get("venue") or low.get("name") or low.get("key") or "")
        url = safe_url(low.get("calendar url") or low.get("url") or low.get("calendar") or "")
        if name and url:
            venues.append({"venue": name, "url": url, "neighborhood": text(low.get("neighborhood") or "")})
    return venues


def window(start: str | None, days: int) -> tuple[dt.date, dt.date]:
    first = dt.date.fromisoformat(start) if start else dt.date.today()
    return first, first + dt.timedelta(days=max(1, min(days, 31)))


def collect(venues: list[dict], first: dt.date, end: dt.date, tz, fetcher=fetch) -> tuple[dict, dict]:
    """-> (week, snapshots): snapshots maps pages/<slug>.md to the text of each venue page
    that published no event data."""
    events, report, snapshots = {}, [], {}
    for v in venues:
        found, status, snapshot = read_venue(v, tz, fetcher)
        kept = [e for e in found if first <= dt.date.fromisoformat(e["date"]) < end]
        status["thisWeek"] = len(kept)
        if snapshot:
            status["snapshot"] = f"pages/{slug(v['venue'])}.md"
            snapshots[status["snapshot"]] = f"# {v['venue']}\n<{v['url']}>\n\n{snapshot}\n"
        report.append(status)
        for e in kept:
            events.setdefault(e["id"], e)
    ordered = sorted(events.values(), key=lambda e: (e["date"], e["time"] or "99", e["venue"], e["title"]))
    return ({"generated": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
             "window": {"start": first.isoformat(), "end": (end - dt.timedelta(days=1)).isoformat()},
             "events": ordered, "venues": report}, snapshots)


def words(s: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", s.lower())


def on_page(title: str, url: str, venue_url: str, snapshot: str) -> str:
    """'' when a hand-added show is backed by the saved page, else why not.

    The title must be on the page as written (letters and digits compared, case and
    punctuation ignored, line breaks allowed), or every word of it must be on one line;
    words scattered over a busy page do not count (an invented "Made Up Band" passed a
    whole-page word check on a real venue, 2026-11-27). The link must be on the page, or
    be the venue's calendar page itself when a show has no link of its own.
    """
    need = words(title)
    if not need:
        return "it has no title"
    lines = [words(ln) for ln in snapshot.split("\n")]
    flat = " ".join(w for ln in lines for w in ln)
    found = f" {' '.join(need)} " in f" {flat} " or any(set(need) <= set(ln) for ln in lines)
    if not found:
        return "its title is not on the venue's saved page"
    if url not in snapshot and url.rstrip("/") != venue_url.rstrip("/"):
        return "its link is not on the venue's saved page"
    return ""


# ---------------------------------------------------------------- page

def snapshots_in(week_dir: Path):
    """venue name -> (calendar url, saved page text), read from week/pages/<slug>.md."""
    def lookup(venue: str):
        p = week_dir / "pages" / f"{slug(venue)}.md"
        if not p.is_file():
            return None
        body = p.read_text(encoding="utf-8", errors="replace")
        m = re.search(r"^<(https?://[^>]+)>", body, re.M)
        return (m.group(1) if m else ""), body
    return lookup


def merge(week: dict, manual: list, picks: list, snapshot_for=lambda venue: None
          ) -> tuple[list[dict], list[dict], list[str]]:
    first = dt.date.fromisoformat(week["window"]["start"])
    last = dt.date.fromisoformat(week["window"]["end"])
    events = {e["id"]: e for e in week.get("events", [])}
    dropped = []
    for i, m in enumerate(manual or []):
        if not isinstance(m, dict):
            continue
        url, title = safe_url(m.get("url")), text(m.get("title"))
        venue = text(m.get("venue"))
        try:
            day = dt.date.fromisoformat(str(m.get("date", "")))
        except ValueError:
            day = None
        at = str(m.get("time") or "")
        if not re.fullmatch(r"(\d{2}:\d{2})?", at):
            at = ""
        if not (url and title and venue and day):
            dropped.append(f"manual #{i + 1}: needs venue, title, date (yyyy-mm-dd) and the url it came from")
            continue
        if not first <= day <= last:
            dropped.append(f"manual #{i + 1} ({title}): {day} is outside this week")
            continue
        saved = snapshot_for(venue)
        if saved is None:
            dropped.append(f"manual #{i + 1} ({title}): no saved page for {venue} "
                           f"(pages/{slug(venue)}.md); a show is added only from a page you read")
            continue
        why = on_page(title, url, saved[0], saved[1])
        if why:
            dropped.append(f"manual #{i + 1} ({title}): {why}")
            continue
        e = event({"venue": venue, "url": url}, title, day, at, url, price=text(m.get("price") or ""),
                  method="read by the assistant")
        events.setdefault(e["id"], e)
    chosen = []
    for p in (picks or [])[: MAX_PICKS * 2]:
        pid = p.get("id") if isinstance(p, dict) else None
        if pid in events and len(chosen) < MAX_PICKS and all(c["id"] != pid for c in chosen):
            chosen.append({"id": pid, "why": text(p.get("why"))[:160]})
        elif pid:
            dropped.append(f"pick {pid}: no such show this week")
    ordered = sorted(events.values(), key=lambda e: (e["date"], e["time"] or "99", e["venue"], e["title"]))
    return ordered, chosen, dropped


def nice_day(iso: str) -> str:
    d = dt.date.fromisoformat(iso)
    return f"{d:%A}, {d:%B} {d.day}"


def nice_time(at: str) -> str:
    if not at:
        return "Time on the venue's page"
    h, m = (int(x) for x in at.split(":"))
    return f"{(h % 12) or 12}:{m:02d} {'pm' if h >= 12 else 'am'}"


CSS = """
:root{color-scheme:light dark;--bg:#fbfaf7;--fg:#1d1d1f;--muted:#5f6368;--line:#e3e0d8;--accent:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#f2f2f2;--muted:#a8a8a8;--line:#2c2c2c;--accent:#ff8a80}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:28px 18px 48px}h1{font-size:1.9rem;line-height:1.2;margin:0 0 6px}
.lede{color:var(--muted);margin:0 0 24px}h2{font-size:1.05rem;margin:28px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--line)}
ul{list-style:none;margin:0;padding:0}li{display:grid;grid-template-columns:6.5rem 1fr;gap:4px 12px;padding:10px 0;border-bottom:1px solid var(--line)}
.t{color:var(--muted);font-variant-numeric:tabular-nums}.n a{color:var(--fg);font-weight:600;text-decoration:none}.n a:hover{text-decoration:underline}
.v{grid-column:2;color:var(--muted);font-size:.92rem}.why{grid-column:2;font-size:.92rem}.picks li{grid-template-columns:1fr}.picks .v,.picks .why{grid-column:1}
footer{margin-top:36px;color:var(--muted);font-size:.9rem}footer a{color:var(--accent)}
@media (max-width:480px){li{grid-template-columns:1fr}.v,.why{grid-column:1}}
"""


def render(city: str, week: dict, events: list[dict], picks: list[dict], title: str | None) -> str:
    first, last = week["window"]["start"], week["window"]["end"]
    span = f"{nice_day(first).split(', ')[1]} to {nice_day(last).split(', ')[1]}"
    heading = title or f"Live music in {city}"
    venues = sorted({e["venue"] for e in events})
    esc = html.escape
    parts = [f"<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
             "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
             f"<title>{esc(heading)}: {esc(span)}</title>",
             f"<meta name=\"description\" content=\"{len(events)} shows at {len(venues)} venues in {esc(city)}, {esc(span)}.\">",
             f"<style>{CSS}</style></head><body><main>",
             f"<h1>{esc(heading)}</h1>",
             f"<p class=\"lede\">{len(events)} shows at {len(venues)} venues, {esc(span)}. Every listing links to the "
             "venue's own page. Times and prices change, so check there before you go.</p>"]
    by_id = {e["id"]: e for e in events}
    if picks:
        parts.append("<h2>Picks this week</h2><ul class=\"picks\">")
        for p in picks:
            e = by_id[p["id"]]
            parts.append(f"<li><span class=\"n\"><a href=\"{esc(e['url'])}\">{esc(e['title'])}</a></span>"
                         f"<span class=\"v\">{esc(nice_day(e['date']))} · {esc(nice_time(e['time']))} · {esc(e['venue'])}</span>"
                         + (f"<span class=\"why\">{esc(p['why'])}</span>" if p["why"] else "") + "</li>")
        parts.append("</ul>")
    if not events:
        parts.append("<p>No shows found for this week yet.</p>")
    day = None
    for e in events:
        if e["date"] != day:
            if day is not None:
                parts.append("</ul>")
            day = e["date"]
            parts.append(f"<h2>{esc(nice_day(day))}</h2><ul>")
        extra = " · ".join(x for x in [e["venue"], e.get("neighborhood", ""), e.get("price", "")] if x)
        parts.append(f"<li><span class=\"t\">{esc(nice_time(e['time']))}</span>"
                     f"<span class=\"n\"><a href=\"{esc(e['url'])}\">{esc(e['title'])}</a></span>"
                     f"<span class=\"v\">{esc(extra)}</span></li>")
    if day is not None:
        parts.append("</ul>")
    today = dt.date.today()
    parts.append(f"<footer><p>Updated {today:%B} {today.day}, {today.year} from the venues' own calendars.</p>"
                 f"<p>Made with mChatAI+. <a href=\"{esc(MAKE_YOUR_OWN)}\">Make your own page for your city</a>.</p>"
                 "</footer></main></body></html>")
    return "\n".join(parts) + "\n"


def summary_md(city: str, week: dict, events: list[dict], picks: list[dict]) -> str:
    lines = [f"# Live music in {city}: {nice_day(week['window']['start'])} to {nice_day(week['window']['end'])}", ""]
    by_id = {e["id"]: e for e in events}
    if picks:
        lines += ["## Picks", ""]
        lines += [f"- [{by_id[p['id']]['title']}]({by_id[p['id']]['url']}), {by_id[p['id']]['venue']}, "
                  f"{nice_day(by_id[p['id']]['date'])}" + (f": {p['why']}" if p["why"] else "") for p in picks]
        lines.append("")
    day = None
    for e in events:
        if e["date"] != day:
            day = e["date"]
            lines += ["", f"## {nice_day(day)}", ""]
        lines.append(f"- {nice_time(e['time'])}: [{e['title']}]({e['url']}), {e['venue']}"
                     + (f", {e['price']}" if e.get("price") else ""))
    return "\n".join(lines).strip() + "\n"


def read_json(path: Path, default):
    if not path.is_file():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


# ---------------------------------------------------------------- selftest

FIXTURE_HTML = """<html><head><script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"MusicEvent","name":"The Low Notes <live>","startDate":"2030-03-05T20:00:00-08:00",
  "url":"/shows/low-notes","performer":[{"@type":"MusicGroup","name":"The Low Notes"}],
  "offers":{"@type":"Offer","lowPrice":"15","highPrice":"20","priceCurrency":"USD"}},
 {"@type":"Event","name":"Cancelled Night","startDate":"2030-03-06T20:00:00-08:00",
  "eventStatus":"https://schema.org/EventCancelled"},
 {"@type":"Event","name":"Far Future","startDate":"2030-04-30"},
 {"@type":"Organization","name":"Not an event"}]}
</script></head><body>shows</body></html>"""

FIXTURE_ICS = "\r\n".join([
    "BEGIN:VCALENDAR", "BEGIN:VEVENT", "SUMMARY:Jazz Brunch\\, Trio", "DTSTART;VALUE=DATE:20300307",
    "URL:https://example.org/brunch", "END:VEVENT", "BEGIN:VEVENT", "SUMMARY:Late Set",
    "DTSTART;TZID=America/Denver:20300308T223000", "END:VEVENT", "BEGIN:VEVENT", "SUMMARY:Called off",
    "STATUS:CANCELLED", "DTSTART:20300308T190000Z", "END:VEVENT", "END:VCALENDAR", ""])

FIXTURE_LINKER = '<html><body><a href="webcal://example.net/cal/feed.ics">Add to calendar</a></body></html>'

FIXTURE_PLAIN = """<html><head><style>.x{}</style><script>var shows=[]</script></head><body>
<div class="event"><a href="/shows/open-mic">Open Mic Night</a> Wed Mar 6, 7pm</div>
<div class="event"><a href="https://tickets.example/e/99">Sam &amp; the Sparks</a> Thu Mar 7, 9pm</div>
</body></html>"""


def selftest() -> int:
    fails, ran = [], []

    def check(name, ok):
        ran.append(name)
        if not ok:
            fails.append(name)

    tz = zone("America/Los_Angeles")
    pages = {"https://club.example.com/calendar": (FIXTURE_HTML, "text/html"),
             "https://hall.example.org/events.ics": (FIXTURE_ICS, "text/calendar"),
             "https://bar.example.net/": (FIXTURE_LINKER, "text/html"),
             "https://example.net/cal/feed.ics": (FIXTURE_ICS, "text/calendar"),
             "https://pub.example/events": (FIXTURE_PLAIN, "text/html; charset=utf-8")}

    def fake(url):
        if url not in pages:
            raise OSError("offline fixture")
        return pages[url]

    venues = load_venues_from([{"Venue": "The Club", "Calendar URL": "https://club.example.com/calendar"},
                               {"venue": "Hall", "url": "https://hall.example.org/events.ics"},
                               {"venue": "Linked Bar", "url": "https://bar.example.net/"},
                               {"venue": "Gone", "url": "https://gone.example/"},
                               {"venue": "Corner Pub", "url": "https://pub.example/events"},
                               {"venue": "No URL"}, {"venue": "Bad", "url": "javascript:alert(1)"}])
    check("venues: rows with a name and an http(s) url only", [v["venue"] for v in venues]
          == ["The Club", "Hall", "Linked Bar", "Gone", "Corner Pub"])
    first, end = window("2030-03-04", 7)
    week, snapshots = collect(venues, first, end, tz, fake)
    snap = snapshots.get("pages/corner-pub.md", "")
    check("snapshot: plain page saved as text with its links, no script or style",
          "Open Mic Night (https://pub.example/shows/open-mic)" in snap and "Sam & the Sparks" in snap
          and "var shows" not in snap and ".x{}" not in snap)
    titles = [e["title"] for e in week["events"]]
    check("page data: MusicEvent kept, cancelled and out-of-week dropped",
          "The Low Notes <live>" in titles and "Cancelled Night" not in titles and "Far Future" not in titles)
    low = next(e for e in week["events"] if e["title"].startswith("The Low Notes"))
    check("page data: local time, absolute url, price range",
          low["time"] == "20:00" and low["url"] == "https://club.example.com/shows/low-notes" and low["price"] == "15–20 USD")
    check("calendar file: escaped comma, all-day, TZID wall clock, cancelled dropped",
          "Jazz Brunch, Trio" in titles and "Called off" not in titles
          and any(e["title"] == "Late Set" and e["time"] == "22:30" for e in week["events"]))
    check("calendar link found on a page with no event data",
          next(v for v in week["venues"] if v["venue"] == "Linked Bar")["how"] == "calendar file")
    gone = next(v for v in week["venues"] if v["venue"] == "Gone")
    check("an unreachable venue is reported, not fatal", gone["events"] == 0 and "could not open" in gone["problem"])
    check("no duplicate ids", len({e["id"] for e in week["events"]}) == len(week["events"]))

    manual = [{"venue": "Corner Pub", "title": "Open Mic Night", "date": "2030-03-06", "time": "19:00",
               "url": "https://pub.example/shows/open-mic"},
              {"venue": "Corner Pub", "title": "Sam & the Sparks", "date": "2030-03-07", "time": "21:00",
               "url": "https://tickets.example/e/99"},
              {"venue": "Corner Pub", "title": "No link", "date": "2030-03-06"},
              {"venue": "Corner Pub", "title": "Next month", "date": "2030-04-06", "url": "https://pub.example/x"},
              {"venue": "Corner Pub", "title": "Ghost Orchestra", "date": "2030-03-08", "url": "https://pub.example/g"},
              {"venue": "Corner Pub", "title": "Sam & the Sparks", "date": "2030-03-08",
               "url": "https://elsewhere.example/sam"},
              {"venue": "Corner Pub", "title": "Sam & the Sparks", "date": "2030-03-09",
               "url": "https://pub.example/made-up-link"},
              {"venue": "Corner Pub", "title": "Night Sparks", "date": "2030-03-09", "url": "https://pub.example/events"},
              {"venue": "Unknown Hall", "title": "Anything", "date": "2030-03-06", "url": "https://u.example/"}]
    picks = [{"id": low["id"], "why": "You said you like soul."}, {"id": "nope", "why": "invented"}]
    lookup = {"Corner Pub": ("https://pub.example/events", snap)}
    events, chosen, dropped = merge(week, manual, picks, lambda v: lookup.get(v))
    kept = {e["title"] for e in events}
    check("manual: shows on the saved page kept (same host, or a link on the page)",
          {"Open Mic Night", "Sam & the Sparks"} <= kept)
    check("manual: unlinked, out-of-week, invented title, off-page or made-up link, words from two shows, "
          "unsaved venue all left out",
          not kept & {"No link", "Next month", "Ghost Orchestra", "Anything", "Night Sparks"}
          and sum(e["title"] == "Sam & the Sparks" for e in events) == 1 and len(dropped) == 8)
    check("picks: only shows that exist", [c["id"] for c in chosen] == [low["id"]])
    page = render("Testville", week, events, chosen, None)
    check("page: text escaped, no script", "&lt;live&gt;" in page and "<script" not in page.lower())
    check("page: every show links out", page.count('class="n"><a href="https://') == len(events) + len(chosen))
    check("page: make-your-own link", "mchatai.com/open/?to=com.sevenhillsstudio.mchatai%3A%2F%2Fworkbench%2Fassistant"
          "%3Fid%3Dlive-music" in page)
    md = summary_md("Testville", week, events, chosen)
    check("summary: markdown links", "[Open Mic Night](https://pub.example/shows/open-mic)" in md)
    print(f"selftest: {len(ran) - len(fails)}/{len(ran)} passed" + (f"; FAILED: {fails}" if fails else ""))
    return 1 if fails else 0


def load_venues_from(rows: list) -> list[dict]:
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "venues.json"
        p.write_text(json.dumps(rows))
        return load_venues(p)


# ---------------------------------------------------------------- main

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("collect", help="read every venue's calendar and keep this week's shows")
    c.add_argument("--venues", required=True, type=Path)
    c.add_argument("--out", required=True, type=Path)
    c.add_argument("--days", type=int, default=7)
    c.add_argument("--start", help="first day, yyyy-mm-dd (default today)")
    c.add_argument("--tz", help="IANA time zone of the city (default this Mac's)")
    p = sub.add_parser("page", help="render the week as a static page and a markdown summary")
    p.add_argument("--week", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    p.add_argument("--city", required=True)
    p.add_argument("--title")
    p.add_argument("--picks", type=Path)
    sub.add_parser("selftest", help="offline fixtures")
    args = ap.parse_args(argv)

    if args.cmd == "selftest":
        return selftest()
    if args.cmd == "collect":
        venues = load_venues(args.venues)
        if not venues:
            raise SystemExit("events: no venue has both a name and an http(s) calendar url")
        first, end = window(args.start, args.days)
        week, snapshots = collect(venues, first, end, zone(args.tz))
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "events.json").write_text(json.dumps(week, indent=2, ensure_ascii=False), encoding="utf-8")
        for rel, body in snapshots.items():
            (args.out / rel).parent.mkdir(parents=True, exist_ok=True)
            (args.out / rel).write_text(body, encoding="utf-8")
        needs = [v for v in week["venues"] if v["problem"]]
        (args.out / "needs-reading.json").write_text(json.dumps(needs, indent=2, ensure_ascii=False), encoding="utf-8")
        for v in week["venues"]:
            print(f"{v['venue']}: {v['thisWeek']} this week" + (f" ({v['how']})" if v["how"] and v["events"] else "")
                  + (f" — {v['problem']}" if v["problem"] else ""))
        print(f"{len(week['events'])} shows, {week['window']['start']} to {week['window']['end']}; "
              f"{len(needs)} venue(s) to read by hand -> {args.out / 'needs-reading.json'}")
        return 0
    week = read_json(args.week / "events.json", None)
    if not week:
        raise SystemExit(f"events: {args.week / 'events.json'} not found; run collect first")
    manual = read_json(args.week / "manual.json", [])
    picks = read_json(args.picks, []) if args.picks else read_json(args.week / "picks.json", [])
    events, chosen, dropped = merge(week, manual, picks, snapshots_in(args.week))
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "index.html").write_text(render(args.city, week, events, chosen, args.title), encoding="utf-8")
    (args.week / "summary.md").write_text(summary_md(args.city, week, events, chosen), encoding="utf-8")
    # Every show on the page with its id, hand-added ones included: what picks.json names.
    (args.week / "merged.json").write_text(json.dumps(events, indent=2, ensure_ascii=False), encoding="utf-8")
    for d in dropped:
        print(f"left out: {d}")
    print(f"page: {args.out / 'index.html'} ({len(events)} shows, {len(chosen)} picks); "
          f"summary: {args.week / 'summary.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
