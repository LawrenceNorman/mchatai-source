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


def compiled_rules(origin=None, project=None):
    """(id, severity, regex, why, scope). scope: "all" (default); "outsideL1" or "insideL1" for a
    domain's point-of-view rules, which only mean something on one side of a declared passage."""
    out = []
    for r in lint_rules(project):
        if origin and r.get("origin") != origin:
            continue
        out.append((r["id"], r.get("severity", "hard"), re.compile(r["pattern"], re.I), r["why"], r.get("scope", "all")))
    return out


def phrase_findings(text, rules=None, strip=True, l1=(), exempt=(), writer=(), writer_exempt=()):
    """Phrase rules over `text`. `l1`: [(start, end)] of declared immersive passages; inside them a
    rule named in `exempt` does not fire (the domain names which, in content) and every other rule
    still does. `writer`: [(start, end)] of the writer's own sentences (domain voice §2a), where the
    rules named in `writer_exempt` do not fire."""
    scan = strip_quoted(text) if strip else (text or "")
    out = []
    for rid, sev, rx, why, scope in rules or compiled_rules():
        for m in rx.finditer(scan):
            inside = any(a <= m.start() < b for a, b in l1)
            if (scope == "outsideL1" and inside) or (scope == "insideL1" and not inside) or (inside and rid in exempt):
                continue
            if rid in writer_exempt and any(a <= m.start() < b for a, b in writer):
                continue
            out.append(finding(rid, sev, f"{m.group(0).strip()!r} — {why}", sentence_around(text, m.start(), m.end())))
    return out


def pov_findings(project, ch, text, t):
    """The point-of-view ladder (history/domains/pivotal-history/voice.md §2), mechanically.

    A chapter may declare immersive (L1) passages in `passages`: [{"mode": "L1", "from": "<its first
    words>", "to": "<its last words>"}]. Returns ([(start, end)] of the passages, findings). Only a
    domain with a `pov` ladder allows them; a History Writer story is narrative nonfiction only
    (design D1). An L1 passage must be earned by the dossier, open on a declaration the reader can
    see, anchor a claim in every sentence, and stay under its share of the chapter."""
    import cite   # cite imports nothing from here; kept local so the phrase rules load without it
    passages = ch.get("passages") or []
    if not passages:
        return [], []
    pov = t.get("pov")
    if not isinstance(pov, dict):
        return [], [finding("pov_mode_unsupported", "hard",
                            "this chapter declares point-of-view passages, but its project has no point-of-view "
                            "ladder (project.json `domain`) — a History Writer story is narrative nonfiction only")]
    modes = set(pov.get("modes") or [])
    patterns = [re.compile(p) for p in pov.get("l1DeclarationPatterns") or []]
    anchors = [norm(c["anchor"]) for c in ch.get("claims", []) if c.get("anchor") and not c.get("retired")]
    spans, out = [], []
    for i, p in enumerate(passages, 1):
        mode, a, b = p.get("mode"), p.get("from") or "", p.get("to") or ""
        if mode not in modes or mode == "L0":
            why = ("L2, historical fiction, is out of scope for this domain" if mode == "L2"
                   else f"mode {mode!r} is not one this domain declares ({', '.join(sorted(modes)) or 'none'})")
            out.append(finding("pov_mode_unknown", "hard", f"passage {i}: {why}"))
            continue
        start = text.find(a) if a else -1
        stop = text.find(b, start) if start >= 0 and b else -1
        if start < 0 or stop < 0:
            out.append(finding("l1_span_unresolved", "hard",
                               f"passage {i}: its `from` and `to` words must be copied exactly from the chapter, in order"))
            continue
        end = stop + len(b)
        spans.append((start, end))
        body = text[start:end]
        sents = [s for _, ss in cite.paragraphs(body) for s in ss]
        if sents and not any(rx.search(sents[0]) for rx in patterns):
            out.append(finding("l1_undeclared", "hard",
                               "an immersive passage opens on its declaration, so the reader knows the mode has changed "
                               f"(voice.md §2: {', '.join(pov.get('l1DeclarationExamples') or [])})", sents[0][:200]))
        for s in sents:
            ns = norm(s)
            if not any(an and an in ns for an in anchors):
                out.append(finding("l1_unanchored", "hard",
                                   "every sentence of an immersive passage carries a sourced detail — anchor a claim in it, "
                                   "or cut it", s[:200]))
    if spans:
        if (project.dossier.get("computed") or {}).get("pov") != "L0+L1":
            out.append(finding("l1_not_earned", "hard",
                               "the dossier does not earn immersive passages (richness.py dossier: point of view "
                               f"{(project.dossier.get('computed') or {}).get('pov') or 'not computed'}) — tell it in L0"))
        n = words(text)
        share = sum(words(text[a:b]) for a, b in spans) / n if n else 0
        cap = pov.get("l1ShareMax", 0)
        if share > cap:
            out.append(finding("l1_share", "hard",
                               f"immersive passages are {100 * share:.0f}% of the chapter (cap {100 * cap:.0f}%) — the "
                               "sourced narrative carries the chapter"))
    return spans, out


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


