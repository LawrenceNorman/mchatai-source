#!/usr/bin/env python3
"""Where every story stands, from the files alone.

    python3 history/tools/stories_status.py [stories-dir] [--json]

For "what's going on with my histories?". Each stage of a story runs as its own job and hands
over through files (PLAYBOOK, "Each stage runs in its own fresh thread"), so the files ARE the
state: nothing here asks a running job anything, and nothing needs the app.

Per story folder: its stage (started, scouted, planned, chapters, built, finished), chapters
written against the plan, whether the introduction exists, the book and the editor's letter,
the last time anything in the folder changed, and the newest `_issues.md` note naming it. Notes
that name no story (a coordinating thread's) are counted apart, and the newest three notes are
listed. Folders starting with "_" (briefs, scout reports) are not stories.
"""
import json
import os
import re
import sys
import time

from _hw import load_json

# "## 2026-10-10 — john-prim (finish)", "## 2026-10-09 — homer-harris scout: refused fetches"
HEADING = re.compile(r"^##\s+(\d{4}-\d{2}-\d{2})\s*[—–-]+\s*(.+?)\s*$", re.M)


def issue_notes(stories_dir, slugs):
    """[(date, title, [slugs the title names])] for each `## <date> — <title>` in _issues.md."""
    path = os.path.join(stories_dir, "_issues.md")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    notes = []
    for date, title in HEADING.findall(text):
        named = [s for s in slugs if re.search(r"(?<![\w-])" + re.escape(s) + r"(?![\w-])", title)]
        notes.append((date, title, named))
    return notes


def last_change(folder):
    newest = 0.0
    for root, _dirs, files in os.walk(folder):
        for name in files:
            try:
                newest = max(newest, os.path.getmtime(os.path.join(root, name)))
            except OSError:
                pass
    return newest


def story_status(folder, notes=()):
    plan = load_json(os.path.join(folder, "plan.json"), {}) or {}
    project = load_json(os.path.join(folder, "project.json"), {}) or {}
    planned = [int(c["n"]) for c in plan.get("chapters", []) if str(c.get("n", "")).isdigit()]
    chapters_dir = os.path.join(folder, "chapters")
    written = sorted(int(n[:-5]) for n in (os.listdir(chapters_dir) if os.path.isdir(chapters_dir) else [])
                     if re.fullmatch(r"\d+\.json", n))
    intro = 0 in written
    body = [n for n in written if n != 0]
    book = os.path.exists(os.path.join(folder, "book", "manifest.json"))
    letter = os.path.exists(os.path.join(folder, "editor", "letter.json"))
    if book and letter:
        stage = "finished"
    elif book:
        stage = "built"
    elif plan and (body or intro):
        stage = "chapters"
    elif plan:
        stage = "planned"
    elif os.path.exists(os.path.join(folder, "dossier.json")):
        stage = "scouted"
    else:
        stage = "started"
    changed = last_change(folder)
    notes = list(notes)
    return {
        "slug": os.path.basename(folder.rstrip(os.sep)),
        "subject": project.get("subject") or "",
        "stage": stage,
        "chaptersWritten": len(body),
        "chaptersPlanned": len(planned),
        "missingChapters": [n for n in planned if n not in body],
        "introduction": intro,
        "book": book,
        "editorLetter": letter,
        "authorReview": bool((project.get("review") or {}).get("author")),
        "lastChange": time.strftime("%Y-%m-%d %H:%M", time.localtime(changed)) if changed else "",
        "lastChangeEpoch": changed,
        "issueNotes": len(notes),
        "latestIssue": f"{notes[-1][0]} {notes[-1][1]}" if notes else "",
    }


def status(stories_dir):
    """{"stories": [...], "notes": {...}}: stories most recently changed first."""
    slugs = sorted(n for n in os.listdir(stories_dir)
                   if not n.startswith((".", "_")) and os.path.isdir(os.path.join(stories_dir, n)))
    notes = issue_notes(stories_dir, slugs)
    rows = [story_status(os.path.join(stories_dir, s), [n for n in notes if s in n[2]]) for s in slugs]
    rows.sort(key=lambda r: -r["lastChangeEpoch"])
    unattributed = [n for n in notes if not n[2]]
    return {
        "stories": rows,
        "notes": {
            "count": len(notes),
            "aboutNoStory": len(unattributed),
            # File order is the order they were written; the newest is last.
            "latest": [f"{d} {t}" for d, t, _ in notes[-3:]][::-1],
        },
    }


def ago(epoch, now=None):
    if not epoch:
        return "never"
    secs = max(0, (now or time.time()) - epoch)
    if secs < 3600:
        return f"{int(secs // 60)} min ago"
    if secs < 86400:
        return f"{int(secs // 3600)} h ago"
    return f"{int(secs // 86400)} d ago"


def table(report, now=None):
    lines = ["story                          stage     chapters      book  editor  changed      notes"]
    for r in report["stories"]:
        chapters = f"{r['chaptersWritten']}/{r['chaptersPlanned']}" + (" +intro" if r["introduction"] else "")
        lines.append(f"{r['slug'][:30]:30s} {r['stage']:9s} {chapters:13s} {'yes' if r['book'] else '-':5s} "
                     f"{'yes' if r['editorLetter'] else '-':7s} {ago(r['lastChangeEpoch'], now):12s} "
                     f"{r['issueNotes']}" + (f" (latest {r['latestIssue'][:60]})" if r["latestIssue"] else ""))
    n = report["notes"]
    if n["count"]:
        lines.append("")
        lines.append(f"_issues.md: {n['count']} notes, {n['aboutNoStory']} naming no story. Newest:")
        lines += [f"  {t[:100]}" for t in n["latest"]]
    return "\n".join(lines)


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    stories_dir = args[0] if args else "stories"
    if not os.path.isdir(stories_dir):
        print(f"no stories folder at {stories_dir}", file=sys.stderr)
        return 2
    report = status(stories_dir)
    print(json.dumps(report, indent=1, ensure_ascii=False) if "--json" in argv else table(report))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
