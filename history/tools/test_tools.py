#!/usr/bin/env python3
"""Tests for the History Writer's deterministic tools.

    python3 history/tools/test_tools.py        (or: python3 -m unittest discover history/tools)

Every gate is proven by a planted defect it must catch AND a clean chapter it must pass — a
gate that only ever passes, or only ever fails, proves nothing. The fixture project
(fixtures/demo-project) is fictional; each test works on a fresh temporary copy.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _hw  # noqa: E402
import checks  # noqa: E402
import cite  # noqa: E402
import gate  # noqa: E402
import quotes  # noqa: E402
import richness  # noqa: E402
import voice_lint  # noqa: E402

FIXTURE = os.path.join(_hw.HISTORY, "fixtures", "demo-project")


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


class FixtureCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="hw-test-")
        self.root = os.path.join(self.tmp, "project")
        shutil.copytree(FIXTURE, self.root)
        self.project = _hw.Project(self.root)
        # Chapter ceilings come from the plan, which needs the dossier's ceiling.
        self.assertEqual(richness.validate_plan(self.project, write=True), [])

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def rules(self, findings, hard_only=True):
        return {f["rule"] for f in findings if not hard_only or f["severity"] == "hard"}


class CleanChapter(FixtureCase):
    def test_clean_chapter_passes_every_gate(self):
        found = [f for f in gate.chapter_findings(self.project, 1) if f["severity"] == "hard"]
        self.assertEqual(found, [], f"chapter 1 is written to pass; got {found}")

    def test_gate_command_exit_codes(self):
        ok = subprocess.run([sys.executable, os.path.join(HERE, "gate.py"), "chapter", self.root, "1"],
                            capture_output=True, text=True)
        bad = subprocess.run([sys.executable, os.path.join(HERE, "gate.py"), "chapter", self.root, "2"],
                             capture_output=True, text=True)
        self.assertEqual(ok.returncode, 0, ok.stdout)
        self.assertEqual(bad.returncode, 1, bad.stdout)


class PlantedDefects(FixtureCase):
    """Chapter 2 carries one planted defect per gate."""

    def test_quote_gates(self):
        found = self.rules(quotes.claim_findings(self.project, 2))
        self.assertTrue({"source_clue_only", "quote_unverified", "source_unknown"} <= found, found)

    def test_facts_only_prose_is_not_copied(self):
        self.assertIn("verbatim_copy", self.rules(quotes.copy_findings(self.project, 2)))
        self.assertEqual(self.rules(quotes.copy_findings(self.project, 1)), set())

    def test_a_copy_with_other_punctuation_is_still_a_copy(self):
        # Sam Smith's chapter 3 copied 24 words of HistoryLink with commas where it had semicolons.
        src = ("His first proposals included a youth patrol for the police department; a study of hiring "
               "practices in every city department; and a fund for summer jobs in the Central District.")
        with open(self.project.path("sources", "s2.txt"), "a", encoding="utf-8") as fh:
            fh.write("\n\n" + src)
        rec = self.project.sources["s2"]
        self.assertEqual((rec.get("license") or "facts-only").lower(), "facts-only")
        ch = self.project.chapter(1)
        ch["text"] += ("\n\nHis first proposals included a youth patrol for the police department, a study of hiring "
                       "practices in every city department, and a fund for summer jobs in the Central District.")
        _hw.save_json(self.project.chapter_path(1), ch)
        self.assertIn("verbatim_copy", self.rules(quotes.copy_findings(self.project, 1)))

    def test_invented_dialogue_is_caught(self):
        self.assertIn("dialogue_unsourced", self.rules(voice_lint.chapter_findings(self.project, 2)))

    def test_punctuation_at_a_quotations_ends_is_not_a_misquote(self):
        ch = self.project.chapter(1)
        quote = "“I have bought the lot on Water Street and mean to build before the rains.”"
        for written, ok in (("“I have bought the lot on Water Street,” she wrote.", True),
                            ("“…mean to build before the rains.”", True),
                            ("“I have bought the lot on Front Street,” she wrote.", False)):
            ch2 = dict(ch, text=ch["text"].replace(quote, written))
            _hw.save_json(self.project.chapter_path(1), ch2)
            found = self.rules(voice_lint.chapter_findings(self.project, 1))
            self.assertEqual("dialogue_unsourced" not in found, ok, written)
        # A claim's evidence may end on a comma where the source has a full stop.
        ch["claims"][2]["evidence"] = "I have bought the lot on Water Street and mean to build before the rains,"
        _hw.save_json(self.project.chapter_path(1), ch)
        self.assertNotIn("quote_unverified", self.rules(quotes.claim_findings(self.project, 1)))

    def test_ocr_damage_in_a_quotation_is_a_note(self):
        import voice_lint as vl
        self.assertTrue(vl.OCR_DAMAGE.search("the editor, and Susie Revels Cayton. his as sociate"))
        self.assertTrue(vl.OCR_DAMAGE.search("printed in 1S96 by the company"))
        for clean in ("Mrs. Cayton spoke", "on the 4th of July", "in 1896, at 2 p.m.", "the B-17 plant"):
            self.assertFalse(vl.OCR_DAMAGE.search(clean), clean)

    def test_narrating_the_record_and_now_are_caught(self):
        found = self.rules(voice_lint.chapter_findings(self.project, 2))
        self.assertIn("impersonal_absence", found)
        self.assertIn("present_tense_now", found)

    def test_unsourced_number_is_caught(self):
        msgs = [f["message"] for f in checks.number_findings(self.project, 2)]
        self.assertTrue(any("'1905'" in m for m in msgs), msgs)
        self.assertFalse(any("'1901'" in m for m in msgs), "1901 is in a claim's evidence")

    def test_a_cited_sources_publication_year_counts_as_evidence(self):
        ch = self.project.chapter(1)
        ch["text"] += " Her letter was dated 1893."      # 1893 is in c2's evidence anyway
        ch["text"] += " The Gazette reported the vote in 1901."
        ch["claims"].append({"id": "c6", "text": "The Gazette reported the vote.", "source": "s1",
                             "evidence": "elected president of the Ladies' Library Association at its meeting", "kind": "fact"})
        _hw.save_json(self.project.chapter_path(1), ch)
        msgs = [f["message"] for f in checks.number_findings(self.project, 1)]
        self.assertFalse(any("'1901'" in m for m in msgs), "s1 is dated 1901-05-02 and is cited")

    def test_a_pdfs_page_furniture_and_cp1252_quotes_do_not_break_a_quote(self):
        # Sam Smith's oral history: "weren" + chr(0x92) + "t", and "PROLOGUE" mid-sentence at a page break.
        raw = ("They just weren" + chr(0x92) + "t allowed to vote,\n\n\fPROLOGUE\nthat was it. \f2\n\nCHAPTER 1\n\n"
               "Teachers were paid poorly. \fCHAPTER 1\nTHE SMITH ELEMENT\n\nI\n\nfreely admit I was spoiled.")
        clean = _hw.clean_source_text(raw)
        self.assertNotIn("PROLOGUE", clean)
        self.assertNotIn("CHAPTER", clean)
        self.assertIn("weren’t", clean)
        self.assertIn("i freely admit i was spoiled", _hw.norm(clean), "a drop cap is a word, not a heading")
        with open(self.project.path("sources", "s3.txt"), "a", encoding="utf-8") as fh:
            fh.write("\n\n" + raw)
        ch = self.project.chapter(1)
        ch["claims"].append({"id": "c9", "text": "They could not vote.", "source": "s3", "kind": "fact",
                             "evidence": "They just weren't allowed to vote, that was it."})
        _hw.save_json(self.project.chapter_path(1), ch)
        self.assertNotIn("quote_unverified", self.rules(quotes.claim_findings(self.project, 1)))

    def test_a_run_on_ocr_date_is_a_day_and_a_year(self):
        self.assertEqual(_hw.numbers("first issue May 19,1894, price 1,250 or 3,5 and 1,234.50"),
                         ["19", "1894", "1,250", "3", "5", "1,234.50"])
        ch = self.project.chapter(1)
        ch["text"] += " The first issue came out on May 19, 1894."
        ch["claims"].append({"id": "c8", "text": "The first issue came out on May 19, 1894.", "source": "s1",
                             "kind": "fact", "evidence": "the first issue appeared May 19,1894"})
        _hw.save_json(self.project.chapter_path(1), ch)
        msgs = [f["message"] for f in checks.number_findings(self.project, 1)]
        self.assertFalse(any("'19'" in m or "'1894'" in m for m in msgs), msgs)

    def test_numbers_in_words_are_numbers(self):
        self.assertEqual(_hw.spelled_numbers("at twenty-three, Forty years later, six, four hundred, the fourth"),
                         [("twenty-three", 23), ("Forty", 40), ("six", 6), ("four hundred", 400)])
        ch = self.project.chapter(1)
        ch["text"] += " Forty years later she wrote about it. She had nine boarders."
        _hw.save_json(self.project.chapter_path(1), ch)
        msgs = [f["message"] for f in checks.number_findings(self.project, 1)]
        self.assertTrue(any("'Forty' (40)" in m for m in msgs), msgs)
        self.assertTrue(any("'nine' (9)" in m for m in msgs), msgs)
        # Sourced by value: "eleven of the fourteen votes" in the evidence sources the prose's words.
        ch["text"] += " She won eleven of fourteen votes."
        ch["claims"].append({"id": "c7", "text": "She won eleven of fourteen votes.", "source": "s1", "kind": "fact",
                             "evidence": "receiving eleven of the fourteen votes cast"})
        _hw.save_json(self.project.chapter_path(1), ch)
        msgs = [f["message"] for f in checks.number_findings(self.project, 1)]
        self.assertFalse(any("'eleven'" in m or "'fourteen'" in m for m in msgs), msgs)

    def test_unshown_growth_is_caught(self):
        msgs = [f["message"] for f in checks.growth_findings(self.project, 2) if f["rule"] == "growth_unshown"]
        self.assertEqual(len(msgs), 1, msgs)
        self.assertIn("library founder", msgs[0])

    def test_correction_is_enforced(self):
        self.assertIn("correction_failed", self.rules(checks.correction_findings(self.project, 2)))
        self.assertEqual(self.rules(checks.correction_findings(self.project, 1)), set())


class Structure(FixtureCase):
    def test_era_share_cap(self):
        ch = self.project.chapter(1)
        ch["claims"].append({"id": "e1", "text": " ".join(["era"] * 60), "source": "s1",
                             "evidence": "The Association will open its reading room in the old bank building",
                             "kind": "era"})
        _hw.save_json(self.project.chapter_path(1), ch)
        self.assertIn("era_share", self.rules(voice_lint.chapter_findings(self.project, 1)))

    def test_ceiling_and_starved_floor(self):
        plan = self.project.plan
        plan["chapters"][0]["ceilingWords"] = 20
        _hw.save_json(self.project.path("plan.json"), plan)
        self.assertIn("over_ceiling", self.rules(voice_lint.chapter_findings(self.project, 1)))
        # A plan written before floors existed: the floor is a share of the ceiling.
        plan["chapters"][0]["ceilingWords"] = 1000
        plan["chapters"][0].pop("floorWords", None)
        _hw.save_json(self.project.path("plan.json"), plan)
        self.assertIn("starved", self.rules(voice_lint.chapter_findings(self.project, 1)))
        # The plan's own floor wins when it has one.
        plan["chapters"][0]["floorWords"] = 1
        _hw.save_json(self.project.path("plan.json"), plan)
        self.assertNotIn("starved", self.rules(voice_lint.chapter_findings(self.project, 1)))

    def test_a_shorter_target_lowers_the_floor_and_never_the_ceiling(self):
        story = self.project.dossier["computed"]["ceilingWords"]
        before = {c["n"]: (c["ceilingWords"], c["floorWords"]) for c in self.project.plan["chapters"]}
        plan = self.project.plan
        plan["targetWords"] = story // 3
        _hw.save_json(self.project.path("plan.json"), plan)
        self.assertEqual(richness.validate_plan(self.project, write=True), [])
        for c in self.project.plan["chapters"]:
            self.assertEqual(c["ceilingWords"], before[c["n"]][0], "the ceiling is earned by the dossier, not chosen")
            self.assertLess(c["floorWords"], before[c["n"]][1], "a shorter story owes less per chapter")

    def test_each_chapter_gets_its_share_of_the_target_and_a_note_when_well_past_it(self):
        import voice_lint
        plan = self.project.plan
        plan["targetWords"] = 120
        _hw.save_json(self.project.path("plan.json"), plan)
        richness.validate_plan(self.project, write=True)
        shares = [c.get("targetWords") for c in self.project.plan["chapters"]]
        self.assertTrue(all(shares) and abs(sum(shares) - 120) <= len(shares), shares)
        n = self.project.plan["chapters"][0]["n"]
        rules = {f["rule"]: f for f in voice_lint.chapter_findings(self.project, n)}
        words = len(self.project.chapter(n)["text"].split())
        if words > 1.3 * shares[0]:
            self.assertEqual(rules["over_target"]["severity"], "soft")
        plan["targetWords"] = None
        plan.pop("targetWords")
        _hw.save_json(self.project.path("plan.json"), plan)
        richness.validate_plan(self.project, write=True)
        self.assertFalse(any(c.get("targetWords") for c in self.project.plan["chapters"]), "no target, no share")

    def test_a_target_above_the_ceiling_is_refused(self):
        plan = self.project.plan
        plan["targetWords"] = self.project.dossier["computed"]["ceilingWords"] + 1
        _hw.save_json(self.project.path("plan.json"), plan)
        self.assertIn("target_over_ceiling", self.rules(richness.validate_plan(self.project, write=False)))

    def test_story_may_not_end_before_the_record(self):
        plan = self.project.plan
        plan["chapters"][1]["span"]["to"] = "1904"
        _hw.save_json(self.project.path("plan.json"), plan)
        found = self.rules(richness.validate_plan(self.project, write=False))
        self.assertIn("story_end_before_record", found)
        plan["endNote"] = "fixture: the story ends with the library vote"
        _hw.save_json(self.project.path("plan.json"), plan)
        self.assertNotIn("story_end_before_record", self.rules(richness.validate_plan(self.project, write=False)))

    def test_ledger_row_needs_verbatim_evidence(self):
        plan = self.project.plan
        plan["ledger"][0]["evidence"]["quote"] = "she ran a boarding house that cost a great deal of money"
        _hw.save_json(self.project.path("plan.json"), plan)
        self.assertIn("ledger_quote_unverified", self.rules(richness.validate_plan(self.project, write=False)))


class Richness(FixtureCase):
    def test_counts_come_from_fetched_sources(self):
        computed, problems = richness.compute(self.project)
        c = computed["counts"]
        self.assertEqual(c["independentSources"], 3, "three publishers; the clue-only page never counts")
        self.assertEqual(c["datedEvents"], 6)
        self.assertEqual(c["lifeStages"], 5)
        self.assertEqual(c["ownWords"], 1)
        self.assertEqual(computed["mode"], "biography")
        self.assertIsNone(computed["tier"], "a few hundred words about her cannot carry even a portrait")

    def test_unfetched_source_does_not_count(self):
        os.remove(self.project.path("sources", "s2.txt"))
        computed, problems = richness.compute(self.project)
        self.assertEqual(computed["counts"]["independentSources"], 2)
        self.assertIn("source_missing", self.rules(problems))

    def test_a_reprint_is_not_a_second_source(self):
        # A newspaper reprinting the encyclopedia entry word for word is one source, not two.
        import shutil as _sh
        _sh.copy(self.project.path("sources", "s2.txt"), self.project.path("sources", "s5.txt"))
        rows = _hw.load_json(self.project.path("sources", "index.json"))
        rows.append({"id": "s5", "url": "https://example.invalid/reprint", "publisher": "Fixture Weekly",
                     "kind": "news", "license": "facts-only", "file": "sources/s5.txt"})
        _hw.save_json(self.project.path("sources", "index.json"), rows)
        computed, _ = richness.compute(self.project)
        self.assertEqual(computed["counts"]["independentSources"], 3, "the reprint must join its original")
        self.assertEqual(computed["sameContent"], [["s2", "s5"]])

    def test_different_articles_from_one_paper_all_count_as_words(self):
        # Two different pieces from the same publisher: one independent source, but both texts'
        # words about the subject count.
        rows = _hw.load_json(self.project.path("sources", "index.json"))
        base = richness.compute(self.project)[0]["counts"]
        with open(self.project.path("sources", "s6.txt"), "w") as fh:
            fh.write("Mrs. Edith Fixture spoke at the Harbor Town council in 1903 about the reading room, "
                     "and the council heard her out for an hour before it adjourned without a vote.")
        rows.append({"id": "s6", "url": "https://example.invalid/g2", "publisher": "Fixture Gazette",
                     "kind": "news", "license": "pd", "file": "sources/s6.txt", "date": "1903-01-01"})
        _hw.save_json(self.project.path("sources", "index.json"), rows)
        after = richness.compute(self.project)[0]["counts"]
        self.assertEqual(after["independentSources"], base["independentSources"], "same publisher, same independence")
        self.assertGreater(after["wordsAboutSubject"], base["wordsAboutSubject"], "a different article adds its words")

    def test_tier_and_mode_thresholds(self):
        t = _hw.thresholds()
        # Every tier's word floor must cover its own minimum length at the source ratio,
        # or a story could qualify for a tier whose minimum it cannot reach.
        for tier in t["tiers"]:
            self.assertGreaterEqual(t["sourceRatio"] * tier["requires"]["wordsAboutSubject"], tier["words"][0], tier["id"])
        self.assertEqual([x["id"] for x in t["tiers"]], ["A", "B", "C"], "tiers are checked in order")


class ThinChapters(FixtureCase):
    def test_many_short_chapters_are_noted(self):
        # Each chapter costs a writer and an auditor whatever its length (the tier-B stories, 2026-10-05).
        plan = _hw.load_json(self.project.path("plan.json"))
        plan["targetWords"] = 300
        _hw.save_json(self.project.path("plan.json"), plan)
        self.assertNotIn("chapters_thin", self.rules(richness.validate_plan(self.project, write=False), hard_only=False),
                         "two chapters are not 'many'")
        e = plan["chapters"][0]["events"] + plan["chapters"][1]["events"]
        plan["chapters"] = [dict(plan["chapters"][0], n=1, events=e[:2]), dict(plan["chapters"][0], n=2, events=e[2:4]),
                            dict(plan["chapters"][1], n=3, events=e[4:])]
        _hw.save_json(self.project.path("plan.json"), plan)
        self.assertIn("chapters_thin", self.rules(richness.validate_plan(self.project, write=False), hard_only=False))


class OwnWords(FixtureCase):
    """An own-words source counts whole only for the part that is theirs (2026-10-02: forty
    newspaper pages an editor ran were counted whole, ads and all)."""

    def test_span_rules(self):
        text = "Caption from the archive. I have bought the lot on Water Street. We shall see. Filed 1893."
        self.assertEqual(richness.own_words_count(text, "all"), len(text.split()))
        self.assertEqual(richness.own_words_count(text, {"from": "I have bought", "to": "We shall see."}), 11)
        self.assertIsNone(richness.own_words_count(text, {"from": "not in it", "to": "We shall see."}))
        self.assertIsNone(richness.own_words_count(text, None))

    def test_an_unmarked_own_words_source_counts_only_its_passages(self):
        marked = richness.compute(self.project)[0]["counts"]
        rows = _hw.load_json(self.project.path("sources", "index.json"))
        for r in rows:
            r.pop("ownWordsSpan", None)
        _hw.save_json(self.project.path("sources", "index.json"), rows)
        unmarked = richness.compute(self.project)[0]["counts"]
        self.assertEqual(unmarked["ownWords"], marked["ownWords"], "still her own words for the tally")
        self.assertLessEqual(unmarked["wordsAboutSubject"], marked["wordsAboutSubject"])

    def test_with_no_repeats_the_count_is_unchanged(self):
        aliases = ["Edith Fixture", "Mrs. Fixture"]
        for sid in [sid for sid in self.project.sources if self.project.source_text(sid)]:
            alone = richness.fresh_words(self.project, [sid], aliases)[sid]
            self.assertEqual(alone, richness.words_about(self.project.source_text(sid), aliases), sid)

    def test_repeated_passages_count_once(self):
        masthead = "THE FIXTURE GAZETTE published weekly by Edith Fixture, Editor, at Water Street, Harbor Town, rates one dollar a year"
        rows = _hw.load_json(self.project.path("sources", "index.json"))
        for i in (7, 8, 9):
            with open(self.project.path("sources", f"s{i}.txt"), "w") as fh:
                fh.write(masthead + " " + " ".join(f"issue{i}word{j}" for j in range(400)))
            rows.append({"id": f"s{i}", "publisher": "Fixture Gazette", "kind": "news", "license": "pd", "file": f"sources/s{i}.txt"})
        _hw.save_json(self.project.path("sources", "index.json"), rows)
        fresh = richness.fresh_words(self.project, ["s7", "s8", "s9"], ["Edith Fixture"])
        self.assertGreater(fresh["s7"], 0)
        self.assertEqual((fresh["s8"], fresh["s9"]), (0, 0), "the same masthead in every issue is one passage")


class EventEvidence(FixtureCase):
    """The dated-event count sets a story's length, so an event's quote is checked like a claim's."""

    def set_event(self, **fields):
        d = self.project.dossier
        d["events"][1].update(fields)          # e02, arrived in Harbor Town, sources s1 + s2
        _hw.save_json(self.project.path("dossier.json"), d)

    def test_a_verbatim_quote_counts_and_a_wrong_one_does_not(self):
        base = richness.compute(self.project)[0]["counts"]["datedEvents"]
        self.set_event(evidence="Mrs. Fixture came to Harbor Town from Ohio in 1890")
        computed, problems = richness.compute(self.project)
        self.assertEqual(computed["counts"]["datedEvents"], base)
        self.assertNotIn("event_unverified", self.rules(problems, hard_only=False))
        self.set_event(evidence="Mrs. Fixture came to Harbor Town from Kansas in the spring of 1890")
        computed, problems = richness.compute(self.project)
        self.assertEqual(computed["counts"]["datedEvents"], base - 1, "a quote no source holds does not count")
        self.assertIn("event_unverified", self.rules(problems, hard_only=False))
        self.assertEqual(len(computed["eventsNotCounted"]), 1)

    def test_required_evidence_stops_bare_events_counting(self):
        real = richness.thresholds
        try:
            richness.thresholds = lambda: dict(real(), eventEvidenceRequired=True)
            self.set_event(evidence="Mrs. Fixture came to Harbor Town from Ohio in 1890")
            computed, _ = richness.compute(self.project)
            self.assertEqual(computed["counts"]["datedEvents"], 1, "only the event with a checked quote counts")
        finally:
            richness.thresholds = real


