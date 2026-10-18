#!/usr/bin/env python3
"""The author's edits become voice rules, checked (STORYMAKER_AUTHORSHIP_PLAN.md AA.5).

  voice_rules.py check --edits EDITS.json [--overlay lint-rules.project.json] PROPOSAL.json [--json]
  voice_rules.py apply --voice voice.md --overlay lint-rules.project.json --edits EDITS.json \\
                       --accept ID[,ID...] --author-said "..." PROPOSAL.json

EDITS.json is what `storymaker.listEdits` returns (the whole reply works too). A rule cites the
author's own edits; a phrase rule's pattern must catch what the agent wrote in them and must not
flag anything the author wrote. `check` only reads. `apply` checks the rules the author chose
again, then adds a new version to voice.md naming the edits behind each rule, and the enforceable
rules to the overlay that `prose_lint.py --also` reads. Every rule is read from
story/voice/voice-rule-schema.json (History Writer's D7, for fiction). Exit 1 when any HARD rule
fires.
"""
import argparse
import datetime
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _story import STORY, finding, load_json, report  # noqa: E402
from prose_lint import DEFAULT_RULES, scope_of  # noqa: E402

HARD, SOFT = "hard", "soft"


def contract():
    return load_json(os.path.join(STORY, "voice", "voice-rule-schema.json"))


def edits_of(export):
    if isinstance(export, dict) and "edits" not in export and isinstance(export.get("result"), dict):
        export = export["result"]
    edits = (export or {}).get("edits") if isinstance(export, dict) else None
    return [e for e in edits if isinstance(e, dict) and e.get("id")] if isinstance(edits, list) else []


def shared_rule_ids(path=DEFAULT_RULES):
    return {r["id"] for r in (load_json(path) or {}).get("rules", [])}


def check(proposal, edits, c=None, taken=()):
    """Findings for a proposal. `taken`: rule ids already in use (the shared rules and the book's
    overlay)."""
    c = c or contract()
    out = []
    if not isinstance(proposal, dict) or not isinstance(proposal.get("rules"), list):
        return [finding("proposal-shape", HARD, "a proposal is {\"rules\": [...]}")]
    for k in proposal:
        if not k.startswith("_") and k not in c["proposalKeys"]:
            out.append(finding("proposal-shape", HARD, f"{k!r} is not a key a proposal has", k))
    by_id = {e["id"]: e for e in edits}
    author = [e for e in edits if e.get("source") == "author"]
    taken, seen = set(taken), set()
    for i, r in enumerate(proposal["rules"]):
        where = f"rules[{i}]"
        if not isinstance(r, dict):
            out.append(finding("rule-shape", HARD, "a rule is an object", where))
            continue
        bad = [k for k in r if not k.startswith("_") and k not in c["ruleKeys"]]
        missing = [k for k in c["requiredRuleKeys"] if k not in r]
        if bad or missing:
            out.append(finding("rule-shape", HARD, "; ".join(
                ([f"{', '.join(map(repr, bad))} not a key of a rule"] if bad else [])
                + ([f"missing {', '.join(missing)}"] if missing else [])), where))
            continue
        rid = r["id"]
        if not (isinstance(rid, str) and re.match(c["idPattern"], rid)):
            out.append(finding("rule-shape", HARD, f"id must match {c['idPattern']}", where))
            continue
        where = f"rules[{i}] {rid}"
        if rid in seen:
            out.append(finding("rule-duplicate", HARD, f"{rid!r} is proposed twice", where))
        elif rid in taken:
            out.append(finding("rule-exists", HARD, f"{rid!r} is already a rule; pick another id", where))
        seen.add(rid)
        if r["kind"] in c["refusedKinds"]:
            out.append(finding("kind-fact", HARD, c["refusedKinds"][r["kind"]], where))
            continue
        if r["kind"] not in c["kinds"] or r.get("in", "narration") not in c["scopes"] \
                or not (isinstance(r["say"], str) and 0 < len(r["say"].strip()) <= c["sayMaxChars"]):
            out.append(finding("rule-shape", HARD, f"kind is one of {', '.join(c['kinds'])}; say is the rule in "
                               f"words (at most {c['sayMaxChars']} characters); in is "
                               f"{' or '.join(c['scopes'])}", where))
            continue
        cited = r["edits"] if isinstance(r["edits"], list) else []
        unknown = [x for x in cited if x not in by_id]
        theirs = [by_id[x] for x in cited if x in by_id and by_id[x].get("source") == "author"]
        if unknown:
            out.append(finding("edit-unknown", HARD, f"no edit {', '.join(map(str, unknown))} in the edits", where))
        not_author = [x for x in cited if x in by_id and by_id[x].get("source") != "author"]
        if not_author:
            out.append(finding("edit-not-author", HARD, f"edit {', '.join(not_author)} is an accepted suggestion: "
                               "the agent's own text, not evidence of the author's voice", where))
        if len({e["id"] for e in theirs}) < c["minEdits"]:
            out.append(finding("too-few-edits", HARD, f"{len({e['id'] for e in theirs})} of the author's edits; a rule "
                               f"needs at least {c['minEdits']} pointing the same way", where))
        if "pattern" not in r:
            out.append(finding("unenforced", SOFT, "no pattern: recorded as a rule nobody's draft is checked for",
                               where))
            continue
        try:
            rx = re.compile(r["pattern"], re.I)
        except (re.error, TypeError) as e:
            out.append(finding("pattern-invalid", HARD, f"the pattern does not compile: {e}", where))
            continue
        caught = [e["id"] for e in theirs if rx.search(scope_of(e.get("before") or "", r))]
        if len(caught) < c["minEdits"]:
            out.append(finding("pattern-misses", HARD, f"the pattern catches {len(caught)} of the {len(theirs)} edits "
                               f"it cites; it must catch what the agent wrote in at least {c['minEdits']}", where))
        flagged = [e for e in author if rx.search(scope_of(e.get("after") or "", r))]
        if flagged:
            e = flagged[0]
            out.append(finding("pattern-flags-author", HARD, f"it would flag the author's own words in edit {e['id']} "
                               f"(“{(e.get('after') or '').strip()[:120]}”); a rule against their words is not "
                               "their voice", where))
    return out


