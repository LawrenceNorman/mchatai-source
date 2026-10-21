#!/usr/bin/env python3
"""An episode's promotion: the posts that point people at it, held to the episode's own words, and
handed to the author's post queue for his approval (PLAYBOOK §7, history/jobs/promo.md).

  promo.py windows <project> <n> [--min 30] [--max 60]  stretches of the episode that a clip can be
                                                         cut from: whole beats, start and end seconds,
                                                         the words, and the cards on screen
  promo.py check <project> <n>                           promo/posts-<n>.json against the episode:
                                                         every number and quotation is the
                                                         episode's own, every link is one of its
                                                         addresses, each post fits its platform,
                                                         every picture or clip exists
  promo.py queue <project> <n> [--dry-run]               the checked posts into the queue: media
                                                         copied into the picture folder with what
                                                         each shows, a row per post, Approval
                                                         Pending. A row already approved or posted
                                                         is never rewritten.

The author, 2026-10-21: promote mChatAI through Pivotal Histories, on the queue the Growth assistant
posts from (he approves each row there) and on the series' own channels. Nothing here posts. Where
the queue is, which accounts exist and what each platform takes are the author's settings, in
`promo` of the workspace's client.json (beside stories/), never in this public file:

  "promo": {"queue": "<Ledger collection>", "pictureFolder": "<folder the poster attaches from>",
            "filePrefix": "ph", "idPrefix": "PH", "site": "<the series site>",
            "destinations": {"<key>": {"platform": "X", "destination": "<account>",
                                       "destinationURL": "<compose page>", "limit": 280,
                                       "urlLength": 23, "media": "pictures-or-video",
                                       "mustSay": "<words every post there says>", "rules": "…",
                                       "rulesChecked": "<date>", "format": "post"}}}

posts-<n>.json, written by the promo job:
  {"episode": 3, "posts": [{"to": "<destination key>", "title": "…", "copy": "…",
     "media": [{"file": "promo/3/card-12.png", "shows": "what it shows"}], "link": "<url>",
     "suggestedDate": "2026-10-24"}]}
"""
import datetime
import json
import os
import re
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import Project, load_json, norm, save_json  # noqa: E402

PICTURE = re.compile(r"\.(?:png|jpe?g|webp|gif)$", re.I)
VIDEO = re.compile(r"\.(?:mp4|mov|m4v)$", re.I)
URL = re.compile(r"https?://[^\s<>\"')]+")
QUOTED = re.compile(r"[“\"]([^”\"]{4,}?)[”\"]")
MEDIA_KINDS = {"pictures-or-video", "pictures", "video", "none"}


# ── the episode ──────────────────────────────────────────────────────────────

def episode_lines(project, n):
    """The episode's narration lines (podcast/episodes.json), its title and how many episodes."""
    data = load_json(project.path("podcast", "episodes.json"), None) or {}
    eps = data.get("episodes") or []
    ep = next((e for e in eps if int(e.get("n", -1)) == int(n)), None)
    if not ep:
        return None, "", len(eps)
    return [l.get("text") or "" for l in ep.get("lines") or []], ep.get("title") or "", len(eps)


def addresses(project, n, promo):
    """Every address a post about episode n may link: the episode's video and podcast pages (its
    publishing record), the series site and the author's channels (client.json)."""
    meta = load_json(project.path("project.json"), {}) or {}
    pub = (meta.get("publishing") or {}).get(str(int(n))) or {}
    out = {(pub.get("video") or {}).get("url"), (pub.get("podcast") or {}).get("url"), promo.get("site")}
    out |= {v for v in (promo.get("_media") or {}).values() if isinstance(v, str)}
    return {bare(u) for u in out if u}


def bare(url):
    """An address without its query, fragment or trailing slash: utm tags change no destination."""
    return re.split(r"[?#]", url.strip())[0].rstrip("/").lower()


def number_values(text):
    import visuals
    return {v for _, _, v in visuals.number_spans(text)}


IRREGULAR = {"feet": "foot", "men": "man", "women": "woman", "people": "person"}


def unit_of(word):
    w = word.lower()
    return IRREGULAR.get(w) or (w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w)


def number_units(text):
    """{(value, unit)}: each number the text says and the word it counts ("twenty-foot trench" →
    (20, "foot"), "eleven miles" → (11, "mile")); unit None when no such word follows ("three
    thousand of the rearguard")."""
    import visuals
    out = set()
    for _, end, v in visuals.number_spans(text):
        m = re.match(r"\s*-?\s*([A-Za-z]+)", text[end:])
        word = m.group(1) if m else ""
        out.add((v, None if not word or word.lower() in visuals.UNIT_STOP else unit_of(word)))
    return out