class Reading(FixtureCase):
    """What a scout reads is what the tier counts (the read-economy fix, 2026-10-02)."""

    def test_count_is_the_union_of_the_mention_windows(self):
        text = " ".join(f"w{i}" for i in range(400))
        text = text.replace("w100", "Edith").replace("w140", "Edith").replace("w390", "Edith")
        toks, spans = richness.mention_spans(text, ["Edith"])
        self.assertEqual([(a, b) for a, b, _ in spans], [(25, 215), (315, 399)], "overlapping windows merge; the end clips")
        self.assertEqual(spans[0][2], 2, "the merged window holds two mentions")
        self.assertEqual(richness.words_about(text, ["Edith"]), (215 - 25 + 1) + (399 - 315 + 1))

    def run_mentions(self, *args):
        import contextlib
        import io
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = richness.cmd_mentions(self.project, ["richness.py", "mentions", self.root, *args])
        return code, out.getvalue()

    def test_mentions_prints_windows_a_quote_can_be_taken_from(self):
        code, out = self.run_mentions()
        self.assertEqual(code, 0)
        passages = [line.split("] ", 1)[1] for line in out.splitlines() if line.startswith("[words ")]
        self.assertTrue(passages)
        corpus = " ".join(_hw.norm(self.project.source_text(sid)) for sid in self.project.sources
                          if self.project.source_text(sid))
        for p in passages:
            self.assertIn(_hw.norm(" ".join(p.split()[:12])), corpus, "a window is verbatim source text")

    def test_budget_holds_back_in_order_and_says_how_to_read_the_rest(self):
        code, out = self.run_mentions("--max-words", "1")
        self.assertEqual(code, 0)
        self.assertEqual(sum(1 for line in out.splitlines() if line.startswith("[words ")), 1, "one passage, then stop")
        self.assertIn("held back", out)
        self.assertIn("Read them by id", out)

    def test_terms_and_ids_narrow_the_reading(self):
        code, out = self.run_mentions("s1", "--terms", "reading room")
        self.assertEqual(code, 0)
        headers = [line for line in out.splitlines() if line.startswith("== ")]
        self.assertEqual(len(headers), 1, out)
        self.assertTrue(headers[0].startswith("== s1 "), headers[0])
        code, out = self.run_mentions("nope")
        self.assertEqual(code, 2, "an unknown source id is refused, not ignored")


class Citations(FixtureCase):
    """Notes and Sources rendered from the claims (voice.md v2, 2026-10-03)."""

    def test_sentences_respect_abbreviations_and_initials(self):
        p = "Mrs. Fixture spoke first. H. R. Fixture listened. Then they left for St. Louis."
        self.assertEqual([p[a:b] for a, b in cite.sentences(p)],
                         ["Mrs. Fixture spoke first.", "H. R. Fixture listened.", "Then they left for St. Louis."])

    def test_a_name_suffix_before_a_capital_ends_the_sentence(self):
        p = ("In 1903 their son was named Horace Jr. The family called him Horace Jr. until he left. "
             "The parade on Martin Luther King Jr. Day passed the house. It was built by the Puget Sound Co. Seattle grew.")
        self.assertEqual([p[a:b] for a, b in cite.sentences(p)],
                         ["In 1903 their son was named Horace Jr.", "The family called him Horace Jr. until he left.",
                          "The parade on Martin Luther King Jr. Day passed the house.",
                          "It was built by the Puget Sound Co.", "Seattle grew."])
        self.assertEqual(cite.key_phrase("Their son was named Horace Jr. The family called him that."),
                         "Their son was named Horace Jr")

    def test_notes_follow_their_sentences_and_runs_share_one(self):
        text, notes, problems = cite.chapter_notes(self.project, 1)
        self.assertEqual(problems, [])
        self.assertIn("in 1890.¹", text)
        self.assertIn("twenty boarders.²", text, "the letter and the mill both cite s3: one note after the run")
        self.assertNotIn("sister:²", text)
        self.assertIn("dollars.³", text)
        self.assertEqual(len(notes), 3)
        self.assertTrue(notes[1].startswith("2. ") and "Letter" in notes[1], notes)

    def test_stripping_the_notes_gives_back_the_gated_prose(self):
        landed, _ = cite.landed_text(self.project, 1)
        self.assertIn("\n\nNotes\n\n1. ", landed)
        flat = lambda t: " ".join(t.split())
        self.assertEqual(flat(cite.strip_notes(landed)), flat(self.project.chapter(1)["text"]))

    def test_an_anchor_must_name_exactly_one_sentence(self):
        ch = self.project.chapter(1)
        ch["claims"][0]["anchor"] = "a sentence that is not in the chapter at all"
        ch["claims"][1]["anchor"] = "Water Street"            # in two sentences
        _hw.save_json(self.project.chapter_path(1), ch)
        hard = [f["message"] for f in cite.anchor_findings(self.project, 1) if f["severity"] == "hard"]
        self.assertEqual(len(hard), 2, hard)
        self.assertIn("anchor_unresolved", self.rules(gate.chapter_findings(self.project, 1)))

    def test_a_missing_anchor_is_a_note_for_the_gate_and_a_refusal_for_the_book(self):
        ch = self.project.chapter(1)
        ch["claims"][0].pop("anchor")
        _hw.save_json(self.project.chapter_path(1), ch)
        self.assertIn("claim_unanchored", self.rules(cite.anchor_findings(self.project, 1), hard_only=False))
        self.assertNotIn("claim_unanchored", self.rules(cite.anchor_findings(self.project, 1)))
        self.assertIn("claim_unanchored", self.rules(cite.check_findings(self.project, [1])), "the book refuses it")

    def test_anchors_write_only_the_certain_ones(self):
        ch = self.project.chapter(1)
        for c in ch["claims"]:
            c.pop("anchor")
        _hw.save_json(self.project.chapter_path(1), ch)
        import contextlib
        import io
        with contextlib.redirect_stdout(io.StringIO()):
            cite.cmd_anchors(self.project, [1], write=True)
        sents = cite.flat_sentences(self.project.chapter(1)["text"])
        for c in self.project.chapter(1)["claims"]:
            if c.get("anchor"):
                self.assertEqual(len(cite.resolve(c["anchor"], sents)), 1, c["id"])

    def test_newspaper_pages_cite_the_page_a_reader_can_open(self):
        rec = {"id": "x", "title": "The Seattle Republican, 1905-12-22, page 1", "publisher": "The Seattle Republican",
               "kind": "primary", "date": "1905-12-22",
               "url": "https://tile.loc.gov/text-services/word-coordinates-service?segment=/service/ndnp/wa/batch_wa_alder_ver01/data/sn84025811/00211100515/1905122201/1266.xml&format=alto_xml&full_text=1"}
        paper, date, page, url = cite.newspaper_page(rec)
        self.assertEqual((paper, date, page), ("The Seattle Republican", "1905-12-22", 1))
        self.assertEqual(url, "https://chroniclingamerica.loc.gov/lccn/sn84025811/1905-12-22/ed-1/seq-1/")
        self.assertEqual(cite.short_cite(rec), "The Seattle Republican, 22 December 1905, p. 1")

    def test_notes_are_short_and_never_ambiguous(self):
        nom = {"title": "Cayton House Nomination, 518 14th Avenue East", "publisher": "City of Harbor Town",
               "cite": {"author": "Ann B. Fixture", "date": "2021-01-22"}, "url": "u"}
        self.assertEqual(cite.short_cite(nom), "Fixture, “Cayton House Nomination, 518 14th Avenue East”",
                         "an author's surname stands for the work; the Sources list has the rest")
        a = {"title": "Report", "publisher": "City", "date": "1990", "url": "u1"}
        b = {"title": "Report", "publisher": "City", "date": "2001", "url": "u2"}
        forms = cite.note_forms({"a": a, "b": b}, ["a", "b"])
        self.assertNotEqual(forms["a"], forms["b"], "two sources must never read the same in a note")

    def test_web_titles_lose_their_site_names(self):
        self.assertEqual(cite.clean_title("Cayton, Susie Sumner Revels | Encyclopedia.com", "Encyclopedia.com"),
                         "Cayton, Susie Sumner Revels")
        self.assertEqual(cite.clean_title('Susie Revels Cayton:\n  "The Part She Played"\n - \n Seattle Civil Rights and Labor History Project',
                                          "Seattle Civil Rights and Labor History Project"),
                         "Susie Revels Cayton: ‘The Part She Played’")

    def test_the_story_needs_an_introduction_and_it_has_a_length(self):
        self.assertIn("intro_missing", self.rules(gate.story_findings(self.project)))
        intro = dict(self.project.chapter(1), chapter=0, title="Introduction")
        _hw.save_json(self.project.chapter_path(0), intro)
        real = gate.thresholds
        try:
            gate.thresholds = lambda: dict(real(), introWords=[5, 20])
            self.assertIn("over_ceiling", self.rules(gate.intro_findings(self.project)))
            gate.thresholds = lambda: dict(real(), introWords=[5, 600])
            self.assertEqual(self.rules(gate.intro_findings(self.project)), set())
        finally:
            gate.thresholds = real
        self.assertNotIn("intro_missing", self.rules(gate.story_findings(self.project)))

    def test_the_book_lands_in_order_and_round_trips(self):
        import contextlib
        import io
        _hw.save_json(self.project.chapter_path(0), dict(self.project.chapter(1), chapter=0, title="Introduction"))
        ch2 = self.project.chapter(2)
        for c in ch2["claims"]:
            c["anchor"] = " ".join(cite.flat_sentences(ch2["text"])[0][2].split()[:6])
        _hw.save_json(self.project.chapter_path(2), ch2)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cite.cmd_book(self.project), 1, "a claim citing a source that does not exist is refused")
        ch2["claims"] = [c for c in ch2["claims"] if c["source"] in self.project.sources]   # the planted defect
        _hw.save_json(self.project.chapter_path(2), ch2)
        with contextlib.redirect_stdout(io.StringIO()):
            code = cite.cmd_book(self.project)
        self.assertEqual(code, 0)
        m = _hw.load_json(self.project.path("book", "manifest.json"))
        self.assertEqual([c["n"] for c in m["chapters"]], [0, 1, 2])
        self.assertTrue(all(c["stripsToGatedText"] for c in m["chapters"]))
        with open(self.project.path("book", "sources.txt")) as fh:
            self.assertTrue(fh.read().startswith("Sources"))


