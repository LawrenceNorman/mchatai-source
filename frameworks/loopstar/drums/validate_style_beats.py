#!/usr/bin/env python3
"""Validate the phone's drum styles (style-beats.json): every style has a verse, a chorus and a fill,
names a real kit, and every row is digits of exactly beatsPerBar x stepsPerBeat x bars.
Run from anywhere: python3 frameworks/loopstar/drums/validate_style_beats.py"""
import json, pathlib, sys

here = pathlib.Path(__file__).resolve().parent
kits = {p["id"] for p in json.loads((here / "drum-synth-presets.json").read_text())["presets"]}
voices = {"kick", "snare", "clap", "closedHat", "openHat", "rim", "tom", "shaker", "ride", "crash"}
parts = {"intro", "verse", "pre", "chorus", "bridge", "breakdown", "outro", "fill"}
doc = json.loads((here / "style-beats.json").read_text())
problems, ids = [], set()
for s in doc["styles"]:
    sid = s["id"]
    if s.get("kit") not in kits: problems.append(f"{sid}: unknown kit {s.get('kit')}")
    have = {p["part"] for p in s["patterns"]}
    for need in ("verse", "chorus", "fill"):
        if need not in have: problems.append(f"{sid}: no {need}")
    beats = s.get("beatsPerBar", 4)
    for p in s["patterns"]:
        pid = p["id"]
        if pid in ids: problems.append(f"{pid}: duplicate id")
        ids.add(pid)
        if p["part"] not in parts: problems.append(f"{pid}: unknown part {p['part']}")
        if not (1 <= p["bars"] <= 4): problems.append(f"{pid}: bars {p['bars']}")
        if not (1 <= p["stepsPerBeat"] <= 12): problems.append(f"{pid}: stepsPerBeat {p['stepsPerBeat']}")
        if not (0.5 <= p["swing"] <= 0.75): problems.append(f"{pid}: swing {p['swing']}")
        want = beats * p["stepsPerBeat"] * p["bars"]
        if not p["rows"]: problems.append(f"{pid}: no rows")
        for v, r in p["rows"].items():
            if v not in voices: problems.append(f"{pid}: unknown voice {v}")
            if len(r) != want or not r.isdigit(): problems.append(f"{pid}/{v}: {len(r)} steps, expected {want} digits")
size = (here / "style-beats.json").stat().st_size
print(f"{len(doc['styles'])} styles, {len(ids)} patterns, {size / 1024:.1f} KB")
if problems:
    print("\n".join(problems)); sys.exit(1)
print("OK")