# ── settings ─────────────────────────────────────────────────────────────────

def workspace(project):
    """The folder above stories/, where client.json and the ./mchatai shim live."""
    return os.path.dirname(os.path.dirname(project.root))


def settings(project):
    client = load_json(os.path.join(workspace(project), "client.json"), {}) or {}
    promo = dict(client.get("promo") or {})
    promo["_media"] = client.get("media") or {}
    return promo


def problems_in_settings(promo):
    out = []
    for key in ("queue", "pictureFolder", "filePrefix", "idPrefix", "destinations"):
        if not promo.get(key):
            out.append(f"client.json promo has no `{key}`")
    for key, d in (promo.get("destinations") or {}).items():
        for field in ("platform", "destination", "limit"):
            if not d.get(field):
                out.append(f"destination {key} has no `{field}`")
        if d.get("media", "pictures-or-video") not in MEDIA_KINDS:
            out.append(f"destination {key}: media is one of {', '.join(sorted(MEDIA_KINDS))}")
    return out


# ── windows ──────────────────────────────────────────────────────────────────

def windows(project, n, lo=30.0, hi=60.0):
    """[(start, end, beats)]: runs of whole lines, lo..hi seconds, one starting at each line. A
    window ends where a line ends, so a clip never stops mid-sentence."""
    beats = (load_json(project.path("video", f"beats-{n}.json"), None) or {}).get("beats") or []
    out = []
    for i, b in enumerate(beats):
        if i and set(b.get("lines") or []) & set(beats[i - 1].get("lines") or []):
            continue                                   # mid-line: a window starts with its line
        for j in range(i, len(beats)):
            end = beats[j]["start"] + beats[j]["seconds"]
            nxt = beats[j + 1] if j + 1 < len(beats) else None
            if nxt and set(nxt.get("lines") or []) & set(beats[j].get("lines") or []):
                continue                               # the line goes on into the next beat
            length = end - b["start"]
            if length > hi:
                break
            if length >= lo:
                out.append((round(b["start"], 1), round(end, 1), beats[i:j + 1]))
                break
    return out


def cmd_windows(project, n, lo, hi):
    ws = windows(project, n, lo, hi)
    if not ws:
        print(f"no stretch of {lo:g} to {hi:g} seconds in video/beats-{n}.json")
        return 1
    for s, e, bs in ws:
        cards = [b["material"].get("layout") or b["material"].get("kind") for b in bs
                 if (b.get("material") or {}).get("kind") == "card"]
        words = " ".join(b.get("text") or "" for b in bs)
        print(f"{s:7.1f} – {e:7.1f}  ({e - s:4.1f} s){'  cards: ' + ', '.join(cards) if cards else ''}")
        print(f"          {words[:400]}")
    return 0


# ── check ────────────────────────────────────────────────────────────────────

def x_length(text, url_length):
    return len(URL.sub("x" * url_length, text))


