#!/usr/bin/env python3
"""Tests for cloud_models.py and cloud_writer.py: no network, no session of a real account, no model.

    python3 history/tools/test_cloud_writer.py

A fake transport stands in for compute-proxy and Google's token service. The writer loop runs on a
temporary copy of fixtures/demo-project and is gated by the real gate: its chapter 1 is written to
pass and its chapter 2 carries one planted defect per gate, so a scripted writer that answers with
chapter 2's prose first and chapter 1's second is a writer the gate sends back once.
"""
import contextlib
import io
import json
import os
import shutil
import stat
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _hw  # noqa: E402
import cloud_models  # noqa: E402
import cloud_writer  # noqa: E402
import richness  # noqa: E402
from cloud_models import ModelError  # noqa: E402

FIXTURE = os.path.join(_hw.HISTORY, "fixtures", "demo-project")
SECRETS = ("id-old", "id-new", "rt-old", "rt-new", "api-key-x")


def read_bytes(path):
    with open(path, "rb") as fh:
        return fh.read()


def reply(text, tokens=10, finish="stop", status=200):
    body = {"choices": [{"message": {"role": "assistant", "content": text}, "finish_reason": finish}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 50}}
    return status, {"x-mchatai-tokens-used": str(tokens)}, json.dumps(body).encode()


def error(status, kind=None):
    return status, {}, json.dumps({"error": {"type": kind, "message": "nope"}} if kind else {"error": {}}).encode()


class FakeNet:
    """compute-proxy and securetoken. `proxy` is a list of answers, or a function of the request."""

    def __init__(self, proxy=()):
        self.proxy = proxy if callable(proxy) else list(proxy)
        self.calls, self.refreshes = [], []

    def __call__(self, method, url, headers, body, timeout):
        if url.startswith(cloud_models.REFRESH_URL):
            self.refreshes.append(body.decode())
            return 200, {}, json.dumps({"id_token": "id-new", "refresh_token": "rt-new", "expires_in": "3600"}).encode()
        req = {"url": url, "headers": dict(headers), "body": json.loads(body)}
        self.calls.append(req)
        if callable(self.proxy):
            return self.proxy(req)
        return self.proxy.pop(0)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="hw-cloud-")
        self.session_path = os.path.join(self.tmp, "session.json")
        self.write_session(time.time())
        self.cfg = json.loads(json.dumps(cloud_models.load_config()))
        self.sleeps = []

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def write_session(self, minted):
        with open(self.session_path, "w", encoding="utf-8") as fh:
            json.dump({"idToken": "id-old", "refreshToken": "rt-old", "apiKey": "api-key-x", "at": int(minted * 1000)}, fh)

    def client(self, net):
        return cloud_models.Client(cfg=self.cfg, session_path=self.session_path, transport=net,
                                   sleep=self.sleeps.append)


class RequestShape(Base):
    def test_claude_5_is_sent_no_temperature(self):
        net = FakeNet([reply("hello")])
        self.client(net).chat("writer", "sys", "user")
        body = net.calls[0]["body"]
        self.assertNotIn("temperature", body)
        self.assertEqual(body["max_tokens"], self.cfg["roles"]["writer"]["maxOutputTokens"])
        self.assertNotIn("max_completion_tokens", body)
        self.assertEqual([m["role"] for m in body["messages"]], ["system", "user"])
        self.assertIs(body["stream"], False)

    def test_gpt_6_takes_max_completion_tokens(self):
        net = FakeNet([reply("hello")])
        self.client(net).chat({"name": "checker", "provider": "openai", "model": "gpt-6-luna", "maxOutputTokens": 12000,
                               "reasoningEffort": "low"}, "sys", "user")
        body = net.calls[0]["body"]
        self.assertEqual(body["max_completion_tokens"], 12000)
        self.assertNotIn("max_tokens", body)
        self.assertNotIn("temperature", body)
        self.assertEqual(body["reasoning_effort"], "low")

    def test_matching_is_learning_models_shape_for(self):
        shapes = {"rules": [{"id": "fam", "family": "zeta", "minMajorVersion": 3, "tokenParameter": "max_completion_tokens"},
                            {"id": "pre", "provider": "Acme", "modelPrefix": ["zeta"], "acceptsTemperature": False}],
                  "providerAliases": {"Acme Cloud": "Acme"}, "default": {"id": "default"}}
        f = cloud_models.shape_for
        self.assertEqual(f(shapes, "anyone", "zeta-3.5")["id"], "fam")        # family, any provider
        self.assertEqual(f(shapes, "acme", "Zeta-2")["id"], "pre")            # a lower major falls through
        self.assertEqual(f(shapes, "Acme Cloud", "zeta-1")["id"], "pre")      # the provider's alias
        self.assertEqual(f(shapes, "other", "zeta-1")["id"], "default")
        self.assertEqual(f(shapes, "other", "omega-9")["id"], "default")


