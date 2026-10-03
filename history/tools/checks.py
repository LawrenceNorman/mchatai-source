#!/usr/bin/env python3
"""Three small deterministic checks on one chapter.

  checks.py numbers     <project> <n>   every year and number in the prose is in a claim's evidence
  checks.py growth      <project> <n>   every ledger row the plan says changes here is shown
  checks.py corrections <project> [n]   the author's corrections hold (all chapters if n omitted)

numbers      number_unsourced — the deterministic half of the anachronism gate: a writer
             reaching for a date or a figure no source gave is the commonest invention.
             Numbers in words count too ("forty years later"), compared by value.
growth       growth_unshown — voice.md §8: the ledger moves, and the prose shows it moving.
             A row's `shows` (alternatives) or its `value` must appear in the chapter. A chapter
             with no rows gets a note, never a failure.
corrections  correction_failed — a correction is permanent: mustMention phrases present (a list
             entry means "any one of these"), mustNotSay phrases absent. Regenerating a chapter
             can never quietly put a wrong fact back.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import Project, finding, numbers, report, spelled_numbers  # noqa: E402


def number_findings(project, n):
    ch = project.chapter(n)
    if ch is None:
        return [finding("chapter_missing", "hard", f"chapters/{int(n):02d}.json does not exist")]
    evidence = " ".join(c.get("evidence", "") for c in ch.get("claims", []))
    have = set(numbers(evidence)) | {x.replace(",", "") for x in numbers(evidence)}
    # The publication year of a source the chapter CITES is sourced too: a newspaper's issue date
    # lives in its record, not its OCR (which often garbles digits — "1S96").
    sources = project.sources
    for c in ch.get("claims", []):
        m = re.match(r"\s*(1[5-9]\d\d|20\d\d)", str((sources.get(str(c.get("source", ""))) or {}).get("date", "")))
        if m:
            have.add(m.group(1))
    out = []
    for tok in sorted(set(numbers(ch.get("text", "")))):
        if tok not in have and tok.replace(",", "") not in have:
            out.append(finding("number_unsourced", "hard", f"{tok!r} appears in the prose and in no claim's evidence"))
    # A number in words is still a number. Compared by VALUE, so the prose's "sixteen" is sourced
    # by evidence that says "16". One and two are left alone: as words they are mostly not counts
    # ("one of the", "the two of them").
    values = {int(x.replace(",", "")) for x in have if x.replace(",", "").isdigit()}
    values |= {v for _, v in spelled_numbers(evidence)}
    seen = set()
    for tok, v in spelled_numbers(ch.get("text", "")):
        if v < 3 or v in values or tok.lower() in seen:
            continue
        seen.add(tok.lower())
        out.append(finding("number_unsourced", "hard",
                           f"{tok!r} ({v}) appears in the prose and in no claim's evidence — a number in words is still "
                           "a number; arithmetic on sourced dates is not a source"))
    return out


def growth_findings(project, n):
    ch = project.chapter(n)
    if ch is None:
        return [finding("chapter_missing", "hard", f"chapters/{int(n):02d}.json does not exist")]
    pc = project.plan_chapter(n)
    if pc is None:
        return [finding("plan_chapter_missing", "hard", f"plan.json has no chapter {n}")]
    rows = project.ledger_rows()
    ids = pc.get("ledger", [])
    if not ids:
        return [finding("growth_none", "soft", "nothing in the ledger changes in this chapter — it must earn its place another way")]
    text = (ch.get("text") or "").lower()
    out = []
    for lid in ids:
        row = rows.get(lid)
        if row is None:
            out.append(finding("plan_unknown_ledger_row", "hard", f"plan lists ledger row {lid!r}, which plan.ledger does not define"))
            continue
        shows = row.get("shows") or [str(row.get("value", ""))]
        if not any(s and s.lower() in text for s in shows):
            out.append(finding("growth_unshown", "hard",
                               f"the plan says {row.get('field')} becomes {row.get('value')!r} in this chapter; the prose never shows it"))
    return out


def correction_problems(c, text):
    t = (text or "").lower()
    out = []
    for phrase in c.get("mustMention") or []:
        alts = phrase if isinstance(phrase, list) else [phrase]
        if not any(a.lower() in t for a in alts):
            out.append(f"missing {alts[0]!r}" if len(alts) == 1 else f"missing one of {alts!r}")
    for phrase in c.get("mustNotSay") or []:
        if phrase.lower() in t:
            out.append(f"still says {phrase!r}")
    return out


def correction_findings(project, n=None):
    chapters = [int(n)] if n is not None else project.chapter_numbers()
    out = []
    for c in project.corrections():
        targets = [int(c["chapter"])] if c.get("chapter") is not None else chapters
        for k in targets:
            if k not in chapters:
                continue
            ch = project.chapter(k)
            if ch is None:
                continue
            for p in correction_problems(c, ch.get("text", "")):
                out.append(finding("correction_failed", "hard", f"correction {c.get('id', '?')} (ch{k}): {p}"))
    return out


def main(argv):
    if len(argv) >= 4 and argv[1] == "numbers":
        return report(f"numbers ch{argv[3]}", number_findings(Project(argv[2]), argv[3]))
    if len(argv) >= 4 and argv[1] == "growth":
        return report(f"growth ch{argv[3]}", growth_findings(Project(argv[2]), argv[3]))
    if len(argv) >= 3 and argv[1] == "corrections":
        n = argv[3] if len(argv) >= 4 else None
        return report("corrections", correction_findings(Project(argv[2]), n))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
