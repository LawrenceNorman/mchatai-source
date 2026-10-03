#!/usr/bin/env python3
"""Every claim's evidence is verbatim in the source it names — and no facts-only source is copied.

  quotes.py chapter <project> <n>

For each claim in chapters/<n>.json:
  source_unknown      the claim names a source that is not in sources/index.json
  source_clue_only    the source is a clue (sourcing.md §2) and can never support a fact
  source_missing      the source's text was never fetched to sources/<id>.txt
  quote_too_short     evidence under thresholds.minQuoteWords words cannot be checked
  quote_unverified    the evidence is not verbatim in the source's fetched text

And across the chapter text (quotation marks excluded):
  verbatim_copy       a run of thresholds.verbatimCopyWindowWords words copied from a
                      facts-only source — their facts are ours to use, their prose is not
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import Project, finding, norm, report, strip_quoted, thresholds, words  # noqa: E402


def claim_findings(project, n):
    ch = project.chapter(n)
    if ch is None:
        return [finding("chapter_missing", "hard", f"chapters/{int(n):02d}.json does not exist")]
    t = thresholds()
    sources = project.sources
    texts = {}
    out = []
    for i, c in enumerate(ch.get("claims", []), 1):
        sid = str(c.get("source", ""))
        label = f"claim {c.get('id', i)}"
        rec = sources.get(sid)
        if rec is None:
            out.append(finding("source_unknown", "hard", f"{label} cites source {sid!r}, which is not in sources/index.json", c.get("text", "")[:160]))
            continue
        if (rec.get("kind") or "").lower() == "clue-only" or (rec.get("license") or "").lower() == "clue-only":
            out.append(finding("source_clue_only", "hard", f"{label} rests on a clue ({rec.get('publisher') or rec.get('url')}) — confirm it in a citable source", c.get("text", "")[:160]))
            continue
        if sid not in texts:
            texts[sid] = project.source_text(sid)
        if texts[sid] is None:
            out.append(finding("source_missing", "hard", f"{label}: source {sid} was never fetched — no bytes on disk, no claim"))
            continue
        ev = c.get("evidence", "")
        if words(ev) < t["minQuoteWords"]:
            out.append(finding("quote_too_short", "hard", f"{label}: evidence under {t['minQuoteWords']} words cannot be verified", c.get("text", "")[:160]))
        elif norm(ev) not in norm(texts[sid]):
            out.append(finding("quote_unverified", "hard", f"{label}: evidence is not verbatim in source {sid} — copy it exactly, same spelling", ev[:200]))
    return out


def copy_findings(project, n):
    ch = project.chapter(n) or {}
    t = thresholds()
    k = t["verbatimCopyWindowWords"]
    prose = norm(strip_quoted(ch.get("text", ""))).split()
    if len(prose) < k:
        return []
    windows = {tuple(prose[i:i + k]): i for i in range(len(prose) - k + 1)}
    out = []
    for sid, rec in project.sources.items():
        if (rec.get("license") or "facts-only").lower() != "facts-only":
            continue
        text = project.source_text(sid)
        if not text:
            continue
        src = norm(text).split()
        for i in range(len(src) - k + 1):
            hit = windows.get(tuple(src[i:i + k]))
            if hit is not None:
                out.append(finding("verbatim_copy", "hard",
                                   f"{k}+ words copied from {rec.get('publisher') or sid} (licence: facts only) — use the fact, write our own sentence",
                                   " ".join(prose[hit:hit + k])))
                break
    return out


def main(argv):
    if len(argv) >= 4 and argv[1] == "chapter":
        project = Project(argv[2])
        return report(f"quotes ch{argv[3]}", claim_findings(project, argv[3]) + copy_findings(project, argv[3]))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
