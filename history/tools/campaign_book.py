#!/usr/bin/env python3
"""A campaign's seasons as one book, in episode order (campaign.md §5).

  campaign_book.py status <stories-dir> <campaign-id>     every season: landed or not, and what waits
                                                          on the author (editor suggestions in StoryMaker)
  campaign_book.py narration <stories-dir> <campaign-id> <out.json> [--files]
                                                          the book as it is read aloud: one track per
                                                          season's introduction (with its Who's who),
                                                          chapter and afterword, each a list of lines

The text is each season's narration (narration.py): read back from StoryMaker, so the author's edits
are what is read, with the domain's pronunciation list. --files reads each season's book/ instead.
What the book changes, it takes from the campaign file's `book` block, never from here:

  - `skip`: {"<slug>": ["<chapter title>", ...]}: chapters a published episode carries that the book
    tells in full elsewhere (Alesia's chapter 1 sums up the 52 BC rising, which season 7 tells). The
    published episode is not changed.
  - Each season's spoken sources line is said once for the whole book, at its end.

Seasons not yet landed are listed under `missing`; `narration` refuses to write a book with any.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import Project, load_json, save_json, words  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
NUMBERS = ("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen "
           "fifteen sixteen seventeen eighteen nineteen twenty").split()


def campaign(cid):
    path = os.path.join(HERE, "..", "domains", "pivotal-history", "campaigns", f"{cid}.json")
    data = load_json(path, None)
    if not data:
        raise SystemExit(f"no campaign file {os.path.normpath(path)}")
    return data


def seasons(stories, camp):
    """[(season, Project, landed)] in episode order."""
    out = []
    for s in sorted(camp["seasons"], key=lambda s: s["episode"]):
        slug = s.get("story") or s["slug"]
        p = Project(os.path.join(stories, slug))
        meta = load_json(p.path("project.json"), {}) or {}
        landed = bool(meta.get("storymakerProject")) and os.path.exists(p.path("book", "manifest.json"))
        out.append((s, p, landed))
    return out


def short_title(camp, season):
    """“Caesar in Gaul, 58 BC: the Helvetii and Ariovistus” → “58 BC: The Helvetii and Ariovistus”."""
    subject = season.get("subject") or ""
    when = season.get("when") or ""
    rest = subject
    prefix = f"{camp['title']}, {when}: "
    if subject.startswith(prefix):
        rest = subject[len(prefix):]
    rest = rest[:1].upper() + rest[1:]
    return f"{when}: {rest}" if when and not rest.startswith(when) else rest


def said(text):
    """What the local voice should read: a range of years with “to”, never a dash it may skip."""
    return re.sub(r"(\d+)\s*[–—-]\s*(\d+)", r"\1 to \2", text)


def cmd_status(stories, cid):
    import cite
    import series_book
    camp = campaign(cid)
    rows = seasons(stories, camp)
    for s, p, landed in rows:
        line = f"{s['episode']:>2}. {os.path.basename(p.root):18s} {'landed' if landed else 'not landed':11s} {s.get('subject')}"
        if landed:
            shim = cite.find_shim(p)
            got, origin, info = series_book.story_parts(p, shim, not shim)
            if got is None:
                line += f"  (cannot read it back: {origin})"
            elif info.get("pendingSuggestions"):
                line += f"  ({info['pendingSuggestions']} editor suggestions wait in StoryMaker)"
        print(line)
    left = [os.path.basename(p.root) for _, p, landed in rows if not landed]
    print(f"{len(rows) - len(left)} of {len(rows)} landed" + (f"; waiting: {', '.join(left)}" if left else ""))
    return 0 if not left else 1


def cmd_narration(stories, cid, out_path, use_files):
    import narration
    camp = campaign(cid)
    book = camp.get("book") or {}
    skip = book.get("skip") or {}
    rows = seasons(stories, camp)
    missing = [os.path.basename(p.root) for _, p, landed in rows if not landed]
    if missing:
        print(f"not every season has landed: {', '.join(missing)}")
        return 1
    tracks, names, skipped = [], [], []
    for part, (s, p, _) in enumerate(rows, start=1):
        slug = os.path.basename(p.root)
        data = narration.build(p, use_files, credit=False)
        title = short_title(camp, s)
        word = NUMBERS[part] if part < len(NUMBERS) else str(part)
        for i, ep in enumerate(data["episodes"]):
            if ep["title"] in skip.get(slug, []):
                skipped.append(f"{slug}: {ep['title']}")
                continue
            lines = [dict(x, text=said(x["text"])) for x in ep["lines"][1:]]   # the first is the heading
            if i == 0:
                track = {"title": f"{title} · {ep['title']}", "spoken": said(f"Part {word}. {title}."),
                         "partStart": True}
            else:
                track = {"title": ep["title"], "spoken": said(f"{ep['title']}.")}
            track.update({"part": part, "season": slug, "lines": lines,
                          "words": sum(words(x["text"]) for x in lines)})
            tracks.append(track)
        for n in narration.source_names(p):
            if n not in names:
                names.append(n)
        print(f"  part {part}: {slug} — {len(data['episodes'])} tracks, read from {data['origin']}")
    unknown = [f"{k}: {t}" for k, ts in skip.items() for t in ts if f"{k}: {t}" not in skipped]
    if unknown:
        print("the campaign file's book.skip names chapters no season has: " + "; ".join(unknown))
        return 1
    out = {"campaign": cid, "title": camp["title"], "subtitle": camp.get("subtitle", ""),
           "question": camp.get("question", ""), "tracks": tracks, "skipped": skipped,
           "sourcesLine": said(narration.sources_line(names)) if names else "",
           "words": sum(t["words"] for t in tracks)}
    save_json(out_path, out)
    print(f"{len(tracks)} tracks, {out['words']:,} words (~{out['words'] / 150 / 60:.1f} h at 150 a minute)"
          + (f"; left out: {'; '.join(skipped)}" if skipped else ""))
    return 0


def main(argv):
    if len(argv) >= 4 and argv[1] == "status":
        return cmd_status(argv[2], argv[3])
    if len(argv) >= 5 and argv[1] == "narration":
        return cmd_narration(argv[2], argv[3], argv[4], "--files" in argv)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
