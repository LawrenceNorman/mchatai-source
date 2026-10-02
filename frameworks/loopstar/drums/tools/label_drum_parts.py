#!/usr/bin/env python3
"""Label every authored LoopStar beat with the song part it serves, and fill the gaps.

Lawrence (2026-10-01): "if it could follow and be labeled for various song parts that might make
it easier see what each pattern represents" ... "add even more patterns if there are gaps that could
be filled easily and obviously composed" ... "fix the Mac's version so that this whole song part
info ... is matched to this new more understandable labeling".

Writes `part` onto every phrase in phrases/<style>/drums.json (the ONE source for both devices:
the Mac's phrase engine reads these files, and build_style_beats.py derives the phone's step
patterns from them). Part vocabulary: intro | verse | pre | chorus | bridge | breakdown | outro |
fill. `role` (comp | fill) is unchanged, so the Mac's generator behaves as before.

The labels are judgment, made from each beat's name, energy and the author's own description
("the neo-soul verse pocket", "the chorus lift", "Thin intro"). Gaps (a style with no intro,
bridge, breakdown or outro) are filled with the standard arrangement moves, derived from that
style's own beats and saying so in `provenance.derivedFrom`:
  intro     = the verse without its backbeat (kick, hats and percussion only)
  breakdown = the chorus with the kick out
  outro     = the verse thinned: hats and shakers on the quarter notes, the open hat gone
  bridge    = the verse in half-time (one backbeat, on beat 3), or on the ride when it already is
Re-running is safe: labels are set by id, and derived beats are replaced, never duplicated.
Usage: python3 frameworks/loopstar/drums/tools/label_drum_parts.py
"""
import json, pathlib, copy

ROOT = pathlib.Path(__file__).resolve().parents[2]          # frameworks/loopstar
PHRASES = ROOT / "phrases"
PARTS = ["intro", "verse", "pre", "chorus", "bridge", "breakdown", "outro", "fill"]
REQUIRED = ["intro", "verse", "chorus", "bridge", "breakdown", "outro"]

