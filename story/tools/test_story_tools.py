#!/usr/bin/env python3
"""Tests for StoryMaker's deterministic story tools.

    python3 story/tools/test_story_tools.py        (or: python3 -m unittest discover story/tools)

Every gate is proven by a planted defect it must catch AND a clean case it must pass — a gate
that only ever passes, or only ever fails, proves nothing. The fixture book ("The Salt Road")
is fictional.
"""
import copy
import json
import os
import re
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _story  # noqa: E402
import prose_lint  # noqa: E402
import validate_pack  # noqa: E402

FIX = os.path.join(_story.DESIGNER, "fixtures")
BANKS = os.path.join(_story.DESIGNER, "question-banks")


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def hard(findings):
    return {f["rule"] for f in findings if f["severity"] == "hard"}


def soft(findings):
    return {f["rule"] for f in findings if f["severity"] != "hard"}


def cli(*args):
    return subprocess.run([sys.executable, os.path.join(HERE, "validate_pack.py"), *args],
                          capture_output=True, text=True)


# ── BD.1: the pack contract and its gate ──────────────────────────────────────

class CatalogPacksPass(unittest.TestCase):
    """The designer's contract must accept what the catalog already ships, unchanged
    (docs/PIVOTAL_HISTORY_ENGINE.md §7): it may not assume fiction."""

    def test_biography_unchanged_is_clean(self):
        f = validate_pack.validate(load(os.path.join(_story.SCHEMAS, "biography.json")))
        self.assertEqual(f, [], f)

    def test_litrpg_unchanged_is_clean(self):
        f = validate_pack.validate(load(os.path.join(_story.SCHEMAS, "litrpg.json")))
        self.assertEqual(f, [], f)

    def test_index_describes_its_packs(self):
        self.assertEqual(validate_pack.validate_index(), [])

    def test_catalog_cli_exits_zero(self):
        r = cli("--catalog")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_campaign_sketch_and_catalog_pack_pass(self):
        # The owner gave the go on 2026-10-16 (docs/PIVOTAL_HISTORY_ENGINE.md §8): the sketch became
        # story/schemas/campaign.json. The sketch stays as the designer's domain-agnostic fixture.
        f = validate_pack.validate(load(os.path.join(FIX, "campaign.sketch.json")))
        self.assertEqual(hard(f), set(), f)
        f = validate_pack.validate(load(os.path.join(_story.SCHEMAS, "campaign.json")))
        self.assertEqual(f, [], f)
        index = load(os.path.join(_story.SCHEMAS, "_index.json"))
        self.assertIn("campaign", [p["id"] for p in index["packs"]])


class DesignedFixturePasses(unittest.TestCase):
    def setUp(self):
        self.pack = load(os.path.join(FIX, "salt-road.pack.json"))
        self.transcript = read(os.path.join(FIX, "interview-salt-road.md"))

    def test_fixture_interview_output_is_clean_with_its_transcript(self):
        f = validate_pack.validate(self.pack, transcript=self.transcript)
        self.assertEqual(f, [], f)

    def test_cli_with_transcript_exits_zero(self):
        r = cli("--transcript", os.path.join(FIX, "interview-salt-road.md"), os.path.join(FIX, "salt-road.pack.json"))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("CLEAN", r.stdout)

    def test_transcript_covers_every_axis_in_order(self):
        axes = re.findall(r"^## Axis: (\w+)", self.transcript, re.M)
        self.assertEqual(axes, _story.contract()["axesRequired"])

    def test_json_output(self):
        r = cli("--json", os.path.join(FIX, "salt-road.pack.json"))
        self.assertEqual(r.returncode, 0)
        self.assertTrue(json.loads(r.stdout)[0]["ok"])


