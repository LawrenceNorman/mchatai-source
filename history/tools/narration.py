#!/usr/bin/env python3
"""A landed story as narration: the episodes and their lines, for Audio Script Creator (Phase PP.2).

  narration.py episodes <project> [--files]   podcast/episodes.json: one episode per part of the
                                              book, each a list of lines in reading order, with its
                                              characters and what voicing it costs. Reads the story
                                              back from StoryMaker (the author's edits are what is
                                              narrated); --files reads book/ instead
  narration.py show <project>                 the episodes, their lengths and the cost

The author, 2026-10-20: publishing goes through mChatAI+, "so you can preview each step before it
goes out". So this tool only prepares: each episode becomes an Audio Script Creator project by
`scriptcreator.createProject {title, lines, provider, voice}` (free, openable, editable), is voiced
by `scriptcreator.render {id, maxCharacters}`, heard by the author in the applet, and published by
`audiocast.publishEpisode` only on his word. PLAYBOOK §7 has the steps.

What is read: the title block as one spoken line, the introduction, the Who's who, every chapter
and the afterword. Not the Notes or the Sources: the last episode ends on one spoken line naming
the sources the book cites. The text is the gated prose (cite.strip_additions: no notes, pictures,
maps or links), so a narration reads exactly what the gates checked. The voice, the model, the
pauses, the price and a short pronunciation list are content (domain thresholds `audio`).
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import Project, load_json, save_json, thresholds, words  # noqa: E402


def cfg(project):
    a = thresholds(project).get("audio") or {}
    return {"provider": a.get("provider", "OpenAI"), "voice": a.get("voice", "onyx"), "hd": a.get("hd", True),
            "usdPerMillionChars": a.get("usdPerMillionChars", {"tts-1": 15.0, "tts-1-hd": 30.0}),
            "paragraphPause": a.get("paragraphPause", 0.8), "headingPause": a.get("headingPause", 1.4),
            "say": a.get("say", {}), "maxEpisodeMinutes": a.get("maxEpisodeMinutes", 38)}


def spoken(text, say):
    """The line as the voice should read it: the pronunciation list applied, whole words only."""
    for written, said in sorted(say.items(), key=lambda kv: -len(kv[0])):
        text = re.sub(r"(?<!\w)" + re.escape(written) + r"(?!\w)", said, text)
    return text


def lines_of(prose, c):
    """[{text, pauseAfter?}]: each sentence a line; a paragraph's last sentence pauses."""
    import cite
    out = []
    for _, sents in cite.paragraphs(prose):
        for i, s in enumerate(sents):
            line = {"text": spoken(s.strip(), c["say"])}
            if i == len(sents) - 1:
                line["pauseAfter"] = c["paragraphPause"]
            out.append(line)
    return out


def parts(project, use_files):
    """The book's parts in reading order, as landed: [(kind, title, text)]."""
    import series_book
    shim = None
    if not use_files:
        import cite
        shim = cite.find_shim(project)
    got, origin, _ = series_book.story_parts(project, shim, use_files or not shim)
    if got is None:
        raise SystemExit(f"cannot read the story back: {origin} (or pass --files)")
    return [(p["kind"], p["title"], p["text"]) for p in got], origin