class SessionAndErrors(Base):
    def test_an_old_token_is_refreshed_and_written_back_private(self):
        self.write_session(time.time() - 51 * 60)
        net = FakeNet([reply("hello")])
        printed = io.StringIO()
        with contextlib.redirect_stdout(printed), contextlib.redirect_stderr(printed):
            self.client(net).chat("writer", "sys", "user")
        self.assertEqual(len(net.refreshes), 1)
        self.assertIn("grant_type=refresh_token", net.refreshes[0])
        self.assertEqual(net.calls[0]["headers"]["authorization"], "Bearer id-new")
        saved = _hw.load_json(self.session_path)
        self.assertEqual((saved["idToken"], saved["refreshToken"]), ("id-new", "rt-new"))
        self.assertLess(abs(saved["at"] / 1000 - time.time()), 60)             # epoch ms, as written
        self.assertEqual(stat.S_IMODE(os.stat(self.session_path).st_mode), 0o600)
        self.assertFalse(any(s in printed.getvalue() for s in SECRETS))

    def test_a_fresh_token_is_not_refreshed(self):
        net = FakeNet([reply("hello")])
        self.client(net).chat("writer", "sys", "user")
        self.assertEqual(net.refreshes, [])
        self.assertEqual(net.calls[0]["headers"]["authorization"], "Bearer id-old")

    def test_a_401_refreshes_once_and_retries(self):
        net = FakeNet([error(401), reply("hello")])
        r = self.client(net).chat("writer", "sys", "user")
        self.assertEqual(r["text"], "hello")
        self.assertEqual(len(net.refreshes), 1)
        self.assertEqual([c["headers"]["authorization"] for c in net.calls], ["Bearer id-old", "Bearer id-new"])
        net = FakeNet([error(401), error(401)])
        with self.assertRaises(ModelError) as e:
            self.client(net).chat("writer", "sys", "user")
        self.assertEqual(e.exception.status, 401)

    def test_402_says_which_and_is_never_retried(self):
        for kind in ("insufficient_tokens", "sign_in_required"):
            net = FakeNet([error(402, kind)])
            with self.assertRaises(ModelError) as e:
                self.client(net).chat("writer", "sys", "user")
            self.assertEqual(e.exception.code, kind)
            self.assertIn(kind, str(e.exception))
            self.assertEqual(len(net.calls), 1)

    def test_429_and_5xx_are_retried_twice(self):
        net = FakeNet([error(503), error(429), reply("hello", tokens=7)])
        c = self.client(net)
        self.assertEqual(c.chat("writer", "sys", "user", stage="s")["tokensUsed"], 7)
        self.assertEqual(len(self.sleeps), 2)
        net = FakeNet([error(500), error(502), error(500)])
        with self.assertRaises(ModelError) as e:
            self.client(net).chat("writer", "sys", "user")
        self.assertEqual((e.exception.code, len(net.calls)), ("model_unavailable", 3))

    def test_an_empty_reply_cut_off_by_its_budget_names_the_role(self):
        net = FakeNet([reply("", tokens=55, finish="length")])
        c = self.client(net)
        with self.assertRaises(ModelError) as e:
            c.chat("auditor", "sys", "user", stage="ch01.audit")
        self.assertEqual(e.exception.code, "output_budget")
        self.assertIn("auditor", str(e.exception))
        self.assertIn("maxOutputTokens", str(e.exception))
        self.assertEqual(e.exception.tokensUsed, 55)
        self.assertEqual(c.tally["ch01.audit"], {"tokens": 55, "calls": 1})

    def test_the_tally_is_kept_per_stage(self):
        net = FakeNet([reply("a", tokens=3), reply("b", tokens=4.5), reply("c", tokens=2)])
        c = self.client(net)
        c.chat("writer", "s", "u", stage="write")
        c.chat("writer", "s", "u", stage="write")
        c.chat("auditor", "s", "u", stage="audit")
        self.assertEqual(c.tally, {"write": {"tokens": 7.5, "calls": 2}, "audit": {"tokens": 2, "calls": 1}})


