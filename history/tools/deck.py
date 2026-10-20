#!/usr/bin/env python3
"""A narrated episode as slides, for AI Slides and the Video Recorder (Pivotal Histories, Phase PP.3).

  deck.py plan <project> <episode>    video/deck-<n>.json: the episode's slides, each with the picture
                                      it shows and the narration that plays under it (its notes)
  deck.py push <project> <episode>    the deck made IN AI Slides through its verbs (createDeck,
                                      addAsset, addSlide), so the author previews and edits it there;
                                      prints its link and the Video Recorder call that narrates it

The author, 2026-10-20: the video recycles the podcast's narration under "slide show type material",
made through mChatAI+ so each step is previewed. The slides carry no new facts and no new pictures:
- a picture or map opens a slide at the paragraph it sits under (the book's own placement); the
  narration until the next picture is that slide's notes, which the Video Recorder reads as its lines
  (aividrecorder.fromDeck: each slide stays up while its lines play);
- a stretch longer than `video.maxSecondsPerSlide` with no picture gets a quote card: one of the
  stretch's own sentences, set large (the writer's question first, when the stretch has one);
- the episode opens on a title card over the story's opening picture, and the Who's who is a card
  of names.
The narration is narration.py's episode, line for line, so the podcast and the video say the same
words. Maps are drawn as SVG; a slide gets a PNG of each, rendered once by a headless browser.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import Project, load_json, save_json, thresholds, words  # noqa: E402

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def cfg(project):
    v = thresholds(project).get("video") or {}
    return {"maxSecondsPerSlide": v.get("maxSecondsPerSlide", 50), "wordsPerSecond": v.get("wordsPerSecond", 2.5),
            "theme": v.get("theme", "midnight"), "quoteMaxWords": v.get("quoteMaxWords", 26)}


def picture_files(project):
    """{paragraph-key: local image file} for every picture and map the book places, keyed by the
    alt text the book's markdown carries, so a slide finds its file from the landed text."""
    import images
    import cite
    out = {}
    for r in images.index(project):
        if r.get("file") and os.path.exists(project.path(r["file"])):
            out[cite.image_markdown(r).split("](")[0][2:]] = (project.path(r["file"]), r)
    for lid, r in cite.map_records(project).items():
        out[(cite.map_markdown(project, r).split("](")[0]).lstrip("[!").lstrip("[")] = (project.path(r["file"]), r)
    return out


def png_of(svg_path, out_dir):
    """A PNG of a map, for a slide (AI Slides and the Video Recorder take raster pictures)."""
    os.makedirs(out_dir, exist_ok=True)
    png = os.path.join(out_dir, os.path.splitext(os.path.basename(svg_path))[0] + ".png")
    if not os.path.exists(png) or os.path.getmtime(png) < os.path.getmtime(svg_path):
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--screenshot={png}",
                        "--window-size=1920,1200", "--force-device-scale-factor=2", "file://" + urllib.parse.quote(svg_path)],
                       capture_output=True, timeout=60)
    return png if os.path.exists(png) else None


def short(caption, limit=70):
    first = re.split(r"(?<=[a-z0-9\)])[.;:](?:\s|$)", caption.strip())[0]
    return first if len(first) <= limit else first[:limit].rsplit(" ", 1)[0] + "…"


def quote_of(sentences, c):
    """A stretch's quote card: its question if it asks one, else its shortest full sentence."""
    fit = [s for s in sentences if 6 <= words(s) <= c["quoteMaxWords"] and '"' not in s and "“" not in s]
    q = [s for s in fit if s.rstrip("”\")").endswith("?")]
    if q:
        return q[0]
    return min(fit, key=lambda s: abs(words(s) - 14)) if fit else None