def quote_core(inner):
    """A quotation's words for matching against evidence. English sets a comma or full stop
    inside the closing quotation mark whether or not the source had one there, and an
    ellipsis at either end marks a cut, so neither is part of what must be verbatim."""
    return re.sub(r"^(?:\.\.\.|…)\s*|[\s,.…]+$", "", norm(inner))


HONORIFICS = {"mr", "mrs", "ms", "miss", "dr", "rev", "reverend", "judge", "mayor", "councilman", "councilmember",
              "council", "representative", "state", "senator", "governor", "editor", "brother", "sister", "mother",
              "father", "captain", "big"}


def subject_first_names(subject, aliases=()):
    """The first names the record gives the subject: "Samuel" and "Sam", "Susie", "William" and "Bill"."""
    parts = subject.replace('"', " ").replace("“", " ").replace("”", " ").split()
    if len(parts) < 2:
        return set()
    surname = parts[-1].lower()
    names = {parts[0]}
    for alias in aliases or ():
        words = str(alias).replace(",", " ").split()
        if len(words) >= 2 and words[-1].lower().strip(".") == surname:
            head = words[0].strip(".")
            if "." in head or head.isupper():          # initials ("H.R. Cayton") are not a first name
                continue
            if head.lower() not in HONORIFICS and head[:1].isupper() and len(head) > 2:
                names.add(head)
    return names


def first_name_findings(text, subject, aliases=()):
    """The subject's first name used alone, outside quotations and link targets: "Susie" where the
    series names every man by his surname. Followed by another capitalised word it is someone
    else's full name ("John Jacob Gayton", "Samuel B. McKinney") or a son's ("Horace Jr."), and is
    left alone. Soft: two people of one surname in a passage may have a reason, which the writer
    states."""
    names = subject_first_names(subject, aliases)
    if not names:
        return []
    surname = subject.replace('"', " ").split()[-1]
    scan = strip_quoted(text)
    # Link and picture targets are addresses, not prose: blank them, keeping every position.
    scan = re.sub(r"\]\([^)]*\)", lambda m: " " * len(m.group(0)), scan)
    rx = re.compile(r"\b(" + "|".join(map(re.escape, sorted(names, key=len, reverse=True))) + r")\b(?!\s+[A-Z])")
    return [finding("first_name_for_subject", "soft",
                    f"{m.group(1)!r} alone: the subject goes by their surname ({surname!r}) after the first full mention, "
                    "a woman exactly as a man; name a family member who shares the surname differently",
                    sentence_around(text, m.start(), m.end()))
            for m in rx.finditer(scan)]