class FixtureProject(Base):
    def setUp(self):
        super().setUp()
        self.root = os.path.join(self.tmp, "project")
        shutil.copytree(FIXTURE, self.root)
        self.project = _hw.Project(self.root)
        self.assertEqual(richness.validate_plan(self.project, write=True), [])
        self.clean = _hw.load_json(os.path.join(FIXTURE, "chapters", "01.json"))
        bad = _hw.load_json(os.path.join(FIXTURE, "chapters", "02.json"))
        self.bad = {"chapter": 1, "title": self.clean["title"], "text": bad["text"], "claims": bad["claims"]}
        self.lines = []

    def secrets_in_logs(self):
        found = []
        for base, _, files in os.walk(self.project.path("cloud")):
            for f in files:
                text = read_bytes(os.path.join(base, f)).decode("utf-8")
                found += [s for s in SECRETS if s in text]
        return found + [s for s in SECRETS if s in "\n".join(self.lines)]


class WriterLoop(FixtureProject):
    def scripted(self, writer, auditor=(), tokens=10):
        """A proxy that answers writer calls from `writer` and auditor calls from `auditor`, in order."""
        writer, auditor = list(writer), list(auditor)
        self.asked = []

        def answer(req):
            system, user = (m["content"] for m in req["body"]["messages"])
            who = "auditor" if "You audit one chapter" in system else "writer"
            self.asked.append((who, system, user))
            queue = auditor if who == "auditor" else writer
            if not queue:
                self.fail(f"an unexpected {who} call")
            item = queue.pop(0)
            text, finish = item if isinstance(item, tuple) else (item, "stop")
            return reply(text if isinstance(text, str) else json.dumps(text), tokens=tokens, finish=finish)
        return FakeNet(answer)

    def run_write(self, net, **kw):
        return cloud_writer.write_chapter(self.project, 1, self.client(net), self.cfg, out=self.lines.append, **kw)

    def test_a_clean_chapter_is_audited_and_the_run_stops(self):
        net = self.scripted([self.clean], [{"blocking": [], "notes": ["read the second paragraph aloud"]}])
        code, result = self.run_write(net)
        self.assertEqual(code, 0, self.lines)
        self.assertEqual([w for w, _, _ in self.asked], ["writer", "auditor"])
        self.assertEqual((result["status"], result["rounds"], result["audits"]), ("audited", 1, 1))
        self.assertEqual(self.project.chapter(1)["status"], "audited")
        log = self.project.path("cloud", "ch01")
        for f in ("r01-write.request.json", "r01-write.reply.txt", "r01-write.gate.json", "a01-audit.audit.json",
                  "brief.json", "result.json"):
            self.assertTrue(os.path.exists(os.path.join(log, f)), f)
        ledger = _hw.load_json(self.project.path("cloud", "ledger.json"))
        self.assertEqual(ledger["total"], 20)
        self.assertEqual(ledger["stages"]["ch01.write"], {"tokens": 10, "calls": 1})
        self.assertEqual(ledger["stages"]["ch01.audit"], {"tokens": 10, "calls": 1})
        self.assertEqual(self.secrets_in_logs(), [])

    def test_hard_findings_go_back_to_the_writer(self):
        net = self.scripted([self.bad, self.clean], [{"blocking": [], "notes": []}])
        code, result = self.run_write(net)
        self.assertEqual(code, 0, self.lines)
        self.assertEqual([w for w, _, _ in self.asked], ["writer", "writer", "auditor"])
        revise = self.asked[1][2]
        self.assertIn("source_unknown", revise)
        self.assertIn("fix the cause, not the wording", revise)
        self.assertIn("She hid gold under the floor", revise)              # the chapter as it stood
        self.assertEqual(result["rounds"], 2)
        first = _hw.load_json(self.project.path("cloud", "ch01", "r01-write.gate.json"))
        self.assertTrue(any(f["rule"] == "source_unknown" for f in first))

    def test_the_auditor_reads_the_chapter_never_the_writers_reply(self):
        noisy = "SECRET-REASONING: here is my plan.\n\n```json\n" + json.dumps(self.clean) + "\n```\nDone."
        net = self.scripted([noisy], [{"blocking": [], "notes": []}])
        self.assertEqual(self.run_write(net)[0], 0, self.lines)
        who, system, user = self.asked[1]
        self.assertEqual(who, "auditor")
        self.assertNotIn("SECRET-REASONING", user)
        self.assertNotIn("You write one chapter", system)
        self.assertIn(self.clean["text"][:60], user)
        self.assertIn("[W]", user + "[W]")                                  # sentences are marked
        self.assertIn("came to Harbor Town from Ohio", user)

    def test_blocking_items_get_a_revision_then_a_second_audit(self):
        flag = {"sentence": "It cost four hundred dollars.", "problem": "PROBLEM-MARK: the cost needs its date",
                "fix": "say 1893"}
        net = self.scripted([self.clean, self.clean], [{"blocking": [flag], "notes": []}, {"blocking": [], "notes": []}])
        code, result = self.run_write(net)
        self.assertEqual(code, 0, self.lines)
        self.assertEqual([w for w, _, _ in self.asked], ["writer", "auditor", "writer", "auditor"])
        self.assertIn("PROBLEM-MARK", self.asked[2][2])
        self.assertIn("Repair only what is flagged", self.asked[2][2])
        self.assertEqual((result["rounds"], result["audits"]), (2, 2))

    def test_max_rounds_marks_the_chapter_blocked(self):
        self.cfg["maxRounds"] = 2
        net = self.scripted([self.bad, self.bad])
        code, result = self.run_write(net)
        self.assertEqual(code, 1)
        self.assertEqual([w for w, _, _ in self.asked], ["writer", "writer"])
        self.assertEqual(result["status"], "blocked")
        self.assertEqual(self.project.chapter(1)["status"], "blocked")
        self.assertTrue(result["findings"])

    def test_the_budget_stops_before_a_call_that_would_pass_it(self):
        self.cfg["chapterBudgetTokens"] = 400
        net = self.scripted([self.bad] * 4, tokens=150)
        code, result = self.run_write(net)
        self.assertEqual(code, 1)
        self.assertEqual(len(self.asked), 2)                    # 300 spent; a third 150 would make 450
        self.assertEqual(result["status"], "stopped")
        self.assertIn("compute tokens", result["reason"])
        self.assertEqual(result["spent"], 300)

    def test_a_reply_that_is_not_json_is_sent_back(self):
        net = self.scripted(["I could not finish the chapter.", self.clean], [{"blocking": [], "notes": []}])
        self.assertEqual(self.run_write(net)[0], 0, self.lines)
        self.assertIn("could not be read as the chapter JSON", self.asked[1][2])

    def test_a_rerun_resumes_from_the_files(self):
        net = self.scripted([self.bad, self.clean], [{"blocking": [], "notes": []}])
        self.assertEqual(self.run_write(net)[0], 0)
        dead = FakeNet(lambda req: self.fail("a rerun called the model"))
        code, result = self.run_write(dead)
        self.assertEqual(code, 0, self.lines)
        self.assertEqual(result["liveCalls"], 0)
        self.assertEqual(result["spent"], 30)                  # what the chapter cost, counted once
        ledger = _hw.load_json(self.project.path("cloud", "ledger.json"))
        self.assertEqual(ledger["total"], 30)

    def test_a_changed_request_sets_the_old_steps_aside(self):
        net = self.scripted([self.bad, self.clean], [{"blocking": [], "notes": []}])
        self.assertEqual(self.run_write(net)[0], 0)
        # The gate now finds something else in round 1, so round 2's request is new.
        with open(self.project.path("sources", "s1.txt"), "a", encoding="utf-8") as fh:
            fh.write("\nShe hid gold under the floor of her boarding house on Water Street.\n")
        idx = _hw.load_json(self.project.path("sources", "index.json"))
        idx = [r for r in idx if r["id"] != "s4"]
        _hw.save_json(self.project.path("sources", "index.json"), idx)
        net = self.scripted([self.clean], [{"blocking": [], "notes": []}])
        code, result = self.run_write(net)
        self.assertEqual(code, 0, self.lines)
        self.assertEqual([w for w, _, _ in self.asked], ["writer", "auditor"])
        self.assertTrue(os.path.isdir(self.project.path("cloud", "ch01", "stale")))
        self.assertEqual(result["spent"], 50)                  # the stale steps still cost what they cost

    def test_a_reply_cut_off_is_not_replayed_once_the_budget_is_raised(self):
        net = self.scripted([(json.dumps(self.clean)[:200], "length")])
        code, result = self.run_write(net)
        self.assertEqual((code, result["status"]), (1, "stopped"))
        self.assertIn("maxOutputTokens", result["reason"])
        self.cfg["roles"]["writer"]["maxOutputTokens"] *= 2
        net = self.scripted([self.clean], [{"blocking": [], "notes": []}])
        code, result = self.run_write(net)
        self.assertEqual(code, 0, self.lines)
        self.assertEqual(result["liveCalls"], 2)
        self.assertEqual(self.asked[0][0], "writer")

    def test_fresh_starts_over_and_keeps_the_gather_log(self):
        net = self.scripted([self.clean], [{"blocking": [], "notes": []}])
        self.assertEqual(self.run_write(net)[0], 0)
        gather_log = self.project.path("cloud", "ch01", "gather", "gather-s1-01.request.json")
        _hw.save_json(gather_log, {"role": "gatherer", "reply": {"ok": True, "tokensUsed": 5}})
        net = self.scripted([self.clean], [{"blocking": [], "notes": []}])
        code, result = self.run_write(net, fresh=True)
        self.assertEqual((code, result["liveCalls"], result["spent"]), (0, 2, 20))
        self.assertTrue(os.path.exists(gather_log))
        old = os.listdir(self.project.path("cloud", "old"))
        self.assertEqual(len(old), 1)
        self.assertTrue(os.path.exists(self.project.path("cloud", "old", old[0], "r01-write.reply.txt")))

    def test_a_ledger_row_without_shows_stops_before_any_call(self):
        plan = self.project.plan
        plan["ledger"][0].pop("shows")
        _hw.save_json(self.project.path("plan.json"), plan)
        net = self.scripted([])
        code, result = self.run_write(net)
        self.assertEqual((code, result["status"]), (2, "stopped"))
        self.assertIn("l01", result["reason"])

    def test_replies_are_read_fenced_or_after_prose(self):
        obj = cloud_writer.parse_json_reply('Here:\n```json\n{"text": "x", "claims": []}\n```', want=("text",))
        self.assertEqual(obj["text"], "x")
        obj = cloud_writer.parse_json_reply('Sure. {"blocking": [], "notes": ["a {b}"]} ok', want=("blocking",))
        self.assertEqual(obj["notes"], ["a {b}"])
        with self.assertRaises(ValueError):
            cloud_writer.parse_json_reply('{"claims": []}', want=("text",))