class AppendixNotes(FixtureCase):
    """The default style since the author's second review (2026-10-03): clean chapters, one Notes
    appendix keyed by paragraph, numbered Sources, each source once."""

    def test_one_note_per_paragraph_with_unique_numbered_sources(self):
        notes = cite.notes_appendix(self.project, [1])
        lines = [l for l in notes.splitlines() if l.startswith("“")]
        self.assertEqual(len(lines), 2, "chapter 1 has two paragraphs, both cited")
        self.assertTrue(lines[0].startswith("“Edith Fixture came to Harbor Town from Ohio"), lines[0])
        nums = cite.source_numbers(self.project, [1])
        self.assertEqual(sorted(nums.values()), list(range(1, len(nums) + 1)), "numbered 1..n, no gaps")
        self.assertEqual(nums["s1"], 1, "numbered in the order the story first cites them")
        for line in lines:
            refs = [int(x) for x in line.split(": ")[1].rstrip(".").split(", ")]
            self.assertEqual(len(refs), len(set(refs)), "a source appears once in a note")

    def test_sources_list_each_source_once_with_its_link(self):
        text = cite.numbered_sources(self.project, [1])
        entries = [l for l in text.splitlines() if re.match(r"\d+\. ", l)]
        self.assertEqual(len(entries), len(cite.source_numbers(self.project, [1])))
        self.assertTrue(all("http" in e for e in entries), entries)

    def test_keys_end_on_a_word_that_carries_meaning(self):
        self.assertEqual(cite.key_phrase("In 1900 a second line appeared on the masthead of the paper."),
                         "In 1900 a second line appeared")
        self.assertEqual(cite.key_phrase('On 3 June 1900 her short story "Sally the Egg-Woman" appeared.'),
                         "On 3 June 1900 her short story", "a key never splits a quotation")
        self.assertEqual(cite.key_phrase('She published a piece called "Black Baby Dolls" warning of harm.'),
                         "She published a piece called ‘Black Baby Dolls’", "a whole quotation may stay")
        self.assertEqual(cite.key_phrase("In 1909 Booker T. Washington came to Seattle for the exposition."),
                         "In 1909 Booker T. Washington came to Seattle", "an initial is not a sentence end")

    def test_the_appendix_book_lands_clean_chapters(self):
        import contextlib
        import io
        self.assertEqual(cite.notes_style(), "appendix", "the default style")
        ch2 = self.project.chapter(2)                      # the planted-defect chapter, made citable
        ch2["claims"] = [c for c in ch2["claims"] if c["source"] in self.project.sources]
        for c in ch2["claims"]:
            c["anchor"] = " ".join(cite.flat_sentences(ch2["text"])[0][2].split()[:6])
        _hw.save_json(self.project.chapter_path(2), ch2)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cite.cmd_book(self.project), 0)
        m = _hw.load_json(self.project.path("book", "manifest.json"))
        self.assertEqual([a["title"] for a in m["appendices"]], ["Notes", "Sources"])
        with open(self.project.path("book", "01.txt")) as fh:
            landed = fh.read()
        self.assertFalse(cite.MARK.search(landed), "no note numbers in the prose")
        # Clean: the gated prose exactly, under the book's title (the first page carries it).
        self.assertEqual(landed, cite.title_block(self.project) + "\n\n" + self.project.chapter(1)["text"])


class Pictures(FixtureCase):
    """Pictures gathered while researching (images.json, voice.md §14, 2026-10-03)."""

    def add_picture(self, **over):
        import images
        os.makedirs(self.project.path("images"), exist_ok=True)
        with open(self.project.path("images", "img1.description.txt"), "w") as fh:
            fh.write("The boarding house on Water Street in Harbor Town, photographed about 1895 by the Fixture studio.\n")
        rec = {"id": "img1", "title": "File:Fixture boarding house.jpg", "url": "https://upload.wikimedia.org/x/Fixture_(house).jpg",
               "pageUrl": "https://commons.wikimedia.org/wiki/File:Fixture_boarding_house.jpg", "license": "Public domain",
               "artist": "Fixture studio", "caption": "The boarding house on Water Street, about 1895",
               "evidence": "The boarding house on Water Street in Harbor Town, photographed about 1895",
               "evidenceSource": "description", "chapter": 1, "after": "That year she opened her boarding house"}
        rec.update(over)
        _hw.save_json(self.project.path("images", "index.json"), [rec])
        return images

    def test_searches_add_to_the_candidates_instead_of_replacing_them(self):
        import images
        images.merge_candidates(self.project, [{"title": "File:A.jpg", "allowed": True}])
        held = images.merge_candidates(self.project, [{"title": "File:B.jpg", "allowed": False},
                                                      {"title": "File:A.jpg", "allowed": True, "note": "newer"}])
        self.assertEqual([r["title"] for r in held], ["File:A.jpg", "File:B.jpg"])
        self.assertEqual(held[0].get("note"), "newer", "a title found again takes the newer record")

    def test_licences_a_paid_story_may_use(self):
        import images
        for ok in ("Public domain", "PD-US", "CC0", "CC BY 4.0", "CC BY-SA 4.0"):
            self.assertTrue(images.licence_verdict(ok)[0], ok)
        for bad in ("CC BY-NC-SA 4.0", "CC BY-ND 2.0", "CC BY-NC 3.0", "Fair use", "", "All rights reserved"):
            self.assertFalse(images.licence_verdict(bad)[0], bad)

    def test_a_placed_picture_is_checked_like_a_claim(self):
        images = self.add_picture()
        self.assertEqual([f["rule"] for f in images.image_findings(self.project) if f["severity"] == "hard"], [])
        self.add_picture(evidence="The boarding house on Water Street, photographed in 1902 by a stranger")
        self.assertIn("image_caption_unverified", {f["rule"] for f in images.image_findings(self.project)})
        self.add_picture(after="Water Street")      # in both paragraphs
        self.assertIn("image_unplaced", {f["rule"] for f in images.image_findings(self.project)})
        self.add_picture(license="CC BY-NC 4.0")
        self.assertIn("image_licence", {f["rule"] for f in images.image_findings(self.project)})
        self.add_picture(caption="A remarkable boarding house on Water Street")
        self.assertTrue(any(f["rule"].startswith("image_caption_") for f in images.image_findings(self.project)))

    def test_a_picture_from_a_host_the_reader_will_not_fetch_is_refused(self):
        # 2026-10-04: Commons began serving scaled copies from thumb.wikimedia.org, a host the
        # Read view did not list, and four of six pictures in the pilot showed as links.
        images = self.add_picture(url="https://thumb.wikimedia.org/wikipedia/commons/thumb/x/Fixture.jpg/1280px-Fixture.jpg")
        self.assertNotIn("image_host_unlisted", {f["rule"] for f in images.image_findings(self.project)})
        for url in ("https://example.org/house.jpg", "http://upload.wikimedia.org/x/Fixture.jpg"):
            self.add_picture(url=url)
            self.assertIn("image_host_unlisted", {f["rule"] for f in images.image_findings(self.project)}, url)

    def test_the_book_shows_the_picture_after_its_paragraph_and_still_round_trips(self):
        import contextlib
        import io
        self.add_picture()
        ch2 = self.project.chapter(2)
        ch2["claims"] = [c for c in ch2["claims"] if c["source"] in self.project.sources]
        for c in ch2["claims"]:
            c["anchor"] = " ".join(cite.flat_sentences(ch2["text"])[0][2].split()[:6])
        _hw.save_json(self.project.chapter_path(2), ch2)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cite.cmd_book(self.project), 0)
        with open(self.project.path("book", "01.txt")) as fh:
            landed = fh.read()
        paras = landed.split("\n\n")
        self.assertTrue(paras[-1].startswith("![The boarding house on Water Street, about 1895. Fixture studio, Public domain.]("), paras[-1])
        self.assertIn("Fixture_%28house%29.jpg", paras[-1], "parentheses in the URL cannot end the Markdown link")
        self.assertEqual(" ".join(cite.strip_additions(landed).split()), " ".join(self.project.chapter(1)["text"].split()))
        with open(self.project.path("book", "sources.txt")) as fh:
            self.assertIn("\nPictures\n", fh.read())

    def test_an_ordinal_in_a_landmark_name_matches_as_a_numeral_or_a_word(self):
        # The pack files it as "1st African Methodist Episcopal Church"; the second story wrote it out.
        name = r"[\s\-–]+".join(cite.word_pattern(w) for w in "1st African Methodist Episcopal Church".split())
        rx = re.compile(r"\b(?:" + name + r")(?![\w-])", re.I)
        self.assertTrue(rx.search("It became First African Methodist Episcopal Church, the oldest"))
        self.assertTrue(rx.search("the 1st African Methodist Episcopal Church"))
        addr = re.compile(r"\b(?:" + cite.address_pattern("1522 14th Ave") + r")(?![\w-])", re.I)
        self.assertTrue(addr.search("the parsonage at 1522 Fourteenth Avenue"))
        self.assertFalse(addr.search("at 1522 15th Ave"))
        self.assertEqual([cite.ordinal_word(n) for n in (1, 12, 21, 40)], ["first", "twelfth", "twenty-first", "fortieth"])

    def test_the_book_names_a_landmark_the_way_its_prose_does(self):
        place = {"id": "SL-0094", "name": "1st African Methodist Episcopal Church", "address": "1522 14th Ave"}
        self.assertEqual(cite.name_as_written(place, "First African Methodist Episcopal Church"),
                         "First African Methodist Episcopal Church")
        self.assertEqual(cite.name_as_written(place, "1522 Fourteenth Avenue"), place["name"],
                         "an address mention keeps the pack's name")

    def test_landmark_addresses_match_their_spellings_and_link_once(self):
        rx = re.compile(r"\b(?:" + cite.address_pattern("518 14th Ave E") + r")(?![\w-])", re.I)
        for spelled in ("518 14th Avenue East", "518 14th Ave. E.", "518 14th Ave E"):
            self.assertTrue(rx.search(f"the house at {spelled}, sold"), spelled)
        self.assertFalse(rx.search("the house at 5180 14th Avenue East"))
        self.assertIsNone(cite.address_pattern("Volunteer Park"), "only street addresses")
        place = {"id": "FX-1", "name": "Fixture House", "address": "518 14th Ave E"}
        pats = [("FX-1", place, rx)]
        used = {}
        out = cite.link_landmarks("At 518 14th Avenue East she lived. 518 14th Avenue East again.", used, pats)
        self.assertEqual(out.count("](https://mchatai.com/seattle-landmarks/#/l/FX-1)"), 1, "first mention only")
        self.assertIn("FX-1", used)



class ParagraphOpenings(unittest.TestCase):
    """A paragraph opens with the person's name, never a pronoun (Lawrence, 2026-10-06: after Isaac
    Stevens's paragraph and portrait, "He came to Seattle" read as Stevens)."""

    def rules(self, text):
        return [f["rule"] for f in voice_lint.phrase_findings(text) if f["rule"] == "pronoun_opens_paragraph"]

    def test_a_paragraph_opening_on_a_pronoun_is_caught(self):
        self.assertEqual(len(self.rules("Stevens urged him to settle.\n\nHe came to Seattle in 1859.\n\n"
                                        "His restaurant was called Our House.\n\nShe taught for nine years.")), 3)

    def test_a_named_opening_and_a_pronoun_inside_pass(self):
        self.assertEqual(self.rules("Grose came to Seattle in 1859, and he found work as a cook.\n\n"
                                    "Seattle was then a village of 300 people. \"He was kind,\" Moran wrote."), [])


class OneNameRule(unittest.TestCase):
    """The subject goes by their surname, a woman exactly as a man (Lawrence, 2026-10-06: Susie
    Revels Cayton's book called her "Susie")."""

    def test_the_first_name_alone_is_noted_and_the_full_name_and_quotes_are_not(self):
        text = ('Susie wrote short stories. Susie Revels Cayton edited the paper. Cayton taught. '
                '"Susie," her mother said. Susie\'s house stood on Fourteenth Avenue.')
        found = voice_lint.first_name_findings(text, "Susie Sumner Revels Cayton")
        self.assertEqual(len(found), 2)
        self.assertTrue(all(f["severity"] == "soft" for f in found))

    def test_a_one_word_subject_has_no_first_name_to_check(self):
        self.assertEqual(voice_lint.first_name_findings("York went west.", "York"), [])


class PictureCredits(unittest.TestCase):
    """A caption credits the artist once, and leaves an unknown one out (2026-10-05: six captions
    read "Unknown author Unknown author, Public domain.")."""

    def test_an_unknown_author_is_left_out_however_it_is_repeated(self):
        import images
        for who in ("Unknown author Unknown author", "Unknown author", "unknown", "Unknown photographer"):
            self.assertEqual(images.credit_line({"artist": who, "license": "Public domain"}), "Public domain", who)

    def test_an_unknown_author_beside_a_real_credit_leaves_the_real_one(self):
        import images
        self.assertEqual(images.credit_line({"artist": "Unknown author Unknown author , reprinted by Asahel Curtis",
                                             "license": "Public domain"}),
                         "Reprinted by Asahel Curtis, Public domain")

    def test_a_name_said_twice_is_said_once(self):
        import images
        self.assertEqual(images.credit_line({"artist": "Joe Mabel Joe Mabel", "license": "CC BY-SA 4.0"}),
                         "Joe Mabel, CC BY-SA 4.0")
        self.assertEqual(images.credit_line({"artist": "A. Roe Anderson", "license": "Public domain"}),
                         "A. Roe Anderson, Public domain")


class PictureRemoval(FixtureCase):
    def test_a_placed_picture_comes_out_whole(self):
        os.makedirs(self.project.path("images"), exist_ok=True)
        for name, data in (("img1.jpg", b"jpg"), ("img1.description.txt", b"desc")):
            with open(self.project.path("images", name), "wb") as fh:
                fh.write(data)
        _hw.save_json(self.project.path("images", "index.json"),
                      [{"id": "img1", "title": "File:X.jpg", "file": "images/img1.jpg", "chapter": 1},
                       {"id": "img2", "title": "File:Y.jpg", "file": "", "chapter": 2}])
        import contextlib
        import io
        import images
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(images.cmd_remove(self.project, "img1"), 0)
            self.assertEqual(images.cmd_remove(self.project, "img9"), 2)
        self.assertEqual([r["id"] for r in images.index(self.project)], ["img2"])
        self.assertFalse(os.path.exists(self.project.path("images", "img1.jpg")))
        self.assertFalse(os.path.exists(self.project.path("images", "img1.description.txt")))


