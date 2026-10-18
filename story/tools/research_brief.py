#!/usr/bin/env python3
"""A sourced research brief for a chapter, checked and rendered (STORYMAKER_AUTHORSHIP_PLAN.md AA.3).

  research_brief.py check  FOLDER     every claim quotes a source saved on disk, word for word
  research_brief.py render FOLDER     the brief as Markdown for AI Write; refused unless check is clean

FOLDER is laid out as a History Writer project: sources saved with history/tools/fetch.py (bytes
on disk before anything is cited) and chapters/01.json, the brief (title, text, claims). History
Writer's evidence rules apply unchanged, through its own checker (history/tools/quotes.py): a
claim's evidence is a verbatim quote from a fetched source, a clue-only source supports nothing,
and a facts-only source's prose is not copied. The brief is research for the author; it is never
pasted into the book (story/research/RESEARCH.md).
"""
import argparse
import os
import sys

TOOLS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, TOOLS)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(TOOLS)), "history", "tools"))
from _hw import Project  # noqa: E402
from _story import report  # noqa: E402
from quotes import claim_findings, copy_findings  # noqa: E402

BRIEF = 1


def check(folder):
    project = Project(folder)
    return claim_findings(project, BRIEF) + copy_findings(project, BRIEF)


def render(folder):
    """The brief, its claims with their quotes, and the sources in order of first use."""
    project = Project(folder)
    brief = project.chapter(BRIEF) or {}
    sources = project.sources
    order = []
    for c in brief.get("claims", []):
        sid = str(c.get("source"))
        if not c.get("retired") and sid not in order:
            order.append(sid)
    number = {sid: i + 1 for i, sid in enumerate(order)}
    lines = [f"# {brief.get('title', 'Research')}", "", brief.get("text", "").strip(), "", "## What the sources say", ""]
    for c in brief.get("claims", []):
        if c.get("retired"):
            continue
        lines.append(f"- {c.get('text', '').strip()} — “{c.get('evidence', '').strip()}” [{number[str(c['source'])]}]")
    lines += ["", "## Sources", ""]
    for sid in order:
        rec = sources.get(sid, {})
        parts = [rec.get("title") or rec.get("url", ""), rec.get("publisher", ""), rec.get("date", "")]
        lines.append(f"[{number[sid]}] " + ". ".join(p for p in parts if p) + f". {rec.get('url', '')}")
    lines += ["", "Research for the author, not text for the book: every quote above was checked against the "
              "source as saved."]
    return "\n".join(lines) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("cmd", choices=["check", "render"])
    ap.add_argument("folder")
    args = ap.parse_args(argv)
    if Project(args.folder).chapter(BRIEF) is None:
        print(f"{args.folder}: no chapters/01.json (the brief)", file=sys.stderr)
        return 2
    findings = check(args.folder)
    if args.cmd == "check" or any(f["severity"] == "hard" for f in findings):
        return report(f"{os.path.basename(os.path.abspath(args.folder))} brief", findings)
    sys.stdout.write(render(args.folder))
    return 0


if __name__ == "__main__":
    sys.exit(main())