class Gather(FixtureProject):
    def test_only_verbatim_long_enough_own_words_facts_are_kept(self):
        events = [
            {"what": "She won the Association's presidency at a Tuesday meeting.", "date": "1901",
             "evidence": "was elected president of the Ladies' Library Association at its meeting on Tuesday evening"},
            {"what": "She came from Kansas.", "date": "1890",
             "evidence": "Mrs. Fixture came to Harbor Town from Kansas in 1890 and opened"},
            {"what": "Eleven of fourteen votes.", "date": "1901", "evidence": "receiving eleven of the fourteen votes cast"},
            {"what": "The Association will open its reading room in the old bank building on the first of June.",
             "date": "1901", "evidence": "The Association will open its reading room in the old bank building on the first of June"},
        ]
        net = FakeNet([reply(json.dumps({"events": events}), tokens=4)])
        dossier_before = read_bytes(self.project.path("dossier.json"))
        code, res = cloud_writer.gather(self.project, 1, ["s1", "s9"], self.client(net), self.cfg, out=self.lines.append)
        self.assertEqual(code, 0, self.lines)
        self.assertEqual([e["what"] for e in res["kept"]], [events[0]["what"]])
        reasons = " | ".join(d["reason"] for d in res["dropped"])
        self.assertIn("not verbatim", reasons)
        self.assertIn("under minQuoteWords", reasons)
        self.assertIn("copies 12+ consecutive words", reasons)
        self.assertIn("never fetched", reasons)                 # s9 is in no index
        saved = _hw.load_json(self.project.path("dossier", "facts-cloud-ch01.json"))
        self.assertEqual(len(saved["events"]), 1)
        ev = saved["events"][0]
        self.assertEqual((ev["sources"], ev["chapter"]), (["s1"], 1))
        self.assertEqual(read_bytes(self.project.path("dossier.json")), dossier_before)
        system = net.calls[0]["body"]["messages"][0]["content"]
        self.assertIn("at least 8 words", system)
        self.assertNotIn("{minQuoteWords}", system)
        self.assertTrue(any("kept 1, dropped 4" in line for line in self.lines), self.lines)

    def test_a_fact_that_defines_a_term_carries_about_and_the_plans_part(self):
        plan = _hw.load_json(self.project.path("plan.json"))
        plan["chapters"][0]["introduces"] = (plan["chapters"][0].get("introduces") or []) + ["Library Association"]
        plan["chapters"][0]["lifeStage"] = "civic"
        _hw.save_json(self.project.path("plan.json"), plan)
        d = _hw.load_json(self.project.path("dossier.json"))
        d.setdefault("people", []).append({"name": "Library Association", "aliases": [], "who": "the town's reading society"})
        _hw.save_json(self.project.path("dossier.json"), d)
        self.project = _hw.Project(self.project.root)
        ev = {"what": "She won the Association's presidency at a Tuesday meeting.", "date": "1901", "lifeStage": "invented",
              "evidence": "was elected president of the Ladies' Library Association at its meeting on Tuesday evening"}
        for about, want in (("library association", "Library Association"), ("Harbor Town", None)):
            net = FakeNet([reply(json.dumps({"events": [{**ev, "about": about}]}))])
            code, res = cloud_writer.gather(self.project, 1, ["s1"], self.client(net), self.cfg, out=self.lines.append,
                                            fresh=True)   # the same request would replay the first reply
            self.assertEqual(code, 0, self.lines)
            self.assertEqual((res["kept"][0].get("about"), res["kept"][0]["lifeStage"]), (want, "civic"))

    def test_a_parts_range_gathers_only_those_parts(self):
        self.cfg["gatherChunkChars"] = 200
        net = FakeNet(lambda req: reply(json.dumps({"events": []})))
        cloud_writer.gather(self.project, 1, ["s1"], self.client(net), self.cfg, out=self.lines.append, parts_range=(2, 2))
        self.assertEqual(len(net.calls), 1)
        self.assertIn("(part 2 of", net.calls[0]["body"]["messages"][1]["content"])

    def test_gathering_a_source_again_replaces_only_its_facts(self):
        path = self.project.path("dossier", "facts-cloud-ch01.json")
        _hw.save_json(path, {"events": [{"id": "old_s2", "sources": ["s2"], "what": "x", "evidence": "y"},
                                        {"id": "old_s1", "sources": ["s1"], "what": "x", "evidence": "y"}]})
        net = FakeNet([reply(json.dumps({"events": []}))])
        cloud_writer.gather(self.project, 1, ["s1"], self.client(net), self.cfg, out=self.lines.append)
        self.assertEqual([e["id"] for e in _hw.load_json(path)["events"]], ["old_s2"])


