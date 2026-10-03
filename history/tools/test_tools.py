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

    def test_invented_dialogue_is_caught(self):
        self.assertIn("dialogue_unsourced", self.rules(voice_lint.chapter_findings(self.project, 2)))

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
