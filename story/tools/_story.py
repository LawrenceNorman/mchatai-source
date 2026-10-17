"""Shared helpers for StoryMaker's deterministic story tools (validate_pack, bible_check, prose_lint).

Standard library only, so a CLI session can run every tool with the system python3.

Content is read from the story/ folder this file sits in, so the tools work from the app's
source cache, a checkout, or a copy — wherever story/ is whole. Nothing here assumes fiction:
a biography or a military campaign is a bible with different kinds and stats
(docs/PIVOTAL_HISTORY_ENGINE.md §7).
"""
import json
import os
import re

TOOLS = os.path.dirname(os.path.abspath(__file__))
STORY = os.path.dirname(TOOLS)
SCHEMAS = os.path.join(STORY, "schemas")
DESIGNER = os.path.join(STORY, "designer")


def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def contract():
    """The pack contract (designer/pack-schema.json). Every rule validate_pack applies is read
    from here; the app's applyBiblePack verb reads the same file."""
    return load_json(os.path.join(DESIGNER, "pack-schema.json"))


def catalog():
    """{packID: pack} for every pack story/schemas/_index.json lists."""
    index = load_json(os.path.join(SCHEMAS, "_index.json"), {"packs": []})
    out = {}
    for entry in index.get("packs", []):
        pack = load_json(os.path.join(SCHEMAS, entry["file"]))
        if isinstance(pack, dict):
            out[pack.get("packID", entry["id"])] = pack
    return out


def finding(rule, severity, message, where=""):
    return {"rule": rule, "severity": severity, "message": message, "where": where}


def report(title, findings):
    """Print findings; return the process exit code (1 when any is hard)."""
    hard = [f for f in findings if f["severity"] == "hard"]
    soft = [f for f in findings if f["severity"] != "hard"]
    for f in hard + soft:
        mark = "✗" if f["severity"] == "hard" else "·"
        where = f" ({f['where']})" if f.get("where") else ""
        print(f"  {mark} [{f['rule']}]{where} {f['message']}")
    note = f" (+{len(soft)} note(s))" if soft else ""
    print(f"{title}: " + ("CLEAN" + note if not hard else f"{len(hard)} violation(s){note}"))
    return 1 if hard else 0


def key(text):
    """How a Who or Stat cell is matched: trimmed and lowercased (StoryBibleChanges.key)."""
    return re.sub(r"\s+", " ", str(text or "")).strip().lower()


# ── the Stat Changes fold ───────────────────────────────────────────────────────

def mode_of(word, modes):
    """'set' | 'change' | 'printed' | None, from the words pack-schema.json statChangeModes
    accepts. An empty word is a change, as in the app's grid."""
    w = key(word)
    if w == "":
        return "change"
    for mode, words in modes.items():
        if w in [key(x) for x in words]:
            return mode
    return None


def numeric_state(rows, as_of, modes):
    """One subject's one stat, as of a chapter: BibleResolver.numericState, line for line.

    rows: dicts with chapter, kind, amount and optional onlyWhen / untilChapter, in the order
    they were written (ties within a chapter keep that order, as createdAt does in the app).

      set      the value is now N
      change   add N; with onlyWhen it is held aside as a variant, never folded in
      printed  what the page shows: recorded with the total at that point, never added

    A temporary change (untilChapter; the grid calls it "Ends in chapter") counts only while
    as_of < untilChapter: poisoned in 5, cured in 7 → it counts in 5 and 6, not from 7 on. That is
    the app's ModifierExpiry.atChapter, evaluated at the ASKED chapter.

    Returns {"value", "variants": [(condition, value)], "assertions": [(chapter, printed, derived)]}.
    """
    live = [(i, r) for i, r in enumerate(rows) if r["chapter"] <= as_of]
    live.sort(key=lambda p: (p[1]["chapter"], p[0]))
    base = 0.0
    held, assertions = [], []
    for _, r in live:
        m = mode_of(r.get("kind"), modes)
        if m == "set":
            base = float(r["amount"])
        elif m == "change":
            until = r.get("untilChapter")
            if until is not None and not as_of < until:
                continue
            if r.get("onlyWhen"):
                held.append((r["onlyWhen"], float(r["amount"])))
            else:
                base += float(r["amount"])
        elif m == "printed":
            assertions.append((r["chapter"], float(r["amount"]), base))
    return {"value": base, "variants": [(c, base + v) for c, v in held], "assertions": assertions}
