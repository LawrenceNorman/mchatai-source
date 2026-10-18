#!/usr/bin/env python3
"""Check a next-chapter option against the book's bible (STORYMAKER_AUTHORSHIP_PLAN.md AA.1).

  bible_check.py --bible bible.json [--pack pack.json] OPTION.json [OPTION.json ...] [--json]

`bible.json` is what `storymaker.getBible` returns (every table, its columns and its rows; the
whole verb reply works too). `--pack` is the book's designed pack (story/designer): it holds each
number's min, max and direction when the bible's columns do not. Every rule is read from
story/planner/option-schema.json; the Stat Changes fold is the app's (story/tools/_story.py).

It refuses a name the bible does not have (declare a new one under `newEntities`), a who with no
row, a stat with no column, a change that takes a number past its min or max or against its
direction, a printed number the rows disagree with, a used row's cost left unpaid, and a
`ruleTested` that names no World Rules row. It does not judge whether a chapter honours a rule's
spirit; the continuity auditor does, once there is prose. Exit 1 when any HARD rule fires.
"""
import argparse
import difflib
import json
import os
import re
import sys
from collections import namedtuple

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _story import STORY, contract, finding, key, load_json, mode_of, report, series_findings  # noqa: E402

HARD, SOFT = "hard", "soft"
OPTION_SCHEMA = os.path.join(STORY, "planner", "option-schema.json")

Entry = namedtuple("Entry", "kind name table row")


def option_contract():
    return load_json(OPTION_SCHEMA)