def plan(project, n):
    """The slides of episode n (1-based, as narration.py numbers them)."""
    import cite
    import narration
    import series_book
    c = cfg(project)
    data = load_json(project.path("podcast", "episodes.json"))
    if not data:
        raise SystemExit("run narration.py episodes first: the deck follows the podcast's episodes")
    ep = data["episodes"][int(n) - 1]
    shim = cite.find_shim(project)
    got, _, _ = series_book.story_parts(project, shim, not shim)
    body = [p for p in got if p["kind"] in ("intro", "chapter")]
    # The landed parts this episode reads: the introduction and the Who's who, or one chapter.
    if ep["title"] == "Introduction":
        mine = [p for p in body if p["kind"] == "intro" or p["title"].lower().startswith("who")]
    else:
        mine = [p for p in body if p["title"] == ep["title"]]
    pics = picture_files(project)
    meta = load_json(project.path("project.json"), {}) or {}
    say = narration.cfg(project)["say"]
    slides, cur = [], None

    def open_slide(**kw):
        nonlocal cur
        if cur and (cur["notes"] or cur.get("layout") in ("title", "section")):
            slides.append(cur)
        cur = {"notes": [], **kw}

    # The episode's opening headings (the story's title, then a chapter's) are said over the title card.
    heads = []
    for ln in ep["lines"]:
        t = ln["text"]
        if not heads or (ep["title"] != "Introduction" and t == narration.spoken(ep["title"] + ".", say) and len(heads) < 2):
            heads.append(t)
            if t == narration.spoken(ep["title"] + ".", say):
                break
        else:
            break
    title_line = " ".join(heads)
    # Opening card: the story's opening picture (its ground) under the episode's title.
    opening = None
    pick = meta.get("portrait")
    for key, (path, rec) in pics.items():
        if rec.get("id") == (pick.get("image") if isinstance(pick, dict) else pick):
            opening = path
    open_slide(layout="fullBleed" if opening else "title", title=meta.get("subject") or "",
               subtitle=("Part " + str(ep["n"]) + ": " + ep["title"]) if ep["title"] != "Introduction" else str((project.dossier or {}).get("when") or ""),
               image=opening)
    cur["notes"].append(title_line)
    used_quotes = set()
    for part in mine:
        text = cite.TITLE_BLOCK.sub("", part["text"])
        is_who = part["title"].lower().startswith("who")
        if is_who:
            # The names as cards of seven, each card's notes the lines of its names.
            rows = [ln.strip() for ln in text.split("\n\n") if ":" in ln]
            for k in range(0, len(rows), 7):
                chunk = rows[k:k + 7]
                open_slide(layout="bullets", title=part["title"], body=[r.split(":")[0].strip() for r in chunk])
                if k == 0:
                    cur["notes"].append(narration.spoken(part["title"] + ".", say))
                cur["notes"] += [narration.spoken(r, say) for r in chunk]
            continue
        elif part["kind"] == "chapter":
            # The chapter's title is the episode's first line, already said over the title card.
            open_slide(layout="section", title=part["title"], subtitle=meta.get("subject") or "")
        for block in re.split(r"\n\s*\n", text.strip()):
            block = block.strip()
            m = re.match(r"^\[?!\[([^\]]*)\]\(([^)]*)\)", block)
            if m:
                key = m.group(1)
                hit = pics.get(key) or next((v for k, v in pics.items() if k.startswith(key[:60])), None)
                if hit and hit[0] == opening and len(slides) <= 1 and cur.get("image") == opening:
                    continue                      # the opening picture already carries the title card
                if hit:
                    path, rec = hit
                    if path.endswith(".svg"):
                        path = png_of(path, project.path("video", "maps"))
                    open_slide(layout="fullBleed", title=short(rec.get("caption") or rec.get("name") or ""), image=path,
                               credit=rec.get("credit") or "")
                continue
            prose = cite.strip_additions(block).strip()
            if not prose:
                continue
            for _, sents in cite.paragraphs(prose):
                for s in sents:
                    cur["notes"].append(narration.spoken(s.strip(), say))
                    secs = words(" ".join(cur["notes"])) / c["wordsPerSecond"]
                    if secs > c["maxSecondsPerSlide"]:
                        q = quote_of([x for x in sents if x not in used_quotes], c)
                        if q:
                            used_quotes.add(q)
                            open_slide(layout="quote", title="", body=[q])
    if ep["lines"] and ep["n"] == len(data["episodes"]):
        cur["notes"].append(ep["lines"][-1]["text"])          # the closing credit line
    if cur:
        slides.append(cur)
    for s in slides:
        s["notes"] = " ".join(s["notes"]).strip()
    deck = {"title": f"{meta.get('subject')} · video {ep['n']} of {len(data['episodes'])} · {ep['title']}",
            "theme": c["theme"], "episode": ep["n"], "slides": slides,
            "characters": sum(len(s["notes"]) for s in slides),
            "seconds": round(sum(words(s["notes"]) for s in slides) / c["wordsPerSecond"])}
    os.makedirs(project.path("video"), exist_ok=True)
    save_json(project.path("video", f"deck-{ep['n']}.json"), deck)
    return deck