def build(project, use_files=False):
    import cite
    c = cfg(project)
    meta = load_json(project.path("project.json"), {}) or {}
    subject = meta.get("subject") or (project.dossier or {}).get("subject") or os.path.basename(project.root)
    dossier = project.dossier or {}
    from _hw import series_entry
    series = ((series_entry(meta.get("series") or "")[0] or {}).get("title")) or ""
    got, origin = parts(project, use_files)
    body = [(k, t, cite.strip_additions(x).strip()) for k, t, x in got if k in ("intro", "chapter")]
    episodes = []
    # Episode 1: the title, the introduction and the Who's who; then one episode per chapter.
    first = []
    when = str(dossier.get("when") or "").strip()
    first.append({"text": spoken(f"{subject}." + (f" {when}." if when else "") + (f" {series}." if series else ""), c["say"]),
                  "pauseAfter": c["headingPause"]})
    k = 0
    while k < len(body) and (body[k][0] == "intro" or body[k][1].lower().startswith("who")):
        kind, title, text = body[k]
        if kind != "intro":
            first.append({"text": spoken(f"{title}.", c["say"]), "pauseAfter": c["headingPause"]})
        first += lines_of(text, c)
        k += 1
    if k:
        episodes.append({"title": "Introduction", "lines": first})
    for kind, title, text in body[k:]:
        episodes.append({"title": title, "lines": [{"text": spoken(f"{title}.", c["say"]), "pauseAfter": c["headingPause"]}]
                         + lines_of(text, c)})
    if not k and episodes:                               # no introduction: the title opens the first episode
        episodes[0]["lines"] = first + episodes[0]["lines"]
    # The book's sources, said once at the end (the Notes and Sources are not read).
    srcs = cite.cited_sources(project, cite.book_numbers(project))
    names = []
    for sid in srcs:
        rec = project.sources.get(sid) or {}
        name = (rec.get("publisher") or "").split("(")[0].strip()
        if name and name not in names and name.lower() != "wikipedia":
            names.append(name)
    if names:
        credit = "This book is told from " + (", ".join(names[:-1]) + " and " + names[-1] if len(names) > 1 else names[0]) \
            + ". Every source is listed, with its notes, in the written book."
        episodes[-1]["lines"].append({"text": spoken(credit, c["say"])})
    model = "tts-1-hd" if c["hd"] else "tts-1"
    rate = float(c["usdPerMillionChars"].get(model, 30.0))
    total = 0
    n_ep = len(episodes)
    for i, ep in enumerate(episodes, 1):
        ep["n"] = i
        ep["projectTitle"] = f"{subject} · {i} of {n_ep} · {ep['title']}"
        ep["characters"] = sum(len(x["text"]) for x in ep["lines"])
        ep["words"] = sum(words(x["text"]) for x in ep["lines"])
        ep["minutes"] = round(ep["words"] / 150, 1)              # a calm documentary read
        ep["usd"] = round(ep["characters"] * rate / 1e6, 3)
        total += ep["characters"]
    out = {"subject": subject, "origin": origin, "provider": c["provider"], "voice": c["voice"], "model": model,
           "usdPerMillionChars": rate, "characters": total, "usd": round(total * rate / 1e6, 2),
           "episodes": episodes}
    return out


def cmd_episodes(project, use_files):
    data = build(project, use_files)
    os.makedirs(project.path("podcast"), exist_ok=True)
    save_json(project.path("podcast", "episodes.json"), data)
    cmd_show(project)
    return 0


def cmd_show(project):
    data = load_json(project.path("podcast", "episodes.json"))
    if not data:
        print("no podcast/episodes.json: run narration.py episodes first")
        return 1
    c = cfg(project)
    print(f"{data['subject']} — {len(data['episodes'])} episodes, {data['characters']:,} characters, "
          f"{data['provider']} {data['voice']} ({data['model']}) ≈ ${data['usd']:.2f}  [read from {data['origin']}]")
    for ep in data["episodes"]:
        flag = "  ⚠ over the podcast share cap" if ep["minutes"] > c["maxEpisodeMinutes"] else ""
        print(f"  {ep['n']}. {ep['title']} — {len(ep['lines'])} lines, {ep['words']:,} words, ~{ep['minutes']} min, "
              f"{ep['characters']:,} chars, ${ep['usd']:.2f}{flag}")
    return 0


def main(argv):
    if len(argv) >= 3 and argv[1] == "episodes":
        return cmd_episodes(Project(argv[2]), "--files" in argv)
    if len(argv) >= 3 and argv[1] == "show":
        return cmd_show(Project(argv[2]))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
