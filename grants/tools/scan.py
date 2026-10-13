#!/usr/bin/env python3
"""Grants & Contracts scanner: what is new or changed since the last run.

Reads the public source catalog (../sources.json) and the person's PRIVATE
profile (grants-profile.json, found by walking up from the working folder; it
never lives in mchatai-source). Queries the free official feeds (Grants.gov
search2, the Federal Register, SAM.gov when a key is set) and watches funder
pages for changes. Writes runs/<yyyy-MM-dd>.json/.md/.html and keeps its
seen-ledger in ./state, both relative to the folder it is run from.

Deterministic on purpose: it decides what is NEW (seen-ledger), what CHANGED
(deadline or page text) and what is EXCLUDED (the profile's conflict rules).
It does not judge fit; the assistant does that from the report, and every
deadline it shows comes from the official feed or the funder's own page.

  python3 scan.py                 # full scan
  python3 scan.py --offline       # no network: writes a report from state only
  python3 scan.py --only grantsgov,pages
  python3 scan.py --selftest      # fixtures, no network
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import json
import os
import re
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCES = HERE.parent / "sources.json"
PROFILE_NAME = "grants-profile.json"
UA = "mChatAI-GrantsScanner/1 (+https://mchatai.com)"
MAX_ADDED_LINES = 25
MAX_NEW_LISTED = 60
STALE_FORECAST_DAYS = 730
FAR_FUTURE_YEARS = 4          # recurring 5-year notices and 2076-style dates = standing programs


# ---------------------------------------------------------------- utilities

def today() -> dt.date:
    return dt.date.today()


def find_profile(start: Path) -> Path | None:
    p = start.resolve()
    for _ in range(5):
        cand = p / PROFILE_NAME
        if cand.is_file():
            return cand
        if p.parent == p:
            break
        p = p.parent
    return None


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def http(url: str, body: dict | None = None, timeout: int = 30) -> bytes:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers={
        "User-Agent": UA,
        "Accept": "application/json, text/html;q=0.9, */*;q=0.5",
        **({"Content-Type": "application/json"} if data else {}),
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def parse_mdy(s: str) -> dt.date | None:
    """Grants.gov dates are MM/dd/yyyy; SAM.gov deadlines are ISO."""
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(s[:10], fmt).date()
        except ValueError:
            pass
    return None


def page_lines(raw: str) -> list[str]:
    """Visible text of an HTML page, one normalised line per block."""
    raw = re.sub(r"(?is)<(script|style|noscript|svg|template)\b.*?</\1>", " ", raw)
    raw = re.sub(r"(?is)<!--.*?-->", " ", raw)
    raw = re.sub(r"(?i)<(br|/p|/div|/li|/h\d|/tr|/td|/th|/a|/section|/article)\b[^>]*>", "\n", raw)
    raw = re.sub(r"(?s)<[^>]+>", " ", raw)
    text = html.unescape(raw)
    out, seen = [], set()
    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if len(line) < 4 or line in seen:
            continue
        seen.add(line)
        out.append(line)
    return out


def excluded_by(text: str, rules: dict) -> str | None:
    """The first conflict rule `text` trips, or None. Case-insensitive."""
    low = (text or "").lower()
    for f in rules.get("funders", []):
        if f and f.lower() in low:
            return f"funder: {f}"
    for t in rules.get("terms", []):
        if t and t.lower() in low:
            return f"term: {t}"
    return None


def agency_skipped(code: str, prefixes: list[str]) -> bool:
    return any(code.upper().startswith(p.upper()) for p in prefixes if p)


DATE_RX = re.compile(
    r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2},? \d{4}\b"
    r"|\b\d{1,2}/\d{1,2}/\d{4}\b|\b20\d\d-\d\d-\d\d\b", re.I)


# ---------------------------------------------------------------- feeds

def grantsgov(cfg: dict, profile: dict, errors: list) -> list[dict]:
    queries = list(cfg.get("agencyQueries", []))
    for kw in profile.get("keywords", [])[: cfg.get("maxKeywordQueries", 12)]:
        queries.append({"keyword": kw})
    skip = cfg.get("skipAgencyPrefixes", []) + profile.get("exclude", {}).get("agencyPrefixes", [])
    # Grants.gov matches keywords anywhere in the full text, so one word like
    # "interpretation" returns ~170 NIH research grants. By default a keyword
    # hit counts only when the keyword is in the title; agency-wide queries
    # with no keyword (the cultural agencies, where the vendor leads are) keep
    # everything.
    title_only = profile.get("keywordMatch", "title") == "title"
    items: dict[str, dict] = {}
    for q in queries:
        body = {"oppStatuses": "forecasted|posted", "rows": cfg.get("rows", 100), **q}
        try:
            data = json.loads(http(cfg["url"], body))["data"]
        except Exception as e:  # noqa: BLE001 — one bad query must not end the scan
            errors.append(f"Grants.gov {q}: {e}")
            continue
        for h in data.get("oppHits", []):
            if agency_skipped(h.get("agencyCode", ""), skip):
                continue
            title = html.unescape(h.get("title", ""))
            if title_only and q.get("keyword") and q["keyword"].lower() not in title.lower():
                continue
            key = f"grants.gov:{h.get('number') or h.get('id')}"
            if key in items:
                items[key]["matched"].append(q.get("keyword") or q.get("agencies"))
                continue
            items[key] = {
                "key": key, "source": "Grants.gov", "type": h.get("docType", ""),
                "title": title, "funder": h.get("agency", ""),
                "agencyCode": h.get("agencyCode", ""),
                "opens": h.get("openDate", ""), "closes": h.get("closeDate", ""),
                "status": h.get("oppStatus", ""),
                "url": f"https://www.grants.gov/search-results-detail/{h.get('id')}",
                "evidence": f"Grants.gov search2, read {today().isoformat()}: "
                            f"status {h.get('oppStatus')}, closes {h.get('closeDate') or 'not stated'}",
                "matched": [q.get("keyword") or q.get("agencies")],
            }
        time.sleep(0.5)
    return list(items.values())


def federal_register(cfg: dict, profile: dict, errors: list) -> list[dict]:
    since = (today() - dt.timedelta(days=cfg.get("lookbackDays", 120))).isoformat()
    out = []
    for q in cfg.get("queries", []):
        params = [("conditions[agencies][]", q["agency"]), ("conditions[type][]", "NOTICE"),
                  ("conditions[publication_date][gte]", since), ("order", "newest"),
                  ("per_page", "20")]
        if q.get("term"):
            params.append(("conditions[term]", q["term"]))
        for f in ("title", "html_url", "publication_date", "document_number", "agencies"):
            params.append(("fields[]", f))
        url = cfg["url"] + "?" + urllib.parse.urlencode(params)
        try:
            results = json.loads(http(url)).get("results", [])
        except Exception as e:  # noqa: BLE001
            errors.append(f"Federal Register {q['agency']}: {e}")
            continue
        for r in results:
            out.append({
                "key": f"fr:{r['document_number']}", "source": "Federal Register", "type": "notice",
                "title": r.get("title", ""),
                "funder": ", ".join(a.get("name", "") for a in r.get("agencies", []) if a.get("name")),
                "opens": r.get("publication_date", ""), "closes": "", "status": "published",
                "url": r.get("html_url", ""),
                "evidence": f"Federal Register notice {r['document_number']}, published {r.get('publication_date')}",
                "matched": [q.get("term") or q["agency"]],
            })
        time.sleep(0.5)
    return out


def sam_gov(cfg: dict, profile: dict, errors: list) -> list[dict]:
    key = os.environ.get(cfg.get("keyEnv", "SAM_API_KEY"), "")
    if not key:
        return []
    fmt = "%m/%d/%Y"
    frm = (today() - dt.timedelta(days=cfg.get("lookbackDays", 30))).strftime(fmt)
    out: dict[str, dict] = {}
    terms = profile.get("contractKeywords") or profile.get("keywords", [])
    for kw in terms[: cfg.get("maxKeywordQueries", 8)]:
        params = {"api_key": key, "postedFrom": frm, "postedTo": today().strftime(fmt),
                  "title": kw, "limit": "100"}
        try:
            data = json.loads(http(cfg["url"] + "?" + urllib.parse.urlencode(params)))
        except Exception as e:  # noqa: BLE001
            errors.append(f"SAM.gov '{kw}': {e}")
            continue
        for o in data.get("opportunitiesData", []) or []:
            k = f"sam:{o.get('noticeId')}"
            out.setdefault(k, {
                "key": k, "source": "SAM.gov", "type": o.get("type", ""),
                "title": o.get("title", ""), "funder": o.get("fullParentPathName", ""),
                "opens": o.get("postedDate", ""), "closes": (o.get("responseDeadLine") or "")[:10],
                "status": "active" if o.get("active") == "Yes" else (o.get("active") or ""),
                "url": o.get("uiLink", ""),
                "evidence": f"SAM.gov opportunities API, read {today().isoformat()}: "
                            f"set-aside {o.get('typeOfSetAsideDescription') or 'none'}",
                "matched": [kw],
            })
        time.sleep(1.0)
    return list(out.values())


def keep_item(it: dict) -> bool:
    """Drop closed items and years-old forecasts with no date."""
    closes = parse_mdy(it.get("closes", ""))
    if closes and closes < today():
        return False
    if not closes and it.get("type") in ("forecast",):
        opened = parse_mdy(it.get("opens", ""))
        if opened and (today() - opened).days > STALE_FORECAST_DAYS:
            return False
    return True


def standing(it: dict) -> bool:
    closes = parse_mdy(it.get("closes", ""))
    return bool(closes and closes.year >= today().year + FAR_FUTURE_YEARS)


# ---------------------------------------------------------------- pages

def watch_pages(pages: list[dict], profile: dict, state_dir: Path, errors: list,
                fetch=None) -> tuple[list[dict], list[dict], list[dict]]:
    """Returns (changed, baselined, skipped). `fetch` is injectable for the selftest."""
    fetch = fetch or (lambda url: http(url).decode("utf-8", "replace"))
    rules = profile.get("exclude", {})
    kws = [k.lower() for k in profile.get("keywords", [])]
    pdir = state_dir / "pages"
    pdir.mkdir(parents=True, exist_ok=True)
    changed, baselined, skipped = [], [], []
    for pg in pages:
        why = excluded_by(f"{pg.get('funder', '')} {pg.get('name', '')} {pg.get('url', '')}", rules)
        if why:
            skipped.append({**pg, "reason": why})
            continue
        try:
            lines = page_lines(fetch(pg["url"]))
        except Exception as e:  # noqa: BLE001
            errors.append(f"page {pg['id']}: {e}")
            continue
        digest = hashlib.sha256("\n".join(lines).encode()).hexdigest()
        sfile = pdir / f"{pg['id']}.json"
        prev = load_json(sfile, None)
        sfile.write_text(json.dumps({"hash": digest, "read": today().isoformat(),
                                     "url": pg["url"], "lines": lines[:3000]}))
        if prev is None:
            baselined.append(pg)
        elif prev.get("hash") != digest:
            old = set(prev.get("lines", []))
            added = [ln for ln in lines if ln not in old]
            notes = []
            for ln in added[:MAX_ADDED_LINES]:
                flag = []
                if DATE_RX.search(ln):
                    flag.append("date")
                if any(k in ln.lower() for k in kws):
                    flag.append("keyword")
                ex = excluded_by(ln, rules)
                if ex:
                    flag.append(f"EXCLUDED {ex}")
                notes.append({"line": ln[:300], "flags": flag})
            changed.append({**pg, "added": notes, "addedCount": len(added),
                            "removedCount": len(old - set(lines))})
        time.sleep(1.0)
    return changed, baselined, skipped


# ---------------------------------------------------------------- ledger + report

def apply_seen(items: list[dict], seen: dict, rules: dict) -> dict:
    new, changed, excluded, standing_items = [], [], [], []
    unchanged = 0
    for it in items:
        why = excluded_by(f"{it['title']} {it['funder']} {it['url']}", rules)
        if why:
            excluded.append({**it, "reason": why})
            continue
        prev = seen.get(it["key"])
        if prev is None:
            seen[it["key"]] = {"first": today().isoformat(), "closes": it.get("closes", ""),
                               "title": it["title"]}
            (standing_items if standing(it) else new).append(it)
        elif prev.get("closes", "") != it.get("closes", ""):
            changed.append({**it, "was": prev.get("closes", "")})
            prev["closes"] = it.get("closes", "")
        else:
            unchanged += 1
    by_close = lambda x: (parse_mdy(x.get("closes", "")) or dt.date.max)  # noqa: E731
    return {"new": sorted(new, key=by_close), "changed": sorted(changed, key=by_close),
            "standing": standing_items, "excluded": excluded, "unchanged": unchanged}


def render_md(r: dict) -> str:
    L = [f"# Grants & Contracts scan: {r['date']}", ""]
    c = r["counts"]
    L.append(f"{c['new']} new · {c['changed']} changed · {c['pagesChanged']} funder pages changed · "
             f"{c['excluded']} excluded by your rules · {c['unchanged']} already seen")
    soon = [i for i in r["new"] + r["changed"]
            if (d := parse_mdy(i.get("closes", ""))) and (d - today()).days <= 30]
    if soon:
        L += ["", "## Closing within 30 days", ""]
        L += [f"- **{i['closes']}** · [{i['title']}]({i['url']}) · {i['funder']}" for i in soon]
    if r["new"]:
        L += ["", "## New", ""]
        for i in r["new"][:MAX_NEW_LISTED]:
            L.append(f"- [{i['title']}]({i['url']}) · {i['funder']} · closes {i.get('closes') or 'not stated'}"
                     f" · {i['source']} (matched: {', '.join(map(str, i['matched']))})")
        if len(r["new"]) > MAX_NEW_LISTED:
            L.append(f"- …and {len(r['new']) - MAX_NEW_LISTED} more, soonest first, in the run's .json")
    if r["changed"]:
        L += ["", "## Deadline changed", ""]
        L += [f"- [{i['title']}]({i['url']}) · {i.get('was') or 'none'} → {i.get('closes') or 'none'}"
              for i in r["changed"]]
    if r["pagesChanged"]:
        L += ["", "## Funder pages that changed", ""]
        for p in r["pagesChanged"]:
            L.append(f"- [{p['name']}]({p['url']}) · {p['addedCount']} new lines")
            for n in p["added"]:
                tag = f" _({', '.join(n['flags'])})_" if n["flags"] else ""
                L.append(f"  - {n['line']}{tag}")
    if r["standing"]:
        L += ["", "## Standing programs first seen today", ""]
        L += [f"- [{i['title']}]({i['url']}) · {i['funder']}" for i in r["standing"]]
    if r["baselined"]:
        L += ["", "## Pages now watched (first read; changes show from next run)", ""]
        L += [f"- [{p['name']}]({p['url']})" for p in r["baselined"]]
    if r["excluded"] or r["skippedPages"]:
        L += ["", "## Excluded by your rules", ""]
        L += [f"- {i['title']} · {i['reason']}" for i in r["excluded"]]
        L += [f"- (page) {p['name']} · {p['reason']}" for p in r["skippedPages"]]
    if r["alerts"]:
        L += ["", "## Check your alert email from", ""]
        L += [f"- {a['name']}" for a in r["alerts"]]
    if r["errors"]:
        L += ["", "## Errors", ""] + [f"- {e}" for e in r["errors"]]
    return "\n".join(L) + "\n"


def render_html(md: str, title: str) -> str:
    body = []
    for line in md.splitlines():
        esc = html.escape(line)
        esc = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', esc)
        esc = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", esc)
        esc = re.sub(r"_\(([^)]*)\)_", r"<em>(\1)</em>", esc)
        if line.startswith("# "):
            body.append(f"<h1>{esc[2:]}</h1>")
        elif line.startswith("## "):
            body.append(f"<h2>{esc[3:]}</h2>")
        elif line.startswith("  - "):
            body.append(f'<li class="sub">{esc[4:]}</li>')
        elif line.startswith("- "):
            body.append(f"<li>{esc[2:]}</li>")
        elif line.strip():
            body.append(f"<p>{esc}</p>")
    return ("<!doctype html><html><head><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            f"<title>{html.escape(title)}</title><style>"
            ":root{color-scheme:light dark}body{font:15px/1.5 -apple-system,system-ui,sans-serif;"
            "max-width:860px;margin:24px auto;padding:0 16px}li{margin:4px 0}"
            "li.sub{margin-left:24px;list-style:circle;opacity:.85}h2{margin-top:28px}"
            "</style></head><body>" + "\n".join(body) + "</body></html>")


def scan(args) -> dict:
    catalog = load_json(Path(args.sources), {})
    prof_path = Path(args.profile) if args.profile else find_profile(Path.cwd())
    profile = load_json(prof_path, {}) if prof_path else {}
    state = Path(args.state)
    state.mkdir(parents=True, exist_ok=True)
    seen_file = state / "seen.json"
    seen = load_json(seen_file, {})
    regions = set(profile.get("regions", ["us"]))
    only = set(args.only.split(",")) if args.only else None
    want = lambda k: (only is None or k in only) and not args.offline  # noqa: E731
    errors: list[str] = []
    if prof_path is None:
        errors.append(f"No {PROFILE_NAME} found; scanning with defaults. "
                      f"Copy grants/profile.example.json to the working folder and fill it in.")

    apis = catalog.get("apis", {})
    items: list[dict] = []
    if want("grantsgov") and "grantsgov" in apis:
        items += grantsgov(apis["grantsgov"], profile, errors)
    if want("fr") and "federalRegister" in apis:
        items += federal_register(apis["federalRegister"], profile, errors)
    if want("sam") and "samgov" in apis:
        items += sam_gov(apis["samgov"], profile, errors)
    items = [i for i in items if keep_item(i)]
    sorted_ = apply_seen(items, seen, profile.get("exclude", {}))

    pages = [p for p in catalog.get("pages", []) if regions & set(p.get("regions", []))]
    pages += profile.get("extraPages", [])
    changed_pages, baselined, skipped = ([], [], [])
    if want("pages"):
        changed_pages, baselined, skipped = watch_pages(pages[: args.max_pages], profile, state, errors)

    alerts = [a for a in catalog.get("emailAlerts", []) if regions & set(a.get("regions", []))]
    seen_file.write_text(json.dumps(seen, indent=1, sort_keys=True))
    r = {"date": today().isoformat(), "profile": str(prof_path) if prof_path else None,
         **sorted_, "pagesChanged": changed_pages, "baselined": baselined,
         "skippedPages": skipped, "alerts": alerts, "errors": errors}
    r["counts"] = {"new": len(r["new"]), "changed": len(r["changed"]),
                   "pagesChanged": len(changed_pages), "excluded": len(r["excluded"]) + len(skipped),
                   "unchanged": r["unchanged"], "standing": len(r["standing"]),
                   "pagesWatched": len(pages) - len(skipped), "errors": len(errors)}
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    # A second run on the same day must not overwrite the first one's report:
    # what it found is already in the seen-ledger and would never show again.
    stem, n = r["date"], 2
    while (out / f"{stem}.md").exists():
        stem, n = f"{r['date']}-{n}", n + 1
    r["report"] = str(out / f"{stem}.md")
    md = render_md(r)
    (out / f"{stem}.json").write_text(json.dumps(r, indent=1))
    (out / f"{stem}.md").write_text(md)
    (out / f"{stem}.html").write_text(render_html(md, f"Grants & Contracts scan {stem}"))
    return r


# ---------------------------------------------------------------- selftest

def selftest() -> int:
    fails, ran = [], []

    def check(name, cond):
        ran.append(name)
        if not cond:
            fails.append(name)

    rules = {"funders": ["City of Example"], "terms": ["landmark nomination"]}
    check("exclude funder", excluded_by("Grants from the City of Example arts office", rules))
    check("exclude term", excluded_by("Landmark Nomination Support", rules))
    check("no false exclude", excluded_by("Heritage Projects", rules) is None)

    lines = page_lines("<html><script>x=1</script><h1>Grants</h1><p>Deadline: Mar 11, 2027</p>"
                       "<p>Deadline: Mar 11, 2027</p><style>p{}</style><li>Open &amp; rolling</li></html>")
    check("page_lines strips script/style", "x=1" not in " ".join(lines) and "p{}" not in " ".join(lines))
    check("page_lines dedupes + unescapes", lines == ["Grants", "Deadline: Mar 11, 2027", "Open & rolling"])
    check("date regex", DATE_RX.search("due Nov 2, 2026") and DATE_RX.search("12/15/2026"))

    soon = (today() + dt.timedelta(days=10)).strftime("%m/%d/%Y")
    past = (today() - dt.timedelta(days=1)).strftime("%m/%d/%Y")
    old_open = (today() - dt.timedelta(days=900)).strftime("%m/%d/%Y")
    check("keeps open item", keep_item({"closes": soon}))
    check("drops closed item", not keep_item({"closes": past}))
    check("drops stale forecast", not keep_item({"closes": "", "type": "forecast", "opens": old_open}))
    check("standing far-future", standing({"closes": "09/30/2076"}))

    item = lambda k, c, t="Grant": {"key": k, "title": t, "funder": "F", "url": "u", "closes": c,  # noqa: E731
                                     "source": "s", "matched": ["m"]}
    seen: dict = {}
    a = apply_seen([item("a", soon), item("b", "", "City of Example grant")], seen, rules)
    check("new on first sight", [i["key"] for i in a["new"]] == ["a"])
    check("excluded never enters ledger", "b" not in seen and len(a["excluded"]) == 1)
    b = apply_seen([item("a", soon)], seen, rules)
    check("seen is not new", not b["new"] and b["unchanged"] == 1)
    later = (today() + dt.timedelta(days=40)).strftime("%m/%d/%Y")
    c = apply_seen([item("a", later)], seen, rules)
    check("deadline change reported", len(c["changed"]) == 1 and c["changed"][0]["was"] == soon)

    with tempfile.TemporaryDirectory() as tmp:
        st = Path(tmp)
        pages = [{"id": "p1", "name": "P1", "url": "https://x", "funder": "Fund"},
                 {"id": "p2", "name": "P2", "url": "https://y", "funder": "City of Example"}]
        prof = {"exclude": rules, "keywords": ["heritage"]}
        v1 = "<p>Heritage Projects</p><p>Closed</p>"
        v2 = "<p>Heritage Projects</p><p>Open: due Mar 11, 2027</p><p>Landmark nomination support</p>"
        ch, base, sk = watch_pages(pages, prof, st, [], fetch=lambda u: v1)
        check("first read baselines", not ch and [p["id"] for p in base] == ["p1"])
        check("excluded page never fetched", [p["id"] for p in sk] == ["p2"])
        ch, base, sk = watch_pages(pages, prof, st, [], fetch=lambda u: v2)
        added = {n["line"]: n["flags"] for n in ch[0]["added"]} if ch else {}
        check("change detected", len(ch) == 1 and ch[0]["addedCount"] == 2)
        check("date flagged", "date" in added.get("Open: due Mar 11, 2027", []))
        check("excluded line flagged", any("EXCLUDED" in f for f in added.get("Landmark nomination support", [])))
        ch, base, sk = watch_pages(pages, prof, st, [], fetch=lambda u: v2)
        check("unchanged page quiet", not ch and not base)

        md = render_md({"date": "2026-01-01", "counts": {"new": 1, "changed": 0, "pagesChanged": 0,
                        "excluded": 0, "unchanged": 0}, "new": [item("a", soon)], "changed": [],
                        "pagesChanged": [], "standing": [], "baselined": [], "excluded": [],
                        "skippedPages": [], "alerts": [], "errors": []})
        check("report lists new", "## New" in md and "Closing within 30 days" in md)
        many = [item(f"k{n}", soon) for n in range(MAX_NEW_LISTED + 5)]
        md2 = render_md({"date": "2026-01-01", "counts": {"new": len(many), "changed": 0, "pagesChanged": 0,
                         "excluded": 0, "unchanged": 0}, "new": many, "changed": [], "pagesChanged": [],
                         "standing": [], "baselined": [], "excluded": [], "skippedPages": [], "alerts": [],
                         "errors": []})
        check("new list capped", "…and 5 more" in md2)
        check("html escapes", "<script>" not in render_html("- <script>x</script>", "t"))

    cat = load_json(SOURCES, None)
    check("sources.json parses", isinstance(cat, dict))
    if isinstance(cat, dict):
        ids = [p["id"] for p in cat.get("pages", [])]
        check("page ids unique", len(ids) == len(set(ids)))
        check("every page has url+regions", all(p.get("url", "").startswith("https://") and p.get("regions")
                                               for p in cat.get("pages", [])))
    print(f"selftest: {len(ran) - len(fails)}/{len(ran)} passed" + (f"; FAILED: {fails}" if fails else ""))
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sources", default=str(SOURCES))
    ap.add_argument("--profile", help=f"default: nearest {PROFILE_NAME} at or above the working folder")
    ap.add_argument("--state", default="state")
    ap.add_argument("--out", default="runs")
    ap.add_argument("--only", help="comma list of grantsgov,fr,sam,pages")
    ap.add_argument("--max-pages", type=int, default=80)
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    r = scan(args)
    c = r["counts"]
    print(f"{c['new']} new, {c['changed']} changed, {c['pagesChanged']} pages changed "
          f"({c['pagesWatched']} watched), {c['excluded']} excluded, {c['errors']} errors "
          f"→ {r['report']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