class Maps(FixtureCase):
    """A small street map for each landmark a story names, linked to its page (maps.py, 2026-10-04)."""

    def setUp(self):
        super().setUp()
        import maps
        self.maps = maps
        self.place = {"id": "FX-1", "name": "Fixture Boarding House", "address": "12 Water St",
                      "neighborhood": "Harbor Town", "lat": 47.6237, "lon": -122.3143}
        rx = re.compile(r"\bWater Street(?![\w-])", re.I)
        self.real = (cite.landmark_patterns, maps.places)
        cite.landmark_patterns = lambda: [("FX-1", self.place, rx)]
        maps.places = lambda: {"FX-1": self.place}

        def enc(pts):                      # [(lat, lon)] in the page's delta encoding
            la, lo = round(pts[0][0] * 1e5), round(pts[0][1] * 1e5)
            g = [la, lo]
            for lat, lon in pts[1:]:
                a, b = round(lat * 1e5), round(lon * 1e5)
                g += [a - la, b - lo]
                la, lo = a, b
            return g
        geo = {"b": [], "hoods": [],
               "streets": [{"c": 1, "n": "Water Street", "g": enc([(47.6237, -122.330), (47.6237, -122.300)])},
                           {"c": 2, "n": "Fourteenth Avenue", "g": enc([(47.615, -122.3143), (47.632, -122.3143)])}],
               "water": [{"c": 0, "g": enc([(47.619, -122.325), (47.619, -122.320), (47.617, -122.320), (47.617, -122.325)])}]}
        self.basemap = os.path.join(self.tmp, "geo.json")
        _hw.save_json(self.basemap, geo)

    def tearDown(self):
        cite.landmark_patterns, self.maps.places = self.real
        super().tearDown()

    def render(self):
        import contextlib
        import io
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(self.maps.cmd_render(self.project, [], self.basemap), 0)

    def test_a_named_landmark_gets_a_map_that_carries_its_credit(self):
        import xml.dom.minidom
        self.render()
        rows = self.maps.index(self.project)
        self.assertEqual([r["id"] for r in rows], ["FX-1"])
        self.assertEqual(rows[0]["url"], "https://mchatai.com/seattle-landmarks/#/l/FX-1")
        with open(self.project.path(rows[0]["file"])) as fh:
            svg = fh.read()
        xml.dom.minidom.parseString(svg)                 # well formed, so AppKit and browsers draw it
        self.assertIn('width="640" height="240"', svg)
        self.assertIn("© OpenStreetMap contributors", svg, "the basemap's licence travels with the map")
        self.assertIn(">Water Street</text>", svg, "streets are named as on the landmark's page")
        self.assertIn('r="12"', svg, "the ring that marks the place")

    def test_the_book_puts_the_map_after_the_paragraph_that_first_names_the_place(self):
        import contextlib
        import io
        self.render()
        ch2 = self.project.chapter(2)
        ch2["claims"] = [c for c in ch2["claims"] if c["source"] in self.project.sources]
        for c in ch2["claims"]:
            c["anchor"] = " ".join(cite.flat_sentences(ch2["text"])[0][2].split()[:6])
        _hw.save_json(self.project.chapter_path(2), ch2)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cite.cmd_book(self.project), 0)
        with open(self.project.path("book", "01.txt")) as fh:
            landed = fh.read()
        paras = cite.TITLE_BLOCK.sub("", landed).split("\n\n")     # the first page also carries the title
        self.assertTrue(paras[1].startswith("[![Fixture Boarding House, 12 Water St, Harbor Town. "
                                            "Click the map for its page in Seattle Landmarks."), paras[1])
        self.assertIn("](file://", paras[1])
        self.assertTrue(paras[1].endswith("](https://mchatai.com/seattle-landmarks/#/l/FX-1)"), paras[1])
        self.assertEqual(landed.count("[!["), 1, "one map per landmark, however often it is named")
        with open(self.project.path("book", "02.txt")) as fh:
            self.assertNotIn("[![", fh.read(), "the map goes where the place is written about")
        self.assertEqual(" ".join(cite.strip_additions(landed).split()), " ".join(self.project.chapter(1)["text"].split()))
        with open(self.project.path("book", "sources.txt")) as fh:
            self.assertIn("Maps: Streets and water © OpenStreetMap contributors (ODbL), from the basemap of Seattle Landmarks.", fh.read())
        self.assertEqual(_hw.load_json(self.project.path("book", "manifest.json"))["maps"], ["FX-1"])

    def test_an_address_names_a_landmark_only_beside_its_name(self):
        # Horace Cayton's 1917 cafeteria at 815 Second Avenue is not the bank built there later.
        place = {"id": "FX-2", "name": "Harbor Savings Bank", "address": "815 2nd Ave"}
        m = cite.LandmarkMatcher(place, None, cite.address_pattern(place["address"]))
        text = ("In 1917 he sued the owner of the cafeteria at 815 Second Avenue.\n\n"
                "Years later Harbor Savings put up its bank at 815 2nd Avenue.")
        self.assertEqual([h.group(0) for h in m.finditer(text)], ["815 2nd Avenue"])
        self.assertEqual([h.group(0) for h in m.unconfirmed(text)], ["815 Second Avenue"])
        named = cite.LandmarkMatcher(place, r"Harbor\s+Savings\s+Bank", cite.address_pattern(place["address"]))
        self.assertTrue(named.search("He kept his money in the Harbor Savings Bank."), "a name needs no help")
        cite.landmark_patterns = lambda: [("FX-2", place, m)]
        ch = self.project.chapter(1)
        ch["text"] += "\n\nIn 1917 she ate at the cafeteria at 815 Second Avenue."
        _hw.save_json(self.project.chapter_path(1), ch)
        self.assertIn("landmark_address_unconfirmed", self.rules(cite.check_findings(self.project, [1]), hard_only=False))
        self.assertNotIn("](https://", cite.link_landmarks(ch["text"].split("\n\n")[-1], {}, cite.landmark_patterns()))

    def test_a_landmark_name_keeps_its_capitals(self):
        # Seattle has a landmark called "Black Property"; William Grose was "the first Black property owner".
        place = {"id": "FX-3", "name": "Black Property", "address": "1319 12th Ave S"}
        m = cite.LandmarkMatcher(place, r"[\s\-–]+".join(cite.cased_word_pattern(w) for w in place["name"].split()),
                                 cite.address_pattern(place["address"]))
        self.assertIsNone(m.search("Grose was the first Black property owner in the district."))
        self.assertTrue(m.search("They restored the Black Property in 1990."))
        self.assertTrue(m.search("It stands at 1319 12th avenue south, near the Black family's garden."))

    def test_a_full_render_drops_maps_the_story_no_longer_names(self):
        self.render()
        drawn = self.project.path(self.maps.index(self.project)[0]["file"])
        self.assertTrue(os.path.exists(drawn))
        for n in cite.book_numbers(self.project):
            ch = self.project.chapter(n)
            if ch:
                ch["text"] = ch["text"].replace("Water Street", "the waterfront")
                _hw.save_json(self.project.chapter_path(n), ch)
        self.render()
        self.assertEqual(self.maps.index(self.project), [])
        self.assertFalse(os.path.exists(drawn))



class TitleBlock(FixtureCase):
    """The book names who it is about before anything else (2026-10-04: "in the introduction there
    is no title in it so it takes a little bit to understand who we are talking about")."""

    def book(self):
        import contextlib
        import io
        ch2 = self.project.chapter(2)
        ch2["claims"] = [c for c in ch2["claims"] if c["source"] in self.project.sources]
        for c in ch2["claims"]:
            c["anchor"] = " ".join(cite.flat_sentences(ch2["text"])[0][2].split()[:6])
        _hw.save_json(self.project.chapter_path(2), ch2)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cite.cmd_book(self.project), 0)
        return [open(self.project.path("book", f"{n:02d}.txt")).read() for n in (1, 2)]

    def test_the_first_page_opens_with_the_name_and_years(self):
        first, second = self.book()
        # The fixture's series is not in series.json, so the line carries the years alone.
        self.assertTrue(first.startswith("# Edith Fixture\n\n*1870–1934*\n\n"), first[:80])
        self.assertFalse(second.startswith("#"), "only the first page carries the title")
        self.assertEqual(" ".join(cite.strip_additions(first).split()), " ".join(self.project.chapter(1)["text"].split()),
                         "the title is apparatus: the landed page still strips back to the gated prose")
        self.assertEqual(_hw.load_json(self.project.path("book", "manifest.json"))["title"], "Edith Fixture")

    def test_the_series_is_named_when_series_json_knows_it(self):
        meta = _hw.load_json(self.project.path("project.json"))
        meta["series"] = "black-seattle"
        _hw.save_json(self.project.path("project.json"), meta)
        self.assertEqual(cite.title_block(self.project), "# Edith Fixture\n\n*1870–1934 · Black Seattle*")



class BookEditor(FixtureCase):
    """The book read once as a whole, and a fresh reader's suggestions gated before the author sees
    them (editor.py, 2026-10-04: "an overall editor … to look at consistency and overall flow and tone")."""

    def land_book(self):
        import contextlib
        import io
        ch2 = self.project.chapter(2)
        ch2["claims"] = [c for c in ch2["claims"] if c["source"] in self.project.sources]
        for c in ch2["claims"]:
            c["anchor"] = " ".join(cite.flat_sentences(ch2["text"])[0][2].split()[:6])
        _hw.save_json(self.project.chapter_path(2), ch2)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cite.cmd_book(self.project), 0)

    def add_to_chapter_2(self, sentence):
        ch2 = self.project.chapter(2)
        ch2["text"] += " " + sentence
        _hw.save_json(self.project.chapter_path(2), ch2)

    def test_what_a_reader_meets_twice_and_numbers_that_conflict(self):
        import editor
        self.add_to_chapter_2("Edith Fixture came to Harbor Town from Ohio in 1891.")
        found = {f["rule"]: f for f in editor.check_findings(self.project)}
        self.assertIn("edith fixture came to harbor town from ohio in", found["told_twice"]["message"])
        self.assertIn("A reader meets them one after the other", found["told_twice"]["message"])
        self.assertIn("(1890 against 1891)", found["numbers_disagree"]["message"])

    def test_one_more_detail_is_not_a_disagreement(self):
        import editor
        self.add_to_chapter_2("In 1890, aged 24, Edith Fixture came to Harbor Town from Ohio.")
        self.assertNotIn("numbers_disagree", {f["rule"] for f in editor.check_findings(self.project)})

    def test_a_specific_the_chapters_own_evidence_quotes_is_not_new(self):
        import contextlib
        import io
        import editor
        self.land_book()
        ch1 = self.project.chapter(1)
        ch1["claims"][0]["evidence"] = ch1["claims"][0].get("evidence", "") + " the lot at 12 Water Street"
        _hw.save_json(self.project.chapter_path(1), ch1)
        self.assertEqual(editor.new_specifics("the lot at 12 Water Street", ch1["text"]), ["12"])
        evidence = " ".join(c.get("evidence", "") for c in ch1["claims"])
        self.assertEqual(editor.new_specifics("the lot at 12 Water Street", ch1["text"] + " " + evidence), [])

    def test_a_chapter_out_of_scale_and_a_drifting_voice(self):
        import editor
        k = editor.cfg()
        short, long_ = "She wrote it down. " * 30, ("She wrote it down in the long ledger that she kept on the "
                                                   "shelf by the stove in the kitchen of the house. ") * 60
        chapters = [{"n": 1, "title": "One", "prose": short}, {"n": 2, "title": "Two", "prose": short},
                    {"n": 3, "title": "Three", "prose": long_}]
        self.assertEqual([f["rule"] for f in editor.balance_findings(chapters, k)], ["chapter_out_of_scale"])
        self.assertIn("Three", editor.balance_findings(chapters, k)[0]["message"])
        self.assertEqual([f["rule"] for f in editor.drift_findings(chapters, k)], ["voice_drift"])

    def test_suggestions_change_words_never_facts(self):
        import contextlib
        import io
        import editor
        self.land_book()
        mill = "The men at the mill told her that a woman could not keep a house of twenty boarders."
        notes = [
            {"chapter": 1, "kind": "clarity", "quote": mill, "note": "Tighter.",
             "replacement": "The men at the mill told her a woman could not keep a house of twenty boarders."},
            {"chapter": 1, "kind": "consistency", "quote": "That year she opened her boarding house on Water Street.",
             "replacement": "In 1894 she opened her boarding house on Water Street.", "note": "Date it."},
            {"chapter": 1, "kind": "tone", "note": "Smoother.",
             "quote": "she wrote to her sister: “I have bought the lot on Water Street and mean to build before the rains.”",
             "replacement": "she wrote to her sister that she had bought the lot on Water Street and meant to build before the rains."},
            {"chapter": 1, "kind": "flow", "quote": "She sailed to Alaska.", "replacement": "She sailed.", "note": "Cut."},
            {"chapter": 1, "kind": "clarity", "quote": "The men at the mill told her", "note": "Name him.",
             "replacement": "John Smith at the mill told her"},
            {"chapter": 1, "kind": "tone", "quote": "It cost four hundred dollars.", "note": "Lift it.",
             "replacement": "It cost a remarkable four hundred dollars."},
            {"chapter": 1, "kind": "flow", "quote": "That year she opened her boarding house on Water Street.",
             "note": "The reader has to look back to know which year."},
            {"chapter": 9, "kind": "flow", "quote": "x", "replacement": "y", "note": "z"},
            {"chapter": 1, "kind": "praise", "quote": mill, "replacement": "A line.", "note": "z"},
        ]
        _hw.save_json(self.project.path("editor", "notes.json"), notes)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(editor.cmd_verify(self.project), 0)
        kept = _hw.load_json(self.project.path("editor", "suggestions.json"))
        self.assertEqual([s["index"] for s in kept], [0])
        self.assertEqual((kept[0]["find"], kept[0]["label"]), (mill, "Editor: clarity"))
        self.assertEqual([n["index"] for n in _hw.load_json(self.project.path("editor", "letter.json"))], [6])
        why = {d["index"]: d["reason"] for d in _hw.load_json(self.project.path("editor", "dropped.json"))}
        self.assertIn("adds 1894", why[1])
        self.assertIn("neither the chapter nor its sources' quotes", why[1])
        self.assertIn("alters quoted words", why[2])
        self.assertIn("not in the chapter as landed", why[3])
        self.assertIn("adds John, Smith", why[4])
        self.assertIn("fails praise_label", why[5])
        self.assertIn("not in the book", why[7])
        self.assertIn("kind must be", why[8])



class AdoptReview(FixtureCase):
    """After the author's review their text becomes the story's, and the notes follow it
    (cite.py adopt, 2026-10-04: "the Notes need rebuilding before the book is final")."""

    def land_book(self):
        import contextlib
        import io
        ch2 = self.project.chapter(2)
        ch2["claims"] = [c for c in ch2["claims"] if c["source"] in self.project.sources]
        for c in ch2["claims"]:
            c["anchor"] = " ".join(cite.flat_sentences(ch2["text"])[0][2].split()[:6])
        _hw.save_json(self.project.chapter_path(2), ch2)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cite.cmd_book(self.project), 0)
        with open(self.project.path("book", "01.txt")) as fh:
            return fh.read()

    def review(self, text):
        os.makedirs(self.project.path("review"), exist_ok=True)
        with open(self.project.path("review", "01.txt"), "w") as fh:
            fh.write(text)

    def adopt(self):
        import contextlib
        import io
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = cite.cmd_adopt(self.project)
        return code, out.getvalue()

    def test_an_accepted_edit_becomes_the_text_and_the_book_rebuilds(self):
        import contextlib
        import io
        landed = self.land_book()
        before = self.project.chapter(1)["text"]
        self.review(landed.replace("That year she opened her boarding house", "That year she opened a boarding house"))
        code, out = self.adopt()
        self.assertEqual(code, 0, out)
        ch = self.project.chapter(1)
        self.assertIn("That year she opened a boarding house", ch["text"])
        self.assertNotIn("# Edith Fixture", ch["text"], "the title is apparatus, not the author's prose")
        self.assertEqual(ch["revisions"][-1]["before"], before.strip())
        self.assertEqual(cite.anchor_findings(self.project, 1), [], "every anchor still points at one sentence")
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cite.cmd_book(self.project), 0)

    def test_a_cut_fact_leaves_its_claim_to_settle_and_retiring_it_lands(self):
        import contextlib
        import io
        landed = self.land_book()
        self.review(landed.replace(" It cost four hundred dollars.", ""))
        code, out = self.adopt()
        self.assertEqual(code, 1, "a claim whose sentence is gone must be settled")
        self.assertIn("to settle", out)
        ch = self.project.chapter(1)
        for c in ch["claims"]:
            if c.get("anchor") is None:
                c["retired"] = "cut by the author"
        _hw.save_json(self.project.chapter_path(1), ch)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cite.cmd_book(self.project), 0, "with the claim retired the book lands again")

    def test_a_number_the_author_adds_is_a_question_never_a_fix(self):
        landed = self.land_book()
        self.review(landed.replace("It cost four hundred dollars.", "It cost four hundred dollars, and she had 31 boarders by 1896."))
        code, out = self.adopt()
        self.assertIn("? number_unsourced", out)
        self.assertIn("31 boarders", self.project.chapter(1)["text"], "the author's text is kept as they wrote it")

    def test_an_unchanged_chapter_is_left_alone(self):
        landed = self.land_book()
        self.review(landed)
        code, out = self.adopt()
        self.assertEqual(code, 0)
        self.assertIn("chapter 1: unchanged", out)
        self.assertNotIn("revisions", self.project.chapter(1))



class MentionMatching(FixtureCase):
    """Who counts as the subject (2026-10-04, the second story's run: an OCR line break hid a
    source, and his sons were counted as him)."""

    def test_an_alias_matches_across_an_ocr_line_break(self):
        text = "the Rainier Club, with John T.\nGayton as steward and Will Taylor as head waiter"
        self.assertEqual(len(richness.alias_matches(text, ["John T. Gayton"])), 1)

    def test_an_alias_ending_in_a_full_stop_matches(self):
        self.assertEqual(len(richness.alias_matches("the club and J. T. Gayton Jr. sang", ["Gayton Jr."])), 1)
        self.assertEqual(richness.alias_matches("Gaytonville", ["Gayton"]), [], "a word edge, not part of a longer word")

    def test_his_sons_are_not_him(self):
        text = "John Gayton Jr. sang a tenor solo. Later John Gayton spoke for the club."
        found = richness.alias_matches(text, ["John Gayton"], ["John Gayton Jr."])
        self.assertEqual(len(found), 1)
        self.assertTrue(text[found[0][0]:].startswith("John Gayton spoke"))

    def test_a_dossier_counted_by_an_older_tool_is_noted(self):
        d = self.project.dossier
        d["computed"]["countVersion"] = "2026-10-02"
        _hw.save_json(self.project.path("dossier.json"), d)
        self.assertIn("dossier_counted_by_older_tool", {f["rule"] for f in richness.validate_plan(self.project, write=False)})



