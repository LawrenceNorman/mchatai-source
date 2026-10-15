#!/usr/bin/env python3
"""Check that every wisdom pack in wisdom/packs/ will load in mChatAI+.

    python3 wisdom/tools/check_packs.py

The app decodes each pack strictly. Until 2026-10-15 a single rule without
"severity" dropped its whole pack without a word, and seven packs (three.js,
matter.js, the raycaster, ...) never reached a build. The app now defaults a
missing severity, but a pack should still say what it means. This script fails
(exit 1) on anything that would not load or that relies on a default:

- a pack without packID, version, displayName, description, categories or keywords;
- a rule without id, rule or severity, or with an unknown severity;
- two rules in one pack with the same id.

Files without "guidelines" are not packs (share-stage.json and
storage-optimizer.json are other features' settings) and are skipped.
"""
import json
import sys
from pathlib import Path

PACKS = Path(__file__).resolve().parent.parent / "packs"
SEVERITIES = {"critical", "important", "high", "medium", "recommended", "low", "blocking", "error", "warning"}
PACK_FIELDS = ["packID", "version", "displayName", "description", "categories", "keywords"]


def check(path):
    problems = []
    try:
        pack = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return [f"not valid JSON: {e}"], False
    if not isinstance(pack, dict) or "guidelines" not in pack:
        return [], False
    for field in PACK_FIELDS:
        if field not in pack:
            problems.append(f"missing {field}")
    seen = set()
    for i, rule in enumerate(pack.get("guidelines") or [], start=1):
        where = f"rule {i} ({rule.get('id', '?')})" if isinstance(rule, dict) else f"rule {i}"
        if not isinstance(rule, dict):
            problems.append(f"{where}: not an object")
            continue
        for field in ("id", "rule", "severity"):
            if field not in rule:
                problems.append(f"{where}: missing {field}")
        if "severity" in rule and rule["severity"] not in SEVERITIES:
            problems.append(f"{where}: unknown severity {rule['severity']!r}")
        if rule.get("id") in seen:
            problems.append(f"{where}: duplicate id")
        seen.add(rule.get("id"))
    return problems, True


def main():
    failed = 0
    packs = 0
    for path in sorted(PACKS.glob("*.json")):
        problems, is_pack = check(path)
        if not is_pack and not problems:
            print(f"skip  {path.name} (not a pack)")
            continue
        packs += 1
        if problems:
            failed += 1
            print(f"FAIL  {path.name}")
            for p in problems:
                print(f"      {p}")
    print(f"{packs} packs checked, {failed} failing")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
