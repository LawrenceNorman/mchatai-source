#!/usr/bin/env python3
"""check.py — validate the TouchLanguage content folder.

    python3 touchlanguage/tools/check.py        (from the mchatai-source root, or anywhere)

Checks: every JSON parses; persona ids are unique and each persona's locale is in its
language's locale list; level and mode ids are unique; every mode's prompt file exists;
every {{placeholder}} in a prompt is in the allowed set; strings cover every language;
CSV row counts. Exit 1 on any problem.
"""
import csv, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = {
    "tutor.system.md": {"personaName", "personaRegion", "personaDetails", "target", "native",
                         "maxSentences", "correctionInstruction", "levelLabel", "levelCEFR",
                         "levelInstruction", "modeInstruction"},
    "turn.user.md": {"history", "inputNote", "transcript"},
    "mode.chat.md": {"target", "native"},
    "mode.story.md": {"target", "native"},
    "mode.vocabulary.md": {"target", "native", "wordHints"},
    "feedback.md": {"target", "native", "levelLabel", "transcript"},
    "translate.md": {"target", "native", "text"},
}
PLACEHOLDER = re.compile(r"\{\{\s*([A-Za-z0-9_.]+)\s*\}\}")
problems = []

def load(name):
    try:
        return json.loads((ROOT / name).read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        problems.append(f"{name}: {e}")
        return {}

personas = load("personas.json").get("personas", [])
levels = load("levels.json").get("levels", [])
modes = load("modes.json").get("modes", [])
speech = load("speech.json")
strings = load("strings.json").get("languages", {})
jobs = load("jobs.json").get("jobs", [])
load("manifest.json")
languages = speech.get("languages", {})

def unique(items, what):
    ids = [i.get("id") for i in items]
    if len(ids) != len(set(ids)) or any(not i for i in ids):
        problems.append(f"{what}: ids not unique or missing: {ids}")

unique(personas, "personas"); unique(levels, "levels"); unique(modes, "modes"); unique(jobs, "jobs")

for p in personas:
    lang = languages.get(p.get("language"))
    if not lang:
        problems.append(f"persona {p.get('id')}: language {p.get('language')!r} not in speech.json")
    elif p.get("locale") not in lang.get("locales", []):
        problems.append(f"persona {p.get('id')}: locale {p.get('locale')!r} not in {lang.get('locales')}")
    for k in ("name", "region", "details", "opening", "symbol"):
        if not p.get(k):
            problems.append(f"persona {p.get('id')}: missing {k}")

for lv in levels:
    for k in ("label", "cefr", "patienceSeconds", "maxSentences", "speakingRate", "vocabularyBand", "correction", "instruction"):
        pass
    if "correctionInstruction" not in lv:
        problems.append(f"level {lv.get('id')}: missing correctionInstruction (empty string is fine)")
    for k in ("label", "cefr", "patienceSeconds", "maxSentences", "speakingRate", "vocabularyBand", "correction", "instruction"):
        if lv.get(k) in (None, ""):
            problems.append(f"level {lv.get('id')}: missing {k}")
    if lv.get("correction") not in ("none", "gentle"):
        problems.append(f"level {lv.get('id')}: correction must be none|gentle")

for m in modes:
    pf = m.get("prompt", "")
    if not (ROOT / pf).exists():
        problems.append(f"mode {m.get('id')}: prompt file {pf} missing")
    if m.get("opening") not in ("persona", "instruction"):
        problems.append(f"mode {m.get('id')}: opening must be persona|instruction")
    if m.get("opening") == "instruction" and not m.get("openingInstruction"):
        problems.append(f"mode {m.get('id')}: openingInstruction missing")

for code, lang in languages.items():
    if lang.get("defaultLocale") not in lang.get("locales", []):
        problems.append(f"language {code}: defaultLocale not in locales")
    for ladder in ("asr", "tts"):
        rungs = lang.get(ladder, [])
        if not rungs:
            problems.append(f"language {code}: empty {ladder} ladder")
        for r in rungs:
            if not r.get("backend") or not r.get("condition"):
                problems.append(f"language {code}: {ladder} rung missing backend/condition")
            if r.get("backend", "").startswith("api:") and not r.get("model"):
                problems.append(f"language {code}: cloud {ladder} rung {r.get('backend')} has no model")
    if code not in strings:
        problems.append(f"language {code}: no strings")
    else:
        for k in ("didNotCatch", "tookTooLong", "paused", "nativeInputNote", "endOfChat", "wordLabOpening"):
            if not strings[code].get(k):
                problems.append(f"strings {code}: missing {k}")

prompt_count = 0
for name, allowed in ALLOWED.items():
    path = ROOT / "prompts" / name
    if not path.exists():
        problems.append(f"prompts/{name}: missing")
        continue
    prompt_count += 1
    text = path.read_text(encoding="utf-8")
    unknown = set(PLACEHOLDER.findall(text)) - allowed
    if unknown:
        problems.append(f"prompts/{name}: unknown placeholders {sorted(unknown)}")

for j in jobs:
    for k in ("taskCategory", "privacy", "engines", "cloudRole", "defaultMode", "typicalTokens"):
        if j.get(k) in (None, "", []):
            problems.append(f"job {j.get('id')}: missing {k}")
    if j.get("taskCategory") not in ("coding", "research", "creative", "analysis", "simple", "planning"):
        problems.append(f"job {j.get('id')}: taskCategory not one of AgentModelRouter.TaskCategory")

csv_counts = {}
for path in sorted((ROOT / "wordlists").glob("*/*.csv")):
    with path.open(encoding="utf-8", newline="") as f:
        rows = [r for r in csv.reader(f) if r]
    bad = [r for r in rows if len(r) != 3]
    if bad:
        problems.append(f"{path.relative_to(ROOT)}: {len(bad)} rows without 3 columns, e.g. {bad[0]}")
    csv_counts[str(path.relative_to(ROOT))] = len(rows)

summary = (f"{len(personas)} personas · {len(levels)} levels · {len(modes)} modes · "
           + " · ".join(f"{c}: asr {len(l.get('asr', []))} / tts {len(l.get('tts', []))}" for c, l in languages.items())
           + f" · {prompt_count} prompts · {len(jobs)} jobs · "
           + ", ".join(f"{k} {v} rows" for k, v in csv_counts.items()))
if problems:
    print("PROBLEMS:")
    for p in problems:
        print(" -", p)
    print(summary)
    sys.exit(1)
print("OK —", summary)
