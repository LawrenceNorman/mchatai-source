#!/usr/bin/env python3
"""The bible-pack gate: is this pack safe to apply to a project's bible?

  validate_pack.py PACK.json [PACK.json ...]     a catalog pack (story/schemas/) or a designed one
  validate_pack.py --catalog                     every pack story/schemas/_index.json lists, and the index
  validate_pack.py --transcript T.md PACK.json   also: every table and column name came from the author
  validate_pack.py --json ...                    findings as JSON, one object per pack

Every rule is read from story/designer/pack-schema.json, the same contract StoryMaker's
storymaker.applyBiblePack verb enforces before it writes anything. A pack that fails here is
refused there, whole: a bible is never half-applied.

A DESIGNED pack (one with a "designer" block, or --designer) must also cover every interview
axis and must not reuse a catalog pack's id. Nothing here assumes fiction: biography.json and a
campaign pack pass the same rules a LitRPG pack does.

It checks shape, names, limits, seed rows against their columns, and the pack's own Stat
Changes (a printed number that disagrees with its rows, a value outside a column's range, a
stat moving against its declared direction). It does not judge whether the design is good;
the author does. Exit 1 when any HARD rule fires; soft findings are notes.
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _story import (SCHEMAS, catalog, contract, finding, key, load_json,  # noqa: E402
                    mode_of, report, series_findings)

HARD, SOFT = "hard", "soft"


def _is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


class _Pack:
    """Lookups over one pack: its kinds, its columns per kind, its stats."""

    def __init__(self, pack, c):
        self.pack, self.c = pack, c
        self.system = c["systemKinds"]
        kinds = pack.get("entityKinds") if isinstance(pack.get("entityKinds"), list) else []
        self.declared = [k.get("kind") for k in kinds if isinstance(k, dict)]
        fields = pack.get("fields") if isinstance(pack.get("fields"), dict) else {}
        self.fields = {k: [f for f in (v if isinstance(v, list) else []) if isinstance(f, dict)]
                       for k, v in fields.items()}

    def known_kind(self, kind):
        return kind in self.declared or kind in self.system

    def columns(self, kind):
        """System columns (or Name, for a kind the pack declares) a seed row may fill by name."""
        if kind in self.system:
            return list(self.system[kind]["columns"])
        return [self.c["packKindKeyColumn"]]

    def key_column(self, kind):
        return self.system[kind]["keyColumn"] if kind in self.system else self.c["packKindKeyColumn"]

    def resolve(self, kind, ref):
        """A seed value's column: ('field', def) for a pack field, ('column', name) for a
        system column, or None."""
        for f in self.fields.get(kind, []):
            if ref == f.get("packKey"):
                return "field", f
        for f in self.fields.get(kind, []):
            if key(ref) == key(f.get("name")):
                return "field", f
        for col in self.columns(kind):
            if key(ref) == key(col):
                return "column", col
        return None

    def stat_candidates(self, ref):
        """Number fields a Stat Changes 'stat' could mean: (kind, field) pairs. A packKey is
        exact; a name may match one column per kind."""
        exact = [(k, f) for k, fs in self.fields.items() for f in fs if ref == f.get("packKey")]
        if exact:
            return exact
        return [(k, f) for k, fs in self.fields.items() for f in fs if key(ref) == key(f.get("name"))]


# ── the checks ────────────────────────────────────────────────────────────────

def _check_keys(obj, allowed, where, out, top=False):
    for k in obj:
        if k.startswith("_"):
            if not top:
                out.append(finding("nested-comment", HARD,
                                   f"comment key {k!r} below the top level — the app's decoder reads "
                                   "these objects as fixed-field; put comments at the top", where))
            continue
        if k not in allowed:
            out.append(finding("unknown-key", HARD, f"{k!r} is not a key this contract knows "
                               f"(allowed: {', '.join(allowed)})", where))


def _check_fields(p, c, out):
    pack = p.pack
    limits = c["limits"]
    name_rx = re.compile(c["nameRules"]["forbiddenPattern"])
    key_rx = re.compile(c["packKeyPattern"])
    seen_keys = {}
    if not isinstance(pack.get("fields"), dict):
        return
    for kind, defs in pack["fields"].items():
        where_kind = f"fields.{kind}"
        if not isinstance(defs, list):
            out.append(finding("field-shape", HARD, "a kind's fields must be a list", where_kind))
            continue
        if not p.known_kind(kind):
            out.append(finding("kind-undeclared", HARD,
                               f"fields for {kind!r}, which is neither declared in entityKinds nor a "
                               f"system table ({', '.join(c['systemKinds'])})", where_kind))
        if len(defs) > limits["fieldsPerKind"]:
            out.append(finding("limit-fields", HARD,
                               f"{len(defs)} columns on {kind!r}; the limit is {limits['fieldsPerKind']}",
                               where_kind))
        names = {key(n): n for n in p.columns(kind)}
        always = []
        for i, f in enumerate(defs):
            where = f"{where_kind}[{i}]"
            if not isinstance(f, dict):
                out.append(finding("field-shape", HARD, "a field must be an object", where))
                continue
            _check_keys(f, c["fieldKeys"], where, out)
            for req in c["requiredFieldKeys"]:
                if req not in f:
                    out.append(finding("missing-key", HARD, f"field has no {req!r}", where))
            pk, name, fk = f.get("packKey"), f.get("name"), f.get("kind")
            if isinstance(pk, str):
                where = f"{where_kind}.{pk}"
                if not key_rx.match(pk):
                    out.append(finding("field-key", HARD,
                                       f"packKey {pk!r} must look like 'pack.column' (letters, digits, dots)", where))
                if any(pk.startswith(r) for r in c["reservedKeyPrefixes"]):
                    out.append(finding("field-key-reserved", HARD,
                                       f"packKey {pk!r} uses a prefix the platform owns "
                                       f"({', '.join(c['reservedKeyPrefixes'])}); it would overwrite a core column",
                                       where))
                if pk in seen_keys:
                    out.append(finding("field-key-duplicate", HARD,
                                       f"packKey {pk!r} is used twice (also at {seen_keys[pk]})", where))
                seen_keys.setdefault(pk, where)
            elif "packKey" in f:
                out.append(finding("field-key", HARD, "packKey must be a string", where))
            if isinstance(name, str) and name.strip():
                if len(name) > c["nameRules"]["maxChars"]:
                    out.append(finding("field-name", HARD,
                                       f"name {name!r} is longer than {c['nameRules']['maxChars']} characters", where))
                if name_rx.search(name.strip()):
                    out.append(finding("field-name", HARD,
                                       f"name {name!r} reads as a slug; write it the way the author says it "
                                       "('Mana Regeneration Rate', never mana_regen)", where))
                if key(name) in names:
                    out.append(finding("field-name-duplicate", HARD,
                                       f"{kind!r} already has a column named {names[key(name)]!r}", where))
                names.setdefault(key(name), name)
            elif "name" in f:
                out.append(finding("field-name", HARD, "name must be a non-empty string", where))
            if "kind" in f and fk not in c["fieldKinds"]:
                out.append(finding("field-kind", HARD,
                                   f"kind {fk!r} is not one a pack may declare ({', '.join(c['fieldKinds'])})", where))
            tier = f.get("promptTier")
            if tier is not None and tier not in c["promptTiers"]:
                out.append(finding("field-tier", HARD, f"promptTier {tier!r} is not one of "
                                   f"{', '.join(c['promptTiers'])}", where))
            for b in ("aiVisible", "isTimeVarying"):
                if b in f and not isinstance(f[b], bool):
                    out.append(finding("field-bool", HARD, f"{b} must be true or false", where))
            if tier == "always":
                always.append(name)
                if f.get("aiVisible") is False:
                    out.append(finding("field-always-hidden", HARD,
                                       "promptTier 'always' with aiVisible false: the column would be "
                                       "promised to every prompt and shown to none", where))
            hint = f.get("llmHint")
            if hint is not None and (not isinstance(hint, str) or len(hint) > limits["hintMaxChars"]):
                out.append(finding("hint-length", HARD,
                                   f"llmHint must be text of at most {limits['hintMaxChars']} characters", where))
            target = f.get("targetKind")
            if target is not None:
                if fk != "link":
                    out.append(finding("field-target", HARD, "targetKind belongs only on a link column", where))
                elif not p.known_kind(target):
                    out.append(finding("field-target", HARD,
                                       f"targetKind {target!r} is not a table this pack or the bible has", where))
            if "unit" in f and fk != "number":
                out.append(finding("field-unit", HARD, "unit belongs only on a number column", where))
            opts = f.get("options")
            if fk in ("select", "multiSelect"):
                if not isinstance(opts, list) or not opts or not all(isinstance(o, str) and o.strip() for o in opts):
                    out.append(finding("field-options", HARD,
                                       f"a {fk} column needs options: a list of the choices, in the author's words",
                                       where))
                else:
                    if len({key(o) for o in opts}) != len(opts):
                        out.append(finding("field-options", HARD, "two options with the same name", where))
                    if len(opts) > limits["optionsPerField"]:
                        out.append(finding("limit-options", HARD,
                                           f"{len(opts)} options; the limit is {limits['optionsPerField']}", where))
            elif opts is not None:
                out.append(finding("field-options", HARD, "options belong only on a select or multiSelect column",
                                   where))
            for r in ("min", "max", "direction"):
                if r in f and fk != "number":
                    out.append(finding("field-range", HARD, f"{r} belongs only on a number column", where))
            for r in ("min", "max"):
                if r in f and not _is_number(f[r]):
                    out.append(finding("field-range", HARD, f"{r} must be a number", where))
            if _is_number(f.get("min")) and _is_number(f.get("max")) and f["min"] > f["max"]:
                out.append(finding("field-range", HARD, f"min {f['min']} is above max {f['max']}", where))
            if "direction" in f and f["direction"] not in c["directions"]:
                out.append(finding("field-range", HARD,
                                   f"direction must be one of {', '.join(c['directions'])}", where))
            if "direction" in f and fk == "number" and f.get("isTimeVarying") is not True:
                out.append(finding("field-range", HARD,
                                   "a direction only means something on a column that changes over chapters "
                                   "(isTimeVarying: true)", where))
        if len(always) > limits["alwaysTierFieldsPerKind"]:
            out.append(finding("tier-budget", HARD,
                               f"{len(always)} always-tier columns on {kind!r} ({', '.join(map(str, always))}); "
                               f"each goes into every prompt that mentions the row — the limit is "
                               f"{limits['alwaysTierFieldsPerKind']}", where_kind))


def _check_kinds(p, c, out):
    pack = p.pack
    kinds = pack.get("entityKinds")
    if not isinstance(kinds, list):
        if "entityKinds" in pack:
            out.append(finding("kind-shape", HARD, "entityKinds must be a list", "entityKinds"))
        return
    if len(kinds) > c["limits"]["kinds"]:
        out.append(finding("limit-kinds", HARD,
                           f"{len(kinds)} tables; the limit is {c['limits']['kinds']}", "entityKinds"))
    kind_rx = re.compile(c["kindPattern"])
    seen = set()
    for i, k in enumerate(kinds):
        where = f"entityKinds[{i}]"
        if not isinstance(k, dict):
            out.append(finding("kind-shape", HARD, "each entity kind must be an object", where))
            continue
        _check_keys(k, c["entityKindKeys"], where, out)
        name = k.get("kind")
        if not isinstance(name, str) or not kind_rx.match(name):
            out.append(finding("kind-id", HARD, f"kind {name!r} must be a short lowercase id", where))
            continue
        if name in c["reservedKinds"]:
            out.append(finding("kind-reserved", HARD,
                               f"{name!r} is a table the platform keeps (Stat Changes, Chapter Plans); a pack "
                               "cannot declare it (Stat Changes rows go in statChanges)", where))
        if name in seen:
            out.append(finding("kind-duplicate", HARD, f"{name!r} is declared twice", where))
        seen.add(name)
        if not p.fields.get(name) and not (pack.get("seedRows") or {}).get(name) and name not in c["systemKinds"]:
            out.append(finding("empty-kind", SOFT, f"{name!r} has no columns and no rows yet — "
                               "an empty table besides Name", where))


def _check_value(field, value, kinds_seen=None):
    """None when `value` fits the column, else why not."""
    fk = field.get("kind")
    if fk == "number":
        if not _is_number(value):
            return f"a number, not {value!r}"
        if _is_number(field.get("min")) and value < field["min"]:
            return f"at least {field['min']} (the column's min), not {value}"
        if _is_number(field.get("max")) and value > field["max"]:
            return f"at most {field['max']} (the column's max), not {value}"
        return None
    if fk == "checkbox":
        return None if isinstance(value, bool) else f"true or false, not {value!r}"
    if fk == "select":
        opts = [key(o) for o in field.get("options") or []]
        return None if isinstance(value, str) and key(value) in opts else \
            f"one of {', '.join(field.get('options') or [])}, not {value!r}"
    if fk == "multiSelect":
        opts = [key(o) for o in field.get("options") or []]
        ok = isinstance(value, list) and all(isinstance(v, str) and key(v) in opts for v in value)
        return None if ok else f"a list drawn from {', '.join(field.get('options') or [])}, not {value!r}"
    if fk == "link":
        names = value if isinstance(value, list) else [value]
        return None if names and all(isinstance(v, str) and v.strip() for v in names) else \
            "a name (or a list of names)"
    if fk == "date":
        return None if isinstance(value, str) and re.match(r"^\d{4}-\d{2}-\d{2}$", value) else \
            f"a date written YYYY-MM-DD, not {value!r} (or make the column a line)"
    return None if isinstance(value, str) else f"text, not {value!r}"


def _tracked(p):
    """packKeys statChanges.track resolves to (no findings; _check_changes reports those)."""
    sc = p.pack.get("statChanges")
    refs = sc.get("track") if isinstance(sc, dict) and isinstance(sc.get("track"), list) else []
    out = set()
    for ref in refs:
        nums = [f for _, f in (p.stat_candidates(ref) if isinstance(ref, str) else []) if f.get("kind") == "number"]
        if len({f.get("packKey") for f in nums}) == 1:
            out.add(nums[0]["packKey"])
    return out


def _check_seeds(p, c, out):
    seeds = p.pack.get("seedRows")
    tracked = _tracked(p)
    if seeds is None:
        return {}
    if not isinstance(seeds, dict):
        out.append(finding("seed-shape", HARD, "seedRows must be an object of kind → rows", "seedRows"))
        return {}
    keys_by_kind = {}
    for kind, rows in seeds.items():
        where_kind = f"seedRows.{kind}"
        if kind.startswith("_"):
            out.append(finding("nested-comment", HARD, f"comment key {kind!r} inside seedRows", where_kind))
            continue
        if not p.known_kind(kind):
            out.append(finding("seed-kind", HARD, f"rows for {kind!r}, which this pack does not declare and "
                               "the bible does not have", where_kind))
            continue
        if not isinstance(rows, list):
            out.append(finding("seed-shape", HARD, "a kind's seed rows must be a list", where_kind))
            continue
        if len(rows) > c["limits"]["seedRowsPerKind"]:
            out.append(finding("limit-seed", HARD, f"{len(rows)} rows; the limit is {c['limits']['seedRowsPerKind']} "
                               "— a designed pack is a starting point, not an import", where_kind))
        key_col = p.key_column(kind)
        seen = {}
        for i, row in enumerate(rows):
            where = f"{where_kind}[{i}]"
            if not isinstance(row, dict):
                out.append(finding("seed-shape", HARD, "a seed row must be an object", where))
                continue
            _check_keys(row, c["seedRowKeys"], where, out)
            k = row.get("key")
            if not isinstance(k, str) or not k.strip() or len(k) > c["limits"]["keyMaxChars"]:
                out.append(finding("seed-key", HARD,
                                   f"each row needs a key: its {key_col}, at most {c['limits']['keyMaxChars']} characters",
                                   where))
                continue
            where = f"{where_kind}.{k}"
            if key(k) in seen:
                out.append(finding("seed-key-duplicate", HARD, f"two rows keyed {k!r}", where))
            seen[key(k)] = k
            values = row.get("values", {})
            if not isinstance(values, dict):
                out.append(finding("seed-shape", HARD, "values must be an object of column → value", where))
                continue
            for ref, value in values.items():
                hit = p.resolve(kind, ref)
                if hit is None:
                    names = [f.get("name") for f in p.fields.get(kind, [])] + p.columns(kind)
                    out.append(finding("seed-column", HARD,
                                       f"no column {ref!r} on {kind!r} (columns: {', '.join(map(str, names))})", where))
                    continue
                what, col = hit
                if what == "column":
                    if key(col) == key(key_col) and key(str(value)) != key(k):
                        out.append(finding("seed-value", HARD,
                                           f"{key_col} is the row's key; it is {k!r} here, not {value!r}", where))
                    elif not isinstance(value, str):
                        out.append(finding("seed-value", HARD, f"{col} takes text, not {value!r}", where))
                    continue
                if col.get("packKey") in tracked:
                    # A second "current value" beside the event log: prompts read the cell, the
                    # fold reads the rows, and the two drift (STORYMAKER_HANDOFF.md §3 antipattern).
                    out.append(finding("seed-stat", HARD,
                                       f"{col.get('name')} is a tracked stat: give its starting value as a "
                                       f"chapter-0 set row in statChanges, not a cell", where))
                    continue
                why = _check_value(col, value)
                if why:
                    rule = "seed-range" if why.startswith(("at least", "at most")) else "seed-value"
                    out.append(finding(rule, HARD, f"{col.get('name')} must be {why}", where))
        keys_by_kind[kind] = set(seen)
    # Links: a name a seed row points at should be seeded too — or already be in the project,
    # which only the apply step can see. A note, not a refusal.
    for kind, rows in seeds.items():
        if not isinstance(rows, list) or not p.known_kind(kind):
            continue
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("values"), dict):
                continue
            for ref, value in row["values"].items():
                hit = p.resolve(kind, ref)
                if not hit or hit[0] != "field" or hit[1].get("kind") != "link" or not hit[1].get("targetKind"):
                    continue
                target = hit[1]["targetKind"]
                for name in (value if isinstance(value, list) else [value]):
                    if isinstance(name, str) and key(name) not in keys_by_kind.get(target, set()):
                        out.append(finding("seed-link", SOFT,
                                           f"{hit[1].get('name')} → {name!r} is not a seeded {target}; "
                                           "it must already be in the project", f"seedRows.{kind}.{row.get('key')}"))
    return keys_by_kind


def _check_changes(p, c, seed_keys, out):
    sc = p.pack.get("statChanges")
    if sc is None:
        return
    if not isinstance(sc, dict):
        out.append(finding("change-shape", HARD, "statChanges must be an object with track and rows",
                           "statChanges"))
        return
    _check_keys(sc, c["statChangeKeys"], "statChanges", out)
    tracked = {}
    for i, ref in enumerate(sc.get("track") or []):
        where = f"statChanges.track[{i}]"
        cands = p.stat_candidates(ref) if isinstance(ref, str) else []
        nums = [(k, f) for k, f in cands if f.get("kind") == "number"]
        if not nums:
            out.append(finding("stat-track", HARD,
                               f"{ref!r} is not a number column in this pack — Stat Changes folds numbers", where))
            continue
        if len({f.get("packKey") for _, f in nums}) > 1:
            out.append(finding("stat-ambiguous", HARD,
                               f"{ref!r} names columns on {', '.join(k for k, _ in nums)}; track it by packKey",
                               where))
            continue
        kind, f = nums[0]
        if f.get("isTimeVarying") is not True:
            out.append(finding("stat-track", HARD,
                               f"{f.get('name')} does not change over chapters (isTimeVarying is not true), "
                               "so it has no Stat Changes", where))
            continue
        tracked[f["packKey"]] = (kind, f)
    rows = sc.get("rows") or []
    if not isinstance(rows, list):
        out.append(finding("change-shape", HARD, "statChanges.rows must be a list", "statChanges.rows"))
        return
    if len(rows) > c["limits"]["statChangeRows"]:
        out.append(finding("limit-changes", HARD,
                           f"{len(rows)} rows; the limit is {c['limits']['statChangeRows']}", "statChanges.rows"))
    series = {}
    for i, r in enumerate(rows):
        where = f"statChanges.rows[{i}]"
        if not isinstance(r, dict):
            out.append(finding("change-shape", HARD, "a change row must be an object", where))
            continue
        _check_keys(r, c["statChangeRowKeys"], where, out)
        bad = []
        if not _is_int(r.get("chapter")) or r["chapter"] < 0:
            bad.append("chapter (a whole number, 0 for 'before the book')")
        if not isinstance(r.get("who"), str) or not r["who"].strip():
            bad.append("who")
        if not _is_number(r.get("amount")):
            bad.append("amount (a number)")
        if "untilChapter" in r and (not _is_int(r["untilChapter"]) or
                                    (_is_int(r.get("chapter")) and r["untilChapter"] <= r["chapter"])):
            bad.append("untilChapter (a chapter after this one)")
        if "onlyWhen" in r and not (isinstance(r["onlyWhen"], str) and r["onlyWhen"].strip()):
            bad.append("onlyWhen (the condition, in words)")
        if bad:
            out.append(finding("change-row", HARD, "missing or wrong: " + ", ".join(bad), where))
            continue
        mode = mode_of(r.get("kind"), c["statChangeModes"])
        if mode is None:
            out.append(finding("change-mode", HARD,
                               f"kind {r.get('kind')!r} must be set, change or printed", where))
            continue
        stat_ref = r.get("stat")
        cands = p.stat_candidates(stat_ref) if isinstance(stat_ref, str) else []
        hits = [f["packKey"] for _, f in cands if f.get("packKey") in tracked]
        if len(set(hits)) != 1:
            out.append(finding("change-stat", HARD,
                               f"stat {stat_ref!r} is not one of the tracked stats "
                               f"({', '.join(tracked[k][1]['name'] for k in tracked) or 'none'})", where))
            continue
        pk = hits[0]
        kind = tracked[pk][0]
        if seed_keys is not None and key(r["who"]) not in seed_keys.get(kind, set()):
            out.append(finding("change-who", SOFT,
                               f"{r['who']!r} is not a seeded {kind}; it must already be in the project", where))
        series.setdefault((key(r["who"]), pk), []).append(dict(r, _where=where))

    for (_, pk), rs in series.items():
        f = tracked[pk][1]
        for rule, _, i, message in series_findings(rs, rs[0]["who"].strip(), f.get("name"), f,
                                                   c["statChangeModes"]):
            out.append(finding(rule, HARD, message, rs[i]["_where"]))


def _check_catalog(p, c, cat, out, designed):
    pid = p.pack.get("packID")
    if designed and pid in cat:
        out.append(finding("catalog-id", HARD,
                           f"packID {pid!r} is a catalog pack's; a designed pack needs its own id "
                           "(it would shadow the catalog's)", "packID"))
    theirs = {}
    for other_id, other in cat.items():
        if other_id == pid:
            continue
        for kind, defs in (other.get("fields") or {}).items():
            for f in defs if isinstance(defs, list) else []:
                if isinstance(f, dict) and f.get("packKey"):
                    theirs[f["packKey"]] = (other_id, f.get("kind"), f.get("name"))
    for kind, defs in p.fields.items():
        for f in defs:
            hit = theirs.get(f.get("packKey"))
            if hit and hit[1] != f.get("kind"):
                out.append(finding("catalog-collision", HARD,
                                   f"packKey {f['packKey']!r} is {hit[0]}'s {hit[2]!r} ({hit[1]}); here it is "
                                   f"{f.get('kind')} — the two would be one column of two types",
                                   f"fields.{kind}.{f['packKey']}"))


def _check_designer(pack, c, out):
    d = pack.get("designer")
    if not isinstance(d, dict):
        out.append(finding("designer-block", HARD,
                           "a designed pack carries a designer block: interview, date, axesCovered", "designer"))
        return
    _check_keys(d, c["designerKeys"], "designer", out)
    covered = d.get("axesCovered") if isinstance(d.get("axesCovered"), list) else []
    missing = [a for a in c["axesRequired"] if a not in covered]
    if missing:
        out.append(finding("designer-axes", HARD,
                           f"the interview skipped {', '.join(missing)} — a blank axis is a guess the "
                           "author never made", "designer.axesCovered"))


# ── transcript provenance ─────────────────────────────────────────────────────

_SPEAKER = re.compile(r"^\s*(?:\*\*)?(Author|Designer)(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.*)$", re.I)


def author_text(transcript):
    """Everything the AUTHOR said in a designer transcript, lowercased. Turns start with
    'Author:' or 'Designer:' (bold allowed) and run to the next speaker or heading."""
    said, speaker = [], None
    for line in transcript.splitlines():
        m = _SPEAKER.match(line)
        if m:
            speaker = m.group(1).lower()
            line = m.group(2)
        elif line.lstrip().startswith("#"):
            speaker = None
            continue
        if speaker == "author":
            said.append(line)
    return re.sub(r"\s+", " ", re.sub(r"[“”\"'’*_`]", "", " ".join(said))).lower()


def _said(name, said):
    n = re.sub(r"\s+", " ", re.sub(r"[“”\"'’*_`]", "", name)).strip().lower()
    if not n:
        return True
    if re.search(r"(?<![a-z0-9])" + re.escape(n) + r"(?![a-z0-9])", said):
        return True
    if n.endswith("s") and re.search(r"(?<![a-z0-9])" + re.escape(n[:-1]) + r"(?![a-z0-9])", said):
        return True
    return False


def _check_provenance(p, transcript, out):
    said = author_text(transcript)
    if not said.strip():
        out.append(finding("name-provenance", SOFT, "the transcript has no Author: turns", "transcript"))
        return
    for k in p.pack.get("entityKinds") or []:
        if isinstance(k, dict) and k.get("kind") not in p.system and k.get("displayName") \
                and not _said(k["displayName"], said):
            out.append(finding("name-provenance", SOFT,
                               f"table {k['displayName']!r} is not in the author's words — the designer named it",
                               f"entityKinds.{k.get('kind')}"))
    for kind, defs in p.fields.items():
        for f in defs:
            if isinstance(f.get("name"), str) and not _said(f["name"], said):
                out.append(finding("name-provenance", SOFT,
                                   f"column {f['name']!r} is not in the author's words — the designer named it",
                                   f"fields.{kind}.{f.get('packKey')}"))


# ── entry points ──────────────────────────────────────────────────────────────

def validate(pack, *, contract_=None, catalog_=None, transcript=None, designed=None):
    """Findings for one pack (a dict). `designed` defaults to: the pack has a designer block."""
    c = contract_ or contract()
    cat = catalog() if catalog_ is None else catalog_
    out = []
    if not isinstance(pack, dict):
        return [finding("json", HARD, "a pack is a JSON object")]
    _check_keys(pack, c["topLevelKeys"], "pack", out, top=True)
    for req in c["requiredTopLevelKeys"]:
        if req not in pack:
            out.append(finding("missing-key", HARD, f"the pack has no {req!r}", "pack"))
    pid = pack.get("packID")
    if "packID" in pack and (not isinstance(pid, str) or not re.match(c["packIDPattern"], pid)):
        out.append(finding("pack-id", HARD, f"packID {pid!r} must be a short lowercase id (letters, digits, -)",
                           "packID"))
    if "fields" in pack and not isinstance(pack["fields"], dict):
        out.append(finding("field-shape", HARD, "fields must be an object of kind → columns", "fields"))
    p = _Pack(pack, c)
    _check_kinds(p, c, out)
    _check_fields(p, c, out)
    seed_keys = _check_seeds(p, c, out)
    _check_changes(p, c, seed_keys, out)
    if designed is None:
        designed = "designer" in pack
    _check_catalog(p, c, cat, out, designed)
    if designed:
        _check_designer(pack, c, out)
        tracked = _tracked(p)
        for kind, defs in p.fields.items():
            for f in defs:
                if f.get("kind") == "number" and f.get("isTimeVarying") is True and f.get("packKey") not in tracked:
                    out.append(finding("stat-untracked", SOFT,
                                       f"{f.get('name')} changes over chapters but is not in statChanges.track, "
                                       "so its changes have nowhere to be logged", f"fields.{kind}.{f.get('packKey')}"))
    if transcript is not None:
        _check_provenance(p, transcript, out)
    return out


def validate_index(cat_dir=SCHEMAS):
    """The catalog index must describe its packs truly: id, kinds, field count."""
    out = []
    index = load_json(os.path.join(cat_dir, "_index.json"))
    if not isinstance(index, dict):
        return [finding("index", HARD, "story/schemas/_index.json is missing or not JSON")]
    for entry in index.get("packs", []):
        path = os.path.join(cat_dir, entry.get("file", ""))
        pack = load_json(path)
        where = f"_index.{entry.get('id')}"
        if not isinstance(pack, dict):
            out.append(finding("index", HARD, f"{entry.get('file')} is missing or not JSON", where))
            continue
        if pack.get("packID") != entry.get("id"):
            out.append(finding("index", HARD, f"index id {entry.get('id')!r} ≠ packID {pack.get('packID')!r}", where))
        kinds = [k.get("kind") for k in pack.get("entityKinds", []) if isinstance(k, dict)]
        if "entityKinds" in entry and entry["entityKinds"] != kinds:
            out.append(finding("index", HARD, f"index lists kinds {entry['entityKinds']}, the pack has {kinds}", where))
        count = sum(len(v) for v in (pack.get("fields") or {}).values() if isinstance(v, list))
        if "fieldCount" in entry and entry["fieldCount"] != count:
            out.append(finding("index", HARD, f"index says {entry['fieldCount']} fields, the pack has {count}", where))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("packs", nargs="*", help="pack JSON files")
    ap.add_argument("--catalog", action="store_true", help="every catalog pack, and the index")
    ap.add_argument("--transcript", help="a designer transcript (Markdown with Author:/Designer: turns)")
    ap.add_argument("--designer", action="store_true", help="hold the pack to the designed-pack rules")
    ap.add_argument("--json", action="store_true", help="findings as JSON")
    args = ap.parse_args(argv)

    targets = list(args.packs)
    extra = {}
    if args.catalog:
        index = load_json(os.path.join(SCHEMAS, "_index.json"), {"packs": []})
        targets += [os.path.join(SCHEMAS, e["file"]) for e in index.get("packs", [])]
        extra["_index.json"] = validate_index()
    if not targets and not extra:
        ap.error("name a pack, or --catalog")
    transcript = None
    if args.transcript:
        with open(args.transcript, encoding="utf-8") as fh:
            transcript = fh.read()

    results = []
    for path in targets:
        try:
            pack = load_json(path)
        except (ValueError, OSError) as e:
            results.append((path, [finding("json", HARD, f"not readable JSON: {e}")]))
            continue
        if pack is None:
            results.append((path, [finding("json", HARD, "file not found")]))
            continue
        results.append((path, validate(pack, transcript=transcript, designed=True if args.designer else None)))
    results += list(extra.items())

    if args.json:
        print(json.dumps([{"pack": path, "ok": not any(f["severity"] == HARD for f in fs), "findings": fs}
                          for path, fs in results], indent=1, ensure_ascii=False))
        return 1 if any(f["severity"] == HARD for _, fs in results for f in fs) else 0
    code = 0
    for path, fs in results:
        code |= report(os.path.relpath(path) if os.path.exists(path) else path, fs)
    return code


if __name__ == "__main__":
    sys.exit(main())