def cmd_plan(project, n):
    d = plan(project, n)
    print(f"{d['title']}: {len(d['slides'])} slides, ~{d['seconds'] // 60} min {d['seconds'] % 60} s, {d['characters']:,} characters of notes")
    for i, s in enumerate(d["slides"], 1):
        pic = os.path.basename(s.get("image") or "") if s.get("image") else ""
        print(f"  {i:>2}. [{s['layout']}] {(s.get('title') or (s.get('body') or [''])[0])[:60]}  {pic}  · {words(s['notes'])} words")
    return 0


def call(shim, verb, args, wait=60):
    out = subprocess.run([shim, "raw", json.dumps({"command": "applet", "applet": "aislides", "verb": verb, "args": args}),
                          "--wait", str(wait)], capture_output=True, text=True, timeout=wait + 30)
    try:
        return json.loads(out.stdout)
    except ValueError:
        return {"status": "error", "error": (out.stdout or out.stderr)[:300]}


def cmd_push(project, n):
    import cite
    d = load_json(project.path("video", f"deck-{int(n)}.json")) or plan(project, n)
    shim = cite.find_shim(project)
    if not shim:
        print("no ./mchatai shim above the story folder: the deck is made in the app")
        return 2
    r = call(shim, "createDeck", {"title": d["title"], "theme": d["theme"], "replace": True})
    deck_id = (r.get("result") or {}).get("id") or ((r.get("entity") or {}).get("id"))
    if r.get("status") != "ok" or not deck_id:
        print("createDeck failed:", r.get("error") or r.get("output"))
        return 1
    files = {}
    for s in d["slides"]:
        img = s.get("image")
        if img and img not in files:
            a = call(shim, "addAsset", {"deck": deck_id, "path": img})
            files[img] = (a.get("result") or {}).get("image_file") or (a.get("result") or {}).get("name")
            if a.get("status") != "ok" or not files[img]:
                print(f"addAsset failed for {os.path.basename(img)}: {a.get('error')}")
                return 1
    for i, s in enumerate(d["slides"]):
        slide = {"layout": s["layout"], "title": s.get("title") or "", "notes": s["notes"]}
        if s.get("subtitle"):
            slide["subtitle"] = s["subtitle"]
        if s.get("body"):
            slide["body"] = s["body"]
        if s.get("image"):
            slide["image_file"] = files[s["image"]]
        a = call(shim, "addSlide", {"deck": deck_id, "slide": slide})
        if a.get("status") != "ok":
            print(f"addSlide {i + 1} failed: {a.get('error')}")
            return 1
    got = call(shim, "getDeck", {"deck": deck_id})
    count = len((got.get("result") or {}).get("slides") or [])
    link = f"com.sevenhillsstudio.mchatai://product/{deck_id}?applet=AISlides"
    meta = load_json(project.path("project.json"), {}) or {}
    meta.setdefault("video", {})[str(d["episode"])] = {"deck": deck_id, "title": d["title"], "slides": count}
    save_json(project.path("project.json"), meta)
    print(f"deck “{d['title']}”: {count} slides in AI Slides → {link}")
    print("narrate it in the Video Recorder (previewed there before any export):")
    print("  " + json.dumps({"command": "applet", "applet": "aividrecorder", "verb": "fromDeck",
                             "args": {"deck": deck_id, "provider": "mchataiCloud", "voice": "onyx",
                                      "maxCharacters": d["characters"] + 200}}))
    return 0


def main(argv):
    if len(argv) >= 4 and argv[1] == "plan":
        return cmd_plan(Project(argv[2]), argv[3])
    if len(argv) >= 4 and argv[1] == "push":
        return cmd_push(Project(argv[2]), argv[3])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