LABELS = {
    "altrnb": {"shaker-snap-01": "intro", "cross-stick-pocket-01": "verse", "sixteenth-hat-pocket-01": "verse",
               "drunk-lean-01": "pre", "open-hat-lift-01": "chorus", "half-time-drift-01": "bridge"},
    "altrock": {"quiet-verse-rim-01": "verse", "straight-eight-rock-01": "verse", "open-hat-drive-01": "pre",
                "half-time-chorus-01": "chorus", "stomp-two-bar-01": "chorus", "crash-ride-wall-01": "chorus"},
    "blues": {"lazy-lope-01": "intro", "chicago-shuffle-01": "verse", "slow-twelve-eight-01": "verse",
              "stomp-and-clap-01": "pre", "boogie-four-on-floor-01": "chorus", "texas-shuffle-01": "chorus",
              "stop-time-01": "breakdown"},
    "boombap": {"dusty-two-hit-01": "intro", "boom-bap-01": "verse", "drunk-nod-01": "verse", "skip-kick-01": "pre",
                "ghost-break-grid-01": "chorus", "jazz-loop-ride-01": "bridge"},
    "classical": {"orchestral-sparse-01": "intro", "timpani-pulse-01": "verse", "dactyl-ostinato-01": "verse",
                  "march-snare-ostinato-01": "pre", "repeated-sixteenth-chug-01": "chorus",
                  "driving-octave-pump-01": "chorus", "fate-cell-01": "bridge"},
    "dnb": {"liquid-ride-roller-01": "intro", "two-step-01": "verse", "sixteenth-hat-roller-01": "pre",
            "amen-break-01": "chorus", "jungle-roller-01": "chorus", "half-time-drop-01": "bridge",
            "breakdown-two-step-01": "breakdown"},
    "dubstep": {"deep-halfstep-01": "intro", "halfstep-01": "verse", "skank-rim-halfstep-01": "verse",
                "halfstep-ghost-kick-01": "pre", "drop-weight-01": "chorus", "two-step-flavored-01": "bridge"},
    "folk": {"claps-and-shaker-01": "intro", "brush-backbeat-01": "verse", "boom-chick-01": "verse",
             "stomp-and-tambourine-01": "pre", "stomp-drive-01": "chorus", "train-beat-01": "bridge"},
    "funk": {"second-line-strut-01": "intro", "on-the-one-01": "verse", "broken-displaced-kick-01": "verse",
             "ghost-16-pocket-01": "pre", "four-on-the-floor-funk-01": "chorus", "sixteenth-hat-drive-01": "chorus",
             "half-time-shuffle-01": "bridge"},
    "gfunk": {"two-note-menace-01": "intro", "laid-back-two-hit-01": "verse", "west-coast-bounce-01": "verse",
              "syncopated-kick-01": "pre", "shaker-bounce-01": "chorus", "live-band-strut-01": "bridge"},
    "grime": {"eski-skeleton-01": "intro", "displaced-snare-01": "verse", "broken-two-step-01": "verse",
              "gut-punch-01": "pre", "slam-grid-01": "chorus", "devil-mix-01": "breakdown"},
    "house": {"deep-ride-sparse-01": "intro", "four-on-the-floor-01": "verse", "909-sixteenth-hats-01": "pre",
              "jackin-kick-01": "chorus", "peak-time-01": "chorus", "garage-shuffle-01": "bridge",
              "breakdown-no-kick-01": "breakdown"},
    "jazz": {"brush-swirl-ballad-01": "intro", "two-feel-ride-01": "verse", "spang-a-lang-01": "verse",
             "triplet-comp-01": "chorus", "uptempo-bell-01": "chorus", "kick-bombs-01": "bridge"},
    "lofi": {"two-feel-drift-01": "intro", "soft-nod-01": "verse", "brushed-sway-01": "verse",
             "boom-bap-borrow-01": "pre", "dusty-16-nod-01": "chorus", "rim-click-groove-01": "bridge"},
    "metal": {"doom-crawl-01": "intro", "groove-backbeat-01": "verse", "reverse-gallop-toms-01": "verse",
              "gallop-01": "pre", "double-kick-16ths-01": "chorus", "blast-beat-01": "bridge",
              "half-time-breakdown-01": "breakdown"},
    "pop": {"thin-intro-01": "intro", "tambourine-backbeat-01": "verse", "half-time-modern-01": "verse",
            "syncopated-push-01": "pre", "four-on-floor-clap-01": "chorus", "disco-hat-drive-01": "chorus",
            "motown-stomp-01": "bridge"},
    "punk": {"palm-mute-verse-01": "verse", "straight-eight-drive-01": "verse", "d-beat-01": "pre",
             "chorus-crash-wall-01": "chorus", "skank-beat-01": "chorus", "ska-punk-upstroke-01": "bridge"},
    "reggae": {"rub-a-dub-one-drop-01": "intro", "one-drop-01": "verse", "one-drop-percussion-01": "verse",
               "flying-cymbal-01": "pre", "rockers-01": "chorus", "steppers-01": "chorus"},
    "rock": {"thin-verse-quarters-01": "verse", "standard-backbeat-01": "verse", "sixteenth-hat-drive-01": "pre",
             "half-time-chorus-01": "chorus", "four-on-floor-driver-01": "chorus", "ride-chorus-01": "chorus",
             "bo-diddley-clave-01": "bridge"},
    "soul": {"ballad-cross-stick-01": "verse", "stax-delayed-backbeat-01": "verse", "gospel-twelve-eight-01": "verse",
             "motown-stomp-01": "chorus", "motown-gallop-01": "chorus", "half-time-menace-01": "bridge",
             "stop-time-stabs-01": "breakdown"},
    "techno": {"rumble-ride-economy-01": "intro", "four-on-the-floor-909-01": "verse", "detroit-machine-funk-01": "verse",
               "rolling-sixteenth-hats-01": "pre", "peak-time-hard-01": "chorus", "broken-kick-tresillo-01": "bridge",
               "percussion-tension-01": "breakdown"},
    "trance": {"progressive-sparse-01": "intro", "rolling-kick-toms-01": "verse", "sixteenth-hat-roll-01": "pre",
               "uplifting-four-on-the-floor-01": "chorus", "climax-full-kit-01": "chorus",
               "dream-half-time-01": "bridge", "breakdown-no-kick-01": "breakdown"},
    "drill": {"bounce-01": "verse", "sliding-bounce-01": "verse", "hat-drive-01": "chorus"},
    "dancehall": {"dembow-rim-01": "verse", "dembow-01": "verse", "dembow-lift-01": "chorus"},
    "trap": {"sparse-menace-01": "intro", "half-time-core-01": "verse", "triplet-hat-01": "verse",
             "hat-roll-01": "pre", "double-clap-push-01": "chorus", "sliding-kick-01": "bridge"},
}

BACKBEAT = {"snare", "snare2", "clap", "rim"}
KICKS = {"kick", "kick2"}
TOMS = {"tomLow", "tomMid", "tomHigh", "conga", "congaLow"}
TIME = {"hat", "hatOpen", "hatPedal", "shaker", "tamb", "maraca", "ride", "rideBell"}


def ev(b, drum, vel, d=0.2, art=None):
    e = {"b": round(b, 4), "d": d, "drum": drum, "vel": vel}
    if art: e["art"] = art
    return e


def derived(style, part, source, name, events, energy, rule):
    return {"id": f"{style}.drums.{part}-derived-01", "name": name, "kind": "cell",
            "lengthBars": source["lengthBars"], "energy": round(max(0.05, min(0.95, energy)), 2),
            "role": "comp", "part": part, "worksOver": source.get("worksOver", ["static", "progression"]),
            "swingSensitive": source.get("swingSensitive", True),
            "provenance": {"inspiration": rule, "derivedFrom": source["id"]},
            "events": sorted(events, key=lambda e: (e["b"], e["drum"]))}


