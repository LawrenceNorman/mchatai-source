#!/usr/bin/env python3
"""The book editor: the last read before the author's review (PLAYBOOK, "The book editor").

Lawrence, reading the pilot (2026-10-04): "Do we have an overall editor when all of the
sections are done to look at consistency and overall flow and tone?" The gates read one chapter
at a time and the audit checks one chapter's facts. This reads the BOOK, in the order a reader
meets it.

    editor.py check <story-dir>    Free, deterministic, whole-book findings, all advisory: the
                                   same thing said twice in the same words, matching sentences
                                   whose numbers disagree, a chapter out of scale with the rest,
                                   a chapter whose sentences drift from the book's, chapters
                                   that all open the same way.
    editor.py verify <story-dir>   Gates a fresh reader's notes (editor/notes.json) before they
                                   reach the author. A suggestion is dropped, with its reason,
                                   when its passage is not in the chapter as landed, when it
                                   alters quoted words, when it adds a name, number or date the
                                   chapter does not state, or when the changed chapter fails a
                                   gate the chapter passed. The rest go to
                                   editor/suggestions.json for storymaker.proposeSuggestion;
                                   notes without a replacement go to editor/letter.json.
    editor.py land <story-dir>     editor/suggestions.json into StoryMaker (proposeSuggestion
                                   through ./mchatai, no shell); what StoryMaker already holds is
                                   never sent twice.

The editor never rewrites. Every change is a suggestion the author accepts or rejects.
"""
import os
import re
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import Project, finding, load_json, report, save_json, thresholds, words  # noqa: E402
import cite  # noqa: E402

KINDS = ("flow", "tone", "consistency", "clarity", "repetition")
QUOTED = re.compile(r'"[^"\n]+"|“[^”\n]+”')
NUMBER = re.compile(r"\$?\d[\d,]*(?:\.\d+)?")
MONTHS = set("january february march april may june july august september october november december".split())


def cfg():
    defaults = {"repeatRunWords": 7, "repeatContentWords": 3, "similarSentence": 0.6, "balanceRatio": 2.0,
                "sentenceDrift": 0.35, "maxNotes": 15, "maxSuggestionsPerChapter": 4}
    return {**defaults, **(thresholds().get("editor") or {})}


# ── the book as a reader meets it ────────────────────────────────────────────

def book(project, landed=False):
    """[{n, title, prose, landed, storymaker}] in reading order. The prose is the gated text;
    `landed` (the text as it went into StoryMaker) needs book/manifest.json."""
    man = load_json(project.path("book", "manifest.json"), None)
    if man:
        rows = [(int(c["n"]), c.get("title"), c.get("file"), c.get("storymaker") or {}) for c in man.get("chapters", [])]
    elif landed:
        raise SystemExit("no book/manifest.json: run cite.py book first")
    else:
        rows = [(n, None, None, {}) for n in cite.book_numbers(project)]
    out = []
    for n, title, path, sm in rows:
        text = ""
        if path and os.path.exists(project.path(path)):
            with open(project.path(path), encoding="utf-8") as fh:
                text = fh.read()
        out.append({"n": n, "title": title or cite.chapter_heading(project, n),
                    "prose": (project.chapter(n) or {}).get("text", ""), "landed": text, "storymaker": sm})
    return out


def tokens(s):
    return [t for t in (w.strip(".,;:!?'’\"“”()[]—–-").lower() for w in s.split()) if t]


def content(ts):
    return [t for t in ts if t not in cite.STOP]


def common_run(a, b):
    """The longest run of words two sentences share, in order."""
    best, end = 0, 0
    prev = [0] * (len(b) + 1)
    for i in range(1, len(a) + 1):
        cur = [0] * (len(b) + 1)
        for j in range(1, len(b) + 1):
            if a[i - 1] == b[j - 1]:
                cur[j] = prev[j - 1] + 1
                if cur[j] > best:
                    best, end = cur[j], i
        prev = cur
    return a[end - best:end]


def numbers(s):
    return {m.group(0).rstrip(",") for m in NUMBER.finditer(s)}


# ── check: the whole book, free ──────────────────────────────────────────────