FAKE_SHIM = """#!/usr/bin/env python3
import json, os, sys, uuid
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fake-storymaker.json")
st = json.load(open(path)) if os.path.exists(path) else {"chapters": [], "edited": []}
req = json.loads(sys.argv[2])
verb, a = req["verb"], req.get("args", {})
def out(status="ok", result=None, error=None):
    json.dump(st, open(path, "w"))
    print(json.dumps({"status": status, "result": result or {}, "error": error}))
    sys.exit(0)
find = lambda cid: next((c for c in st["chapters"] if c["id"] == cid), None)
if verb == "getProject":
    out(result={"chapters": [{"id": c["id"], "title": c["title"]} for c in st["chapters"]]})
if verb == "getChapter":
    c = find(a.get("chapterID"))
    out(result={"text": c["text"]}) if c else out("error", error="no chapter")
if verb == "createChapter":
    c = {"id": str(uuid.uuid4()).upper(), "title": a["title"], "text": a["text"]}
    ids = [x["id"] for x in st["chapters"]]
    st["chapters"].insert(ids.index(a["before"]), c) if a.get("before") in ids else st["chapters"].append(c)
    out(result={"chapterID": c["id"]})
if verb == "getOutline":
    out(result={"chapters": st.get("outline", [])})
if verb == "setOutline":
    if st.get("outlineEdited"):
        out("error", error="the author edited the outline")
    st["outline"] = a["chapters"]
    out(result={"chapters": len(a["chapters"]), "linked": sum(1 for r in a["chapters"] if r.get("linkedChapterID"))})
if verb == "proposeSuggestion":
    st.setdefault("suggestions", []).append({"chapterID": a.get("chapter"), "label": a.get("label", ""),
                                             "replacementPreview": a["replacement"][:60], "status": "pending"})
    out()
if verb == "listSuggestions":
    out(result={"suggestions": st.get("suggestions", [])})
if verb == "replaceChapter":
    if a["chapter"] in st["edited"]:
        out("error", error="the author edited this chapter")
    find(a["chapter"])["text"] = a["text"]
    out()
out("error", error="unknown verb " + verb)
"""


def built_book_and_fake_storymaker(case):
    """The fixture's book built, and a fake StoryMaker shim beside it (LandBook, SeriesBook)."""
    import contextlib
    import io
    shim = os.path.join(case.tmp, "mchatai")
    with open(shim, "w") as fh:
        fh.write(FAKE_SHIM)
    os.chmod(shim, 0o755)
    case.state = os.path.join(case.tmp, "fake-storymaker.json")
    meta = _hw.load_json(case.project.path("project.json"))
    meta["storymakerProject"] = "P1"
    _hw.save_json(case.project.path("project.json"), meta)
    ch2 = case.project.chapter(2)
    ch2["claims"] = [c for c in ch2["claims"] if c["source"] in case.project.sources]
    for c in ch2["claims"]:
        c["anchor"] = " ".join(cite.flat_sentences(ch2["text"])[0][2].split()[:6])
    _hw.save_json(case.project.chapter_path(2), ch2)
    with contextlib.redirect_stdout(io.StringIO()):
        case.assertEqual(cite.cmd_book(case.project), 0)


class LandBook(FixtureCase):
    """cite.py land: the book goes into StoryMaker without passing through a model (2026-10-04:
    the second story pasted 5,235 words as shell arguments, and apostrophes broke the quoting)."""

    def setUp(self):
        super().setUp()
        built_book_and_fake_storymaker(self)

    def land(self):
        import contextlib
        import io
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = cite.cmd_land(self.project)
        return code, out.getvalue()

    def test_an_empty_project_gets_every_chapter_in_order_and_reads_back(self):
        code, out = self.land()
        self.assertEqual(code, 0, out)
        held = _hw.load_json(self.state)["chapters"]
        self.assertEqual([c["title"] for c in held][-2:], ["Notes", "Sources"])
        with open(self.project.path("book", "01.txt")) as fh:
            self.assertEqual(held[0]["text"].strip(), fh.read().strip())
        meta = _hw.load_json(self.project.path("project.json"))
        self.assertTrue(meta.get("notesChapterID") and meta.get("sourcesChapterID"))
        self.assertEqual(self.project.chapter(1)["storymaker"]["chapterID"], held[0]["id"])
        outline = _hw.load_json(self.state)["outline"]
        self.assertEqual([r["linkedChapterID"] for r in outline], [c["id"] for c in held], "every row linked to its chapter, in order")
        self.assertIn("outline: set, 4 rows, 4 linked", out)
        code, out = self.land()
        self.assertEqual(code, 0)
        self.assertEqual(out.count(": unchanged"), 4, out)

    def test_landing_keeps_the_outline_summaries_a_plan_never_stored(self):
        # Horace Cayton's plan held no summaries, and landing blanked his outline (2026-10-05).
        plan = _hw.load_json(self.project.path("plan.json"))
        for c in plan["chapters"]:
            c.pop("summary", None)
        _hw.save_json(self.project.path("plan.json"), plan)
        st = _hw.load_json(self.state) if os.path.exists(self.state) else {"chapters": [], "edited": []}
        st["outline"] = [{"title": c["title"], "summary": f"What happens in {c['title']}.", "linkedChapterID": ""}
                         for c in plan["chapters"]]
        _hw.save_json(self.state, st)
        code, out = self.land()
        self.assertEqual(code, 0, out)
        rows = {r["title"]: r for r in _hw.load_json(self.state)["outline"]}
        for c in plan["chapters"]:
            title = (self.project.chapter(c["n"]) or {}).get("title") or c["title"]
            self.assertEqual(rows[title]["summary"], f"What happens in {c['title']}.", title)
        intro = [r for r in rows.values() if r["title"] == "Introduction"]
        if intro:
            self.assertNotIn("he or she", intro[0]["summary"])

    def test_the_outline_command_sets_the_plans_summaries_with_no_shell(self):
        import contextlib
        import io
        plan = _hw.load_json(self.project.path("plan.json"))
        plan["chapters"][0]["summary"] = "She buys the lot on Water Street, and the mill's men doubt her."
        for c in plan["chapters"][1:]:
            c.pop("summary", None)
        _hw.save_json(self.project.path("plan.json"), plan)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(cite.cmd_outline(self.project), 0)
        rows = _hw.load_json(self.state)["outline"]
        self.assertEqual(rows[0]["summary"], "She buys the lot on Water Street, and the mill's men doubt her.")
        self.assertEqual(len(rows), len(plan["chapters"]))
        self.assertIn("no `summary` for chapter(s)", out.getvalue())

    def test_the_editors_suggestions_land_once(self):
        import contextlib
        import io
        import editor
        os.makedirs(self.project.path("editor"), exist_ok=True)
        _hw.save_json(self.project.path("editor", "suggestions.json"), [
            {"chapter": 1, "chapterID": "C1", "find": "Edith Fixture came to Harbor Town", "label": "Editor: flow",
             "replacement": "In 1890 Edith Fixture came to Harbor Town, from Ohio, and stayed.", "rationale": ["why"]},
            {"chapter": 2, "chapterID": "C2", "find": "That year she opened", "label": "Editor: clarity",
             "replacement": "That year she opened her boarding house; it's on Water Street.", "rationale": ["why"]}])
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(editor.cmd_land(self.project), 0)
            self.assertEqual(editor.cmd_land(self.project), 0)
        self.assertIn("land: 2 sent, 0 already in StoryMaker, 0 not sent; 2 waiting", out.getvalue())
        self.assertIn("land: 0 sent, 2 already in StoryMaker, 0 not sent; 2 waiting", out.getvalue())

    def test_a_part_landed_by_hand_is_found_by_title_not_duplicated(self):
        _hw.save_json(self.state, {"chapters": [{"id": "HAND-NOTES", "title": "Notes", "text": "old notes"}], "edited": []})
        code, out = self.land()
        self.assertEqual(code, 0, out)
        titles = [c["title"] for c in _hw.load_json(self.state)["chapters"]]
        self.assertEqual(titles.count("Notes"), 1, titles)
        self.assertEqual(_hw.load_json(self.project.path("project.json"))["notesChapterID"], "HAND-NOTES")
        self.assertIn("Notes: replaced", out)

    def test_a_chapter_the_author_edited_is_never_replaced(self):
        self.land()
        st = _hw.load_json(self.state)
        st["edited"] = [st["chapters"][0]["id"]]
        st["chapters"][0]["text"] = "The author's own version."
        _hw.save_json(self.state, st)
        code, out = self.land()
        self.assertEqual(code, 1)
        self.assertIn("REFUSED", out)
        self.assertIn("proposeSuggestion", out)
        self.assertEqual(_hw.load_json(self.state)["chapters"][0]["text"], "The author's own version.")

    def test_a_chapter_with_quotes_and_apostrophes_lands_exactly(self):
        ch1 = self.project.chapter(1)
        self.assertIn("“", ch1["text"], "the fixture's chapter 1 carries a curly-quoted letter")
        code, out = self.land()
        self.assertEqual(code, 0, out)
        with open(self.project.path("book", "01.txt")) as fh:
            self.assertEqual(_hw.load_json(self.state)["chapters"][0]["text"].strip(), fh.read().strip())


def tiny_png(path, w, h):
    """A plain w×h PNG, written with the standard library."""
    import struct
    import zlib
    raw = b"".join(b"\x00" + bytes([200, 120, 40]) * w for _ in range(h))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                 + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


class Portraits(FixtureCase):
    """images.py portrait: a story's portrait that is never placed in a chapter, so it reaches a
    story the author has already edited (2026-10-08, "we need photos for everyone")."""

    def test_a_portrait_only_picture_is_checked_but_never_placed(self):
        import images
        os.makedirs(self.project.path("images"), exist_ok=True)
        with open(self.project.path("images", "img1.description.txt"), "w") as fh:
            fh.write("Edith Fixture at her door in 1902, photographed by the Fixture Archive.\n")
        _hw.save_json(self.project.path("images", "index.json"), [{
            "id": "img1", "title": "File:Edith Fixture.jpg", "url": "https://upload.wikimedia.org/edith.jpg",
            "license": "CC BY 2.0", "artist": "Fixture Archive", "caption": "Edith Fixture in 1902.",
            "evidence": "Edith Fixture at her door in 1902", "evidenceSource": "description",
            "chapter": -1, "after": "", "portraitOnly": True}])
        rules = {f["rule"] for f in images.image_findings(self.project)}
        self.assertFalse(rules & {"image_chapter_missing", "image_unplaced"}, rules)
        self.assertEqual(cite.chapter_images(self.project, 1), {})          # never in the text

    def test_a_public_domain_portrait_must_be_old_enough_and_backed_by_a_source(self):
        import images
        args = dict(url="https://archive.example/plate.jpg", page="https://archive.example/book", credit="A Book (1926)",
                    caption="Edith Fixture, 1926.", evidence="Edith Fixture at her door in 1902", evidence_source="s1",
                    crop=None)
        with self.assertRaises(images.Refused):               # 95 years have not passed
            images.cmd_portrait_pd(self.project, published="1990", **args)
        with self.assertRaises(images.Refused):               # the page must be a fetched source
            images.cmd_portrait_pd(self.project, published="1926", **dict(args, evidence_source="no-such-source"))

    def test_a_picture_used_by_permission_carries_its_grant(self):
        import images
        rec = {"license": images.PERMISSION, "permission": {"holder": "Courtesy MOHAI", "scope": "non-commercial",
                                                             "statedBy": "the author", "date": "2026-10-09"}}
        self.assertTrue(images.permission_ok(rec))
        self.assertFalse(images.permission_ok({"license": images.PERMISSION}))      # no grant recorded: refused
        self.assertFalse(images.licence_verdict(images.PERMISSION)[0])              # never passes as an open licence

    def test_a_crop_must_lie_inside_the_picture(self):
        import images
        self.assertEqual(images.parse_crop("0.2,0.1,0.3,0.6"), [0.2, 0.1, 0.3, 0.6])
        for bad in ("0.8,0,0.3,0.5", "0,0,0,1", "a,b", "0.1,0.1,0.2"):
            with self.assertRaises(images.Refused):
                images.parse_crop(bad)