def intro_from(style, verse):
    events = [copy.deepcopy(e) for e in verse["events"] if e["drum"] not in BACKBEAT]
    return derived(style, "intro", verse, f"Intro: {verse['name']} before the backbeat",
                   events, verse["energy"] - 0.15,
                   f"the verse groove ({verse['name']}) with the backbeat held back: kick, hats and percussion only")


def breakdown_from(style, chorus):
    events = [copy.deepcopy(e) for e in chorus["events"] if e["drum"] not in KICKS | TOMS]
    return derived(style, "breakdown", chorus, f"Breakdown: {chorus['name']} with the kick out",
                   events, chorus["energy"] - 0.35,
                   f"the chorus groove ({chorus['name']}) with the kick pulled out, the classic breakdown")


def outro_from(style, verse):
    events = []
    for e in verse["events"]:
        if e["drum"] in TIME and abs(e["b"] - round(e["b"])) > 1e-6: continue
        if e["drum"] == "hatOpen": continue
        e = copy.deepcopy(e)
        if e["drum"] in TIME and round(e["b"]) % 2 == 1:
            e["vel"] = max(30, int(e["vel"] * 0.78))     # time leans on the One and three as it winds down
        events.append(e)
    return derived(style, "outro", verse, f"Outro: {verse['name']}, thinned",
                   events, verse["energy"] - 0.1,
                   f"the verse groove ({verse['name']}) winding down: hats and shakers on the quarter notes, the open hat gone")


def bridge_from(style, verse):
    bars = verse["lengthBars"]
    backbeats = [e for e in verse["events"] if e["drum"] in BACKBEAT and e.get("art") != "ghost"]
    on_two_four = [e for e in backbeats if abs((e["b"] % 4) - 1) < 1e-6 or abs((e["b"] % 4) - 3) < 1e-6]
    if on_two_four:
        loud = max(e["vel"] for e in on_two_four)
        drum = max(on_two_four, key=lambda e: e["vel"])["drum"]
        events = [copy.deepcopy(e) for e in verse["events"]
                  if not (e["drum"] in BACKBEAT and e.get("art") != "ghost")
                  and not (e["drum"] in KICKS and (e["b"] % 4) >= 2 - 1e-6)]
        for bar in range(bars):
            events.append(ev(bar * 4 + 2.0, drum, loud, 0.3, "accent"))
        return derived(style, "bridge", verse, f"Bridge: {verse['name']} in half-time", events, verse["energy"],
                       f"the verse groove ({verse['name']}) in half-time: one backbeat on beat 3, the kick on the One")
    events = [copy.deepcopy(e) for e in verse["events"] if e["drum"] not in {"hat", "hatOpen", "hatPedal"}]
    for bar in range(bars):
        for q in range(4):
            events.append(ev(bar * 4 + q, "ride", 96 if q % 2 == 0 else 82, 0.3))
    return derived(style, "bridge", verse, f"Bridge: {verse['name']} on the ride", events, verse["energy"] + 0.05,
                   f"the verse groove ({verse['name']}) moved from the hats to quarter notes on the ride")


def label_style(path):
    style = path.parent.name
    doc = json.loads(path.read_text())
    labels = LABELS.get(style, {})
    phrases = [p for p in doc["phrases"] if "-derived-" not in p["id"]]
    for p in phrases:
        if p["role"] == "fill":
            p["part"] = "fill"
            continue
        short = p["id"].split(".drums.")[1]
        p["part"] = labels.get(short) or p.get("part")
        if p["part"] not in PARTS:
            raise SystemExit(f"{p['id']}: no part label")
    by_part = {}
    for p in phrases:
        by_part.setdefault(p["part"], []).append(p)
    verses = sorted(by_part.get("verse", []), key=lambda p: p["energy"])
    choruses = sorted(by_part.get("chorus", []), key=lambda p: -p["energy"])
    assert verses and choruses, f"{style}: needs a verse and a chorus"
    added = []
    if "intro" not in by_part: added.append(intro_from(style, verses[0]))
    if "breakdown" not in by_part: added.append(breakdown_from(style, choruses[0]))
    if "outro" not in by_part: added.append(outro_from(style, verses[0]))
    if "bridge" not in by_part: added.append(bridge_from(style, verses[-1]))
    doc["phrases"] = phrases + added
    path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
    parts = sorted({p["part"] for p in doc["phrases"]}, key=PARTS.index)
    missing = [r for r in REQUIRED if r not in parts]
    print(f"{style:10} {len(phrases):2} labelled + {len(added)} derived ({', '.join(a['part'] for a in added) or '-'})"
          f"  parts: {' '.join(parts)}" + (f"  MISSING {missing}" if missing else ""))


if __name__ == "__main__":
    for path in sorted(PHRASES.glob("*/drums.json")):
        label_style(path)