def repeat_findings(chapters, k):
    """The same thing said twice in the same words, one finding per pair of chapters, and
    near-identical sentences whose numbers conflict."""
    out = []
    order = {c["n"]: i for i, c in enumerate(chapters)}
    sents = []
    for c in chapters:
        for _, _, s in cite.flat_sentences(c["prose"]):
            ts = tokens(s)
            sents.append((c, s, ts, {" ".join(ts[i:i + 3]) for i in range(len(ts) - 2)}, set(content(ts))))
    pairs = {}
    for i, (ca, sa, ta, ga, wa) in enumerate(sents):
        for cb, sb, tb, gb, wb in sents[i + 1:]:
            if cb["n"] == ca["n"]:
                continue
            if len(ga & gb) >= k["repeatRunWords"] - 2:
                run = common_run(ta, tb)
                if len(run) >= k["repeatRunWords"] and len(content(run)) >= k["repeatContentWords"]:
                    pairs.setdefault((ca["n"], cb["n"]), []).append((len(run), " ".join(run), sa, sb))
            if wa and wb and len(wa & wb) / len(wa | wb) >= k["similarSentence"]:
                na, nb = numbers(sa), numbers(sb)
                if na - nb and nb - na:          # each states a number the other contradicts, not just one more detail
                    out.append(finding("numbers_disagree", "soft",
                                       f"{ca['title']} and {cb['title']} read as the same statement with different numbers "
                                       f"({', '.join(sorted(na - nb))} against {', '.join(sorted(nb - na))}); check they agree.",
                                       f"{sa}  |  {sb}"))
    titles = {c["n"]: c["title"] for c in chapters}
    for (a, b), runs in pairs.items():
        runs.sort(key=lambda r: -r[0])
        next_door = abs(order[b] - order[a]) == 1
        out.append(finding("told_twice", "soft",
                           f"{titles[a]} and {titles[b]} share {len(runs)} passage{'s' if len(runs) > 1 else ''} word for word; "
                           f"the longest: “{runs[0][1]}”." + (" A reader meets them one after the other." if next_door else "")
                           + " Say each once, or say it differently where it comes back.",
                           "  ||  ".join(f"{sa}  |  {sb}" for _, _, sa, sb in runs[:3])))
    return out


def balance_findings(chapters, k):
    """A chapter far longer or shorter than the middle one changes the book's pace."""
    body = [c for c in chapters if c["n"] != 0]
    if len(body) < 3:
        return []
    counts = {c["n"]: words(c["prose"]) for c in body}
    mid = statistics.median(counts.values())
    out = []
    for c in body:
        r = counts[c["n"]] / mid if mid else 1
        if r >= k["balanceRatio"] or r <= 1 / k["balanceRatio"]:
            out.append(finding("chapter_out_of_scale", "soft",
                               f"{c['title']} is {counts[c['n']]:,} words; the middle chapter is {mid:,.0f}. "
                               "A reader feels that as a change of pace: check it tells one stretch of the life, not two."
                               if r > 1 else
                               f"{c['title']} is {counts[c['n']]:,} words; the middle chapter is {mid:,.0f}. "
                               "Check it carries a stretch of the life the reader needs, not a fragment."))
    return out


def drift_findings(chapters, k):
    """A chapter whose sentences run much longer or shorter than the book's reads in another voice."""
    avg = {}
    for c in chapters:
        lens = [len(s.split()) for _, _, s in cite.flat_sentences(c["prose"])]
        if lens:
            avg[c["n"]] = sum(lens) / len(lens)
    if len(avg) < 3:
        return []
    mid = statistics.median(avg.values())
    return [finding("voice_drift", "soft",
                    f"{c['title']}'s sentences average {avg[c['n']]:.0f} words against {mid:.0f} for the book; "
                    "check its voice matches the chapters around it.")
            for c in chapters if c["n"] in avg and mid and abs(avg[c["n"]] - mid) / mid >= k["sentenceDrift"]]


def opening_shape(sentence):
    shape = []
    for t in sentence.split()[:2]:
        w = t.strip(",.;:").lower()
        shape.append("<year>" if re.fullmatch(r"1[5-9]\d\d|20\d\d", w) else
                     "<number>" if re.fullmatch(r"\d+", w) else "<month>" if w in MONTHS else w)
    return " ".join(shape)


def opening_findings(chapters):
    """Three or more chapters that open the same way read as a formula."""
    shapes = {}
    for c in chapters:
        first = next((s for _, _, s in cite.flat_sentences(c["prose"])), "")
        if c["n"] != 0 and first:
            shapes.setdefault(opening_shape(first), []).append(c["title"])
    return [finding("openings_alike", "soft",
                    f"{len(titles)} chapters open the same way (“{shape} …”): {', '.join(titles)}. Vary how they begin.")
            for shape, titles in shapes.items() if len(titles) >= 3]


def check_findings(project):
    k = cfg()
    chapters = [c for c in book(project) if c["prose"]]
    return (repeat_findings(chapters, k) + balance_findings(chapters, k)
            + drift_findings(chapters, k) + opening_findings(chapters))


# ── verify: a fresh reader's notes, gated before the author sees them ────────

class Patched(Project):
    """The project with one chapter's prose replaced, so the real gates can read the change."""

    def __init__(self, root, n, text):
        super().__init__(root)
        self._n, self._text = int(n), text

    def chapter(self, k):
        ch = super().chapter(k)
        if ch is not None and int(k) == self._n:
            ch = dict(ch, text=self._text)
        return ch


