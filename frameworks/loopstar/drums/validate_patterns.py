#!/usr/bin/env python3
"""Validate LoopStar drum content (Phase LI): every pattern names a real kit and real
voices, and every step string is exactly bars x beatsPerBar x 4 sixteenths of X/x/o/.
Run from anywhere: python3 frameworks/loopstar/drums/validate_patterns.py"""
import json, pathlib, sys

here = pathlib.Path(__file__).resolve().parent
kits = {p["id"] for p in json.loads((here / "drum-synth-presets.json").read_text())["presets"]}
voices = {"kick", "snare", "clap", "closedHat", "openHat", "rim", "tom", "shaker"}
problems = []
patterns = json.loads((here / "patterns.json").read_text())["patterns"]
ids = set()
for p in patterns:
    pid = p.get("id", "?")
    if pid in ids: problems.append(f"{pid}: duplicate id")
    ids.add(pid)
    if p.get("kit") not in kits: problems.append(f"{pid}: unknown kit {p.get('kit')}")
    bars = p.get("bars", 1); bpb = p.get("beatsPerBar", 4)
    if not (1 <= bars <= 4): problems.append(f"{pid}: bars {bars} outside 1-4")
    if not (0.5 <= p.get("swing", 0.5) <= 0.75): problems.append(f"{pid}: swing outside 0.5-0.75")
    for voice, steps in p.get("rows", {}).items():
        if voice not in voices: problems.append(f"{pid}: unknown voice {voice}")
        clean = steps.replace(" ", "").replace("|", "")
        if any(ch not in "Xxo.-_" for ch in clean): problems.append(f"{pid}/{voice}: bad characters")
        if len(clean) != bars * bpb * 4: problems.append(f"{pid}/{voice}: {len(clean)} steps, expected {bars * bpb * 4}")
print(f"{len(patterns)} patterns, {len(kits)} kits")
if problems:
    print("\n".join(problems)); sys.exit(1)
print("OK")