class ReviserRole(FixtureProject):
    """Plan §19.6: a revision the gate alone asks for goes to the reviser; the audit's to the writer."""
    scripted, run_write = WriterLoop.scripted, WriterLoop.run_write

    def test_gate_revisions_go_to_the_reviser_and_audit_revisions_to_the_writer(self):
        flag = {"sentence": "It cost four hundred dollars.", "problem": "needs its date", "fix": "say 1893"}
        net = self.scripted([self.bad, self.clean, self.clean],
                            [{"blocking": [flag], "notes": []}, {"blocking": [], "notes": []}])
        code, result = self.run_write(net)
        self.assertEqual(code, 0, self.lines)
        models = [c["body"]["model"] for c in net.calls]
        writer, reviser = self.cfg["roles"]["writer"]["model"], self.cfg["roles"]["reviser"]["model"]
        self.assertNotEqual(writer, reviser)
        self.assertEqual(models, [writer, reviser, self.cfg["roles"]["auditor"]["model"], writer,
                                 self.cfg["roles"]["auditor"]["model"]])
        # the reviser carries the writer's own preface and instructions
        self.assertEqual(self.asked[0][1], self.asked[1][1])

    def test_without_the_key_every_revision_goes_to_the_writer(self):
        self.cfg.pop("gateReviseRole")
        net = self.scripted([self.bad, self.clean], [{"blocking": [], "notes": []}])
        self.run_write(net)
        writer = self.cfg["roles"]["writer"]["model"]
        self.assertEqual([c["body"]["model"] for c in net.calls][:2], [writer, writer])