class BookMap(unittest.TestCase):
    """book_map.py: the places a book's chapters name, pinned where the record allows (2026-10-08,
    "a places POI map that relates to each person")."""

    def setUp(self):
        import book_map
        self.bm = book_map

    @staticmethod
    def enc(pts):
        la, lo = round(pts[0][0] * 1e5), round(pts[0][1] * 1e5)
        g = [la, lo]
        for lat, lon in pts[1:]:
            a, b = round(lat * 1e5), round(lon * 1e5)
            g += [a - la, b - lo]
            la, lo = a, b
        return g

    def streets(self, *lines):
        return self.bm.Streets({"streets": [{"c": 2, "n": n, "g": self.enc(pts)} for n, pts in lines]})

    def corner_map(self):
        return self.streets(("29th Ave E", [(47.615, -122.295), (47.625, -122.295)]),
                            ("E John St", [(47.6195, -122.30), (47.6195, -122.29)]))

    def test_a_corner_is_where_the_two_streets_cross_on_todays_map(self):
        at, why = self.bm.corner(self.corner_map(), "29th Avenue and John Street")
        self.assertIsNone(why)
        self.assertAlmostEqual(at[0], 47.6195, places=3)
        self.assertAlmostEqual(at[1], -122.295, places=3)
        self.assertIsNone(self.bm.corner(self.corner_map(), "29th Avenue and Pine Street")[0])

    def test_two_streets_that_meet_in_two_places_get_no_pin(self):
        st = self.streets(("Main St", [(47.60, -122.40), (47.60, -122.30)]),
                          ("Lake Ave", [(47.59, -122.39), (47.61, -122.39)]),
                          ("Lake Ave", [(47.59, -122.31), (47.61, -122.31)]))
        at, why = self.bm.corner(st, "Lake Avenue and Main Street")
        self.assertIsNone(at)
        self.assertIn("2 places", why)

    def test_an_address_needs_its_number_its_street_and_its_quarter_in_the_city(self):
        row = lambda n, road, lat=47.611, lon=-122.33: {"lat": lat, "lon": lon, "number": n, "road": road}  # noqa: E731
        self.assertIsNotNone(self.bm.decide("1223 Seventh Avenue", [row("1223", "7th Avenue")])[0])
        # Queen Anne's 7th Avenue West is another street: the quarter is part of a Seattle address.
        self.assertIsNone(self.bm.decide("1223 Seventh Avenue", [row("1223", "7th Avenue West", 47.63, -122.367)])[0])
        self.assertIsNone(self.bm.decide("1223 Seventh Avenue", [row("1225", "7th Avenue")])[0])
        self.assertIsNone(self.bm.decide("1223 Seventh Avenue", [row("1223", "7th Avenue", 47.25, -122.44)])[0])
        two = [row("410", "22nd Avenue"), row("410", "22nd Avenue", 47.64, -122.30)]
        self.assertIn("more than one", self.bm.decide("410 22nd Avenue", two)[1])
        self.assertEqual(self.bm.query_form("1223 Seventh Avenue"), "1223 7th Avenue")

    def test_the_map_pins_what_the_record_places_and_lists_the_rest(self):
        said = lambda name, kind, **kw: dict({"name": name, "kind": kind, "s": f"They were at {name}.", "year": 1902}, **kw)  # noqa: E731
        story = {"slug": "edith", "mapPlaces": [
            (1, said("Fixture House", "landmark", landmark="FX-1")),
            (1, said("29th Avenue and John Street", "corner")),
            (2, said("1223 Seventh Avenue", "address")),
            (2, said("Seward Park", "named")),
            (3, said("Madison Street", "street")),
            (3, said("Denny Hotel", "named")),
            (3, said("214 Columbia Street", "address"))]}
        cache = {"1223 seventh avenue": {"rows": [{"lat": 47.611, "lon": -122.33, "number": "1223", "road": "7th Avenue"}]},
                 "name:seward park": {"rows": [{"lat": 47.555, "lon": -122.251, "name": "Seward Park", "type": "park"}]}}
        data = self.bm.map_data([story], {"FX-1": {"name": "Fixture House", "lat": 47.6237, "lon": -122.3143}},
                                self.corner_map(), cache)
        self.assertEqual(sorted(p["n"] for p in data["pins"]),
                         ["1223 Seventh Avenue", "29th Avenue and John Street", "Fixture House", "Seward Park"])
        why = {p["n"]: p["why"] for p in data["unplaced"]}
        self.assertIn("a street", why["Madison Street"])
        self.assertIn("may have moved or gone", why["Denny Hotel"])     # an old building's name is never guessed at
        self.assertIn("not looked up yet", why["214 Columbia Street"])
        house = next(p for p in data["pins"] if p["l"] == "FX-1")
        self.assertEqual(house["r"], [["edith", 1, 1902, "They were at Fixture House."]])

    def test_a_photo_is_of_the_place_only_when_its_title_opens_with_it_and_names_it(self):
        row = lambda n, k="named": {"name": n, "kind": k, "landmark": ""}  # noqa: E731
        ok = lambda r, title: self.bm.leads_with(r, title) and self.bm.names_place(r, title)  # noqa: E731
        self.assertTrue(ok(row("Mount Pleasant Cemetery"), "Seattle - Mount Pleasant Cemetery - Typographical Union"))
        self.assertTrue(ok(row("Mount Zion Baptist Church", "landmark"), "Mt. Zion Baptist Church, 1950"))
        self.assertTrue(ok(row("Washington Athletic Club", "landmark"), "Washington Athletic Club, southwest corner of 6th Ave"))
        # Something AT the place, or near it, is not a picture of it.
        self.assertFalse(ok(row("Lake View Cemetery"), "William F. Burris grave, Lake View Cemetery, Seattle"))
        self.assertFalse(ok(row("Seward Park"), "Lake Washington Villas, a residence near Seward Park"))
        self.assertFalse(ok(row("Garfield High School", "landmark"), "Medgar Evers Pool, circa 1973"))

    def test_an_address_is_named_by_its_number_and_its_street(self):
        row = {"name": "1729 24th Avenue", "kind": "address", "landmark": ""}
        self.assertTrue(self.bm.names_place(row, "The house at 1729 24th Avenue, about 1920"))
        self.assertFalse(self.bm.names_place(row, "24th Avenue looking north"))
        self.assertFalse(self.bm.names_place(row, "1729 25th Avenue"))

    def test_only_an_image_is_kept_as_a_picture_of_a_place(self):
        self.assertTrue(self.bm.is_image(b"\xff\xd8\xff\xe0" + b"\0" * 20))
        self.assertTrue(self.bm.is_image(b"\x89PNG\r\n\x1a\n" + b"\0" * 20))
        # A site that turns a script away answers with a web page (seattle.gov, 2026-10-09).
        self.assertFalse(self.bm.is_image(b'<html xmlns="http://www.w3.org/1999/xhtml"><script src="x.js">'))

    def test_an_addresss_cross_street_is_the_one_that_meets_it_there(self):
        st = self.streets(("2nd Ave", [(47.600, -122.334), (47.608, -122.334)]),
                          ("Columbia St", [(47.6038, -122.340), (47.6038, -122.330)]),
                          ("9th Ave", [(47.600, -122.320), (47.608, -122.320)]))
        cross = self.bm.cross_streets(st, {"name": "214 Columbia Street", "kind": "address"}, 47.6038, -122.3336)
        self.assertEqual(cross, [["second"]])      # Second Avenue, never the distant Ninth, never Columbia itself

    def test_the_lot_today_is_read_from_the_assessors_page(self):
        self.assertEqual(self.bm.parse_lot("Site Address 720 2ND AVE 98104 Property Name FOSTER &amp; MARSHALL BUILDING "
                                           "Jurisdiction SEATTLE Year Built 1921"),
                         {"yearBuilt": 1921, "name": "Foster & Marshall Building", "site": "720 2Nd Ave"})
        self.assertEqual(self.bm.parse_lot("<td>Property Name</td><td></td><td>Jurisdiction</td> Year Built 1977")["name"], "")

    def test_a_lot_that_holds_a_landmark_is_named_as_the_guide_names_it(self):
        landmarks = {"SL-0094": {"name": "1st African Methodist Episcopal Church", "address": "1522 14th Ave"}}
        # The Assessor writes the quarter the guide leaves off.
        self.assertEqual(self.bm.landmark_of_lot({"site": "1522 14Th Ave E"}, landmarks), "SL-0094")
        self.assertIsNone(self.bm.landmark_of_lot({"site": "1524 14Th Ave E"}, landmarks))
        # A lot of several buildings is dated by its oldest.
        self.assertEqual(self.bm.parse_lot("Year Built 1988 … Year Built 1912 Property Name X Jurisdiction")["yearBuilt"], 1912)

    def test_a_commons_file_name_reads_as_a_caption(self):
        self.assertEqual(self.bm.tidy_title("File:Mount Zion Baptist Church2 HRHP100002407 King County, WA.jpg"),
                         "Mount Zion Baptist Church")
        self.assertEqual(self.bm.tidy_title("File:Seattle - Garfield High School, circa 1965 (50019290713).jpg"),
                         "Garfield High School, circa 1965")

    def test_a_storys_own_picture_of_a_place_goes_on_its_pin(self):
        pictures = [({"caption": "The Cayton family on the porch of their home at 518 14th Avenue East, 1904.",
                      "license": "Public domain", "pageUrl": "https://commons.example/porch"}, "resources/img/a/img4.jpg"),
                    ({"caption": "Downtown Seattle from the water, 1910.", "license": "Public domain"}, "resources/img/a/img5.jpg")]
        landmarks = {"FX-9": {"name": "Cayton Revels House", "address": "518 14th Ave E"}}
        got = self.bm.story_photos({"name": "Cayton Revels House", "kind": "landmark", "landmark": "FX-9"}, landmarks, pictures)
        self.assertEqual([p["src"] for p in got], ["resources/img/a/img4.jpg"])   # by the landmark's address
        self.assertEqual(got[0]["credit"], "Public domain")

    def test_a_chapter_gives_its_addresses_and_corners_with_their_sentences(self):
        text = ("In 1902 they bought a house at 1729 24th Avenue.\n\n"
                "She taught music at the corner of 23rd Avenue and Olive Street until 1910.")
        got = {(p["kind"], p["name"]): p for p in self.bm.chapter_places(text, "Seattle")}
        self.assertEqual(got[("address", "1729 24th Avenue")]["year"], 1902)
        self.assertIn("Olive Street", got[("corner", "23rd Avenue and Olive Street")]["s"])


class SeriesBook(FixtureCase):
    """series_book.py: a series' landed stories as one book, read back from StoryMaker so the
    author's text wins, in the order the subjects arrived (2026-10-05, "Black Seattle").
    Borrows LandBook's fixture (a built book and a fake StoryMaker) without rerunning its tests."""

    land = LandBook.land

    ENTRY = {"id": "fixture", "title": "Fixture Lives", "book": {
        "title": "Fixture Lives", "intro": "Test lives.",
        "parts": [{"title": "Early", "from": 1800, "to": 1899}, {"title": "Later", "from": 1900}],
        "companion": {"title": "Guide", "url": "https://example.org/guide/"}}}

    def setUp(self):
        super().setUp()
        built_book_and_fake_storymaker(self)
        import series_book
        self.sb = series_book
        self._entry = series_book.series_entry
        series_book.series_entry = lambda sid: (self.ENTRY if sid == "fixture" else None, "Seattle")
        self.out = os.path.join(self.tmp, "web")
        import maps
        self._basemap = maps.basemap
        maps.basemap = lambda project, source=None: ({"streets": [], "water": [], "hoods": []}, "fixture")

    def tearDown(self):
        import maps
        maps.basemap = self._basemap
        self.sb.series_entry = self._entry
        super().tearDown()

    def build(self, publish=False, files=False, review=False):
        import contextlib
        import io
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = self.sb.cmd_build(self.tmp, "fixture", self.out, use_files=files, publish=publish, review=review)
        return code, buf.getvalue()

    def data(self):
        page = read(os.path.join(self.out, "index.html"))
        raw = re.search(r'<script id="data" type="application/json">(.*?)</script>', page, re.S).group(1)
        return json.loads(raw.replace("<\\/", "</"))

    def test_a_portrait_only_picture_is_the_storys_portrait_cropped_and_credited(self):
        if not shutil.which("sips"):
            self.skipTest("the crop uses macOS sips")
        code, out = self.land()
        self.assertEqual(code, 0, out)
        tiny_png(os.path.join(self.root, "images", "img9.png"), 200, 100)
        rows = _hw.load_json(os.path.join(self.root, "images", "index.json"), []) or []
        rows.append({"id": "img9", "title": "File:Edith Fixture.png", "url": "https://upload.wikimedia.org/edith.png",
                     "license": "CC BY 2.0", "artist": "Fixture Archive", "caption": "Edith Fixture in 1902.",
                     "evidence": "Edith Fixture at her door in 1902", "evidenceSource": "description",
                     "chapter": -1, "after": "", "portraitOnly": True, "file": "images/img9.png"})
        _hw.save_json(os.path.join(self.root, "images", "index.json"), rows)
        meta = _hw.load_json(os.path.join(self.root, "project.json"))
        meta["portrait"] = {"image": "img9", "crop": [0.5, 0, 0.5, 1]}     # the right half: a square
        _hw.save_json(os.path.join(self.root, "project.json"), meta)
        code, out = self.build(files=True)
        self.assertEqual(code, 0, out)
        story = self.data()["stories"]["edith-fixture"]
        self.assertTrue(story["portrait"].endswith("-portrait.png"), story["portrait"])
        self.assertEqual(story["portraitCredit"], "Fixture Archive, CC BY 2.0, cropped")
        self.assertEqual(self.sb.dims(os.path.join(self.out, story["portrait"])), (100, 100))
        self.assertNotIn("img9", read(os.path.join(self.out, "index.html")).split('"chapters"')[1][:4000])

    def test_the_book_maps_the_places_its_chapters_name_and_keeps_the_guides_file(self):
        code, out = self.land()
        self.assertEqual(code, 0, out)
        st = _hw.load_json(self.state)
        st["chapters"][0]["text"] += "\n\nIn 1902 she lived at 1729 24th Avenue."
        _hw.save_json(self.state, st)
        code, out = self.build()
        self.assertEqual(code, 0, out)
        data = self.data()
        self.assertEqual(data["map"]["basemap"], "resources/basemap.json")
        self.assertTrue(os.path.isfile(os.path.join(self.out, "resources", "basemap.json")))
        spot = next(p for p in data["map"]["unplaced"] if p["n"] == "1729 24th Avenue")
        self.assertIn("not looked up yet", spot["why"])            # a build never asks the network
        self.assertEqual(spot["r"][0][:3], ["edith-fixture", 1, 1902])
        self.assertNotIn("mapPlaces", data["stories"]["edith-fixture"])
        guide = _hw.load_json(os.path.join(self.out, "resources", "places.json"))
        self.assertEqual(sorted(guide), ["book", "generated", "places", "published", "url"])   # what the guide reads

    def test_the_book_is_read_back_from_storymaker_so_the_authors_edit_wins(self):
        code, out = self.land()
        self.assertEqual(code, 0, out)
        st = _hw.load_json(self.state)
        st["chapters"][0]["text"] += "\n\nA paragraph the author added in StoryMaker."
        _hw.save_json(self.state, st)
        code, out = self.build()
        self.assertEqual(code, 0, out)
        story = self.data()["stories"]["edith-fixture"]
        self.assertIn("A paragraph the author added in StoryMaker.", story["chapters"][0]["html"])
        self.assertTrue(story["draft"])

    def test_publishing_waits_for_the_authors_and_the_communitys_review(self):
        self.assertEqual(self.land()[0], 0)
        code, out = self.build(publish=True)
        self.assertEqual(code, 0, out)
        self.assertEqual(self.data()["order"], [], "an unreviewed story must not be published")
        self.assertIn("held", out)
        meta = _hw.load_json(self.project.path("project.json"))
        meta["review"] = {"author": "2026-10-05", "community": {"reader": "a reader", "date": "2026-10-05"}}
        _hw.save_json(self.project.path("project.json"), meta)
        code, out = self.build(publish=True)
        self.assertEqual(code, 0, out)
        self.assertEqual(self.data()["order"], ["edith-fixture"])
        self.assertFalse(self.data()["stories"]["edith-fixture"]["draft"])

    def test_a_held_storys_pictures_are_not_carried_by_a_review_copy(self):
        if not shutil.which("sips"):
            self.skipTest("the hosted pictures use macOS sips")
        self.assertEqual(self.land()[0], 0)
        tiny_png(os.path.join(self.root, "images", "img9.png"), 40, 30)
        rows = _hw.load_json(os.path.join(self.root, "images", "index.json"), []) or []
        rows.append({"id": "img9", "title": "File:Door.png", "url": "https://upload.wikimedia.org/door.png", "license": "PD",
                     "caption": "A door.", "chapter": 1, "file": "images/img9.png"})
        _hw.save_json(os.path.join(self.root, "images", "index.json"), rows)
        st = _hw.load_json(self.state)
        st["chapters"][0]["text"] += "\n\n![A door.](https://upload.wikimedia.org/door.png)"
        _hw.save_json(self.state, st)
        code, out = self.build(review=True)                  # unsigned: the story is held
        self.assertEqual(self.data()["order"], [])
        self.assertEqual(self.data()["pics"], {}, "a held story's pictures count against the deploy's cap")

    def test_a_review_copy_needs_only_the_authors_sign_off(self):
        self.assertEqual(self.land()[0], 0)
        code, out = self.build(review=True)
        self.assertEqual(self.data()["order"], [], "an unsigned story is not sent to reviewers")
        meta = _hw.load_json(self.project.path("project.json"))
        meta["review"] = {"author": "2026-10-05"}
        _hw.save_json(self.project.path("project.json"), meta)
        code, out = self.build(review=True)
        self.assertEqual(code, 0, out)
        data = self.data()
        self.assertEqual(data["order"], ["edith-fixture"])
        self.assertTrue(data["book"]["reviewCopy"])
        self.assertEqual(data["book"]["canonical"], "")
        self.assertIn('content="noindex"', read(os.path.join(self.out, "index.html")))
        places = _hw.load_json(os.path.join(self.out, "resources", "places.json"))
        self.assertFalse(places["published"], "the landmark guide never links a review copy")

    def test_a_picture_the_hosted_page_cannot_show_refuses_a_published_book(self):
        meta = _hw.load_json(self.project.path("project.json"))
        meta["review"] = {"author": "2026-10-05", "community": {"reader": "a reader", "date": "2026-10-05"}}
        _hw.save_json(self.project.path("project.json"), meta)
        with open(self.project.path("book", "01.txt"), "a", encoding="utf-8") as fh:
            fh.write("\n\n![A picture with no record. Someone, Public domain.](https://example.org/x.jpg)\n")
        code, out = self.build(publish=True, files=True)
        self.assertEqual(code, 1, out)
        self.assertIn("no local copy of the picture", out)
        code, out = self.build(files=True)
        self.assertEqual(code, 0, "a draft for the author still builds, and says so")
        self.assertIn("problem:", out)

    def test_a_folder_the_tool_did_not_make_is_never_emptied(self):
        os.makedirs(os.path.join(self.out, "resources"))
        with open(os.path.join(self.out, "resources", "keep.txt"), "w") as fh:
            fh.write("someone else's")
        code, out = self.build(files=True)
        self.assertEqual(code, 2, out)
        self.assertTrue(os.path.exists(os.path.join(self.out, "resources", "keep.txt")))

    def test_render_pictures_landmarks_and_each_paragraphs_sources(self):
        ctx = {"picture": lambda url, alt: "resources/img/x.jpg"}
        md = ("The house at [518 14th Avenue East](https://mchatai.com/seattle-landmarks/#/l/SL-0648) stood.\n\n"
              "![A house. Someone, Public domain.](https://example.org/a.jpg)\n\n"
              "[![A map.](file:///tmp/m.svg)](https://mchatai.com/seattle-landmarks/#/l/SL-0284)\n\n"
              "He came to Seattle in 1859 or soon after.")
        html_ = self.sb.render(md, ctx, [("He came to Seattle in 1859", [3, 12])], "w")
        self.assertIn('class="lm" data-l="SL-0648"', html_)
        self.assertIn('<figure><img data-src="resources/img/x.jpg"', html_,
                      "a copied picture is filled in by the page: from text on a hosted copy")
        self.assertIn('data-l="SL-0284"', html_)
        self.assertNotIn('class="lm" data-l="SL-0284"', html_, "a linked map is a picture, not a pinned phrase")
        self.assertIn('<a href="#/p/w/sources/3">3</a>,<a href="#/p/w/sources/12">12</a>', html_)
        self.assertEqual(ctx["places"], ["SL-0648", "SL-0284"])
        self.assertNotIn("javascript:", self.sb.render("Click [here](javascript:alert(1)).", {"picture": str}))
        self.assertIn('href="https://en.wikipedia.org/wiki/William_Grose_(pioneer)"',
                      self.sb.render("See [it](https://en.wikipedia.org/wiki/William_Grose_(pioneer)).", {"picture": str}))

    def test_a_part_says_where_its_people_arrived_and_takes_the_years_before_it(self):
        # The Bush family settled on Puget Sound in 1845, six years before Seattle began; the
        # author opened a part for them (2026-10-08). A dossier with no arrival event dates its
        # story from a birth year, which used to fall into the LAST part.
        parts = [{"title": "North of the Columbia", "from": 1844, "to": 1850, "arrivedIn": "on Puget Sound"},
                 {"title": "The settler town", "from": 1851, "to": 1888}, {"title": "Later", "from": 1889}]
        self.assertEqual(self.sb.part_for(1832, parts), 0, "a year before every part files into the first")
        self.assertEqual(self.sb.part_for(1845, parts), 0)
        self.assertEqual(self.sb.part_for(1859, parts), 1)
        self.assertEqual(self.sb.part_for(None, parts), 2, "no year at all still goes last")
        year, _ = self.sb.arrival(self.project, "Seattle")
        default = self.ENTRY
        try:
            type(self).ENTRY = json.loads(json.dumps(default))
            self.ENTRY["book"]["parts"] = [{"title": "First", "from": year, "to": year, "arrivedIn": "on Puget Sound"},
                                           {"title": "After", "from": year + 1}]
            code, out = self.build(files=True)
            self.assertEqual(code, 0, out)
            self.assertEqual(self.data()["stories"]["edith-fixture"]["arrivedIn"], "on Puget Sound")
        finally:
            type(self).ENTRY = default
        code, out = self.build(files=True)
        self.assertNotIn("arrivedIn", self.data()["stories"]["edith-fixture"], "a part that names no place adds nothing")

    def test_a_size_word_sizes_the_figure_and_never_shows_as_text(self):
        html_ = self.sb.render('![Moran. Public domain.](https://x.org/m.jpg "small")\n\nPlain [link](https://x.org "a title").',
                               {"picture": lambda url, alt: "resources/img/m.jpg"})
        self.assertIn('<figure class="size-small">', html_)
        self.assertNotIn("small", self.sb.plain('![a](https://x.org/a.jpg "small") words'))
        self.assertEqual(self.sb.render("![x](https://x.org/x.jpg \"huge\")", {"picture": lambda u, a: u}).count("size-"), 0,
                         "only the four size words are sizes")

    def test_years_portraits_and_first_sentences(self):
        self.assertEqual(self.sb.span("The Rainier Club, 1889 to 1904"), ("The Rainier Club", 1889, 1904))
        self.assertEqual(self.sb.span("Pioneer Square, 1859-1882"), ("Pioneer Square", 1859, 1882))
        self.assertEqual(self.sb.span("The 1909 election"), ("The 1909 election", None, None))
        names = ["Powell Barnett", "Powell S. Barnett"]
        self.assertTrue(self.sb.is_portrait("Powell Barnett, about 1950.", names))
        self.assertTrue(self.sb.is_portrait("Seattle City Councilmember Powell Barnett, June 1960", names))
        self.assertFalse(self.sb.is_portrait("Powell Barnett (second from left) shown the plans", names))
        self.assertFalse(self.sb.is_portrait("Powell Barnett Park, in Leschi.", names))
        self.assertFalse(self.sb.is_portrait("Carver Barnett, his grandson, 2001.", names))
        self.assertEqual(self.sb.first_sentence("In 1947 she began teaching at Frank B. Cooper School. Then more."),
                         "In 1947 she began teaching at Frank B. Cooper School.")

    def test_arrival_is_the_earliest_arrival_that_names_the_place(self):
        d = _hw.load_json(self.project.path("dossier.json"))
        d["events"] = [{"id": "a", "date": "1885", "what": "Moved to Kansas.", "lifeStage": "arrival"},
                       {"id": "b", "date": "1890", "what": "Arrived in Seattle.", "lifeStage": "arrival"},
                       {"id": "c", "date": "1870", "what": "Born.", "lifeStage": "birth"}]
        _hw.save_json(self.project.path("dossier.json"), d)
        self.assertEqual(self.sb.arrival(self.project, "Seattle")[0], 1890)
        d["events"] = [e for e in d["events"] if e["id"] == "a"]
        _hw.save_json(self.project.path("dossier.json"), d)
        self.assertEqual(self.sb.arrival(self.project, "Seattle")[0], 1885)


