#!/usr/bin/env python3
"""Era context across a series: what the book has already told about the times, and a chapter
that tells it again or carries too much of it (voice §9, 2026-10-28).

  era.py told  <project-dir>         every era fact the series' OTHER stories tell: read it before
                                     writing a chapter's era context, and tell something else
  era.py check <project-dir> [<n>]   the chapter's era findings (all chapters without <n>)

A series is the stories beside this one (the same stories/ folder) whose project.json or dossier
names the same series. An era claim repeats another story's when both quote overlapping words of
the same source (a run of `eraRepeat.runWords` words), or their own sentences share
`eraRepeat.names` names and years (words common to the series' era context, such as its city,
do not count) and `eraRepeat.overlap` of their content words. A chapter with more than `eraSentencesMax`
sentences of era context is told to keep it to a few. Both are notes for the writer and the
editor (severity soft): the 30% cap (era_share) stays the only hard limit.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import Project, finding, load_json, norm, report, thresholds  # noqa: E402

STOP = set("""a an the and or but of in on at to for from by with as is was were be been being it its this that these
those he she they his her their them there here which who whom whose what when where while than then so such not no
into onto over under about after before during between through up down out off also only very more most many much
any all each other some one two three had has have did do does would could should may might will shall can""".split())
_CACHE = {}


def series_of(project):
    meta = load_json(project.path("project.json"), {}) or {}
    return meta.get("series") or (project.dossier or {}).get("series") or ""


def content_words(text):
    return {w for w in re.findall(r"[a-z0-9']+", norm(text)) if w not in STOP and len(w) > 2}


def distinct(text):
    """The names and years in a sentence: capitalised words past its first, and numbers."""
    toks = re.findall(r"[A-Za-z0-9][A-Za-z0-9'’]*", text or "")
    return {w.lower() for i, w in enumerate(toks) if (i and w[0].isupper()) or re.fullmatch(r"\d{3,4}s?", w)}


def common(rows, share=0.25):
    """Names in more than `share` of the series' era sentences: the city, the state."""
    from collections import Counter
    df = Counter(w for r in rows for w in distinct(r["text"]))
    return {w for w, k in df.items() if len(rows) >= 8 and k / len(rows) > share}


def era_claims(project, n=None):
    out = []
    for k in ([n] if n is not None else project.chapter_numbers()):
        ch = project.chapter(k) or {}
        for c in ch.get("claims", []):
            if c.get("kind") == "era" and not c.get("retired"):
                out.append((k, c))
    return out


def siblings(project):
    """The other stories of this project's series, beside it."""
    series = series_of(project)
    parent = os.path.dirname(project.root)
    if not series or not os.path.isdir(parent):
        return []
    key = (parent, series)
    if key not in _CACHE:
        found = []
        for name in sorted(os.listdir(parent)):
            p = Project(os.path.join(parent, name))
            if os.path.isdir(p.path("chapters")) and series_of(p) == series:
                found.append(p)
        _CACHE[key] = found
    return [p for p in _CACHE[key] if p.root != project.root]


def told(project):
    """[{story, chapter, text, source, url, evidence}] for every era claim in the series' other stories."""
    rows = []
    for p in siblings(project):
        srcs = p.sources
        slug = (load_json(p.path("project.json"), {}) or {}).get("slug") or os.path.basename(p.root)
        for k, c in era_claims(p):
            rec = srcs.get(str(c.get("source")), {})
            rows.append({"story": slug, "chapter": k, "text": c.get("text", ""), "source": str(c.get("source", "")),
                         "url": rec.get("url", ""), "evidence": c.get("evidence", "")})
    return rows


def _run(a, b, n):
    wa, wb = norm(a).split(), norm(b).split()
    if len(wa) < n or len(wb) < n:
        return False
    grams = {tuple(wb[i:i + n]) for i in range(len(wb) - n + 1)}
    return any(tuple(wa[i:i + n]) in grams for i in range(len(wa) - n + 1))


def repeats(project, claim, others, t):
    cfg = t.get("eraRepeat") or {}
    run_words, overlap, names = int(cfg.get("runWords", 8)), float(cfg.get("overlap", 0.5)), int(cfg.get("names", 3))
    url = project.sources.get(str(claim.get("source")), {}).get("url", "")
    mine, my_names = content_words(claim.get("text", "")), distinct(claim.get("text", ""))
    usual = common(others)
    for o in others:
        if url and o["url"] == url and _run(claim.get("evidence", ""), o["evidence"], run_words):
            return o
        theirs = content_words(o["text"])
        shared = (my_names & distinct(o["text"])) - usual
        if len(shared) >= names and mine and theirs and len(mine & theirs) / min(len(mine), len(theirs)) >= overlap:
            return o
    return None


def chapter_findings(project, n, others=None):
    t = thresholds(project)
    claims = era_claims(project, n)
    if not claims:
        return []
    out = []
    ch = project.chapter(n) or {}
    text = ch.get("text", "")
    # A sentence carrying an era claim, found by the claim's anchor.
    sentences = set()
    for _, c in claims:
        a = norm(c.get("anchor") or "")
        if not a:
            sentences.add(c.get("id") or c.get("text"))
            continue
        for s in re.split(r"(?<=[.!?])\s+", text):
            if a and a in norm(s):
                sentences.add(norm(s))
                break
        else:
            sentences.add(a)
    cap = t.get("eraSentencesMax", 4)
    if cap is not None and len(sentences) > int(cap):
        out.append(finding("era_nuggets", "soft",
                           f"{len(sentences)} sentences of era context in this chapter — a few well-chosen facts the "
                           f"person's life touches carry the period (at most {cap}); the person is the subject"))
    others = told(project) if others is None else others
    for _, c in claims:
        o = repeats(project, c, others, t)
        if o:
            out.append(finding("era_repeat", "soft",
                               f"the series already tells this in {o['story']}, chapter {o['chapter']}: "
                               f"\"{o['text'][:140]}\" — refer to it in a phrase, or choose another fact",
                               c.get("text", "")))
    return out


def main(argv):
    if len(argv) < 3 or argv[1] not in ("told", "check"):
        print(__doc__)
        return 2
    project = Project(argv[2])
    if argv[1] == "told":
        rows = told(project)
        if not rows:
            print(f"no other story of series {series_of(project)!r} beside {project.root} tells any era context yet")
            return 0
        print(f"{len(rows)} era facts already told in series {series_of(project)!r} (do not tell these again):")
        for r in rows:
            print(f"  {r['story']} ch {r['chapter']}: {r['text']}" + (f"  [{r['url']}]" if r["url"] else ""))
        return 0
    others = told(project)
    ns = [int(argv[3])] if len(argv) > 3 else project.chapter_numbers()
    found = []
    for n in ns:
        found += [dict(f, chapter=n) for f in chapter_findings(project, n, others)]
    print(report(f"era context: {os.path.basename(project.root)}", found))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
