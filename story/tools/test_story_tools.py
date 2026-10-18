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
import bible_check  # noqa: E402
import prose_lint  # noqa: E402
import validate_pack  # noqa: E402

FIX = os.path.join(_story.DESIGNER, "fixtures")
BANKS = os.path.join(_story.DESIGNER, "question-banks")
PLAN = os.path.join(_story.STORY, "fixtures", "planner")


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


# ── AA.1: a planned chapter, checked against the book's live bible ─────────────

def _table(export, kind):
    return next(t for t in export["tables"] if t["kind"] == kind)


class BibleCheck(unittest.TestCase):
    """bible_check reads a real storymaker.getBible export (fixtures/planner/salt-road-bible.json:
    the Salt Road pack applied to a throwaway book). option-good.json must pass; each rule must
    fire on its own defect."""

    @classmethod
    def setUpClass(cls):
        cls.export = load(os.path.join(PLAN, "salt-road-bible.json"))
        cls.pack = load(os.path.join(FIX, "salt-road.pack.json"))
        cls.rules = bible_check.option_contract()
        cls.modes = _story.contract()["statChangeModes"]
        cls.good = load(os.path.join(PLAN, "option-good.json"))

    def check(self, option, export=None, pack=True):
        bible = bible_check.Bible(export or self.export, self.rules, self.pack if pack else None)
        return bible_check.check(option, bible, self.rules, self.modes)

    def alone(self, mutate, pack=True):
        option = copy.deepcopy(self.good)
        mutate(option)
        return self.check(option, pack=pack)

    @staticmethod
    def change(stat, amount, kind="change", who="Ilse Varro", **more):
        return lambda o: o["statChanges"].append(dict(who=who, stat=stat, kind=kind, amount=amount, **more))

    def test_the_clean_option_passes_with_and_without_the_pack(self):
        self.assertEqual(self.check(self.good), [])
        self.assertEqual(self.check(self.good, pack=False), [])

    def test_every_planted_defect_is_named(self):
        bad = load(os.path.join(PLAN, "option-bad.json"))
        self.assertEqual(hard(self.check(bad)), set(bad["_plantedRules"]))

    def test_a_misspelt_name_offers_the_bibles_spelling(self):
        fs = self.alone(lambda o: o["names"].append("Teodor Haskell"))
        self.assertEqual(hard(fs), {"unknown-name"})
        self.assertIn("did you mean 'Teodor Hask'", fs[0]["message"])

    def test_an_alias_and_a_declared_new_name_resolve(self):
        export = copy.deepcopy(self.export)
        _table(export, "character")["rows"][0]["Aliases"] = "Ils, the apprentice"
        option = copy.deepcopy(self.good)
        option["names"] += ["Ils", "The Apprentice"]
        option["statChanges"][0]["who"] = "Ils"
        self.assertEqual(hard(self.check(option, export)), set(), "an alias is the same person, rows and all")
        del option["newEntities"]
        self.assertEqual(hard(self.check(option, export)), {"unknown-name"}, "Karsk passes only when declared")

    def test_a_cost_must_be_paid(self):
        self.assertEqual(hard(self.alone(lambda o: o["uses"][0].pop("pays"))), {"cost-unpaid"})
        self.assertEqual(hard(self.alone(lambda o: o["uses"].append({"entity": "Rock Salt"}))), set(),
                         "a row with no cost needs no payment")

    def test_a_rule_is_named_by_its_name_or_category_not_by_a_word_in_it(self):
        for said in ("The salt oath", "salt oath", "Oaths"):
            self.assertEqual(hard(self.alone(lambda o: o.update(ruleTested=said))), set(), said)
        for said in ("oath", "the tide oath", "Mechanism"):
            self.assertEqual(hard(self.alone(lambda o: o.update(ruleTested=said))), {"unknown-rule"}, said)

    def test_who_and_stat_must_exist_on_that_table(self):
        self.assertEqual(hard(self.alone(self.change("Coin", 1, who="Mara"))), {"unknown-who"})
        self.assertEqual(hard(self.alone(self.change("Stamina", 1))), {"unknown-stat"})
        self.assertEqual(hard(self.alone(self.change("Toll", 1))), {"unknown-stat"}, "Toll is a Location's number")
        self.assertEqual(hard(self.alone(self.change("Coin", 1, kind="minus"))), {"change-mode"})

    def test_range_and_direction(self):
        self.assertEqual(hard(self.alone(self.change("Coin", -20))), {"change-range"})
        self.assertEqual(hard(self.alone(self.change("Coin", -20), pack=False)), set(),
                         "no min in the bible or a pack: nothing to hold it to")
        self.assertEqual(hard(self.alone(self.change("Favour", 11, kind="set"))), {"change-range"})
        self.assertEqual(hard(self.alone(self.change("Guild Rank", -1))), {"change-range", "change-direction"})
        self.assertEqual(hard(self.alone(self.change("Guild Rank", 1))), set())
        self.assertEqual(hard(self.alone(self.change("Favour", -9, onlyWhen="if she lies"))), set(),
                         "a conditional change is held aside, never folded in")

    def test_a_min_on_the_bibles_own_column_needs_no_pack(self):
        export = copy.deepcopy(self.export)
        next(c for c in _table(export, "character")["columns"] if c["name"] == "Coin")["min"] = 0
        option = copy.deepcopy(self.good)
        self.change("Coin", -20)(option)
        self.assertEqual(hard(self.check(option, export, pack=False)), {"change-range"})

    def test_a_printed_number_must_match_the_rows_before_it(self):
        self.assertEqual(hard(self.alone(lambda o: o["statChanges"][2].update(amount=12))), {"change-printed"})

    def test_a_problem_already_in_the_bible_is_not_the_options(self):
        export = copy.deepcopy(self.export)
        printed = next(r for r in _table(export, "change")["rows"] if r["Kind"] == "printed")
        printed["Amount"] = "11"
        history = bible_check.Bible(export, self.rules, self.pack)
        self.assertTrue(any(r["amount"] == 11 for r in history.changes), "the bad row is really there")
        self.assertEqual(hard(self.check(self.good, export)), set())

    def test_new_entities(self):
        self.assertEqual(hard(self.alone(lambda o: o["newEntities"][0].update(kind="spaceship"))),
                         {"unknown-kind", "unknown-name"})
        self.assertEqual(hard(self.alone(lambda o: o["newEntities"][0].update(kind="change"))),
                         {"unknown-kind", "unknown-name"}, "Stat Changes takes changes, not entities")
        fs = self.alone(lambda o: o["newEntities"].append({"kind": "ware", "key": "Rock Salt"}))
        self.assertEqual((hard(fs), soft(fs)), (set(), {"already-exists"}))

    def test_shape(self):
        for name, mutate in (("two beats", lambda o: o.update(beats=o["beats"][:2])),
                             ("unknown key", lambda o: o.update(mood="grim")),
                             ("no rule", lambda o: o.pop("ruleTested")),
                             ("chapter 0", lambda o: o.update(chapter=0)),
                             ("ends before it starts", lambda o: o["statChanges"][0].update(untilChapter=2)),
                             ("amount in words", lambda o: o["statChanges"][0].update(amount="three")),
                             ("unknown use key", lambda o: o["uses"][0].update(price=3)),
                             ("new entity without a kind", lambda o: o["newEntities"][0].pop("kind"))):
            self.assertEqual(hard(self.alone(mutate)), {"option-shape"}, name)

    def test_not_only_fiction(self):
        """A campaign's units and supply rules check the same way (docs/PIVOTAL_HISTORY_ENGINE.md §7)."""
        export = {"tables": [
            {"kind": "unit", "name": "Units", "columns": [
                {"name": "Name", "kind": "line"},
                {"name": "Strength", "kind": "number", "packKey": "campaign.strength", "min": 0}],
             "rows": [{"Name": "2nd Minnesota"}]},
            {"kind": "worldrule", "name": "World Rules", "columns": [
                {"name": "Category", "kind": "line"}, {"name": "Rule", "kind": "text"}],
             "rows": [{"Category": "Supply", "Rule": "The river line. Mechanism: nothing crosses after dark."}]},
            dict(_table(self.export, "change"), rows=[
                {"Chapter": "0", "Who": "2nd Minnesota", "Stat": "Strength", "Kind": "set", "Amount": "900"}])]}
        option = {"chapter": 3, "title": "The Crossing", "ruleTested": "river line", "names": ["2nd Minnesota"],
                  "beats": ["They reach the ford.", "The light goes.", "They cross anyway."],
                  "statChanges": [{"who": "2nd Minnesota", "stat": "Strength", "kind": "change", "amount": -120}]}
        self.assertEqual(self.check(option, export, pack=False), [])
        option["statChanges"][0]["amount"] = -1000
        self.assertEqual(hard(self.check(option, export, pack=False)), {"change-range"})

    def test_cli(self):
        def run(*args):
            return subprocess.run([sys.executable, os.path.join(HERE, "bible_check.py"), *args],
                                  capture_output=True, text=True)
        bible, good = os.path.join(PLAN, "salt-road-bible.json"), os.path.join(PLAN, "option-good.json")
        ok = run("--bible", bible, good)
        self.assertEqual(ok.returncode, 0, ok.stdout + ok.stderr)
        self.assertIn("option-good.json: CLEAN", ok.stdout)
        bad = run("--bible", bible, "--pack", os.path.join(FIX, "salt-road.pack.json"), "--json",
                  os.path.join(PLAN, "option-bad.json"))
        self.assertEqual(bad.returncode, 1)
        self.assertFalse(json.loads(bad.stdout)[0]["ok"])
        self.assertEqual(run("--bible", good, good).returncode, 2, "an option is not a bible")
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump({"ok": True, "result": self.export}, fh)
        try:
            self.assertEqual(run("--bible", fh.name, good).returncode, 0, "the whole verb reply works too")
        finally:
            os.unlink(fh.name)

    def test_the_planner_brief_shows_every_key_and_the_real_command(self):
        text = read(os.path.join(_story.STORY, "planner", "PLANNER.md"))
        self.assertIn("python3 story/tools/bible_check.py --bible", text)
        for k in self.rules["topLevelKeys"]:
            self.assertIn(f'"{k}"', text, f"PLANNER.md's example option shows {k}")


if __name__ == "__main__":
    unittest.main(verbosity=1)
