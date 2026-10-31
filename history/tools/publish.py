#!/usr/bin/env python3
"""Where each episode of a story stands on its way out, and the record of each step (PLAYBOOK §7).

  publish.py status <project>                          each episode: its podcast (the Audio Script
                                                       Creator project, voiced, published) and its
                                                       video (things, beats, contact sheet, deck,
                                                       Video Recorder project, export, the author's
                                                       approvals), from the story's own files
  publish.py record <project> <n> <medium> key=value…  note a step for episode n; medium is podcast
                                                       or video, e.g. `video recorder=<id> export=<path>`,
                                                       `podcast published=2026-10-20`

The author, 2026-10-20: he drives the whole pipeline by talking to the assistant, so the assistant
must be able to say where every episode stands without asking the app or a job. The app holds the
media (Audio Script Creator, AI Slides, the Video Recorder, the podcast feed); this is the story's
own note of which is which, in project.json under `publishing.<n>.<medium>`. `deck.py push` already
writes `video.<n>.deck`.

Keys (anything else is refused, so a typo never becomes a second record):
  podcast  project (the Script Creator id) · voiced · published · unpublished (dates) · url (the
           episode's page, publishEpisode's shareURL) · spotify (the episode's page on Spotify, once
           Spotify has taken it from the feed: the site links there, a player anyone can use)
  video    recorder (the Video Recorder id) · export (the file) · sheet (the contact sheet) ·
           sheetApproved · approved · uploaded (dates) · url (where it went up)
A date is the author's: record `approved` or `published` only when he said so, with the day he did.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import Project, load_json, save_json  # noqa: E402

KEYS = {
    "podcast": ("project", "voiced", "published", "unpublished", "url", "spotify"),
    "video": ("recorder", "export", "sheet", "sheetApproved", "approved", "uploaded", "url"),
}


def episodes(project):
    """[(n, title)] from podcast/episodes.json, or [] before narration.py episodes has run."""
    data = load_json(project.path("podcast", "episodes.json"), None) or {}
    return [(int(e["n"]), e.get("title") or "") for e in data.get("episodes") or []]


def record(project, n, medium, pairs):
    """Write key=value pairs for episode n; returns the problems (empty when written)."""
    if medium not in KEYS:
        return [f"medium is podcast or video, not {medium!r}"]
    out, problems = {}, []
    for pair in pairs:
        key, eq, value = pair.partition("=")
        if not eq or not key:
            problems.append(f"{pair!r} is not key=value")
        elif key not in KEYS[medium]:
            problems.append(f"{medium} has no {key!r}; its keys: {', '.join(KEYS[medium])}")
        else:
            out[key] = value
    if problems or not out:
        return problems or ["nothing to record"]
    meta = load_json(project.path("project.json"), {}) or {}
    slot = meta.setdefault("publishing", {}).setdefault(str(int(n)), {}).setdefault(medium, {})
    slot.update(out)
    save_json(project.path("project.json"), meta)
    return []


def video_files(project, n):
    """What the video's own files say for episode n."""
    beats = load_json(project.path("video", f"beats-{n}.json"), None) or {}
    return {
        "things": os.path.exists(project.path("video", f"things-{n}.json")),
        "beats": len(beats.get("beats") or []),
        "seconds": beats.get("seconds"),
        "sheet": os.path.exists(project.path("video", f"sheet-{n}.html")),
        "description": os.path.exists(project.path("video", f"description-{n}.txt")),
    }


def status_rows(project):
    meta = load_json(project.path("project.json"), {}) or {}
    pub = meta.get("publishing") or {}
    decks = meta.get("video") or {}
    rows = []
    for n, title in episodes(project):
        p = (pub.get(str(n)) or {}).get("podcast") or {}
        v = (pub.get(str(n)) or {}).get("video") or {}
        f = video_files(project, n)
        deck = decks.get(str(n)) or {}
        rows.append({"n": n, "title": title, "podcast": p, "video": v, "files": f, "deck": deck})
    return rows


def podcast_cell(p):
    if p.get("unpublished"):
        return f"taken down {p['unpublished']}"
    if p.get("published"):
        return f"published {p['published']}"
    if p.get("voiced"):
        return f"voiced {p['voiced']}"
    return "project made" if p.get("project") else "-"


def video_cell(v, f, deck):
    if v.get("uploaded"):
        return f"uploaded {v['uploaded']}" + (f" {v['url']}" if v.get("url") else "")
    if v.get("approved"):
        return f"approved {v['approved']}"
    steps = []
    if f["things"]:
        steps.append("things")
    if f["beats"]:
        steps.append(f"{f['beats']} beats")
    if f["sheet"]:
        steps.append("sheet" + (f" approved {v['sheetApproved']}" if v.get("sheetApproved") else ""))
    if deck.get("deck"):
        steps.append(f"deck {deck.get('slides', '?')} slides")
    if v.get("recorder"):
        steps.append("video")
    if v.get("export"):
        steps.append("exported" if os.path.exists(v["export"]) else "export missing")
    return " · ".join(steps) or "-"


def cmd_status(project):
    rows = status_rows(project)
    if not rows:
        print("no podcast/episodes.json yet: narration.py episodes makes the episodes")
        return 1
    meta = load_json(project.path("project.json"), {}) or {}
    print(f"{meta.get('title') or os.path.basename(project.root)}: {len(rows)} episodes")
    print(f"{'ep':>3}  {'podcast':<24}  video")
    for r in rows:
        print(f"{r['n']:>3}  {podcast_cell(r['podcast']):<24}  {video_cell(r['video'], r['files'], r['deck'])}"
              f"   {r['title'][:40]}")
    return 0


def main(argv):
    if len(argv) >= 3 and argv[1] == "status":
        return cmd_status(Project(argv[2]))
    if len(argv) >= 6 and argv[1] == "record":
        problems = record(Project(argv[2]), argv[3], argv[4], argv[5:])
        for p in problems:
            print(p)
        if not problems:
            print(f"recorded episode {int(argv[3])} {argv[4]}: {' '.join(argv[5:])}")
        return 1 if problems else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
