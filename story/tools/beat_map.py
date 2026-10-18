#!/usr/bin/env python3
"""Map a draft onto a story-structure beat pack, and check the map (STORYMAKER_AUTHORSHIP_PLAN.md AA.2).

  beat_map.py packs                                            every pack in story/canon/beats/, and the index
  beat_map.py check --manuscript FILE [--pack ID] MAP.json     a map an agent wrote (story/canon/MAPPING.md)
  add --json for findings and the report as JSON

The manuscript is what `storymaker.getOutline` returns (chapters with summary, notes and scenes)
or {"chapters": [{"title", "text"}]} put together from `storymaker.getChapter`. An outline is
placed by chapter (each chapter an equal share of the book); prose by its words.

A map gives each beat it found a chapter and a quote from that chapter, word for word. Refused:
a quote that is not in that chapter (the beat was paraphrased or invented), a beat or chapter
that does not exist, a malformed map. Reported, not refused: the beats the draft lacks (the
middle first), beats that land early or late, beats out of order. What is missing is computed
here, never taken from the agent. Every rule is read from story/canon/beat-pack-schema.json.
Exit 1 when any HARD rule fires.
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _story import STORY, finding, load_json, report  # noqa: E402

HARD, SOFT = "hard", "soft"
CANON = os.path.join(STORY, "canon")
BEATS = os.path.join(CANON, "beats")


def contract():
    return load_json(os.path.join(CANON, "beat-pack-schema.json"))


def catalog():
    """{packID: pack} for every pack the index lists."""
    index = load_json(os.path.join(BEATS, "_index.json"), {"packs": []})
    out = {}
    for entry in index.get("packs", []):
        pack = load_json(os.path.join(BEATS, entry["file"]))
        if isinstance(pack, dict):
            out[pack.get("packID", entry["id"])] = pack
    return out


def _is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


# ── packs ────────────────────────────────────────────────────────────────────

def validate_pack(pack, c=None):
    c = c or contract()
    lim, out = c["limits"], []
    if not isinstance(pack, dict):
        return [finding("pack-shape", HARD, "a pack is a JSON object")]
    for k in pack:
        if not k.startswith("_") and k not in c["topLevelKeys"]:
            out.append(finding("pack-shape", HARD, f"{k!r} is not a key a pack has", k))
    for k in c["requiredKeys"]:
        if k not in pack:
            out.append(finding("pack-shape", HARD, f"the pack has no {k!r}", k))
    if "packID" in pack and not (isinstance(pack["packID"], str) and re.match(c["idPattern"], pack["packID"])):
        out.append(finding("pack-id", HARD, f"packID must match {c['idPattern']}", "packID"))
    if not (isinstance(pack.get("displayName"), str) and pack["displayName"].strip()):
        out.append(finding("pack-shape", HARD, "displayName is the pack's name, in words", "displayName"))
    if not (isinstance(pack.get("summary"), str) and 0 < len(pack["summary"]) <= lim["summaryMaxChars"]):
        out.append(finding("pack-shape", HARD, f"summary is text of at most {lim['summaryMaxChars']} characters",
                           "summary"))
    if "ordered" in pack and not isinstance(pack["ordered"], bool):
        out.append(finding("pack-shape", HARD, "ordered is true or false", "ordered"))
    beats = pack.get("beats")
    if not isinstance(beats, list) or not all(isinstance(b, dict) for b in beats):
        out.append(finding("pack-shape", HARD, "beats is a list of objects", "beats"))
        return out
    if not lim["beatsMin"] <= len(beats) <= lim["beatsMax"]:
        out.append(finding("pack-limits", HARD, f"{len(beats)} beats; a pack has {lim['beatsMin']} to "
                           f"{lim['beatsMax']}", "beats"))
    seen, starts = set(), []
    for i, b in enumerate(beats):
        where = f"beats[{i}]"
        for k in b:
            if not k.startswith("_") and k not in c["beatKeys"]:
                out.append(finding("pack-shape", HARD, f"{k!r} is not a key a beat has", where))
        for k in c["requiredBeatKeys"]:
            if k not in b:
                out.append(finding("pack-shape", HARD, f"the beat has no {k!r}", where))
        bid = b.get("id")
        if not (isinstance(bid, str) and re.match(c["idPattern"], bid)):
            out.append(finding("beat-id", HARD, f"id must match {c['idPattern']}", where))
        elif bid in seen:
            out.append(finding("beat-duplicate", HARD, f"{bid!r} appears twice", where))
        seen.add(bid)
        if not (isinstance(b.get("name"), str) and 0 < len(b["name"].strip()) <= lim["nameMaxChars"]):
            out.append(finding("pack-shape", HARD, f"name is text of at most {lim['nameMaxChars']} characters", where))
        if not (isinstance(b.get("describe"), str) and 0 < len(b["describe"]) <= lim["describeMaxChars"]):
            out.append(finding("pack-shape", HARD, f"describe is text of at most {lim['describeMaxChars']} "
                               "characters", where))
        w = b.get("window")
        if not (isinstance(w, list) and len(w) == 2 and all(_is_number(x) for x in w) and 0 <= w[0] <= w[1] <= 1):
            out.append(finding("beat-window", HARD, "window is [start, end], fractions of the book with "
                               "0 <= start <= end <= 1", where))
        else:
            starts.append((w[0], i))
        look = b.get("lookFor", [])
        if not (isinstance(look, list) and all(isinstance(x, str) and x.strip() for x in look)
                and len(look) <= lim["lookForMax"]):
            out.append(finding("pack-shape", HARD, f"lookFor is a list of at most {lim['lookForMax']} signs, "
                               "in words", where))
    marks = [m.lower() for m in c.get("marksNotInNames", [])]
    shown = [("displayName", pack.get("displayName")), ("summary", pack.get("summary"))]
    shown += [("bestFor", x) for x in pack.get("bestFor") or []]
    for i, b in enumerate(beats):
        shown += [(f"beats[{i}]", b.get(k)) for k in ("name", "describe")]
        shown += [(f"beats[{i}]", x) for x in b.get("lookFor") or []]
    for where, text in shown:
        hit = next((m for m in marks if isinstance(text, str) and m in text.lower()), None)
        if hit:
            out.append(finding("pack-mark", HARD, f"{hit!r} is a title's mark; say where the structure comes from "
                               "in _lineage, not in what the author is shown", where))
    if pack.get("ordered"):
        for (a, i), (b, j) in zip(starts, starts[1:]):
            if b < a:
                out.append(finding("pack-order", HARD, f"an ordered pack's windows go backwards: beats[{j}] starts "
                                   f"at {b:g}, before beats[{i}] at {a:g}", f"beats[{j}]"))
    return out


def validate_index():
    index = load_json(os.path.join(BEATS, "_index.json"))
    out = []
    if not isinstance(index, dict) or not isinstance(index.get("packs"), list):
        return [finding("index", HARD, "story/canon/beats/_index.json must list its packs")]
    listed = set()
    for entry in index["packs"]:
        path = os.path.join(BEATS, entry.get("file", ""))
        listed.add(entry.get("file"))
        pack = load_json(path) if entry.get("file") else None
        if not isinstance(pack, dict):
            out.append(finding("index", HARD, f"{entry.get('file')!r} is listed but missing or unreadable"))
        elif pack.get("packID") != entry.get("id"):
            out.append(finding("index", HARD, f"{entry.get('file')}: packID {pack.get('packID')!r} is listed as "
                               f"{entry.get('id')!r}"))
    for name in sorted(os.listdir(BEATS)):
        if name.endswith(".json") and not name.startswith("_") and name not in listed:
            out.append(finding("index", HARD, f"{name} is not listed in _index.json"))
    return out


# ── the manuscript ───────────────────────────────────────────────────────────

def chapters_of(manuscript):
    """[(title, text, words)] and how they are placed ("chapters" or "words")."""
    if isinstance(manuscript, dict) and "chapters" not in manuscript and isinstance(manuscript.get("result"), dict):
        manuscript = manuscript["result"]
    rows = (manuscript or {}).get("chapters") if isinstance(manuscript, dict) else None
    if not isinstance(rows, list) or not rows:
        return [], "chapters"
    out, prose = [], all(isinstance(r, dict) and isinstance(r.get("text"), str) for r in rows)
    for r in rows:
        r = r if isinstance(r, dict) else {}
        if prose:
            text = r["text"]
        else:
            parts = [r.get("title"), r.get("summary"), r.get("notes")]
            for s in r.get("scenes") or []:
                if isinstance(s, dict):
                    parts += [s.get(k) for k in ("title", "goal", "conflict", "turn", "outcome")]
            text = "\n".join(p for p in parts if isinstance(p, str) and p.strip())
        out.append((r.get("title") or "", text, len(text.split())))
    return out, "words" if prose else "chapters"


def spans(chapters, basis):
    """Each chapter's [start, end) as fractions of the book."""
    n = len(chapters)
    if basis == "chapters" or not sum(w for _, _, w in chapters):
        return [(i / n, (i + 1) / n) for i in range(n)]
    total, at, out = sum(w for _, _, w in chapters), 0, []
    for _, _, w in chapters:
        out.append((at / total, (at + w) / total))
        at += w
    return out


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", str(text or "").lower()).strip("-")