class Survey(unittest.TestCase):
    """survey.py: the long list's pure parts. Leads, not members (2026-10-05)."""

    def setUp(self):
        import survey
        self.sv = survey

    def test_the_place_lens_tells_a_life_here_from_a_visit(self):
        # Lawrence, 2026-10-08: "people who lived and worked in Seattle (not just people who passed
        # through) and the significant places that they lived and worked."
        lens = self.sv.place_lens(["Edith Fixture came to Seattle in 1902. She opened a barbershop at 1520 Jackson "
                                   "Street. In 1912 she moved to Fixtureville, Oregon. She opened a bank at 40 Main Street."],
                                  ["Seattle"], born=1880, died=1950)
        self.assertEqual(self.sv.life_of(lens), "lived and worked")
        self.assertEqual(lens["from"], 1902)
        names = [x["name"] for x in lens["places"]]
        self.assertIn("1520 Jackson Street", names)
        self.assertNotIn("40 Main Street", names, "after the move away, the places are not Seattle's")
        visit = self.sv.place_lens(["Della Visitor performed in Seattle in 1950 on a national tour."], ["Seattle"])
        self.assertEqual(self.sv.life_of(visit), "passed through")
        chief = self.sv.place_lens(["Bush befriended Chief Seattle and lived among the Nisqually."], ["Seattle"])
        self.assertEqual(self.sv.life_of(chief), "", "the chief is not the city")
        org = self.sv.place_lens(["In Seattle she founded the Fixture Charity Club and taught at the Fixture School."], ["Seattle"])
        self.assertEqual([x["name"] for x in org["places"]], ["Fixture School"], "a club she founded is an organisation, a school she taught AT a place")

    def test_the_landmark_guide_names_its_black_residents_and_takes_the_authors_seeds(self):
        text = ("Richard and Mildred Fixture met at the plant in 1962. He was a Black engineer from Mississippi. "
                "The Fixtures ran their company out of unit 9 and lived in the next apartment. Matthew Hudson, a Black teacher, "
                "was vice president. "
                "The building faces the Black Ball Line dock.")
        found, _ = self.sv.guide_people(text)
        self.assertEqual(set(found), {"Matthew Hudson"}, "a couple named together leaves 'He' unresolved; a line is not a person")
        rows = self.sv.guide_rows({"id": "SL-9999", "name": "Fixture Hall", "text": text}, lambda lid: "https://x.org/#/l/" + lid,
                                  ["Richard Fixture"])
        richard = next(r for r in rows if r["name"] == "Richard Fixture")
        self.assertEqual(self.sv.life_of(richard["lens"]), "lived and worked",
                         "'a Black engineer from Mississippi' says where he came from; it does not take him away from the landmark")
        self.assertEqual(richard["lens"]["places"][0]["landmark"], "SL-9999")
        self.assertEqual(richard["source"]["site"], "Seattle Landmarks")

    def test_a_guide_spelling_joins_the_story_it_names(self):
        stories = os.path.join(tempfile.mkdtemp(), "stories")
        os.makedirs(os.path.join(stories, "william-grose"))
        with open(os.path.join(stories, "william-grose", "dossier.json"), "w") as fh:
            json.dump({"subject": "William Grose", "aliases": ["William Gross", "Grose"]}, fh)
        self.assertEqual(self.sv.canonical_names(stories), {"william gross": "William Grose"})

    def test_life_dates_read_every_form_the_encyclopedias_use(self):
        self.assertEqual(self.sv.life_dates("1883-1971"), (1883, 1971, False))
        self.assertEqual(self.sv.life_dates("b. 1946"), (1946, None, True))
        self.assertEqual(self.sv.life_dates("1986-  "), (1986, None, True))
        self.assertEqual(self.sv.life_dates("1812-?"), (1812, None, False))
        self.assertEqual(self.sv.life_dates("1835?-1860?"), (1835, 1860, False))

    def test_one_person_under_two_spellings_is_one_row(self):
        rows = [
            {"name": "Norman B. Rice", "born": 1943, "died": None, "living": True, "summary": "a",
             "source": {"site": "HistoryLink", "url": "u1", "title": "Rice, Norman B. (b. 1943)"}},
            {"name": "Norm Rice", "born": 1943, "died": None, "living": True, "summary": "b",
             "source": {"site": "BlackPast", "url": "u2", "title": "Norm Rice (1943-  )"}},
            {"name": "Emanuel Lopes", "born": 1812, "died": 1895, "living": False,
             "source": {"site": "BlackPast", "url": "u3", "title": "Emanuel Lopes (1812-1895)"}},
            {"name": "Manuel Lopes", "born": 1812, "died": None, "living": False,
             "source": {"site": "HistoryLink", "url": "u4", "title": "Lopes, Manuel (1812-?)"}},
            {"name": "Horace Roscoe Cayton Sr.", "born": 1859, "died": 1940, "living": False,
             "source": {"site": "HistoryLink", "url": "u5", "title": "x"}},
            {"name": "Horace R. Cayton Jr.", "born": 1903, "died": 1970, "living": False,
             "source": {"site": "HistoryLink", "url": "u6", "title": "y"}},
            {"name": "Zoe Dusanne", "born": 1884, "died": 1972, "living": False,
             "source": {"site": "HistoryLink", "url": "u7", "title": "Dusanne, Zoe (1884-1972)"}},
            {"name": "Zoë Dusanne", "born": 1884, "died": 1972, "living": False,
             "source": {"site": "BlackPast", "url": "u8", "title": "Zoë Dusanne (1884-1972)"}},
        ]
        people = self.sv.merge(rows)
        self.assertEqual(len(people), 5, [p["names"] for p in people])
        lopes = next(p for p in people if "Manuel Lopes" in p["names"])
        self.assertEqual(lopes["died"], 1895)

    def test_a_son_or_grandson_with_the_same_name_is_not_our_story(self):
        tmp = tempfile.mkdtemp(prefix="hw-survey-")
        try:
            root = os.path.join(tmp, "john-t-gayton")
            os.makedirs(os.path.join(root, "book"))
            _hw.save_json(os.path.join(root, "project.json"), {"slug": "john-t-gayton", "subject": "John Thomas Gayton"})
            _hw.save_json(os.path.join(root, "dossier.json"), {"subject": "John Thomas Gayton",
                          "aliases": ["John T. Gayton"], "lifespan": {"born": "", "died": "1954"}})
            _hw.save_json(os.path.join(root, "book", "manifest.json"), {"chapters": []})
            people = [{"name": n, "names": [n], "born": b} for n, b in
                      (("John T. Gayton", 1866), ("John Jacob Gayton", 1899), ("John Cyrus Gayton", 1931))]
            self.sv.status_of(people, tmp, [])
            self.assertEqual([p.get("status") for p in people], ["written", None, None])
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_a_nickname_merges_only_with_the_same_birth_year(self):
        row = lambda n, b: {"name": n, "born": b, "died": None, "living": False,
                            "source": {"site": "x", "url": n, "title": n}}
        self.assertEqual(len(self.sv.merge([row("Sam Smith", 1922), row("Samuel J. Smith", 1922)])), 1)
        self.assertEqual(len(self.sv.merge([row("Sam Smith", 1922), row("Samuel Smith", 1950)])), 2)

    def test_notable_from_is_a_role_or_arrival_in_the_place_never_a_birth(self):
        text = ("Bruce Harrell was born in Seattle in 1958. He graduated from Garfield High School in 1976. "
                "In 2007 he was elected to the Seattle City Council. He became mayor of Seattle in 2022.")
        self.assertEqual(self.sv.notable_from(text, 1958, ["Seattle"])[0], 2007)
        self.assertEqual(self.sv.notable_from("Lopes arrived in Seattle in 1852 and opened a barbershop.", 1812,
                                              ["Seattle"])[0], 1852)
        self.assertIsNone(self.sv.notable_from("She was born in Seattle in 1957.", 1957, ["Seattle"]))

    def test_fields_come_from_the_summary(self):
        self.assertEqual(self.sv.field_of("a jazz pianist and bandleader"), "music")
        self.assertEqual(self.sv.field_of("the first Black mayor of Seattle"), "government & law")
        self.assertEqual(self.sv.field_of("pastor of Mount Zion Baptist Church"), "faith")