STARTERS = set("later afterwards then soon still yet meanwhile there here when while after before once now within "
               "during until since although though because so but and for nor or what which who how where why "
               "every each both all most many some none no not only even just".split())


def new_specifics(replacement, prose):
    """Numbers, and names, that the chapter never states. A capitalised word opening a sentence is
    allowed only when it is an ordinary word (a common opener, or one the chapter uses lower-case)."""
    def present(word, text):
        return re.search(r"(?<![A-Za-z])" + re.escape(word) + r"(?![A-Za-z])", text) is not None
    out = []
    for num in numbers(replacement):
        if num not in prose:
            out.append(num)
    lower = prose.lower()
    for m in re.finditer(r"[A-Z][a-zA-Z’'\-]*", replacement):
        before = replacement[:m.start()].rstrip()
        opens = not before or before[-1] in ".!?:“\"(" or before.endswith("—")
        word = m.group(0).rstrip("’'")
        if len(word) < 2 or present(word, prose):
            continue
        if opens and (word.lower() in cite.STOP or word.lower() in STARTERS or present(word.lower(), lower)):
            continue
        out.append(word)
    return out


def hard_set(findings):
    return {(f["rule"], f["message"]) for f in findings if f["severity"] == "hard"}


def judge(project, note, chapters, cache):
    """("keep" | "letter" | "drop", reason, extra) for one note."""
    import gate
    try:
        n = int(note.get("chapter"))
    except (TypeError, ValueError):
        return "drop", "it names no chapter number", {}
    c = chapters.get(n)
    if c is None:
        return "drop", f"chapter {n} is not in the book", {}
    if note.get("kind") not in KINDS:
        return "drop", f"its kind must be one of {', '.join(KINDS)}", {}
    quote, said = (note.get("quote") or "").strip(), (note.get("note") or "").strip()
    if not quote or not said:
        return "drop", "a note needs the passage and what a reader meets there", {}
    hits = c["landed"].count(quote)
    if hits != 1:
        return "drop", ("the passage is not in the chapter as landed; copy it exactly" if not hits
                        else "the passage occurs more than once; quote more of it"), {}
    rep = (note.get("replacement") or "").strip()
    if not rep:
        return "letter", "", {}
    if rep == quote:
        return "drop", "the replacement is the passage unchanged", {}
    if c["prose"].count(quote) != 1:
        return "drop", "the passage runs into a link, picture or map as landed; choose words outside them", {}
    for q in QUOTED.findall(quote):
        if q[1:-1] not in rep:
            qt, rt = tokens(q), tokens(rep)
            if {" ".join(qt[i:i + 3]) for i in range(len(qt) - 2)} & {" ".join(rt[i:i + 3]) for i in range(len(rt) - 2)}:
                return "drop", f"it alters quoted words ({q[:70]}); a quotation stays exactly as printed or goes whole", {}
    for q in QUOTED.findall(rep):
        if q[1:-1] not in c["prose"]:
            return "drop", f"it adds a quotation the chapter does not have ({q[:70]})", {}
    # A name or number the chapter's own claims quote from their sources is not a new fact: the
    # second story's editor could not spell out an address its claim's evidence gives (2026-10-04).
    evidence = " ".join(cl.get("evidence", "") for cl in cite.live_claims(project.chapter(n) or {}))
    added = new_specifics(rep, c["prose"] + "\n" + evidence)
    if added:
        return "drop", f"it adds {', '.join(added[:4])}, which neither the chapter nor its sources' quotes state; the editor changes words, never facts", {}
    if n not in cache:
        cache[n] = hard_set(gate.chapter_findings(project, n))
    after = gate.chapter_findings(Patched(project.root, n, c["prose"].replace(quote, rep, 1)), n)
    fresh = [f for f in after if f["severity"] == "hard" and (f["rule"], f["message"]) not in cache[n]]
    blocking = [f for f in fresh if not f["rule"].startswith("anchor")]
    if blocking:
        return "drop", f"the changed chapter fails {blocking[0]['rule']}: {blocking[0]['message'][:160]}", {}
    # A reworded sentence can lose the words a claim's note is keyed to. That is the claim's
    # anchor to move after the author accepts, not a reason to keep the change from the author.
    return "keep", "", {"reanchor": [f["message"][:160] for f in fresh]}


