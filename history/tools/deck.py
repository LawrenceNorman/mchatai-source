#!/usr/bin/env python3
"""A narrated episode as slides, for AI Slides and the Video Recorder (Pivotal Histories, Phase PP.3).

  deck.py plan <project> <episode>    video/deck-<n>.json: the episode's slides, each with the picture
                                      it shows and the narration that plays under it (its notes)
  deck.py plan <project> <episode> --beats   the same from the episode's visual beats (visuals.py,
                                      VB.4): a picture, map or card for every line or two
  deck.py description <project> <episode>   video/description-<n>.txt: every picture the video shows,
                                      with its credit and source page (for the upload)
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
            "theme": v.get("theme", "mono-noir"), "quoteMaxWords": v.get("quoteMaxWords", 26)}


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
    """A PNG of a map, for a slide (AI Slides and the Video Recorder take raster pictures), the map
    filling the whole picture. Chrome draws an SVG file at its own size (960 × 600), so a window
    twice that size left three quarters of the picture white (found 2026-10-20); the map is drawn
    through a page that sizes it to the window."""
    os.makedirs(out_dir, exist_ok=True)
    png = os.path.join(out_dir, os.path.splitext(os.path.basename(svg_path))[0] + ".png")
    if not os.path.exists(png) or os.path.getmtime(png) < os.path.getmtime(svg_path) \
            or os.path.getmtime(png) < os.path.getmtime(__file__):
        page = png[:-4] + ".html"
        with open(page, "w", encoding="utf-8") as fh:
            fh.write('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#12181a}'
                     'img{display:block;width:100vw;height:100vh;object-fit:cover}</style>'
                     f'<img src="{urllib.parse.quote(os.path.basename(svg_path))}">')
        shutil.copyfile(svg_path, os.path.join(out_dir, os.path.basename(svg_path)))
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--screenshot={png}",
                        "--window-size=1920,1200", "--force-device-scale-factor=2", "file://" + urllib.parse.quote(page)],
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


def walk(project, n):
    """Episode n (1-based, as narration.py numbers them) as the video meets it, in order: its
    opening (the story's title and opening picture), then each chapter heading, placed picture, Who's
    who row and spoken sentence of the landed text, then, in the last episode, the closing credit
    line. The slide plan and the visual beats (visuals.py) both read this one walk.
    Returns (episodes, episode, project.json, items); each item is a dict with a `kind`."""
    import cite
    import narration
    import series_book
    data = load_json(project.path("podcast", "episodes.json"))
    if not data:
        raise SystemExit("run narration.py episodes first: the video follows the podcast's episodes")
    ep = data["episodes"][int(n) - 1]
    shim = cite.find_shim(project)
    got, origin, _ = series_book.story_parts(project, shim, not shim)
    if got is None:
        # Say what failed. Discarded, it surfaced as "'NoneType' object is not iterable", and two video
        # jobs retried blind while another job's long Video Recorder call held the app (2026-10-20).
        raise SystemExit(f"could not read the story back: {origin}. If another job's long app call "
                         "(fromDeck, narrate, export) is running, the app answers once it finishes: run again then.")
    body = [p for p in got if p["kind"] in ("intro", "chapter")]
    # The landed parts this episode reads: the introduction and the Who's who, or one chapter.
    if ep["title"] == "Introduction":
        mine = [p for p in body if p["kind"] == "intro" or p["title"].lower().startswith("who")]
    else:
        mine = [p for p in body if p["title"] == ep["title"]]
    pics = picture_files(project)
    meta = load_json(project.path("project.json"), {}) or {}
    say = narration.cfg(project)["say"]

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
    # The story's opening picture (its ground) under the episode's title.
    opening = None
    pick = meta.get("portrait")
    for key, (path, rec) in pics.items():
        if rec.get("id") == (pick.get("image") if isinstance(pick, dict) else pick):
            opening = (path, rec)
    sub = ("Part " + str(ep["n"]) + ": " + ep["title"]) if ep["title"] != "Introduction" else \
        " · ".join(x for x in (str((project.dossier or {}).get("when") or ""), "Pivotal Histories") if x)
    items = [{"kind": "open", "title": meta.get("subject") or "", "sub": sub, "text": " ".join(heads),
              "image": opening[0] if opening else None, "rec": opening[1] if opening else None}]
    for part in mine:
        text = cite.TITLE_BLOCK.sub("", part["text"])
        if part["title"].lower().startswith("who"):
            items.append({"kind": "whoTitle", "title": part["title"], "text": narration.spoken(part["title"] + ".", say)})
            for row in [ln.strip() for ln in text.split("\n\n") if ":" in ln]:
                name, _, who = row.partition(":")
                items.append({"kind": "who", "name": name.strip(), "who": who.strip(), "text": narration.spoken(row, say)})
            continue
        if part["kind"] == "chapter":
            # The chapter's title is the episode's first line, already said over the title card.
            items.append({"kind": "section", "title": part["title"]})
        for block in re.split(r"\n\s*\n", text.strip()):
            block = block.strip()
            m = re.match(r"^\[?!\[([^\]]*)\]\(([^)]*)\)", block)
            if m:
                key = m.group(1)
                hit = pics.get(key) or next((v for k, v in pics.items() if k.startswith(key[:60])), None)
                if hit:
                    items.append({"kind": "picture", "path": hit[0], "rec": hit[1]})
                continue
            prose = cite.strip_additions(block).strip()
            if not prose:
                continue
            for _, sents in cite.paragraphs(prose):
                for s in sents:
                    items.append({"kind": "line", "text": narration.spoken(s.strip(), say), "paragraph": sents})
    if ep["lines"] and ep["n"] == len(data["episodes"]):
        items.append({"kind": "credit", "text": ep["lines"][-1]["text"]})          # the closing credit line
    return data, ep, meta, items


def plan(project, n):
    """The slides of episode n (1-based, as narration.py numbers them)."""
    c = cfg(project)
    data, ep, meta, items = walk(project, n)
    slides, cur = [], None

    def open_slide(**kw):
        nonlocal cur
        if cur and (cur["notes"] or cur.get("layout") in ("title", "section")):
            slides.append(cur)
        cur = {"notes": [], **kw}

    opening = None
    used_quotes = set()
    k = 0
    while k < len(items):
        it = items[k]
        kind = it["kind"]
        if kind == "open":
            opening = it["image"]
            open_slide(layout="fullBleed" if opening else "title", title=it["title"],
                       **({"caption": it["sub"]} if opening else {"subtitle": it["sub"]}), image=opening)
            cur["notes"].append(it["text"])
        elif kind == "whoTitle":
            # The names as cards of seven, each card's notes the lines of its names.
            rows = []
            while k + 1 < len(items) and items[k + 1]["kind"] == "who":
                k += 1
                rows.append(items[k])
            for j in range(0, len(rows), 7):
                chunk = rows[j:j + 7]
                open_slide(layout="bullets", title=it["title"], body=[r["name"] for r in chunk])
                if j == 0:
                    cur["notes"].append(it["text"])
                cur["notes"] += [r["text"] for r in chunk]
        elif kind == "section":
            open_slide(layout="section", title=it["title"], subtitle=meta.get("subject") or "")
        elif kind == "picture":
            path, rec = it["path"], it["rec"]
            if path == opening and len(slides) <= 1 and cur.get("image") == opening:
                k += 1
                continue                      # the opening picture already carries the title card
            if path.endswith(".svg"):
                path = png_of(path, project.path("video", "maps"))
            open_slide(layout="fullBleed", title="", caption=short(rec.get("caption") or rec.get("name") or "", 110),
                       image=path)
        elif kind == "line":
            cur["notes"].append(it["text"])
            secs = words(" ".join(cur["notes"])) / c["wordsPerSecond"]
            if secs > c["maxSecondsPerSlide"]:
                q = quote_of([x for x in it["paragraph"] if x not in used_quotes], c)
                if q:
                    used_quotes.add(q)
                    open_slide(layout="quote", quote=q)
        elif kind == "credit":
            cur["notes"].append(it["text"])
        k += 1
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


def plan_from_beats(project, n):
    """Episode n's slides from its visual beats (visuals.py, VB.4): one slide per beat, its notes the
    beat's lines, so the Video Recorder shows each picture, map or card while its words are read.
    A person's or place's first beat carries the name; every picture carries its caption and credit
    (CC BY and BY-SA require the credit, and the Video Recorder keeps the words still while the
    picture moves)."""
    import visuals
    c = cfg(project)
    data = load_json(project.path("podcast", "episodes.json"))
    if not data:
        raise SystemExit("run narration.py episodes first: the video follows the podcast's episodes")
    ep = data["episodes"][int(n) - 1]
    beats = load_json(project.path("video", f"beats-{ep['n']}.json")) or visuals.plan_beats(project, n)
    meta = load_json(project.path("project.json"), {}) or {}
    slides = []
    for b in beats["beats"]:
        m = b["material"]
        if m.get("kind") == "picture":
            image = project.path(m["file"]) if m.get("file") else None
            if m.get("subtitle"):                     # the opening: the story's title over its ground
                slide = {"layout": "fullBleed", "title": m.get("title") or "", "caption": m["subtitle"], "image": image,
                         "words_at": "top"}
            else:
                credit = re.sub(r"\s*·\s*Wikimedia Commons$", "", m.get("credit") or "")
                cap = short(m.get("caption") or "", 80)
                parts = re.split(r"\s*·\s*|,\s+(?=(?:CC|Public|PD|©))", credit)
                if len(parts) > 1 and parts[0] and parts[0].lower() in cap.lower():
                    credit = " · ".join(parts[1:])        # the caption already names the maker
                caption = cap + (" · " + credit if credit else "")
                # The words at the top: the bottom is the video's captions (they covered the credit).
                slide = {"layout": "fullBleed", "title": b.get("title") or "", "caption": caption, "image": image,
                         "words_at": "top"}
        else:
            slide = {"layout": m["layout"]}
            for k in ("title", "subtitle", "quote", "attribution", "fact", "label"):
                if m.get(k):
                    slide[k] = m[k]
        slide["notes"] = b["text"]
        slides.append(slide)
    deck = {"title": f"{meta.get('subject')} · video {ep['n']} of {len(data['episodes'])} · {ep['title']}",
            "theme": c["theme"], "episode": ep["n"], "slides": slides, "fromBeats": True,
            "closingHold": beats.get("closingHold"),
            "characters": sum(len(s["notes"]) for s in slides),
            "seconds": round(sum(words(s["notes"]) for s in slides) / c["wordsPerSecond"])}
    os.makedirs(project.path("video"), exist_ok=True)
    save_json(project.path("video", f"deck-{ep['n']}.json"), deck)
    return deck


def description(project, n):
    """Episode n's YouTube description, from its beats: what it is, then every picture it shows with
    its credit and where it comes from (CC BY and BY-SA require the credit; the frame carries a
    short one, this the full one). The author writes the rest before an upload."""
    data = load_json(project.path("podcast", "episodes.json")) or {}
    ep = (data.get("episodes") or [{}])[int(n) - 1]
    beats = load_json(project.path("video", f"beats-{int(n)}.json"))
    if not beats:
        raise SystemExit("run visuals.py beats first: the description lists what the video shows")
    meta = load_json(project.path("project.json"), {}) or {}
    out = [f"{meta.get('subject')}, part {ep.get('n')} of {len(data.get('episodes') or [])}: {ep.get('title')}", "",
           "Every fact in this episode comes from a cited source; nothing is invented.", "", "Pictures, in order:"]
    seen = set()
    for b in beats["beats"]:
        m = b["material"]
        if m.get("kind") != "picture" or m.get("file") in seen:
            continue
        seen.add(m.get("file"))
        bits = [m.get("caption") or "", m.get("credit") or "", m.get("page") or ""]
        out.append("- " + " — ".join(x for x in bits if x))
    text = "\n".join(out) + "\n"
    os.makedirs(project.path("video"), exist_ok=True)
    with open(project.path("video", f"description-{int(n)}.txt"), "w", encoding="utf-8") as fh:
        fh.write(text)
    return text


def cmd_plan(project, n, from_beats=False):
    d = plan_from_beats(project, n) if from_beats else plan(project, n)
    print(f"{d['title']}: {len(d['slides'])} slides, ~{d['seconds'] // 60} min {d['seconds'] % 60} s, {d['characters']:,} characters of notes")
    for i, s in enumerate(d["slides"], 1):
        pic = os.path.basename(s.get("image") or "") if s.get("image") else ""
        label = s.get("title") or s.get("quote") or s.get("fact") or s.get("caption") or (s.get("body") or [""])[0]
        print(f"  {i:>2}. [{s['layout']}] {label[:60]}  {pic}  · {words(s['notes'])} words")
    return 0


def call(shim, verb, args, wait=60):
    out = subprocess.run([shim, "raw", json.dumps({"command": "applet", "applet": "aislides", "verb": verb, "args": args}),
                          "--wait", str(wait)], capture_output=True, text=True, timeout=wait + 30)
    try:
        return json.loads(out.stdout)
    except ValueError:
        return {"status": "error", "error": (out.stdout or out.stderr)[:300]}


def cmd_push(project, n, into=None):
    """The deck made in AI Slides. `into` updates an existing deck in place instead (its slides
    changed where they differ, added or removed at the end), so a Video Recorder project made from
    it keeps every voiced line on its "Update from Deck"; a new deck would be a new project."""
    import cite
    d = load_json(project.path("video", f"deck-{int(n)}.json")) or plan(project, n)
    shim = cite.find_shim(project)
    if not shim:
        print("no ./mchatai shim above the story folder: the deck is made in the app")
        return 2
    if into:
        deck_id = into
        started = 0
        have = len(((call(shim, "getDeck", {"deck": deck_id}).get("result") or {}).get("slides")) or [])
        if not have:
            print(f"no AI Slides deck {deck_id} (or it is empty)")
            return 1
    else:
        r = call(shim, "createDeck", {"title": d["title"], "theme": d["theme"], "replace": True})
        deck_id = (r.get("result") or {}).get("id") or ((r.get("entity") or {}).get("id"))
        if r.get("status") != "ok" or not deck_id:
            print("createDeck failed:", r.get("error") or r.get("output"))
            return 1
        have = 0
        # AI Slides starts a deck with a title slide of its own (the deck's name, no notes); the Video
        # Recorder would read its text aloud, so the slides it started with are removed once ours are in.
        started = len(((call(shim, "getDeck", {"deck": deck_id}).get("result") or {}).get("slides")) or [])
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
        for key in ("subtitle", "quote", "caption", "attribution", "fact", "label", "image_focus", "words_at"):
            if s.get(key):
                slide[key] = s[key]
        if s.get("body"):
            slide["body"] = s["body"]
        if s.get("image"):
            slide["image_file"] = files[s["image"]]
        if i < have:
            a = call(shim, "updateSlide", {"deck": deck_id, "index": i + 1, "slide": slide})
            if a.get("status") != "ok" and "nothing changed" not in str(a.get("error") or a.get("output")):
                print(f"updateSlide {i + 1} failed: {a.get('error')}")
                return 1
            continue
        a = call(shim, "addSlide", {"deck": deck_id, "slide": slide})
        if a.get("status") != "ok":
            print(f"addSlide {i + 1} failed: {a.get('error')}")
            return 1
    for _ in range(max(0, have - len(d["slides"]))):
        r = call(shim, "removeSlide", {"deck": deck_id, "index": len(d["slides"]) + 1})
        if r.get("status") != "ok":
            print(f"removeSlide failed: {r.get('error')}")
            return 1
    for _ in range(started):
        r = call(shim, "removeSlide", {"deck": deck_id, "index": 1})        # 1-based
        if r.get("status") != "ok":
            print(f"removeSlide failed: {r.get('error')}")
            return 1
    # A portrait filled into a 16:9 slide keeps its face (the app's subject-finder; never an author's
    # own focus): the stills and the moving video show the same crop as AI Slides.
    v = thresholds(project).get("video") or {}
    # A regenerated deck (--into) gets its crops chosen again; a new one has none yet.
    f = call(shim, "autoFocus", {"deck": deck_id, "wholeBelow": v.get("wholeBelow", 0.6), "all": bool(into)}, wait=180)
    # The opening card is the title over the story's ground: it always fills the frame (a tall plan
    # shown whole made a thin strip behind the title, 2026-10-20).
    if d["slides"] and d["slides"][0].get("layout") == "fullBleed" and d["slides"][0].get("subtitle") is None \
            and d["slides"][0].get("caption") and d["slides"][0].get("image"):
        call(shim, "updateSlide", {"deck": deck_id, "index": 1, "slide": {"image_fit": "fill"}})
    if f.get("status") == "ok" and (f.get("result") or {}).get("slides"):
        print(f"kept the subject in frame on slides {', '.join(map(str, f['result']['slides']))}"
              + (f"; shown whole: {', '.join(map(str, f['result'].get('whole') or []))}" if f['result'].get('whole') else ""))
    got = call(shim, "getDeck", {"deck": deck_id})
    count = len((got.get("result") or {}).get("slides") or [])
    link = f"com.sevenhillsstudio.mchatai://product/{deck_id}?applet=AISlides"
    meta = load_json(project.path("project.json"), {}) or {}
    meta.setdefault("video", {})[str(d["episode"])] = {"deck": deck_id, "title": d["title"], "slides": count}
    save_json(project.path("project.json"), meta)
    print(f"deck “{d['title']}”: {count} slides in AI Slides → {link}")
    print("narrate it in the Video Recorder (previewed there before any export):")
    args = {"deck": deck_id, "provider": "openai", "voice": "onyx", "maxCharacters": d["characters"] + 200}
    if d.get("fromBeats"):
        args.update((thresholds(project).get("video") or {}).get("beatPacing") or {})
        if d.get("closingHold"):
            args["closingHold"] = d["closingHold"]          # the end card stays up for YouTube's end screen
    print("  " + json.dumps({"command": "applet", "applet": "aividrecorder", "verb": "fromDeck", "args": args}))
    return 0


def main(argv):
    if len(argv) >= 4 and argv[1] == "plan":
        return cmd_plan(Project(argv[2]), argv[3], "--beats" in argv)
    if len(argv) >= 4 and argv[1] == "description":
        print(description(Project(argv[2]), argv[3]))
        return 0
    if len(argv) >= 4 and argv[1] == "push":
        into = argv[argv.index("--into") + 1] if "--into" in argv else None
        return cmd_push(Project(argv[2]), argv[3], into)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