def normalize(text):
    """How a quote is matched: case, curly quotes, dashes and spacing aside."""
    t = str(text or "").lower()
    for a, b in (("‘", "'"), ("’", "'"), ("“", '"'), ("”", '"'), ("—", "-"), ("–", "-")):
        t = t.replace(a, b)
    return re.sub(r"\s+", " ", t).strip()


# ── the map ──────────────────────────────────────────────────────────────────

def check(beat_map, pack, chapters, basis, c=None):
    """(findings, report) for one map of one pack on one manuscript."""
    c = c or contract()
    out = []
    if not isinstance(beat_map, dict):
        return [finding("map-shape", HARD, "a map is a JSON object")], {}
    for k in beat_map:
        if not k.startswith("_") and k not in c["mapKeys"]:
            out.append(finding("map-shape", HARD, f"{k!r} is not a key a map has", k))
    if beat_map.get("pack") not in (None, pack["packID"]):
        out.append(finding("map-pack", HARD, f"the map is for {beat_map.get('pack')!r}, checked against "
                           f"{pack['packID']!r}", "pack"))
    order = {b["id"]: i for i, b in enumerate(pack["beats"])}
    # The names writers usually use (the pack's internal _commonNames), so "all-is-lost" points
    # to the pack's own id.
    common = {slug(n): bid for bid, names in (pack.get("_commonNames") or {}).items() for n in names}
    common.update({slug(b["name"]): b["id"] for b in pack["beats"]})
    texts = [normalize(t) for _, t, _ in chapters]
    entries = beat_map.get("beats")
    if not isinstance(entries, list) or not all(isinstance(e, dict) for e in entries):
        out.append(finding("map-shape", HARD, "beats is a list of {beat, chapter, evidence}", "beats"))
        entries = []
    found = {}                                   # beat id → [chapter, …], valid entries only
    for i, e in enumerate(entries):
        where = f"beats[{i}]"
        extra = [k for k in e if not k.startswith("_") and k not in c["mapBeatKeys"]]
        if extra:
            out.append(finding("map-shape", HARD, f"{', '.join(map(repr, extra))} not a key of a mapped beat", where))
            continue
        bid, ch, quote = e.get("beat"), e.get("chapter"), e.get("evidence")
        if bid not in order:
            meant = common.get(slug(bid))
            out.append(finding("unknown-beat", HARD, f"{bid!r} is not a beat of {pack['displayName']}"
                               + (f"; did you mean {meant!r}?" if meant else f" ({', '.join(order)})"), where))
            continue
        if not (isinstance(ch, int) and not isinstance(ch, bool) and 1 <= ch <= len(chapters)):
            out.append(finding("unknown-chapter", HARD, f"chapter {ch!r}: the manuscript has chapters 1 to "
                               f"{len(chapters)}", where))
            continue
        if not (isinstance(quote, str) and quote.strip()):
            out.append(finding("evidence-not-found", HARD, "every mapped beat quotes its chapter", where))
            continue
        if len(quote.split()) > c["evidenceMaxWords"]:
            out.append(finding("evidence-length", HARD, f"{len(quote.split())} words; a quote is at most "
                               f"{c['evidenceMaxWords']}", where))
            continue
        if normalize(quote) not in texts[ch - 1]:
            out.append(finding("evidence-not-found", HARD, f"chapter {ch} does not say “{quote.strip()}”: quote it "
                               "word for word, or leave the beat out", where))
            continue
        found.setdefault(bid, []).append(ch)

    span = spans(chapters, basis)
    tol, (mid_lo, mid_hi) = c["tolerance"], c["middle"]
    rep = {"pack": pack["packID"], "displayName": pack["displayName"], "chapters": len(chapters), "basis": basis,
           "hits": [], "missing": [], "missingInMiddle": [], "early": [], "late": [], "outOfOrder": []}
    for b in pack["beats"]:
        lo, hi = b["window"]
        if b["id"] not in found:
            rep["missing"].append(b["id"])
            if mid_lo <= (lo + hi) / 2 <= mid_hi:
                rep["missingInMiddle"].append(b["id"])
            continue
        ch = min(found[b["id"]])
        start, end = span[ch - 1]
        rep["hits"].append({"beat": b["id"], "name": b["name"], "chapter": ch, "at": round(start, 3)})
        if end < lo - tol:
            rep["early"].append({"beat": b["id"], "chapter": ch, "window": [lo, hi]})
        elif start > hi + tol:
            rep["late"].append({"beat": b["id"], "chapter": ch, "window": [lo, hi]})
    if pack.get("ordered"):
        # Each beat once, with the beats this structure puts before it that the draft has later.
        first = {bid: min(chs) for bid, chs in found.items()}
        for b in pack["beats"]:
            if b["id"] not in first:
                continue
            ahead = [a["id"] for a in pack["beats"][:order[b["id"]]] if first.get(a["id"], 0) > first[b["id"]]]
            if ahead:
                rep["outOfOrder"].append({"beat": b["id"], "chapter": first[b["id"]], "before": ahead})
    return out, rep