def check_post(project, n, post, promo, lines, title, count, allowed):
    """Problems with one post, each a sentence."""
    out = []
    dests = promo.get("destinations") or {}
    d = dests.get(post.get("to") or "")
    if not d:
        return [f"`to` is {post.get('to')!r}; the destinations are {', '.join(sorted(dests))}"]
    copy = (post.get("copy") or "").strip()
    if not copy:
        return ["has no copy"]
    length = x_length(copy, int(d.get("urlLength") or 0)) if d.get("urlLength") else len(copy)
    if length > int(d["limit"]):
        out.append(f"is {length} characters; {d['platform']} takes {d['limit']}")
    if d.get("mustSay") and not re.search(d["mustSay"], copy, re.I):
        out.append(f"must say {d['mustSay']!r} there")
    # Numbers: the episode's own, counting what the episode counts with them ("twenty-foot trench"
    # is not "twenty miles"), or the part's place in the series ("part 3 of 6").
    said = set()
    for line in lines + [title]:
        said |= number_units(line)
    values = {v for v, _ in said} | {int(n), count}
    for v, unit in sorted(number_units(URL.sub("", copy)), key=str):
        shown = f"{v:,}" if isinstance(v, int) else f"{v}"
        if v not in values:
            out.append(f"says {shown}, which the episode never says")
        elif unit and (v, unit) not in said and v not in (int(n), count):
            units = sorted(u for w, u in said if w == v and u)
            out.append(f"says {shown} {unit}; the episode says {shown} " + (" or ".join(units) or "with no unit")
                       if units else f"says {shown} {unit}; the episode's {shown} counts nothing named")
    # Quotations: word for word from the episode.
    spoken = norm(" ".join(lines))
    for q in QUOTED.findall(copy):
        if norm(q).strip(" .,;:!?") not in spoken:
            out.append(f"quotes “{q[:60]}”, which is not the episode's words")
    # Links: the episode's own addresses only.
    for u in URL.findall(copy) + ([post["link"]] if post.get("link") else []):
        if bare(u) not in allowed:
            out.append(f"links {u}, which is not this episode's video, podcast or site")
    # Media.
    files = [m.get("file") if isinstance(m, dict) else m for m in post.get("media") or []]
    kind = d.get("media", "pictures-or-video")
    pics = [f for f in files if f and PICTURE.search(f)]
    vids = [f for f in files if f and VIDEO.search(f)]
    for m in post.get("media") or []:
        f = m.get("file") if isinstance(m, dict) else m
        if not f or not os.path.isfile(project.path(f)):
            out.append(f"names {f!r}, which is not in the story folder")
        elif not (PICTURE.search(f) or VIDEO.search(f)):
            out.append(f"{f} is neither a picture nor a video")
        elif not (isinstance(m, dict) and (m.get("shows") or "").strip()):
            out.append(f"{f} needs `shows`: what it shows, for the picture folder's index")
    if kind == "none" and files:
        out.append(f"{d['platform']} here takes no media")
    if kind == "video" and not vids:
        out.append(f"{d['platform']} here needs its clip")
    if kind == "pictures" and vids:
        out.append(f"{d['platform']} here takes pictures, not a video")
    if pics and vids:
        out.append("names pictures and a video: a post takes one or the other")
    if len(vids) > 1:
        out.append("names more than one video")
    if len(pics) > int(d.get("maxPictures") or 4):
        out.append(f"names {len(pics)} pictures; {d['platform']} takes {d.get('maxPictures') or 4}")
    return out


def check(project, n):
    """(posts, problems): problems as (post label, sentence)."""
    promo = settings(project)
    problems = [("settings", p) for p in problems_in_settings(promo)]
    if problems:
        return [], problems
    lines, title, count = episode_lines(project, n)
    if lines is None:
        return [], [("episode", f"no episode {n} in podcast/episodes.json")]
    data = load_json(project.path("promo", f"posts-{n}.json"), None)
    if not data or not data.get("posts"):
        return [], [("posts", f"no promo/posts-{n}.json with posts")]
    allowed = addresses(project, n, promo)
    posts = data["posts"]
    for i, post in enumerate(posts, 1):
        for p in check_post(project, n, post, promo, lines, title, count, allowed):
            problems.append((f"post {i} ({post.get('to')})", p))
    return posts, problems


def cmd_check(project, n):
    posts, problems = check(project, n)
    for label, p in problems:
        print(f"  {label}: {p}")
    if problems:
        print(f"NOT CLEAN: {len(problems)} problem(s)")
        return 1
    print(f"CLEAN: {len(posts)} post(s) for episode {n}")
    return 0


# ── queue ────────────────────────────────────────────────────────────────────

def row_ids(posts, promo, slug, n):
    """A stable ID per post: <idPrefix>-<story>-<n>-<destination>[-k] for a second post there."""
    counts, out = {}, []
    for post in posts:
        key = post["to"]
        counts[key] = counts.get(key, 0) + 1
        out.append(f"{promo['idPrefix']}-{slug}-{n}-{key}" + (f"-{counts[key]}" if counts[key] > 1 else ""))
    return out


def media_name(promo, slug, n, path):
    return f"{promo['filePrefix']}-{slug}-{n}-{os.path.basename(path)}"


def csv_text(rows, columns):
    import csv
    import io
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(columns)
    for r in rows:
        w.writerow([r.get(c, "") for c in columns])
    return buf.getvalue()


def failed(reply):
    """The app's refusal, or None: an applet reply says ok false, or the tunnel says error."""
    if reply.get("ok") is False or reply.get("status") == "error":
        return reply.get("error") or reply.get("summary") or reply.get("output") or "refused"
    return None


def existing_rows(shim, queue, prefix):
    import narration
    rows, offset = [], 0
    while True:
        r = narration.verb(shim, "ledger", "getRows", {"collection": queue, "match": prefix, "limit": 200,
                                                        "offset": offset})
        res = r.get("result") or {}
        if failed(r):
            raise RuntimeError(f"the queue could not be read: {failed(r)}")
        rows += res.get("rows") or []
        if not res.get("nextOffset"):
            return {str(x.get("ID") or ""): x for x in rows}
        offset = res["nextOffset"]