def chapter_findings(project, n):
    ch = project.chapter(n)
    if ch is None:
        return [finding("chapter_missing", "hard", f"chapters/{int(n):02d}.json does not exist")]
    t = thresholds(project)
    text = ch.get("text", "")
    claims = ch.get("claims", [])
    spans, out = pov_findings(project, ch, text, t)
    exempt = set((t.get("pov") or {}).get("l1ExemptRules") or []) if spans else set()
    # The writer's own sentences (a domain's voice §2a): a sentence that anchors no claim. Only a
    # domain with a `writer` block has them; a History Writer story is claims, as before.
    writer, writer_exempt = [], set()
    import storytelling
    if storytelling.v2(project):
        sents, _, relaxed = storytelling.classify(ch, spans)
        writer = [(sents[i][2], sents[i][3]) for i in relaxed]
        writer_exempt = set(t["writer"].get("exemptRules") or [])
    out += phrase_findings(text, compiled_rules(project=project), l1=spans, exempt=exempt,
                           writer=writer, writer_exempt=writer_exempt)
    if isinstance(t.get("writer"), dict):
        out += storytelling.writer_findings(project, n, ch, spans)

    # §2 — a quotation is verbatim from a claimed source, or it is invented.
    evidence = " \n ".join(norm(c.get("evidence", "")) for c in claims)
    for start, end, inner in quoted_spans(text):
        if words(inner) < 3 or is_title(inner):
            continue                      # a quoted word, a name, or a title — not speech
        if quote_core(inner) not in evidence:
            out.append(finding("dialogue_unsourced", "hard",
                               "quoted words that are in no claim's evidence — a quotation must be verbatim from a source",
                               sentence_around(text, start, end)))
        elif OCR_DAMAGE.search(inner):
            out.append(finding("ocr_in_quote", "soft",
                               "this quotation carries OCR damage (a word broken by a stray full stop, or letters inside a "
                               "number) — quote a clean span, or tell it in your own words",
                               sentence_around(text, start, end)))

    # §7 — the subject goes by their surname, a woman exactly as a man (2026-10-06).
    dossier = project.dossier or {}
    # Only a person has a first name: an episode's subject ("The Battle of Hampton Roads") read as one
    # made "The" a first name and flagged every sentence that began with it (2026-10-18).
    if t.get("subjectIsPerson", True):
        out += first_name_findings(text, dossier.get("subject") or "", dossier.get("aliases") or ())

    n_words = words(text)
    # §9 — era context, capped. A domain may measure it over the book instead (eraShareScope
    # "book": an episode's orientation, gate.py story); the base measures each chapter.
    era_words = sum(words(c.get("text", "")) for c in claims if c.get("kind") == "era")
    book_scope = t.get("eraShareScope") == "book" and storytelling.v2(project)
    if not book_scope and n_words and era_words / n_words > t["eraShareMax"]:
        out.append(finding("era_share", "hard",
                           f"era context is {100 * era_words / n_words:.0f}% of the chapter (cap {100 * t['eraShareMax']:.0f}%) — the person is the subject"))
    import world
    out += world.chapter_findings(project, n, claims, t)

    # §10 — the ceiling the plan computed, and the relative floor.
    pc = project.plan_chapter(n) or {}
    ceiling = pc.get("ceilingWords")
    if ceiling and n_words > ceiling:
        out.append(finding("over_ceiling", "hard", f"{n_words} words over this chapter's {ceiling}-word ceiling — cut, do not reword"))
    if pc.get("role") == "afterword":
        lo = ((t.get("afterword") or {}).get("words") or [0])[0]
        if n_words < lo:
            out.append(finding("under_floor", "soft", f"the afterword is {n_words} words, under {lo} (domain voice §12)"))
        return out
    aim = pc.get("targetWords")
    if aim and n_words > t.get("targetOverrun", 1.3) * aim:
        out.append(finding("over_target", "soft",
                           f"{n_words} words against this chapter's share of the story's target, {aim} — cut toward it unless "
                           "the author asked for more (plan.targetWords)"))
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
