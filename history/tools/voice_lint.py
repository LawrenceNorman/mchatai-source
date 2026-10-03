#!/usr/bin/env python3
"""The voice gate (history/voice.md), mechanically.

  voice_lint.py chapter <project> <n>       one chapter: phrase rules + quotations + era share + ceilings
  voice_lint.py text [--max-words N] < f    any text: phrase rules (and a ceiling if given)
  voice_lint.py corpus <file.json>          phrase rules carried from the landmark lint, over a
                                            {slug: {"narration": ...}} corpus — the parity check

Phrase rules are DATA in history/lint-rules.json. They run on the text with quotation-marked
spans removed, because a speaker in 1910 saying "today" is not the narrator saying it — and
every quotation is checked separately: its words must be verbatim in a claim's evidence.

It does not judge good writing. It catches the failures voice.md names, each of which was
measured somewhere. Exit 1 when any HARD rule fires; soft rules are notes.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import (Project, finding, lint_rules, norm, quoted_spans, report,  # noqa: E402
                 sentence_around, strip_quoted, thresholds, words)


def compiled_rules(origin=None):
    out = []
    for r in lint_rules():
        if origin and r.get("origin") != origin:
            continue
        out.append((r["id"], r.get("severity", "hard"), re.compile(r["pattern"], re.I), r["why"]))
    return out


def phrase_findings(text, rules=None, strip=True):
    scan = strip_quoted(text) if strip else (text or "")
    out = []
    for rid, sev, rx, why in rules or compiled_rules():
        for m in rx.finditer(scan):
            out.append(finding(rid, sev, f"{m.group(0).strip()!r} — {why}", sentence_around(text, m.start(), m.end())))
    return out


def is_title(inner):
    """A newspaper, book, song or organisation name in quotation marks, not speech: short, and
    its significant words capitalised ("The Seattle Republican", "Up From Slavery"). Speech
    runs mostly lowercase."""
    toks = re.findall(r"[A-Za-z][A-Za-z'’-]*", inner)
    sig = [t for t in toks if len(t) >= 4]
    return 0 < len(toks) <= 8 and bool(sig) and sum(t[0].isupper() for t in sig) / len(sig) >= 0.75


# OCR damage inside a quotation: a full stop followed by a lowercase word ("Cayton. his as
# sociate"), or letters inside a number ("1S96"). A reader sees a typo; the archive saw a smudge.
OCR_DAMAGE = re.compile(r"\w\.\s+[a-z]{2,}|\b\d+[A-Za-z]+\d+\b|\b[A-Z]?\d+[A-Z]\d*\b")


def chapter_findings(project, n):
    ch = project.chapter(n)
    if ch is None:
        return [finding("chapter_missing", "hard", f"chapters/{int(n):02d}.json does not exist")]
    t = thresholds()
    text = ch.get("text", "")
    claims = ch.get("claims", [])
    out = phrase_findings(text)

    # §2 — a quotation is verbatim from a claimed source, or it is invented.
    evidence = " \n ".join(norm(c.get("evidence", "")) for c in claims)
    for start, end, inner in quoted_spans(text):
        if words(inner) < 3 or is_title(inner):
            continue                      # a quoted word, a name, or a title — not speech
        if norm(inner) not in evidence:
            out.append(finding("dialogue_unsourced", "hard",
                               "quoted words that are in no claim's evidence — a quotation must be verbatim from a source",
                               sentence_around(text, start, end)))
        elif OCR_DAMAGE.search(inner):
            out.append(finding("ocr_in_quote", "soft",
                               "this quotation carries OCR damage (a word broken by a stray full stop, or letters inside a "
                               "number) — quote a clean span, or tell it in your own words",
                               sentence_around(text, start, end)))

    n_words = words(text)
    # §9 — era context, capped.
    era_words = sum(words(c.get("text", "")) for c in claims if c.get("kind") == "era")
    if n_words and era_words / n_words > t["eraShareMax"]:
        out.append(finding("era_share", "hard",
                           f"era context is {100 * era_words / n_words:.0f}% of the chapter (cap {100 * t['eraShareMax']:.0f}%) — the person is the subject"))

    # §10 — the ceiling the plan computed, and the relative floor.
    pc = project.plan_chapter(n) or {}
    ceiling = pc.get("ceilingWords")
    if ceiling and n_words > ceiling:
        out.append(finding("over_ceiling", "hard", f"{n_words} words over this chapter's {ceiling}-word ceiling — cut, do not reword"))
    floor = pc.get("floorWords") or (t["starvedFraction"] * ceiling if ceiling else None)
    if floor and len(pc.get("events", [])) >= t["starvedMinEvents"] and n_words < floor:
        out.append(finding("starved", "hard",
                           f"{n_words} words from an allotment of {len(pc.get('events', []))} events, under this chapter's "
                           f"{round(floor)}-word floor — the sources hold more than this tells. If the story is meant to be "
                           "shorter than its ceiling, say so in plan.targetWords and rerun `richness.py plan` (a ceiling is "
                           "a maximum, not a quota); never pad"))
    return out


def main(argv):
    mode = argv[1] if len(argv) > 1 else ""
    if mode == "chapter" and len(argv) >= 4:
        return report(f"voice ch{argv[3]}", chapter_findings(Project(argv[2]), argv[3]))
    if mode == "text":
        text = sys.stdin.read()
        out = phrase_findings(text)
        if "--max-words" in argv:
            cap = int(argv[argv.index("--max-words") + 1])
            if words(text) > cap:
                out.append(finding("over_ceiling", "hard", f"{words(text)} words over the {cap}-word ceiling"))
        return report("voice", out)
    if mode == "corpus" and len(argv) >= 3:
        corpus = json.load(open(argv[2], encoding="utf-8"))
        rules = compiled_rules(origin="landmark-v8")
        per_rule = {rid: 0 for rid, *_ in rules}
        for slug, v in corpus.items():
            text = v.get("narration", "") if isinstance(v, dict) else str(v)
            hit = {f["rule"] for f in phrase_findings(text, rules, strip=False)}
            for rid in hit:
                per_rule[rid] += 1
        print(json.dumps({"entries": len(corpus), "entriesPerRule": per_rule}, indent=1))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