def apply(proposal, edits, voice_path, overlay_path, accept, author_said, c=None, today=None):
    """(findings, summary). Writes nothing unless every accepted rule passes."""
    c = c or contract()
    rules = {r.get("id"): r for r in proposal.get("rules", []) if isinstance(r, dict)}
    unknown = [a for a in accept if a not in rules]
    if unknown:
        return [finding("accept-unknown", HARD, f"no rule {', '.join(unknown)} in the proposal")], None
    if not (author_said or "").strip():
        return [finding("author-said", HARD, "apply needs --author-said: the author's own words choosing these rules")], None
    overlay = load_json(overlay_path) if os.path.exists(overlay_path) else None
    overlay = overlay if isinstance(overlay, dict) else {
        "version": 1,
        "_comment": "This book's own lint rules: the voice rules its author accepted (story/voice/VOICE.md). "
                    "prose_lint.py --also reads this file.",
        "rules": []}
    chosen = [rules[a] for a in accept]
    findings = check({"rules": chosen}, edits, c, shared_rule_ids() | {r["id"] for r in overlay["rules"]})
    if any(f["severity"] == HARD for f in findings):
        return findings, None

    voice = _read(voice_path) if os.path.exists(voice_path) else (
        "# Voice\n\nThe rules this book's author has chosen from their own edits, newest last. "
        "\"Checked\" rules gate every draft (lint-rules.project.json); the others are for the writer to keep.\n")
    version = 1 + max([int(n) for n in re.findall(r"(?m)^## v(\d+)\b", voice)] or [0])
    by_id = {e["id"]: e for e in edits}
    today = today or datetime.date.today().isoformat()
    cited = sorted({x for r in chosen for x in r["edits"]})
    lines = [f"\n## v{version} — {today} — from {len(cited)} of the author's edits\n",
             f"The author: “{author_said.strip()}”\n"]
    for r in chosen:
        chapters = sorted({by_id[x].get("chapterTitle") or "?" for x in r["edits"] if x in by_id})
        how = "checked" if "pattern" in r else "not checked: no pattern can catch it"
        lines.append(f"- {r['say'].strip()} ({how}; from edits {', '.join(r['edits'])} in {', '.join(chapters)})")
    for r in chosen:
        if "pattern" in r:
            rule = {"id": r["id"], "severity": c["overlaySeverity"], "pattern": r["pattern"], "why": r["say"].strip(),
                    "fromEdits": r["edits"], "addedIn": f"v{version}"}
            if "in" in r:
                rule["in"] = r["in"]
            overlay["rules"].append(rule)
    _write(voice_path, voice.rstrip("\n") + "\n" + "\n".join(lines) + "\n")
    _write(overlay_path, json.dumps(overlay, indent=1, ensure_ascii=False) + "\n")
    checked = sum(1 for r in chosen if "pattern" in r)
    return findings, (f"voice.md v{version}: {len(chosen)} rule(s), {checked} checked; "
                      f"{os.path.basename(overlay_path)} now has {len(overlay['rules'])} rule(s)")


def _read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def _write(path, text):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(text)
    os.replace(tmp, path)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    k = sub.add_parser("check")
    k.add_argument("proposal")
    k.add_argument("--edits", required=True, help="storymaker.listEdits's result, saved as JSON")
    k.add_argument("--overlay", help="the book's lint-rules.project.json, if it has one")
    k.add_argument("--json", action="store_true")
    a = sub.add_parser("apply")
    a.add_argument("proposal")
    a.add_argument("--edits", required=True)
    a.add_argument("--voice", required=True, help="the book's voice.md")
    a.add_argument("--overlay", required=True, help="the book's lint-rules.project.json")
    a.add_argument("--accept", required=True, help="the rule ids the author kept, comma-separated")
    a.add_argument("--author-said", required=True)
    args = ap.parse_args(argv)
    proposal = load_json(args.proposal)
    edits = edits_of(load_json(args.edits))
    if not edits:
        print(f"{args.edits}: no edits (save storymaker.listEdits's result there)", file=sys.stderr)
        return 2
    if args.cmd == "check":
        overlay = load_json(args.overlay) if args.overlay else None
        overlay_ids = {r["id"] for r in (overlay or {}).get("rules", [])}
        findings = check(proposal, edits, taken=shared_rule_ids() | overlay_ids)
        if args.json:
            print(json.dumps({"ok": not any(f["severity"] == HARD for f in findings), "findings": findings}, indent=1,
                             ensure_ascii=False))
            return 1 if any(f["severity"] == HARD for f in findings) else 0
        return report(os.path.basename(args.proposal), findings)
    findings, summary = apply(proposal, edits, args.voice, args.overlay,
                              [x.strip() for x in args.accept.split(",") if x.strip()], args.author_said)
    code = report(os.path.basename(args.proposal), findings)
    if summary:
        print(summary)
    return code


if __name__ == "__main__":
    sys.exit(main())