class FakeCLI:
    """`claude -p`: records each command, its stdin, env and the system prompt file; answers in turn."""

    def __init__(self, answers):
        self.answers, self.calls = list(answers), []

    def __call__(self, cmd, stdin, env, cwd, timeout):
        sysfile = cmd[cmd.index("--system-prompt-file") + 1]
        with open(sysfile, encoding="utf-8") as fh:
            self.calls.append({"cmd": cmd, "stdin": stdin, "env": env, "cwd": cwd, "system": fh.read()})
        a = self.answers.pop(0)
        return a if isinstance(a, tuple) else (0, json.dumps(a), "")


def envelope(text, out_tokens=40, side=True, stop="end_turn"):
    usage = {"claude-opus-5-5": {"inputTokens": 3, "outputTokens": out_tokens, "cacheReadInputTokens": 1000,
                                 "cacheCreationInputTokens": 200}}
    if side:   # the CLI's small side call on another model
        usage = {"claude-haiku-5-5": {"inputTokens": 50, "outputTokens": 5}, **usage}
    return {"type": "result", "is_error": False, "result": text, "stop_reason": stop,
            "usage": {"input_tokens": 3, "output_tokens": out_tokens}, "modelUsage": usage}


class ClaudeCodeBackend(Base):
    def setUp(self):
        super().setUp()
        self.ccfg = cloud_models.load_config(backend="claude-code")

    def test_the_overlay_keeps_the_base_fields_and_names_the_backend(self):
        w = self.ccfg["roles"]["writer"]
        self.assertEqual((self.ccfg["backend"], w["provider"]), ("claude-code", "claude-code"))
        self.assertEqual(w["prompt"], self.cfg["roles"]["writer"]["prompt"])
        # On the plan the writer may write past compute-proxy's 32,000 cap (the overlay raises it).
        self.assertGreaterEqual(w["maxOutputTokens"], self.cfg["roles"]["writer"]["maxOutputTokens"])
        self.assertTrue(self.ccfg["chapterPlanBudgetTokens"])
        self.assertNotIn("backend", cloud_models.load_config())   # no backend: the base, unchanged
        self.assertIsInstance(cloud_models.make_client(self.ccfg), cloud_models.ClaudeCodeClient)

    def test_a_call_is_one_tool_less_turn_on_the_plan(self):
        cli = FakeCLI([envelope("hello")])
        os.environ["ANTHROPIC_API_KEY"] = "sk-should-not-pass"
        try:
            r = cloud_models.ClaudeCodeClient(cfg=self.ccfg, run=cli, sleep=self.sleeps.append).chat(
                "writer", "SYSTEM-MARK", "USER-MARK", stage="ch01.write")
        finally:
            os.environ.pop("ANTHROPIC_API_KEY", None)
        call = cli.calls[0]
        cmd = call["cmd"]
        self.assertEqual(cmd[:2], [cmd[0], "-p"])
        self.assertNotIn("--bare", cmd)
        self.assertEqual(cmd[cmd.index("--tools") + 1], "")
        self.assertIn("--strict-mcp-config", cmd)
        self.assertEqual(cmd[cmd.index("--model") + 1], self.ccfg["roles"]["writer"]["model"])
        self.assertEqual(cmd[cmd.index("--effort") + 1], self.ccfg["roles"]["writer"]["effort"])
        self.assertNotIn("ANTHROPIC_API_KEY", call["env"])
        self.assertEqual(call["env"]["CLAUDE_CODE_MAX_OUTPUT_TOKENS"], str(self.ccfg["roles"]["writer"]["maxOutputTokens"]))
        self.assertEqual((call["system"], call["stdin"]), ("SYSTEM-MARK", "USER-MARK"))
        self.assertFalse(os.path.exists(call["cwd"]))   # an empty folder, removed after the call
        self.assertEqual((r["text"], r["tokensUsed"], r["model"]), ("hello", 0, "claude-opus-5-5"))
        self.assertEqual(r["planTokens"], 3 + 40 + 1000 + 200 + 50 + 5)

    def test_a_reply_continued_past_the_output_cap_reads_as_cut_off(self):
        # Claude Code went past the cap in a second message and returned only that message (chapter 5, 2026-11-17).
        cap = self.ccfg["roles"]["writer"]["maxOutputTokens"]
        cli = FakeCLI([envelope("parameters and 650,000 neurons, in five layers", out_tokens=cap + 9000)])
        r = cloud_models.ClaudeCodeClient(cfg=self.ccfg, run=cli, sleep=self.sleeps.append).chat("writer", "s", "u")
        self.assertEqual(r["finishReason"], "length")
        cli = FakeCLI([envelope("{}", out_tokens=cap - 1)])
        r = cloud_models.ClaudeCodeClient(cfg=self.ccfg, run=cli, sleep=self.sleeps.append).chat("writer", "s", "u")
        self.assertEqual(r["finishReason"], "end_turn")

    def test_a_plan_limit_stops_at_once_and_other_failures_are_retried(self):
        limit = (1, json.dumps({"is_error": True, "result": "You've hit your weekly limit · resets Nov 21"}), "")
        cli = FakeCLI([limit])
        with self.assertRaises(ModelError) as e:
            cloud_models.ClaudeCodeClient(cfg=self.ccfg, run=cli, sleep=self.sleeps.append).chat("writer", "s", "u")
        self.assertEqual((e.exception.code, len(cli.calls)), ("plan_limit", 1))
        cli = FakeCLI([(1, "", "boom"), (1, "", "boom"), envelope("ok")])
        r = cloud_models.ClaudeCodeClient(cfg=self.ccfg, run=cli, sleep=self.sleeps.append).chat("writer", "s", "u")
        self.assertEqual((r["text"], len(cli.calls)), ("ok", 3))

    def test_plan_tokens_reach_the_ledger_and_the_plan_budget_stops_a_run(self):
        root = os.path.join(self.tmp, "project")
        shutil.copytree(FIXTURE, root)
        project = _hw.Project(root)
        richness.validate_plan(project, write=True)
        bad = _hw.load_json(os.path.join(FIXTURE, "chapters", "02.json"))
        bad = {"chapter": 1, "title": "x", "text": bad["text"], "claims": bad["claims"]}
        cfg = {**self.ccfg, "chapterPlanBudgetTokens": 2000}
        cli = FakeCLI([envelope(json.dumps(bad))] * 5)
        lines = []
        code, result = cloud_writer.write_chapter(project, 1, cloud_models.ClaudeCodeClient(cfg=cfg, run=cli), cfg,
                                                  out=lines.append)
        self.assertEqual((code, result["stopCode"]), (1, "plan_budget"), lines)
        self.assertEqual(len(cli.calls), 1)   # 1,298 used; another of the same size would pass 2,000
        ledger = _hw.load_json(project.path("cloud", "ledger.json"))
        self.assertEqual((ledger["total"], ledger["planTotal"]), (0, 1298))
        self.assertEqual(ledger["calls"][0]["provider"], "claude-code")


if __name__ == "__main__":
    unittest.main()