def describe(rep, pack):
    """The report in the author's words."""
    names = {b["id"]: b["name"] for b in pack["beats"]}
    placed = "each chapter an equal share" if rep["basis"] == "chapters" else "placed by words"
    lines = [f"{rep['displayName']} on {rep['chapters']} chapter(s) ({placed})"]
    if rep["hits"]:
        lines.append("Has: " + " · ".join(f"{h['name']} (ch {h['chapter']})" for h in rep["hits"]))
    middle = [names[b] for b in rep["missingInMiddle"]]
    rest = [names[b] for b in rep["missing"] if b not in rep["missingInMiddle"]]
    if middle:
        lines.append("Missing in the middle: " + ", ".join(middle))
    if rest:
        lines.append(("Missing elsewhere: " if middle else "Missing: ") + ", ".join(rest))
    for key, word in (("early", "Early"), ("late", "Late")):
        for x in rep[key]:
            lo, hi = x["window"]
            lines.append(f"{word}: {names[x['beat']]} in chapter {x['chapter']} (usually {lo:.0%}–{hi:.0%} of the book)")
    for x in rep["outOfOrder"]:
        lines.append(f"Out of order: {names[x['beat']]} (ch {x['chapter']}) comes before "
                     + ", ".join(names[b] for b in x["before"]) + ", which this structure puts first")
    return lines


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("packs")
    p.add_argument("--json", action="store_true")
    k = sub.add_parser("check")
    k.add_argument("map")
    k.add_argument("--manuscript", required=True, help="storymaker.getOutline's result, or {chapters:[{title,text}]}")
    k.add_argument("--pack", help="a pack id from story/canon/beats/ (default: the map's own `pack`)")
    k.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    c = contract()

    if args.cmd == "packs":
        results = [(pid, validate_pack(pack, c)) for pid, pack in sorted(catalog().items())]
        results.append(("_index.json", validate_index()))
        if args.json:
            print(json.dumps([{"pack": n, "findings": fs} for n, fs in results], indent=1))
            return 1 if any(f["severity"] == HARD for _, fs in results for f in fs) else 0
        code = 0
        for name, fs in results:
            code |= report(name, fs)
        return code

    beat_map = load_json(args.map)
    chapters, basis = chapters_of(load_json(args.manuscript))
    if not chapters:
        print(f"{args.manuscript}: no chapters (save storymaker.getOutline's result there)", file=sys.stderr)
        return 2
    pid = args.pack or (beat_map or {}).get("pack")
    pack = catalog().get(pid)
    if pack is None:
        print(f"no beat pack {pid!r}; packs: {', '.join(sorted(catalog()))}", file=sys.stderr)
        return 2
    findings, rep = check(beat_map, pack, chapters, basis, c)
    failed = any(f["severity"] == HARD for f in findings)
    if args.json:
        print(json.dumps({"ok": not failed, "findings": findings, "report": rep}, indent=1, ensure_ascii=False))
        return 1 if failed else 0
    for line in describe(rep, pack) if rep else []:
        print(line)
    return report(os.path.basename(args.map), findings)


if __name__ == "__main__":
    sys.exit(main())