class PlantedPackIsRefused(unittest.TestCase):
    def test_every_planted_defect_is_named(self):
        pack = load(os.path.join(FIX, "planted-bad.pack.json"))
        found = hard(validate_pack.validate(pack))
        self.assertEqual(set(pack["_plantedRules"]) - found, set(), f"missed; found {found}")

    def test_cli_exits_one(self):
        r = cli(os.path.join(FIX, "planted-bad.pack.json"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("violation", r.stdout)


class EachRuleAlone(unittest.TestCase):
    """One defect planted in a copy of the clean fixture: that rule fires, and nothing else hard."""

    def setUp(self):
        self.clean = load(os.path.join(FIX, "salt-road.pack.json"))

    def plant(self, mutate, rule, severity="hard", **kw):
        pack = copy.deepcopy(self.clean)
        mutate(pack)
        f = validate_pack.validate(pack, **kw)
        bucket = hard(f) if severity == "hard" else soft(f)
        self.assertIn(rule, bucket, f)
        if severity == "hard":
            self.assertEqual(hard(f), {rule}, f"only {rule} should fire: {f}")
        return f

    def field(self, pack, kind, key):
        return next(f for f in pack["fields"][kind] if f["packKey"] == key)

    def test_unknown_top_level_key(self):
        self.plant(lambda p: p.update(feilds={}), "unknown-key")

    def test_missing_required_key(self):
        self.plant(lambda p: p.pop("packID"), "missing-key")

    def test_bad_pack_id(self):
        self.plant(lambda p: p.update(packID="Book Salt Road"), "pack-id")

    def test_designed_pack_cannot_take_a_catalog_id(self):
        self.plant(lambda p: p.update(packID="litrpg"), "catalog-id")

    def test_reserved_kind(self):
        self.plant(lambda p: p["entityKinds"].append({"kind": "change", "displayName": "Changes"}), "kind-reserved")

    def test_fields_for_an_undeclared_kind(self):
        self.plant(lambda p: p["fields"].update(ship=[{"packKey": "salt.hull", "name": "Hull", "kind": "line"}]),
                   "kind-undeclared")

    def test_duplicate_column_name_including_system_columns(self):
        self.plant(lambda p: p["fields"]["character"].append(
            {"packKey": "salt.description", "name": "Description", "kind": "text"}), "field-name-duplicate")

    def test_duplicate_pack_key(self):
        self.plant(lambda p: p["fields"]["guild"].append(
            {"packKey": "salt.guildSeat", "name": "Second Seat", "kind": "line"}), "field-key-duplicate")

    def test_unknown_field_kind(self):
        self.plant(lambda p: self.field(p, "guild", "salt.guildWants").update(kind="formula"), "field-kind")

    def test_target_kind_must_exist(self):
        self.plant(lambda p: self.field(p, "ware", "salt.heldBy").update(targetKind="dragon"), "field-target")

    def test_always_tier_cannot_be_hidden(self):
        self.plant(lambda p: self.field(p, "character", "salt.guildRank").update(aiVisible=False),
                   "field-always-hidden")

    def test_min_above_max(self):
        self.plant(lambda p: self.field(p, "location", "salt.toll").update(min=5, max=1), "field-range")

    def test_direction_needs_a_changing_number(self):
        self.plant(lambda p: self.field(p, "location", "salt.toll").update(direction="nonDecreasing"), "field-range")

    def test_unit_only_on_numbers(self):
        self.plant(lambda p: self.field(p, "guild", "salt.guildSeat").update(unit="silver"), "field-unit")

    def test_seed_value_type(self):
        self.plant(lambda p: p["seedRows"]["ware"].append({"key": "Lamp Oil", "values": {"Price": "three"}}),
                   "seed-value")

    def test_seed_select_option(self):
        self.plant(lambda p: p["seedRows"]["knack"][0]["values"].update(Rank="Grandmaster"), "seed-value")

    def test_seed_date_format(self):
        def m(p):
            p["fields"]["guild"].append({"packKey": "salt.founded", "name": "Founded", "kind": "date"})
            p["seedRows"]["guild"][0]["values"]["Founded"] = "spring"
        self.plant(m, "seed-value")

    def test_seed_range(self):
        self.plant(lambda p: p["seedRows"]["ware"].append({"key": "Lamp Oil", "values": {"Price": -1}})
                   or self.field(p, "ware", "salt.warePrice").update(min=0), "seed-range")

    def test_seed_key_duplicate(self):
        self.plant(lambda p: p["seedRows"]["guild"].append({"key": "lantern guild", "values": {}}),
                   "seed-key-duplicate")

    def test_seed_key_column_must_match_key(self):
        self.plant(lambda p: p["seedRows"]["character"][0]["values"].update(Name="Someone Else"), "seed-value")

    def test_seed_link_to_unseeded_name_is_a_note(self):
        self.plant(lambda p: p["seedRows"]["ware"][0]["values"].update({"Held By": "Nobody Seeded"}),
                   "seed-link", severity="soft")

    def test_change_mode(self):
        self.plant(lambda p: p["statChanges"]["rows"][3].update(kind="bump"), "change-mode")

    def test_change_stat_not_tracked(self):
        self.plant(lambda p: p["statChanges"]["rows"][3].update(stat="Stamina"), "change-stat")

    def test_change_row_missing_amount(self):
        self.plant(lambda p: p["statChanges"]["rows"][3].pop("amount"), "change-row")

    def test_change_range(self):
        self.plant(lambda p: p["statChanges"]["rows"].append(
            {"chapter": 2, "who": "Ilse Varro", "stat": "Favour", "kind": "change", "amount": -20}), "change-range")

    def test_change_direction(self):
        self.plant(lambda p: p["statChanges"]["rows"].extend([
            {"chapter": 2, "who": "Ilse Varro", "stat": "Guild Rank", "kind": "set", "amount": 3},
            {"chapter": 3, "who": "Ilse Varro", "stat": "Guild Rank", "kind": "change", "amount": -1}]),
            "change-direction")

    def test_printed_mismatch(self):
        self.plant(lambda p: p["statChanges"]["rows"][4].update(amount=14), "change-printed")

    def test_track_a_static_number(self):
        self.plant(lambda p: p["statChanges"]["track"].append("salt.toll"), "stat-track")

    def test_track_ambiguous_name(self):
        def m(p):
            p["fields"]["knack"].append({"packKey": "salt.knackCoin", "name": "Coin", "kind": "number",
                                         "isTimeVarying": True})
            p["statChanges"]["track"].append("Coin")
            for r in p["statChanges"]["rows"]:
                if r["stat"] == "Coin":
                    r["stat"] = "salt.coin"
        self.plant(m, "stat-ambiguous")

    def test_tracked_stat_seeded_as_a_cell(self):
        self.plant(lambda p: p["seedRows"]["character"][0]["values"].update(Coin=12), "seed-stat")

    def test_untracked_changing_number_is_a_note(self):
        self.plant(lambda p: p["statChanges"]["track"].remove("salt.favour") or
                   p["statChanges"]["rows"].pop(1), "stat-untracked", severity="soft")

    def test_skipped_axis(self):
        self.plant(lambda p: p["designer"]["axesCovered"].remove("change"), "designer-axes")

    def test_designer_named_a_column_the_author_never_said(self):
        self.plant(lambda p: self.field(p, "guild", "salt.guildWants").update(name="Ambitions"),
                   "name-provenance", severity="soft",
                   transcript=read(os.path.join(FIX, "interview-salt-road.md")))

    def test_comment_key_in_a_field(self):
        self.plant(lambda p: self.field(p, "guild", "salt.guildSeat").update(_why="x"), "nested-comment")

    def test_catalog_packkey_with_another_type(self):
        self.plant(lambda p: p["fields"]["character"].append(
            {"packKey": "litrpg.grit", "name": "Grit", "kind": "line"}), "catalog-collision")


class LimitsAreContent(unittest.TestCase):
    """The limits come from pack-schema.json, not from the tool: tightening the contract
    tightens the gate with no code change."""

    def test_a_smaller_seed_limit_in_the_contract_refuses_the_same_pack(self):
        c = _story.contract()
        self.assertEqual(hard(validate_pack.validate(load(os.path.join(FIX, "salt-road.pack.json")), contract_=c)),
                         set())
        c["limits"]["seedRowsPerKind"] = 2
        f = validate_pack.validate(load(os.path.join(FIX, "salt-road.pack.json")), contract_=c)
        self.assertIn("limit-seed", hard(f))

    def test_tier_budget_from_contract(self):
        c = _story.contract()
        c["limits"]["alwaysTierFieldsPerKind"] = 1
        f = validate_pack.validate(load(os.path.join(FIX, "salt-road.pack.json")), contract_=c)
        self.assertIn("tier-budget", hard(f))


# ── QG.1: the prose gate ──────────────────────────────────────────────────────

PROSE = os.path.join(_story.STORY, "fixtures", "prose")


class ProseLint(unittest.TestCase):
    def setUp(self):
        self.rules = prose_lint.load_rules()
        self.clean = read(os.path.join(PROSE, "ch01-clean.md"))
        self.planted = read(os.path.join(PROSE, "ch02-planted.md"))

    def rules_fired(self, findings, severity=None):
        return {f["rule"] for f in findings if severity is None or f["severity"] == severity}

    def test_clean_chapter_has_no_findings(self):
        self.assertEqual(prose_lint.chapter_findings(self.clean, self.rules), [])

    def test_every_planted_defect_fires(self):
        f = prose_lint.chapter_findings(self.planted, self.rules, "ch02")
        self.assertEqual(self.rules_fired(f, "hard"), {"breath_unknown", "tapestry", "stat_screens", "stat_screen_long"})
        self.assertEqual(self.rules_fired(f, "soft"), {"explaining_ending"})

    def test_a_cliche_in_dialogue_is_the_character_speaking(self):
        spoken = '"Little did they know," he said.'
        self.assertEqual(prose_lint.chapter_findings(spoken, self.rules), [])
        self.assertIn("little_did", self.rules_fired(prose_lint.chapter_findings("Little did they know.", self.rules)))

    def test_a_shared_run_is_one_repeat(self):
        f = prose_lint.repeat_findings([("ch01", self.clean), ("ch02", self.planted)], self.rules)
        self.assertEqual(len(f), 1, f)
        self.assertEqual(f[0]["rule"], "repeated_phrase")
        self.assertEqual(f[0]["severity"], "soft")

    def test_status_boxes_do_not_count_as_repeats(self):
        box = "[Ilse Varro — Guild Rank 1]\n[Coin: 12 silver from the guild ledger]\n"
        self.assertEqual(prose_lint.repeat_findings([("a", "One line.\n\n" + box), ("b", "Other.\n\n" + box)],
                                                    self.rules), [])

    def test_rules_are_data(self):
        """A phrase added to the rules file fires with no code change, and a rules file for
        another kind of book (no status boxes) checks none."""
        rules = json.loads(json.dumps(self.rules))
        rules["rules"].append({"id": "salt_road_word", "severity": "hard", "pattern": "\\bflats\\b", "why": "test"})
        self.assertIn("salt_road_word", self.rules_fired(prose_lint.chapter_findings(self.clean, rules)))
        rules.pop("statScreens")
        self.assertNotIn("stat_screens", self.rules_fired(prose_lint.chapter_findings(self.planted, rules)))

    def test_cli_exit_codes(self):
        tool = os.path.join(HERE, "prose_lint.py")
        clean = subprocess.run([sys.executable, tool, "chapter", os.path.join(PROSE, "ch01-clean.md")],
                               capture_output=True, text=True)
        self.assertEqual(clean.returncode, 0, clean.stdout)
        bad = subprocess.run([sys.executable, tool, "book", os.path.join(PROSE, "ch01-clean.md"),
                              os.path.join(PROSE, "ch02-planted.md")], capture_output=True, text=True)
        self.assertEqual(bad.returncode, 1)
        self.assertIn("repeated_phrase", bad.stdout)


# ── QG.2: agents pinned to Opus by content ─────────────────────────────────────

AGENTS = os.path.join(_story.STORY, "agents")


def frontmatter(path):
    text = read(path)
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        return None
    return dict(line.split(":", 1) for line in m.group(1).splitlines() if ":" in line)


class StoryAgents(unittest.TestCase):
    def test_every_agent_parses_and_pins_its_model(self):
        files = [n for n in os.listdir(AGENTS) if n.endswith(".md") and n != "README.md"]
        self.assertEqual(sorted(files), ["story-chapter-writer.md", "story-cold-reader.md", "story-continuity-auditor.md"])
        for name in files:
            meta = frontmatter(os.path.join(AGENTS, name))
            self.assertIsNotNone(meta, f"{name} has no frontmatter")
            meta = {k.strip(): v.strip() for k, v in meta.items()}
            self.assertEqual(meta.get("name"), name[:-3], name)
            self.assertTrue(meta.get("description"), name)
            self.assertEqual(meta.get("model"), "opus", f"{name}: writers and checkers stay on the strongest model")

    def test_the_app_does_not_name_the_agents(self):
        """The model is content: no Swift in the app checkout names these agents or their model."""
        app = os.path.join(os.path.dirname(os.path.dirname(_story.STORY)), "mchatai_macOS", "mChatAI", "mChatAI")
        if not os.path.isdir(app):
            self.skipTest("mchatai_macOS checkout not beside this one")
        for root, _, files in os.walk(app):
            for n in files:
                if n.endswith(".swift"):
                    self.assertNotIn("story-chapter-writer", read(os.path.join(root, n)), n)


# ── the content itself ────────────────────────────────────────────────────────

class DesignerContent(unittest.TestCase):
    def test_one_bank_per_required_axis_in_order(self):
        banks = [load(os.path.join(BANKS, n)) for n in sorted(os.listdir(BANKS)) if n.endswith(".json")]
        by_order = sorted(banks, key=lambda b: b["order"])
        self.assertEqual([b["axis"] for b in by_order], _story.contract()["axesRequired"])
        self.assertEqual([b["order"] for b in by_order], list(range(1, len(by_order) + 1)))

    def test_bank_questions_are_well_formed(self):
        seen = set()
        for name in os.listdir(BANKS):
            if not name.endswith(".json"):
                continue
            bank = load(os.path.join(BANKS, name))
            self.assertEqual(name, bank["axis"] + ".json")
            for k in ("goal", "fills", "questions", "doneWhen"):
                self.assertIn(k, bank, f"{name} has no {k}")
            for q in bank["questions"]:
                self.assertTrue(q["id"].startswith(bank["axis"] + "."), q["id"])
                self.assertNotIn(q["id"], seen)
                seen.add(q["id"])
                for k in ("ask", "why", "listenFor"):
                    self.assertTrue(q.get(k), f"{q['id']} has no {k}")
                    self.assertFalse(any(k2.startswith("_") for k2 in q), f"{q['id']}: comment keys at the top only")

    def test_interview_names_every_axis_and_the_gate(self):
        text = read(os.path.join(_story.DESIGNER, "INTERVIEW.md"))
        for axis in _story.contract()["axesRequired"]:
            self.assertIn(f"`{axis}`", text)
        self.assertIn("validate_pack.py", text)
        self.assertIn("storymaker.applyBiblePack", text)


class FoldMatchesTheApp(unittest.TestCase):
    """numeric_state is BibleResolver.numericState in Python. The expected values are the ones
    the Swift tests use (mChatAITests/Fixtures/numeric_ledger_fixture.json), computed outside
    Swift."""

    FIXTURE = os.path.join(os.path.dirname(os.path.dirname(_story.STORY)), "mchatai_macOS", "mChatAI",
                           "mChatAITests", "Fixtures", "numeric_ledger_fixture.json")

    def test_against_the_swift_fixture(self):
        if not os.path.exists(self.FIXTURE):
            self.skipTest("mchatai_macOS checkout not beside this one")
        fx = load(self.FIXTURE)
        rows = [{"chapter": r["atChapter"], "kind": r["mode"], "amount": r["magnitude"],
                 "onlyWhen": r.get("conditionPredicate")} for r in fx["rows"]]
        modes = _story.contract()["statChangeModes"]
        for ch, want in fx["expectedEffective"].items():
            self.assertEqual(_story.numeric_state(rows, int(ch), modes)["value"], want, f"chapter {ch}")
        st = _story.numeric_state(rows, 50, modes)
        mismatched = [(c, p, d) for c, p, d in st["assertions"] if p != d]
        self.assertEqual(mismatched, [(41, 99.0, 13.0)], "only the planted CON 99 disagrees")
        self.assertEqual(st["variants"], [("fist mode", 15.0)])

    def test_a_temporary_change_ends_at_its_until_chapter(self):
        """ModifierExpiry.atChapter(n).isActive(at: c) is c < n: gone AT chapter n."""
        modes = _story.contract()["statChangeModes"]
        rows = [{"chapter": 1, "kind": "set", "amount": 10},
                {"chapter": 2, "kind": "change", "amount": 3, "untilChapter": 4}]
        self.assertEqual(_story.numeric_state(rows, 3, modes)["value"], 13)
        self.assertEqual(_story.numeric_state(rows, 4, modes)["value"], 10)


if __name__ == "__main__":
    unittest.main(verbosity=1)
