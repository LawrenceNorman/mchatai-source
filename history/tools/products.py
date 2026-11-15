#!/usr/bin/env python3
"""A finished chapter as a podcast script or a slide deck, from the mchatai.com service (Phases ED.8 and ED.10,
mchatai_macOS/docs/EDUCATION_CLOUD_SERVICES.md), kept honest as the chapter changes. Quizzes have quiz.py.

  products.py podcast-request <project> <n> [--minutes 8] [--must-say "sentence"]...
        the body for web-api POST /v1/learn/podcasts/script. Save the reply's `script` as podcast/NN.json
        (series_book.py shows it under the chapter with "podcastOnPage": true).
  products.py slides-request <project> <n> [--slides 10] [--must-say "sentence"]...
        the body for POST /v1/learn/slides/deck. Save the reply's `deck` as slides/NN.json; its `markdown` is
        AI Slides markdown.
  products.py check <project> <n>      (also: gate.py products <project> <n>)
        prove offline that podcast/NN.json and slides/NN.json still fit the chapter: each passed the service's
        line check, and every number in it is still a number of the chapter (the service's own rule, so a
        revised chapter cannot leave a script reading out a figure that is gone).

The service checks a product when it is made; this check runs again whenever the chapter changes.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import Project, finding, load_json, report  # noqa: E402

# The same number rule as web-api learningChecks.js (keep the two in step).
NUMBER_WORDS = set("""zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen
sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred hundreds thousand
thousands million millions billion billions trillion trillions half halves quarter quarters double triple twice thrice
once first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth fifteenth
sixteenth seventeenth eighteenth nineteenth twentieth thirtieth fortieth fiftieth sixtieth seventieth eightieth
ninetieth hundredth thousandth millionth dozen dozens percent""".split())
NUMBER_TOKEN = re.compile(r"(?:(?<![\w.,])-)?[$€£¥]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)%?|[½¼¾⅓⅔⅛⅜⅝⅞]")
CURRENCY = re.compile(r"[$€£¥]")


def number_tokens(text):
    out = []
    for t in NUMBER_TOKEN.findall(str(text)):
        t = re.sub(r",+$", "", t)
        t = re.sub(r"(\d)\.$", r"\1", t)
        if t:
            out.append(t)
    return out


def numbers_not_in_source(items, source, must_say=()):
    """[(id, text)] → [(id, token)] for every number not in the source (the author's mustSay sentences are theirs)."""
    tokens = set(number_tokens(source))
    bare = {CURRENCY.sub("", t) for t in tokens}
    words = set(re.findall(r"[a-z]+", source.lower()))
    out = []
    for iid, text in items:
        for m in must_say:
            at = text.lower().find(m.lower())
            if at >= 0:
                text = text[:at] + " " + text[at + len(m):]
        for t in number_tokens(text):
            ok = t in tokens if CURRENCY.search(t) else t in bare
            if not ok:
                out.append((iid, t))
        for w in re.findall(r"[a-z]+", text.lower()):
            if (w in NUMBER_WORDS or (w.endswith("fold") and w[:-4] in NUMBER_WORDS)) and w not in words:
                out.append((iid, w))
    return out


def chapter_source(project, n):
    ch = project.chapter(n)
    if not ch:
        raise SystemExit(f"chapter {n} not found at {project.chapter_path(n)}")
    meta = load_json(project.path("project.json"), {}) or {}
    plan_ch = project.plan_chapter(n) or {}
    title = plan_ch.get("title") or ch.get("title") or f"Chapter {n}"
    return meta, {"title": title, "chapter": int(n), "text": ch.get("text", "")}


def request_payload(project, n, kind, size=None, must_say=()):
    meta, source = chapter_source(project, n)
    body = {"source": source, "mustSay": list(must_say)}
    if kind == "podcast":
        body["minutes"] = size or 8
    else:
        body["slides"] = size or 10
    return body


def podcast_items(sc):
    items = [("title", sc.get("title") or "")]
    for i, sec in enumerate(sc.get("sections") or []):
        if sec.get("heading"):
            items.append((f"H{i + 1}", sec["heading"]))
        items += [(l.get("id") or "?", l.get("text") or "") for l in sec.get("lines") or []]
    return items


def deck_items(deck):
    items = [("title", deck.get("title") or "")]
    for s in deck.get("slides") or []:
        sid = s.get("id") or "?"
        if s.get("heading"):
            items.append((f"{sid}.h", s["heading"]))
        items += [(b.get("id") or "?", b.get("text") or "") for b in s.get("bullets") or []]
        if s.get("notes"):
            items.append((f"{sid}.n", s["notes"]))
        if s.get("diagram"):
            items.append((f"{sid}.d", " ".join(re.findall(r'"([^"]*)"', s["diagram"]))))
    return items


def product_findings(project, n):
    ch = project.chapter(n)
    if not ch:
        return [finding("product_chapter_missing", "hard", f"chapter {n} not found")]
    text = ch.get("text", "")
    out = []
    found = False
    for kind, folder, schema, key, check, items_of in (
        ("podcast", "podcast", "podcast-script.v1", "script", "lines_supported", podcast_items),
        ("slides", "slides", "slide-deck.v1", "deck", "items_supported", deck_items),
    ):
        path = project.path(folder, f"{int(n):02d}.json")
        if not os.path.isfile(path):
            continue
        found = True
        rel = f"{folder}/{int(n):02d}.json"
        try:
            raw = load_json(path)
        except (OSError, ValueError) as e:
            out.append(finding(f"{kind}_unreadable", "hard", f"{rel} cannot be read ({type(e).__name__})"))
            continue
        doc = raw.get(key) if isinstance(raw, dict) and isinstance(raw.get(key), dict) else raw
        if not isinstance(doc, dict) or doc.get("schema") != schema:
            out.append(finding(f"{kind}_schema", "hard", f"{rel} is not a {schema}"))
            continue
        if check not in ((doc.get("validation") or {}).get("checks") or []):
            out.append(finding(f"{kind}_unchecked", "hard", f"{rel} did not pass the service's check ({check})"))
        must = [m for m in doc.get("mustSay") or [] if isinstance(m, str)]
        for iid, tok in numbers_not_in_source(items_of(doc), text, must):
            out.append(finding(f"{kind}_number_gone", "hard", f"{rel} {iid}: {tok!r} is not a number of the chapter any more"))
    if not found:
        out.append(finding("product_missing", "soft", f"no podcast/{int(n):02d}.json or slides/{int(n):02d}.json"))
    return out


def main(argv):
    args = argv[1:]
    if len(args) >= 3 and args[0] in ("podcast-request", "slides-request"):
        kind = args[0].split("-")[0]
        size, must, rest = None, [], args[3:]
        while rest:
            flag = rest.pop(0)
            if flag in ("--minutes", "--slides"):
                size = int(rest.pop(0))
            elif flag == "--must-say":
                must.append(rest.pop(0))
        print(json.dumps(request_payload(Project(args[1]), args[2], kind, size, must), ensure_ascii=False, indent=2))
        return 0
    if len(args) >= 3 and args[0] == "check":
        return report(f"products ch{args[2]}", product_findings(Project(args[1]), args[2]))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