def cmd_queue(project, n, dry_run=False):
    import cite
    posts, problems = check(project, n)
    if problems:
        cmd_check(project, n)
        print("queue: nothing queued until check is CLEAN")
        return 1
    promo = settings(project)
    slug = re.sub(r"-\d+(bc|ad)?(-\d+)?$", "", os.path.basename(project.root)) or os.path.basename(project.root)
    shim = None if dry_run else cite.find_shim(project)
    if not dry_run and not shim:
        print("no ./mchatai shim above the stories")
        return 1
    have = {} if dry_run else existing_rows(shim, promo["queue"], f"{promo['idPrefix']}-{slug}-{n}-")
    meta = load_json(project.path("project.json"), {}) or {}
    story = meta.get("title") or slug
    _, ep_title, count = episode_lines(project, n)
    today = datetime.date.today().isoformat()
    rows, skipped, copies, index = [], [], [], {}
    for rid, post in zip(row_ids(posts, promo, slug, n), posts):
        old = have.get(rid)
        if old and (old.get("Approval") == "Approved" or str(old.get("Status") or "").lower() == "posted"):
            skipped.append(f"{rid}: {old.get('Approval')}, {old.get('Status')}; change it in the queue, not here")
            continue
        d = promo["destinations"][post["to"]]
        names = []
        for m in post.get("media") or []:
            name = media_name(promo, slug, n, m["file"])
            copies.append((project.path(m["file"]), os.path.join(promo["pictureFolder"], name)))
            index[name] = m["shows"].strip()
            names.append(name)
        rows.append({
            "ID": rid, "Approval": "Pending", "Status": "Queued", "Platform": d["platform"],
            "Destination": d["destination"], "Destination URL": d.get("destinationURL", ""),
            "Format": d.get("format", "post"), "Title": post.get("title") or f"{story}, part {n}",
            "Copy": post["copy"].strip(), "Screenshot": ", ".join(names) or "none (text post)",
            "Link": post.get("link", ""), "Feature": f"Pivotal Histories: {story}, part {n} of {count}",
            "Rules": d.get("rules", ""), "Rules checked": d.get("rulesChecked", ""),
            "Voice": "AI draft, his review", "Suggested date": post.get("suggestedDate", ""),
            "Notes": f"From the promo job, {today}: promo.py check CLEAN against episode {n} "
                     f"(“{ep_title}”); every number and quotation is the episode's own.",
        })
    for s in skipped:
        print(f"  kept as it is: {s}")
    if dry_run:
        for src, dst in copies:
            print(f"  would copy {os.path.relpath(src, project.root)} → {dst}")
        for r in rows:
            print(f"  would queue {r['ID']} ({r['Platform']}): {r['Copy'][:80]}…")
        return 0
    if not rows:
        print("nothing to queue")
        return 0
    os.makedirs(promo["pictureFolder"], exist_ok=True)
    for src, dst in copies:
        shutil.copy2(src, dst)
    idx_path = os.path.join(promo["pictureFolder"], "index.json")
    idx = load_json(idx_path, {}) or {}
    idx.update(index)
    save_json(idx_path, idx)
    import narration
    columns = list(rows[0].keys())
    r = narration.verb(shim, "ledger", "appendRows", {"collection": promo["queue"], "csv": csv_text(rows, columns),
                                                      "matchOn": "ID"}, wait=60)
    if failed(r):
        print(f"the queue refused the rows: {failed(r)}")
        return 1
    record = load_json(project.path("promo", f"queued-{n}.json"), {}) or {}
    for row in rows:
        record[row["ID"]] = {"queued": today, "to": row["Platform"], "media": row["Screenshot"]}
    save_json(project.path("promo", f"queued-{n}.json"), record)
    print(f"queued {len(rows)} row(s) in {promo['queue']}, Approval Pending: {', '.join(r['ID'] for r in rows)}")
    print(f"copied {len(copies)} file(s) into the picture folder")
    return 0


def main(argv):
    def opt(name, default):
        return float(argv[argv.index(name) + 1]) if name in argv else default
    if len(argv) >= 4 and argv[1] == "windows":
        return cmd_windows(Project(argv[2]), int(argv[3]), opt("--min", 30.0), opt("--max", 60.0))
    if len(argv) >= 4 and argv[1] == "check":
        return cmd_check(Project(argv[2]), int(argv[3]))
    if len(argv) >= 4 and argv[1] == "queue":
        return cmd_queue(Project(argv[2]), int(argv[3]), dry_run="--dry-run" in argv)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