def cmd_verify(project):
    k = cfg()
    notes = load_json(project.path("editor", "notes.json"), None)
    if not isinstance(notes, list):
        print("editor/notes.json must be a list of notes (PLAYBOOK, the book editor)")
        return 2
    chapters = {c["n"]: c for c in book(project, landed=True)}
    cache, per = {}, {}
    kept, letter, dropped = [], [], []
    for i, note in enumerate(notes):
        if not isinstance(note, dict):
            dropped.append({"index": i, "reason": "a note must be an object"})
            continue
        verdict, why, extra = ("drop", f"over the book's cap of {k['maxNotes']} notes; keep the strongest", {}) \
            if i >= k["maxNotes"] else judge(project, note, chapters, cache)
        n = note.get("chapter")
        if verdict == "keep" and per.get(n, 0) >= k["maxSuggestionsPerChapter"]:
            verdict, why = "drop", f"over the cap of {k['maxSuggestionsPerChapter']} suggestions a chapter; keep the strongest"
        row = {"index": i, "chapter": n, "kind": note.get("kind"), "quote": (note.get("quote") or "")[:400]}
        if verdict == "keep":
            per[n] = per.get(n, 0) + 1
            c = chapters[int(n)]
            kept.append({**row, "title": c["title"], "project": c["storymaker"].get("project"),
                         "chapterID": c["storymaker"].get("chapterID"), "find": note["quote"].strip(),
                         "replacement": note["replacement"].strip(), "label": f"Editor: {note['kind']}",
                         "rationale": note["note"].strip(), **extra})
        elif verdict == "letter":
            letter.append({**row, "title": chapters[int(n)]["title"], "note": note["note"].strip()})
        else:
            dropped.append({**row, "reason": why})
    save_json(project.path("editor", "suggestions.json"), kept)
    save_json(project.path("editor", "letter.json"), letter)
    save_json(project.path("editor", "dropped.json"), dropped)
    print(f"editor verify: {len(kept)} suggestion(s) for StoryMaker, {len(letter)} note(s) for the letter, {len(dropped)} dropped")
    for s in kept:
        print(f"  keep  ch{s['chapter']} {s['kind']}: “{s['find'][:70]}” → “{s['replacement'][:70]}”"
              + (f"  (re-anchor after accepting: {len(s['reanchor'])})" if s.get("reanchor") else ""))
    for d in dropped:
        print(f"  drop  #{d['index']} ch{d.get('chapter')}: {d['reason']}")
    return 0


def cmd_land(project):
    """editor/suggestions.json into StoryMaker as proposeSuggestion calls, through ./mchatai with no
    shell in between: every editor so far hand-built these calls and fought the quoting, one with a
    script the run refused (2026-10-05). A suggestion StoryMaker already holds for the same chapter
    with the same replacement is not sent twice, so it is safe to run again."""
    import cite
    data = load_json(project.path("editor", "suggestions.json"), None)
    if data is None:
        print("no editor/suggestions.json: run editor.py verify first")
        return 2
    rows = data if isinstance(data, list) else data.get("suggestions", [])
    shim = cite.find_shim(project)
    if not shim:
        print("no ./mchatai shim above the story folder")
        return 2
    pid = (load_json(project.path("project.json"), {}) or {}).get("storymakerProject")

    def held():
        r = cite.storymaker(shim, "listSuggestions", project=pid)
        return ((r.get("result") or {}).get("suggestions") or []) if r.get("status") == "ok" else []

    def already(s, have):
        rep = re.sub(r"\s+", " ", s.get("replacement") or "").strip()
        for x in have:
            prev = re.sub(r"\s+", " ", (x.get("replacementPreview") or "").rstrip("…")).strip()
            if x.get("chapterID") == s.get("chapterID") and prev and rep.startswith(prev) \
                    and (x.get("label") or "") == (s.get("label") or x.get("label") or ""):
                return True
        return False

    have = held()
    sent = skipped = failed = 0
    for s in rows:
        if already(s, have):
            skipped += 1
            continue
        args = {"project": s.get("project") or pid, "chapter": s.get("chapterID"), "find": s.get("find") or s.get("quote"),
                "replacement": s.get("replacement")}
        for k in ("rationale", "label"):
            if s.get(k):
                args[k] = s[k]
        r = cite.storymaker(shim, "proposeSuggestion", **args)
        if r.get("status") == "ok":
            sent += 1
        else:
            failed += 1
            print(f"  {s.get('title') or s.get('chapter')}: NOT SENT — {(r.get('error') or r.get('output') or '')[:200]}")
    waiting = sum(1 for x in held() if x.get("status") == "pending")
    print(f"land: {sent} sent, {skipped} already in StoryMaker, {failed} not sent; {waiting} waiting for the author")
    return 1 if failed else 0


def main(argv):
    if len(argv) >= 3 and argv[1] == "check":
        return report("editor check", check_findings(Project(argv[2])))
    if len(argv) >= 3 and argv[1] == "verify":
        return cmd_verify(Project(argv[2]))
    if len(argv) >= 3 and argv[1] == "land":
        return cmd_land(Project(argv[2]))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