def _num(text):
    try:
        return float(str(text).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


class Bible:
    """Lookups over a getBible export: rows by key or alias, number columns per table, the
    Stat Changes rows, and each number's min / max / direction."""

    def __init__(self, export, rules, pack=None):
        self.rules = rules
        self.tables = [t for t in (export or {}).get("tables", []) if isinstance(t, dict)]
        self.kinds = {t.get("kind") for t in self.tables if t.get("kind")}
        self.entries = {}    # key(name or alias) → Entry
        self.numbers = {}    # (kind, key(column name or packKey)) → column
        self.limits = {}     # (kind, key(column name or packKey)) → {min, max, direction}
        self.changes = []    # Stat Changes rows, in the fold's shape
        skip = {rules["planKind"], rules["changeKind"]}
        for t in self.tables:
            kind = t.get("kind")
            cols = [c for c in t.get("columns", []) if isinstance(c, dict)]
            if kind == rules["changeKind"]:
                self._read_changes(t, cols)
                continue
            if kind in skip:
                continue
            for c in cols:
                if c.get("kind") == "number":
                    lim = {k: c[k] for k in ("min", "max", "direction") if k in c}
                    for n in (c.get("name"), c.get("packKey")):
                        if n:
                            self.numbers.setdefault((kind, key(n)), c)
                            self.limits.setdefault((kind, key(n)), {}).update(lim)
            key_col = next((c.get("name") for c in cols if c.get("name") in rules["keyColumns"]), None)
            alias_cols = [c.get("name") for c in cols if c.get("name") in rules["aliasColumns"]]
            for r in t.get("rows", []):
                name = (r.get(key_col) or "").strip() if key_col else ""
                if not name:
                    continue
                entry = Entry(kind, name, t, r)
                self.entries.setdefault(key(name), entry)
                for a in alias_cols:
                    for alias in re.split(r"[,;]", r.get(a) or ""):
                        if alias.strip():
                            self.entries.setdefault(key(alias), entry)
        # The designed pack fills any min / max / direction the bible's columns do not carry.
        for kind, defs in ((pack or {}).get("fields") or {}).items():
            for f in defs if isinstance(defs, list) else []:
                if isinstance(f, dict) and f.get("kind") == "number":
                    for n in (f.get("name"), f.get("packKey")):
                        if n:
                            have = self.limits.setdefault((kind, key(n)), {})
                            for k in ("min", "max", "direction"):
                                if k in f and k not in have:
                                    have[k] = f[k]

    def _read_changes(self, table, cols):
        by = {c.get("packKey"): c.get("name") for c in cols if c.get("packKey")}
        for r in table.get("rows", []):
            def get(pk):
                return r.get(by.get(pk) or "")
            chapter, amount = _num(get("change.chapter")), _num(get("change.amount"))
            if chapter is None or amount is None:
                continue
            until = _num(get("change.until"))
            self.changes.append({"chapter": int(chapter), "who": (get("change.subject") or "").strip(),
                                 "stat": (get("change.stat") or "").strip(), "kind": get("change.mode") or "",
                                 "amount": amount, "onlyWhen": (get("change.condition") or "").strip() or None,
                                 "untilChapter": int(until) if until is not None else None})

    def find(self, name):
        return self.entries.get(key(name))

    def near(self, name):
        names = sorted({e.name for e in self.entries.values()})
        return difflib.get_close_matches(name, names, n=1, cutoff=self.rules["limits"]["nearMissCutoff"])

    def world_rules(self):
        return [r for t in self.tables if t.get("kind") == self.rules["worldRuleKind"] for r in t.get("rows", [])]

    def cost_of(self, entry):
        """The text in the row's cost column (a column named Cost, or a packKey ending in cost)."""
        spec = self.rules["costColumns"]
        for c in entry.table.get("columns", []):
            name, pk = c.get("name") or "", (c.get("packKey") or "").lower()
            if name in spec["names"] or any(pk.endswith(s.lower()) for s in spec["packKeySuffixes"]):
                value = (entry.row.get(name) or "").strip()
                if value:
                    return value
        return None


def _rule_names(rows, leading):
    """What a ruleTested may say: a rule's Category, or its name (the Rule text up to its first
    full stop, as the designer writes them: "The salt oath. Mechanism: …"), less a leading word."""
    def bare(text):
        words = key(text).rstrip(".").split(" ")
        return " ".join(words[1:] if len(words) > 1 and words[0] in leading else words)
    names = {}               # bare → as the bible writes it
    for r in rows:
        for text in ((r.get("Category") or "").strip(), (r.get("Rule") or "").split(".")[0].strip()):
            if text:
                names.setdefault(bare(text), text)
    return bare, names


def _check_shape(option, rules, out):
    if not isinstance(option, dict):
        out.append(finding("option-shape", HARD, "an option is a JSON object"))
        return False
    lim = rules["limits"]
    for k in option:
        if not k.startswith("_") and k not in rules["topLevelKeys"]:
            out.append(finding("option-shape", HARD, f"{k!r} is not a key an option has", k))
    for k in rules["requiredKeys"]:
        if k not in option:
            out.append(finding("option-shape", HARD, f"the option has no {k!r}", k))
    if "chapter" in option and not (_is_int(option["chapter"]) and option["chapter"] >= 1):
        out.append(finding("option-shape", HARD, "chapter must be a whole number from 1", "chapter"))
    title = option.get("title")
    if "title" in option and not (isinstance(title, str) and title.strip() and len(title) <= lim["titleMaxChars"]):
        out.append(finding("option-shape", HARD, f"title must be text of at most {lim['titleMaxChars']} characters",
                           "title"))
    if "ruleTested" in option and not (isinstance(option["ruleTested"], str) and option["ruleTested"].strip()):
        out.append(finding("option-shape", HARD, "ruleTested must name a World Rules row", "ruleTested"))
    beats = option.get("beats")
    if "beats" in option:
        if not (isinstance(beats, list) and all(isinstance(b, str) and b.strip() for b in beats)):
            out.append(finding("option-shape", HARD, "beats must be a list of sentences", "beats"))
        elif not lim["beatsMin"] <= len(beats) <= lim["beatsMax"]:
            out.append(finding("option-shape", HARD,
                               f"{len(beats)} beats; an option has {lim['beatsMin']} to {lim['beatsMax']}", "beats"))
        elif any(len(b) > lim["beatMaxChars"] for b in beats):
            out.append(finding("option-shape", HARD, f"a beat is over {lim['beatMaxChars']} characters", "beats"))
    if "summary" in option and not isinstance(option["summary"], str):
        out.append(finding("option-shape", HARD, "summary must be text", "summary"))
    for k in ("names", "gains", "losses", "threads"):
        if k in option and not (isinstance(option[k], list) and all(isinstance(v, str) for v in option[k])):
            out.append(finding("option-shape", HARD, f"{k} must be a list of text", k))
    for k, item_keys in (("uses", rules["useKeys"]), ("newEntities", rules["newEntityKeys"]),
                         ("statChanges", rules["statChangeKeys"])):
        items = option.get(k, [])
        if not (isinstance(items, list) and all(isinstance(i, dict) for i in items)):
            out.append(finding("option-shape", HARD, f"{k} must be a list of objects", k))
            continue
        for i, item in enumerate(items):
            bad = [ik for ik in item if ik not in item_keys]
            if bad:
                out.append(finding("option-shape", HARD, f"{', '.join(map(repr, bad))} not a key of {k}",
                                   f"{k}[{i}]"))
    for k in ("names", "uses", "statChanges"):
        if isinstance(option.get(k), list) and len(option[k]) > lim[k]:
            out.append(finding("option-shape", HARD, f"{len(option[k])} {k}; the limit is {lim[k]}", k))
    if any(f["rule"] == "option-shape" for f in out):
        return False
    for i, sc in enumerate(option.get("statChanges", [])):
        bad = []
        if not (isinstance(sc.get("who"), str) and sc["who"].strip()):
            bad.append("who")
        if not (isinstance(sc.get("stat"), str) and sc["stat"].strip()):
            bad.append("stat")
        if not _is_number(sc.get("amount")):
            bad.append("amount (a number)")
        if "untilChapter" in sc and not (_is_int(sc["untilChapter"]) and sc["untilChapter"] > option["chapter"]):
            bad.append("untilChapter (a chapter after this one)")
        if "onlyWhen" in sc and not (isinstance(sc["onlyWhen"], str) and sc["onlyWhen"].strip()):
            bad.append("onlyWhen (the condition, in words)")
        if bad:
            out.append(finding("option-shape", HARD, "missing or wrong: " + ", ".join(bad), f"statChanges[{i}]"))
    for i, use in enumerate(option.get("uses", [])):
        if not (isinstance(use.get("entity"), str) and use["entity"].strip()):
            out.append(finding("option-shape", HARD, "a use names its entity", f"uses[{i}]"))
    for i, e in enumerate(option.get("newEntities", [])):
        if not all(isinstance(e.get(k), str) and e[k].strip() for k in ("kind", "key")):
            out.append(finding("option-shape", HARD, "a new entity needs a kind and a key", f"newEntities[{i}]"))
    return not any(f["rule"] == "option-shape" for f in out)


def check(option, bible, rules, modes):
    """Findings for one option against one bible."""
    out = []
    if not _check_shape(option, rules, out):
        return out
    chapter = option["chapter"]
    new = {}
    tables = {t.get("kind"): t.get("name") for t in bible.tables
              if t.get("kind") not in (rules["planKind"], rules["changeKind"])}
    for i, e in enumerate(option.get("newEntities", [])):
        if e["kind"] not in tables:
            out.append(finding("unknown-kind", HARD, f"new {e['kind']!r}: no table of that kind takes new rows ("
                               + ", ".join(f"{k} = {n}" for k, n in sorted(tables.items())) + ")",
                               f"newEntities[{i}]"))
            continue
        if bible.find(e["key"]):
            out.append(finding("already-exists", SOFT, f"{e['key']!r} is already in the bible", f"newEntities[{i}]"))
            continue
        new[key(e["key"])] = Entry(e["kind"], e["key"].strip(), None, {})

    def resolve(name):
        return bible.find(name) or new.get(key(name))

    def unknown(rule, name, where, what):
        hint = bible.near(name)
        tip = f"; did you mean {hint[0]!r}?" if hint else "; check the spelling, or declare it under newEntities"
        out.append(finding(rule, HARD, f"{name!r} {what}{tip}", where))

    for name in option.get("names", []):
        if not resolve(name):
            unknown("unknown-name", name, "names", "is not in the bible")

    for i, use in enumerate(option.get("uses", [])):
        entry = resolve(use["entity"])
        if entry is None:
            unknown("unknown-name", use["entity"], f"uses[{i}]", "is not in the bible")
            continue
        cost = bible.cost_of(entry) if entry.table is not None else None
        if cost and not (use.get("pays") or "").strip():
            out.append(finding("cost-unpaid", HARD, f"{entry.name} costs “{cost}” — say how this chapter pays it",
                               f"uses[{i}]"))

    bare, names = _rule_names(bible.world_rules(), rules["ruleNameLeadingWords"])
    if bare(option["ruleTested"]) not in names:
        known = "; ".join(sorted(set(names.values()))) or "the bible has no World Rules yet"
        out.append(finding("unknown-rule", HARD, f"ruleTested {option['ruleTested']!r} names no World Rules row "
                           f"(a rule's name or category: {known})", "ruleTested"))

    # The planned Stat Changes, as series: one subject's one stat → the option's rows, in its order.
    series = {}
    for i, sc in enumerate(option.get("statChanges", [])):
        where = f"statChanges[{i}]"
        entry = resolve(sc["who"])
        if entry is None:
            unknown("unknown-who", sc["who"], where, "has no row in the bible")
            continue
        col = bible.numbers.get((entry.kind, key(sc["stat"])))
        if col is None and not any(key(r["stat"]) == key(sc["stat"]) for r in bible.changes):
            have = sorted({c.get("name") for (k, _), c in bible.numbers.items() if k == entry.kind})
            out.append(finding("unknown-stat", HARD, f"{sc['stat']!r} is not a number on {entry.name}'s table "
                               f"({', '.join(have) or 'it has none'})", where))
            continue
        if mode_of(sc.get("kind"), modes) is None:
            out.append(finding("change-mode", HARD, f"kind {sc.get('kind')!r} must be set, change or printed", where))
            continue
        if col is not None and col.get("changesOverChapters") is False:
            out.append(finding("static-stat", SOFT, f"{col.get('name')} does not change over chapters in this bible",
                               where))
        stat = col.get("name") if col else sc["stat"].strip()
        aliases = {key(stat)} | ({key(col["packKey"])} if col and col.get("packKey") else set())
        s = series.setdefault((entry.kind, key(entry.name), key(stat)),
                              {"entry": entry, "stat": stat, "aliases": aliases, "rows": []})
        s["rows"].append(dict(sc, chapter=chapter, _where=where))

    # The fold with and without this option: only what the option breaks is its finding.
    for (kind, _, stat_key), s in series.items():
        entry = s["entry"]

        def same(who):
            other = resolve(who)
            return other is not None and other.kind == entry.kind and key(other.name) == key(entry.name)
        history = [r for r in bible.changes if key(r["stat"]) in s["aliases"] and same(r["who"])]
        limits = bible.limits.get((kind, stat_key), {})
        before = {(rule, ch) for rule, ch, _, _ in series_findings(history, entry.name, s["stat"], limits, modes)}
        rows = history + s["rows"]
        for rule, ch, i, message in series_findings(rows, entry.name, s["stat"], limits, modes):
            if (rule, ch) not in before:
                out.append(finding(rule, HARD, message, rows[i]["_where"] if i >= len(history) else "statChanges"))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("options", nargs="+", help="option files (story/planner/option-schema.json)")
    ap.add_argument("--bible", required=True, help="storymaker.getBible's result, saved as JSON")
    ap.add_argument("--pack", help="the book's designed pack, for any min / max / direction the bible lacks")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    export = load_json(args.bible)
    if isinstance(export, dict) and "tables" not in export and isinstance(export.get("result"), dict):
        export = export["result"]
    if not (isinstance(export, dict) and isinstance(export.get("tables"), list)):
        print(f"{args.bible}: not a bible export (save storymaker.getBible's result there)", file=sys.stderr)
        return 2
    rules = option_contract()
    bible = Bible(export, rules, load_json(args.pack) if args.pack else None)
    modes = contract()["statChangeModes"]
    results = []
    for path in args.options:
        try:
            option = load_json(path)
        except ValueError as e:
            results.append((path, [finding("option-shape", HARD, f"not JSON: {e}")]))
            continue
        if option is None:
            results.append((path, [finding("option-shape", HARD, "no such file")]))
            continue
        results.append((path, check(option, bible, rules, modes)))
    failed = any(f["severity"] == HARD for _, fs in results for f in fs)
    if args.json:
        print(json.dumps([{"option": p, "ok": not any(f["severity"] == HARD for f in fs), "findings": fs}
                          for p, fs in results], indent=1, ensure_ascii=False))
    else:
        for path, fs in results:
            report(os.path.basename(path), fs)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