class Fetching(FixtureCase):
    def test_html_to_text_keeps_inline_words_together(self):
        import fetch
        title, text = fetch.html_to_text("<html><head><title>T &amp; U</title><script>var x=1</script></head>"
                                         "<body><p>He was <em>elected</em> wreck&shy;master in <b>1892</b>.</p>"
                                         "<p>Second&nbsp;paragraph.</p></body></html>")
        self.assertEqual(title, "T & U")
        self.assertIn("He was elected wreck\u00admaster in 1892.", text)
        self.assertIn("\n\nSecond paragraph.", text)
        self.assertNotIn("var x", text)

    def test_page_furniture_is_not_the_document(self):
        import fetch
        body = "She wrote for the paper every week, and the paper printed her stories. " * 6
        page = ("<html><head><title>T</title></head><body><header><nav>Home About Donate</nav>Banner</header>"
                "<div role='navigation'>Law Justice Watchdog</div><main><article><header><h1>Edith Fixture</h1></header>"
                f"<p>{body}</p><aside>Related people</aside></article></main><footer>Copyright Privacy</footer>"
                "<form><button>Subscribe</button></form></body></html>")
        _, text = fetch.html_to_text(page)
        for junk in ("Donate", "Banner", "Watchdog", "Related", "Copyright", "Subscribe"):
            self.assertNotIn(junk, text)
        self.assertTrue(text.startswith("Edith Fixture"), "an article's own header is its title")
        # No <main>/<article>: the whole page, minus the furniture.
        _, text = fetch.html_to_text(f"<html><body><nav>Menu</nav><div><p>{body}</p></div></body></html>")
        self.assertNotIn("Menu", text)
        self.assertIn("She wrote for the paper", text)

    def test_text_mode_reads_an_aiweb_reply_and_refuses_a_stub(self):
        import io
        import fetch
        reply = json.dumps({"status": "ok", "result": {"title": "A page", "text": " ".join(["word"] * 80)}})
        old = sys.stdin
        try:
            sys.stdin = io.StringIO(reply)
            rc = fetch.main(["fetch.py", "text", self.root, "--url", "https://example.invalid/a",
                             "--publisher", "Example", "--kind", "archive", "--license", "facts-only", "--id", "s20"])
            self.assertEqual(rc, 0)
            rec = self.project.sources["s20"]
            self.assertEqual((rec["via"], rec["title"], rec["words"]), ("aiweb", "A page", 80))
            sys.stdin = io.StringIO("Access denied.")
            rc = fetch.main(["fetch.py", "text", self.root, "--url", "https://example.invalid/b",
                             "--publisher", "Example", "--kind", "archive", "--license", "facts-only", "--id", "s21"])
            self.assertEqual(rc, 3, "a blocked page must never become a source")
            self.assertNotIn("s21", self.project.sources)
        finally:
            sys.stdin = old

    def test_plain_text_is_kept_whole_not_read_as_a_page(self):
        # archive.org serves a book's OCR as text/plain; read as HTML, a stray "<" in it swallowed
        # 70% of a volume (the George Bush scout, 2026-10-08).
        import email.message
        import fetch
        import urllib.request
        ocr = ("Bush settled on the prairie. " * 40) + "the sum <ere was paid " + ("The claim was confirmed at last. " * 40)
        self.assertTrue(fetch.is_plain_text("text/plain; charset=utf-8", "https://archive.org/download/x/x_djvu.txt", ocr))
        self.assertTrue(fetch.is_plain_text("", "https://archive.org/stream/x/x_djvu.txt", ocr))
        self.assertFalse(fetch.is_plain_text("text/plain", "https://x.org/a.txt", "<!DOCTYPE html><html><body>x</body></html>"))
        self.assertFalse(fetch.is_plain_text("text/html", "https://x.org/a", ocr))

        class Resp:
            def __init__(self):
                self.headers = email.message.Message()
                self.headers["Content-Type"] = "text/plain; charset=utf-8"

            def read(self, n=-1):
                return ocr.encode()

            def geturl(self):
                return "https://archive.org/download/x/x_djvu.txt"

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        real = urllib.request.urlopen
        urllib.request.urlopen = lambda req, timeout=None: Resp()
        try:
            rc = fetch.main(["fetch.py", "fetch", self.root, "https://archive.org/download/x/x_djvu.txt",
                             "--publisher", "Archive", "--kind", "book", "--license", "pd", "--id", "s30"])
        finally:
            urllib.request.urlopen = real
        self.assertEqual(rc, 0)
        self.assertTrue(read(self.project.path("sources", "s30.txt")).rstrip().endswith("The claim was confirmed at last."),
                        "every word after the stray '<' is kept")
        self.assertTrue(os.path.exists(self.project.path("sources", "s30.raw.txt")))

    def test_json_reply_yields_its_document_text(self):
        import fetch
        body = json.dumps({"/service/ndnp/x/0002.xml": {"full_text": "The Seattle Republican\nH. R. Cayton, Editor\nSusie Revels Cayton, Associate"}})
        self.assertEqual(fetch.json_text(body), "The Seattle Republican\nH. R. Cayton, Editor\nSusie Revels Cayton, Associate")
        self.assertIsNone(fetch.json_text(json.dumps({"results": [{"id": "x", "count": 3}]})))

    def test_meta_refresh_stub_names_its_target(self):
        import fetch
        stub = '<html><head><meta http-equiv="refresh" content="0; url=segregated.shtml"></head><body>Moved.</body></html>'
        self.assertEqual(fetch.meta_refresh_target(stub, "https://depts.washington.edu/civilr/segregated.htm"),
                         "https://depts.washington.edu/civilr/segregated.shtml")
        self.assertIsNone(fetch.meta_refresh_target("<html><body><p>A real page.</p></body></html>", "https://x.org/"))

    def test_bot_checks_are_recognised(self):
        import fetch
        self.assertTrue(fetch.is_challenge("<html><title>Just a moment...</title><div id=cf_chl_opt></div></html>"))
        self.assertFalse(fetch.is_challenge("<html><p>John T. Gayton waited tables at the Rainier Club.</p></html>"))

    def test_the_clock_is_shared_not_per_agent(self):
        import fetch
        self.assertNotIn("claude-501", fetch.clock_dir(), "a per-agent temp folder is not a shared clock")

    def test_requests_to_one_host_are_spaced(self):
        import fetch, time as _t, uuid as _u
        host = "test-" + _u.uuid4().hex[:8] + ".invalid"
        t0 = _t.time()
        fetch.throttle(host, 0.3)
        fetch.throttle(host, 0.3)
        self.assertGreaterEqual(_t.time() - t0, 0.29)

    def test_catalogue_record_fields_become_text(self):
        import fetch
        rec = json.dumps({"fields": [{"label": "Title", "value": "Thelma Dewitty, teacher"},
                                     {"label": "Date", "value": "1947"}, {"label": "Notes", "value": ""}]})
        self.assertEqual(fetch.json_text(rec), "Title: Thelma Dewitty, teacher\nDate: 1947")

    def test_quoted_titles_are_not_dialogue(self):
        self.assertTrue(voice_lint.is_title("The Seattle Republican"))
        self.assertTrue(voice_lint.is_title("Up From Slavery"))
        self.assertFalse(voice_lint.is_title("We will have a library in this town"))


class Offspin(unittest.TestCase):
    """fame.py: famous lives tied to places. Fictional people and places; no network."""

    ARTICLE = ("FIXTURE — fictional. Della Fixture was an American singer. Fixture was the first African-American "
               "woman to lead the Harbor Town Choral Society, which she did from 1931. She studied at Harbor Town "
               "High School from 1924 to 1928, and she sang every Saturday at the Blue Lantern Club on Water Street "
               "through the 1930s. She is buried at Hillside Cemetery in Far Valley.")

    def setUp(self):
        import fame
        self.fame = fame
        self.real = (fame.config, fame.landmarks)
        cfg = {"caps": {"people": 2, "candidatesToRead": 5, "sourcesPerPerson": 3, "tiesPerPerson": 8,
                        "vignetteWords": [10, 80], "pageviewMonths": 12},
               "tieKinds": ["studied", "performed", "buried", "lived"],
               "runs": [{"id": "fx-run", "identityTerms": ["African American", "African-American", "Black"],
                         "localTerms": ["Harbor Town"], "placeTerms": ["Water Street"], "landmarkPack": "fx",
                         "region": {"anchorLat": 47.6, "anchorLon": -122.3, "radiusKm": 40}}]}
        fame.config = lambda: cfg
        fame.landmarks = lambda run: {"FX-1": {"id": "FX-1", "name": "Harbor Town High School", "lat": 47.61,
                                               "lon": -122.31, "address": "1 School St"}}
        self.tmp = tempfile.mkdtemp(prefix="hw-fame-")
        self.run_dir = os.path.join(self.tmp, "run")
        root = os.path.join(self.run_dir, "della-fixture")
        os.makedirs(os.path.join(root, "sources"))
        _hw.save_json(os.path.join(self.run_dir, "candidates.json"), {"run": "fx-run", "candidates": []})
        with open(os.path.join(root, "sources", "wp.txt"), "w") as fh:
            fh.write(self.ARTICLE)
        _hw.save_json(os.path.join(root, "sources", "index.json"),
                      [{"id": "wp", "publisher": "Wikipedia", "kind": "encyclopedia", "license": "facts-only", "file": "sources/wp.txt"}])
        _hw.save_json(os.path.join(root, "project.json"),
                      {"slug": "della-fixture", "subject": "Della Fixture", "run": "fx-run", "identitySource": "wp",
                       "identityEvidence": "Fixture was the first African-American woman to lead the Harbor Town Choral Society"})
        self.ties = [
            {"id": "t1", "place": "Harbor Town High School", "landmark": "FX-1", "kind": "studied", "date": "1924-1928",
             "what": "studied at Harbor Town High School", "source": "wp",
             "evidence": "She studied at Harbor Town High School from 1924 to 1928"},
            {"id": "t2", "place": "Blue Lantern Club", "address": "Water Street", "kind": "performed", "date": "1930s",
             "what": "sang every Saturday", "source": "wp", "wikipedia": "Blue Lantern Club",
             "evidence": "she sang every Saturday at the Blue Lantern Club on Water Street"},
            {"id": "t3", "place": "Hillside Cemetery", "kind": "buried", "date": "", "source": "wp",
             "wikipedia": "Hillside Cemetery", "evidence": "She is buried at Hillside Cemetery in Far Valley"}]
        self.project = _hw.Project(root)
        self.write_ties()

    def tearDown(self):
        self.fame.config, self.fame.landmarks = self.real
        shutil.rmtree(self.tmp, ignore_errors=True)

    def write_ties(self):
        _hw.save_json(self.project.path("ties.json"), {"ties": self.ties})

    def rules(self):
        return {f["rule"] for f in self.fame.tie_findings(self.project) if f["severity"] == "hard"}

    def test_checked_ties_pass_and_an_undated_one_is_a_note(self):
        found = self.fame.tie_findings(self.project)
        self.assertEqual([f["rule"] for f in found if f["severity"] == "hard"], [])
        self.assertIn("tie_undated", {f["rule"] for f in found})

    def test_a_tie_needs_a_quote_that_names_its_place(self):
        self.ties[1]["evidence"] = "She is buried at Hillside Cemetery in Far Valley"
        self.write_ties()
        self.assertIn("tie_place_unnamed", self.rules())

    def test_a_tie_quote_must_be_verbatim_and_its_landmark_real(self):
        self.ties[0]["evidence"] = "She studied at Harbor Town High School from 1925 to 1928"
        self.ties[1]["landmark"] = "FX-404"
        self.write_ties()
        self.assertTrue({"quote_not_found", "landmark_unknown"} <= self.rules())

    def test_identity_needs_a_statement_of_identity(self):
        pj = _hw.load_json(self.project.path("project.json"))
        pj["identityEvidence"] = "She studied at Harbor Town High School from 1924 to 1928"
        _hw.save_json(self.project.path("project.json"), pj)
        self.assertIn("identity_term_missing", self.rules())

    def test_identity_may_come_from_another_fetched_source(self):
        with open(self.project.path("sources", "s2.txt"), "w") as fh:
            fh.write("FIXTURE. The Harbor Town Clarion profiled Della Fixture, an African American singer and "
                     "choir leader, in its spring issue of 1931, praising her Saturday performances at length.")
        rows = _hw.load_json(self.project.path("sources", "index.json"))
        rows.append({"id": "s2", "publisher": "Harbor Town Clarion", "kind": "news", "license": "pd", "file": "sources/s2.txt"})
        _hw.save_json(self.project.path("sources", "index.json"), rows)
        pj = _hw.load_json(self.project.path("project.json"))
        pj.update(identityEvidence="Della Fixture, an African American singer and choir leader, in its spring issue",
                  identitySource="s2")
        _hw.save_json(self.project.path("project.json"), pj)
        self.assertEqual(self.rules() & {"identity_missing", "identity_not_verbatim", "identity_term_missing"}, set())
        pj.pop("identityEvidence")
        _hw.save_json(self.project.path("project.json"), pj)
        self.assertIn("identity_missing", self.rules(), "a person with no recorded statement never passes")

    def test_identity_terms_respect_capitals(self):
        self.assertEqual(list(self.fame.term_hits("a black coat", ["Black"])), [])
        self.assertEqual(list(self.fame.term_hits("a Black newspaper", ["Black"])), ["Black"])
        self.assertEqual(list(self.fame.term_hits("an african-american choir", ["African-American"])), ["African-American"])

    def test_places_lists_landmarks_terms_and_named_places(self):
        found = self.fame.place_mentions(self.project, self.fame.run_config("fx-run"), self.fame.landmarks(None))
        kinds = {r["name"]: r["kind"] for r in found.values()}
        self.assertEqual(kinds.get("Harbor Town High School"), "landmark")
        self.assertEqual(kinds.get("Water Street"), "term")
        self.assertIn("Blue Lantern Club", kinds)
        self.assertIn("Hillside Cemetery", kinds)

    def test_merge_places_landmarks_and_articles_and_drops_far_places(self):
        import contextlib
        import io
        stub = {"Blue Lantern Club": (47.60, -122.33), "Hillside Cemetery": (46.5, -120.0)}   # ~170 km away
        with contextlib.redirect_stdout(io.StringIO()):
            self.fame.cmd_merge(self.run_dir, lookup=lambda titles: {t: stub[t] for t in titles if t in stub})
        out = _hw.load_json(os.path.join(self.run_dir, "places.json"))
        names = {p["name"]: p for p in out["places"]}
        self.assertEqual(names["Harbor Town High School"]["category"], "Landmark")
        self.assertEqual(names["Harbor Town High School"]["lat"], 47.61, "a landmark's coordinates come from the pack")
        self.assertEqual(names["Blue Lantern Club"]["category"], "Not a landmark")
        self.assertEqual([p["name"] for p in out["elsewhere"]], ["Hillside Cemetery"])
        with open(os.path.join(self.run_dir, "places.csv")) as fh:
            header = fh.readline().strip().split(",")
        self.assertEqual(header[:4], ["id", "name", "lat", "lon"], "the Ledger place-pack exporter reads these names")

    def test_merge_leaves_out_a_person_whose_ties_fail(self):
        import contextlib
        import io
        self.ties[0]["evidence"] = "nothing like this is in the article at all, not one word"
        self.write_ties()
        with contextlib.redirect_stdout(io.StringIO()):
            self.fame.cmd_merge(self.run_dir, lookup=lambda titles: {})
        out = _hw.load_json(os.path.join(self.run_dir, "places.json"))
        self.assertEqual(out["places"], [])
        self.assertEqual(len(out["skipped"]), 1)

    def test_sub_story_gate_has_a_ceiling_and_no_plan(self):
        _hw.save_json(self.project.chapter_path(1), {"chapter": 1, "title": "Della Fixture's Harbor Town",
                      "text": "She studied at Harbor Town High School from 1924 to 1928. " * 12,
                      "claims": [{"id": "c1", "kind": "fact", "source": "wp", "text": "studied",
                                  "evidence": "She studied at Harbor Town High School from 1924 to 1928"}]})
        rules = {f["rule"] for f in self.fame.vignette_findings(self.project, 1) if f["severity"] == "hard"}
        self.assertIn("over_ceiling", rules)
        self.assertNotIn("plan_chapter_missing", rules, "a sub-story has no plan and needs none")

    def test_sentences_drop_headings_and_split_paragraphs(self):
        self.assertEqual(self.fame.sentences("He sang. She played.\n\n== Early life ==\n\nHe was born in 1942"),
                         ["He sang.", "She played.", "He was born in 1942"])

    def test_place_names_stay_in_their_sentence(self):
        text = ("Her London flat at 23 Brook Street, London, has a plaque. The Charles H. Wright Museum honored her.\n"
                "It was rebranded as Handel Fixture House.\nThe Electric Lady Studio opened. "
                "In Seattle she sang at the Blue Lantern Club every week.")
        names = [self.fame.clean_name(m.group(1)) for rx in (self.fame.GENERIC, self.fame.STREET) for m in rx.finditer(text)]
        self.assertEqual(self.fame.clean_name("Central District Jimi Fixture Park", ["Central District"]), "Jimi Fixture Park")
        self.assertIn("Charles H. Wright Museum", names)
        self.assertFalse([n for n in names if "\n" in n or "House. The" in n], names)
        i = text.index("23 Brook Street")
        self.assertNotIn("Seattle", self.fame.sentence_of(text, i, i + 15))
        j = text.index("Blue Lantern Club")
        self.assertIn("Seattle", self.fame.sentence_of(text, j, j + 17))

    def test_month_window_is_whole_months(self):
        import datetime
        start, end, label = self.fame.month_window(12, today=datetime.date(2026, 10, 2))
        self.assertEqual(label, "2025-10..2026-09")
        self.assertEqual((start, end), ("2025100100", "2026093000"))


class ContentContracts(unittest.TestCase):
    def test_lint_rules_compile_and_landmark_rules_are_carried(self):
        rules = _hw.lint_rules()
        for r in rules:
            re.compile(r["pattern"], re.I)
            self.assertIn(r["severity"], ("hard", "soft"), r["id"])
        self.assertEqual(sum(1 for r in rules if r["origin"] == "landmark-v8"), 13)

    def test_every_rule_named_in_the_voice_is_enforced_somewhere(self):
        voice = read(os.path.join(_hw.HISTORY, "voice.md"))
        named = set()
        for bracket in re.findall(r"\[([a-z_, A-Za-z.0-9]+)\]", voice):
            named |= set(re.findall(r"\b[a-z]+(?:_[a-z]+)+\b", bracket))
        rule_ids = {r["id"] for r in _hw.lint_rules()}
        tools = "".join(read(os.path.join(HERE, f))
                        for f in os.listdir(HERE) if f.endswith(".py") and f != "test_tools.py")
        missing = sorted(n for n in named if n not in rule_ids and f'"{n}"' not in tools)
        self.assertEqual(missing, [], "voice.md names rules no tool enforces — a rule the lint does not encode is not proven by a clean lint")

    def test_content_files_parse(self):
        for name in ("thresholds.json", "series.json", "lint-rules.json"):
            json.loads(read(os.path.join(_hw.HISTORY, name)))
        for name in os.listdir(os.path.join(_hw.HISTORY, "schemas")):
            json.loads(read(os.path.join(_hw.HISTORY, "schemas", name)))

    def test_no_machine_paths_in_tools(self):
        for f in os.listdir(HERE):
            if f.endswith(".py") and f != "test_tools.py":
                self.assertNotIn("/Users/", read(os.path.join(HERE, f)), f)


if __name__ == "__main__":
    unittest.main(verbosity=1)
