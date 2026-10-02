#!/usr/bin/env python3
"""Derive the phone's drum styles (drums/style-beats.json) from the authored beats.

The beats live ONCE, in phrases/<style>/drums.json (the Mac's phrase engine reads the same files),
each labelled with the song part it serves (tools/label_drum_parts.py). This turns them into the
phone's step patterns: one string per voice, one digit per step (0 off, 1-9 = velocity in ninths of
127), so a ghost at 34 stays a ghost. Tempo and swing come from <style>/material.json; the kit, the
order and any phone-only style from drums/style-beats.config.json.

Mapping, and where it is lossy:
  voices   the Mac's 22 drum names fold onto the phone's 10 rows (kick2→kick, snare2→snare, hatPedal→
           hat, rideBell→ride, three toms and congas→tom, tambourine and maraca→shaker, clave and
           cowbell→rim). Flams keep the main stroke.
  steps    the finest grid a beat needs: 16ths (8ths when swung), triplets, 32nds or 12ths per beat.
  swing    the Mac delays the and of each beat by swing×¼ beat; the phone delays odd steps. On an
           8th grid that is exact (phone swing 0.5 + s/4); on a 16th grid the same delay lands on
           the odd 16ths instead (0.5 + s/2), the MPC convention.
Also writes the phone's bundled offline copy. Usage: python3 frameworks/loopstar/drums/tools/build_style_beats.py
"""
import json, math, pathlib
from fractions import Fraction

ROOT = pathlib.Path(__file__).resolve().parents[2]        # frameworks/loopstar
DRUMS = ROOT / "drums"
OUT = DRUMS / "style-beats.json"
BUNDLED = ROOT.parents[2] / "mchatai/mChatAI/mChatAI/LoopStar/Resources/loopstar_style_beats_fallback.json"
PARTS = ["intro", "verse", "pre", "chorus", "bridge", "breakdown", "outro", "fill"]
VOICE = {"kick": "kick", "kick2": "kick", "snare": "snare", "snare2": "snare", "rim": "rim", "clave": "rim",
         "cowbell": "rim", "clap": "clap", "hat": "closedHat", "hatPedal": "closedHat", "hatOpen": "openHat",
         "ride": "ride", "rideBell": "ride", "crash": "crash", "tomLow": "tom", "tomMid": "tom", "tomHigh": "tom",
         "conga": "tom", "congaLow": "tom", "tamb": "shaker", "maraca": "shaker", "shaker": "shaker"}
SCALE = {"snare2": 0.85, "hatPedal": 0.7, "rideBell": 1.08}
CHAR_VEL = {"X": 122, "x": 100, "o": 44}


def digit(vel):
    return 0 if vel <= 0 else max(1, min(9, round(vel * 9 / 127)))


def grid_of(events):
    g = 1
    for e in events:
        den = Fraction(e["b"]).limit_denominator(48).denominator
        g = g * den // math.gcd(g, den)
    return g


def convert(phrase, style_swing):
    grid = grid_of(phrase["events"])
    swung = phrase.get("swingSensitive", True) and style_swing > 0
    if grid <= 2 and swung:
        spb, swing = 2, 0.5 + style_swing / 4
    elif grid <= 4:
        spb, swing = 4, (0.5 + style_swing / 2) if swung else 0.5
    elif grid in (3, 6, 8, 12):
        spb, swing = grid, 0.5
    else:
        raise SystemExit(f"{phrase['id']}: grid {grid} is not representable")
    bars = phrase["lengthBars"]
    total = 4 * spb * bars
    rows = {}
    for e in phrase["events"]:
        voice = VOICE.get(e["drum"])
        if voice is None:
            raise SystemExit(f"{phrase['id']}: unknown drum {e['drum']}")
        step = round(e["b"] * spb)
        if not 0 <= step < total:
            continue
        vel = min(127, round(e["vel"] * SCALE.get(e["drum"], 1)))
        row = rows.setdefault(voice, [0] * total)
        row[step] = max(row[step], digit(vel))
    return {"id": phrase["id"], "part": phrase["part"], "name": phrase["name"], "energy": phrase["energy"],
            "bars": bars, "stepsPerBeat": spb, "swing": round(min(0.75, swing), 3),
            "rows": {v: "".join(map(str, r)) for v, r in sorted(rows.items())}}


def from_steps(p, beats):
    rows = {}
    for voice, s in p["rows"].items():
        clean = s.replace("|", "").replace(" ", "")
        rows[voice] = "".join(str(digit(CHAR_VEL.get(ch, 0))) for ch in clean)
    total = len(next(iter(rows.values())))
    return {"id": p["id"], "part": p["part"], "name": p["name"], "energy": p.get("energy", 0.5),
            "bars": total // (beats * 4), "stepsPerBeat": 4, "swing": 0.5, "rows": rows,
            "beatsPerBar": beats}


def main():
    config = json.loads((DRUMS / "style-beats.config.json").read_text())
    names = {s["id"]: s["name"] for s in json.loads((ROOT / "styles.json").read_text())["styles"]}
    styles = []
    group_of = {sid: g["name"] for g in config["groups"] for sid in g["styles"]}
    for sid in group_of:
        cfg = config["styles"][sid]
        material = ROOT / sid / "material.json"
        mat = json.loads(material.read_text()) if material.exists() else {}
        bpm = cfg.get("bpm") or (mat.get("tempo") or {}).get("default") or 100
        swing = float((mat.get("drums") or {}).get("swing", mat.get("swing", 0)) or 0)
        beats = cfg.get("beatsPerBar", 4)
        if "patterns" in cfg:
            patterns = [from_steps(p, beats) for p in cfg["patterns"]]
        else:
            phrases = json.loads((ROOT / "phrases" / sid / "drums.json").read_text())["phrases"]
            patterns = [convert(p, swing) for p in phrases]
        # By part, then as authored: each file lists a style's signature beat first, so Rock's
        # Verse 1 is the standard rock beat, not the thinner verse that sorts lower by energy.
        patterns.sort(key=lambda p: PARTS.index(p["part"]))
        style = {"id": sid, "name": cfg.get("name") or names.get(sid, sid.title()), "group": group_of[sid],
                 "kit": cfg["kit"], "bpm": bpm, "patterns": patterns}
        if beats != 4: style["beatsPerBar"] = beats
        if cfg.get("phrases"): style["phrases"] = cfg["phrases"]
        styles.append(style)
    doc = {"_comment": "GENERATED by tools/build_style_beats.py from phrases/<style>/drums.json, <style>/material.json "
                       "and style-beats.config.json. Do not edit by hand: edit the beats or the config and re-run. "
                       "Rows: one digit per step, 0 off, 1-9 = velocity in ninths of 127.",
           "schemaVersion": 1, "styles": styles}
    text = json.dumps(doc, separators=(",", ":"), ensure_ascii=False)
    OUT.write_text(text + "\n")
    bundled = {"_fallback_only": True, "_source_of_truth": "mchatai-source/frameworks/loopstar/drums/style-beats.json",
               "_comment": "FROZEN offline first-launch fallback, regenerated by tools/build_style_beats.py. Do not edit by hand.",
               "schemaVersion": 1, "styles": styles}
    if BUNDLED.parent.exists():
        BUNDLED.write_text(json.dumps(bundled, separators=(",", ":"), ensure_ascii=False) + "\n")
    count = sum(len(s["patterns"]) for s in styles)
    print(f"{len(styles)} styles, {count} patterns, {len(text) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
