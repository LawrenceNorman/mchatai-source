#!/usr/bin/env python3
"""Tests for cloud_models.py's grant mode and book_job.py: no network, no Google, no model.

    python3 history/tools/test_book_job.py

A fake transport stands in for compute-proxy and the Cloud Run metadata server (which mints the
job's Google ID token); a fake clock moves time past the token's expiry. The runner runs on a
temporary copy of fixtures/demo-project, gated by the real gate, as test_cloud_writer.py's writer
loop does: its chapter 1 passes, and chapter 2's prose sent as chapter 1 fails.
"""
import base64
import contextlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
import urllib.parse
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import _hw  # noqa: E402
import book_job  # noqa: E402
import cloud_models  # noqa: E402
import richness  # noqa: E402
from cloud_models import ModelError  # noqa: E402
from test_cloud_writer import FIXTURE, error, reply  # noqa: E402

ENV = ("MCHATAI_GRANT", "MCHATAI_GRANT_AUDIENCE", "MCHATAI_GOOGLE_ID_TOKEN", "MCHATAI_JOB_ID", "MCHATAI_SESSION",
       "COMPUTE_PROXY_URL", "MCHATAI_CLOUD_WRITER", "MCHATAI_REQUEST_SHAPES")
AUDIENCE = "https://compute-proxy.test"
START = 1_800_000_000.0


def jwt(claims):
    enc = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")  # noqa: E731
    return f"{enc({'alg': 'RS256', 'typ': 'JWT'})}.{enc(claims)}.c2lnbmF0dXJl"


class Clock:
    def __init__(self, t=START):
        self.t = t

    def __call__(self):
        return self.t


class GrantNet:
    """compute-proxy and the metadata server. `proxy` is a list of answers, or a function of the
    request; an answer that is a BaseException is raised (a dropped connection, a SIGTERM)."""

    def __init__(self, proxy=(), clock=None, life=3600, metadata=None):
        self.proxy = proxy if callable(proxy) else list(proxy)
        self.clock = clock or Clock()
        self.life = life
        self.metadata = metadata      # None: mint; else a list of answers / exceptions
        self.calls, self.mints, self.tokens = [], [], []

    def __call__(self, method, url, headers, body, timeout):
        if url.startswith(cloud_models.METADATA_IDENTITY_URL):
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
            self.mints.append({"method": method, "headers": dict(headers), "query": q})
            if self.metadata:
                item = self.metadata.pop(0)
                if isinstance(item, BaseException):
                    raise item
                return item
            tok = jwt({"aud": q["audience"][0], "exp": int(self.clock()) + self.life, "n": len(self.mints),
                       "email": "grant-runner@example.iam.gserviceaccount.com"})
            self.tokens.append(tok)
            return 200, {}, tok.encode()
        if url.startswith(cloud_models.REFRESH_URL):
            raise AssertionError("a grant job refreshed a Firebase session")
        req = {"url": url, "headers": dict(headers), "body": json.loads(body)}
        self.calls.append(req)
        item = self.proxy(req) if callable(self.proxy) else self.proxy.pop(0)
        if isinstance(item, BaseException):
            raise item
        return item


class Base(unittest.TestCase):
    def setUp(self):
        env = mock.patch.dict(os.environ, {})
        env.start()
        self.addCleanup(env.stop)
        for k in ENV:
            os.environ.pop(k, None)
        self.tmp = tempfile.mkdtemp(prefix="hw-job-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.cfg = json.loads(json.dumps(cloud_models.load_config()))
        self.sleeps = []
        self.clock = Clock()

    def client(self, net, grant="g_job12", **kw):
        return cloud_models.Client(cfg=self.cfg, transport=net, sleep=self.sleeps.append, clock=self.clock,
                                   grant=grant, audience=kw.pop("audience", AUDIENCE), **kw)


class GrantRequests(Base):
    def test_a_grant_call_carries_the_grant_and_a_google_bearer(self):
        net = GrantNet([reply("hello")], clock=self.clock)
        r = self.client(net).chat("writer", "sys", "user")
        self.assertEqual(r["text"], "hello")
        h, body = net.calls[0]["headers"], net.calls[0]["body"]
        self.assertEqual(h["x-mchatai-grant"], "g_job12")
        self.assertEqual(h["authorization"], "Bearer " + net.tokens[0])
        mint = net.mints[0]
        self.assertEqual(mint["method"], "GET")
        self.assertEqual(mint["headers"], {"Metadata-Flavor": "Google"})
        self.assertEqual((mint["query"]["audience"], mint["query"]["format"]), ([AUDIENCE], ["full"]))
        self.assertEqual(body["max_tokens"], self.cfg["roles"]["writer"]["maxOutputTokens"])
        self.assertNotIn("temperature", body)               # Claude 5.x, from request-shapes.json
        self.assertEqual(body["output_config"], {"effort": "low"})
        self.assertIs(body["stream"], False)
        self.assertEqual(body.get("n", 1), 1)

    def test_max_tokens_is_sent_beside_max_completion_tokens(self):
        net = GrantNet([reply("hello")], clock=self.clock)
        self.client(net).chat({"name": "checker", "provider": "openai", "model": "gpt-6-luna", "maxOutputTokens": 12000},
                              "sys", "user")
        body = net.calls[0]["body"]
        self.assertEqual((body["max_completion_tokens"], body["max_tokens"]), (12000, 12000))
        self.assertNotIn("temperature", body)

    def test_without_a_grant_the_session_path_is_unchanged(self):
        path = os.path.join(self.tmp, "session.json")
        _hw.save_json(path, {"idToken": "id-old", "refreshToken": "rt", "apiKey": "k", "at": int(self.clock() * 1000)})
        net = GrantNet([reply("hello")], clock=self.clock)
        c = cloud_models.Client(cfg=self.cfg, session_path=path, transport=net, clock=self.clock)
        self.assertIsNone(c.grant)
        c.chat("writer", "sys", "user")
        self.assertNotIn("x-mchatai-grant", net.calls[0]["headers"])
        self.assertEqual(net.calls[0]["headers"]["authorization"], "Bearer id-old")
        self.assertEqual(net.mints, [])

    def test_the_environment_selects_grant_mode(self):
        tok = jwt({"aud": AUDIENCE, "exp": int(self.clock()) + 3600})
        os.environ.update(MCHATAI_GRANT="g_env", MCHATAI_GRANT_AUDIENCE=AUDIENCE, MCHATAI_GOOGLE_ID_TOKEN=tok,
                          COMPUTE_PROXY_URL="https://proxy.example/")
        net = GrantNet([reply("hello")], clock=self.clock)
        c = cloud_models.Client(cfg=self.cfg, transport=net, clock=self.clock)    # no session file anywhere
        c.chat("writer", "sys", "user")
        self.assertEqual(net.calls[0]["url"], "https://proxy.example/v1/chat/completions")
        self.assertEqual(net.calls[0]["headers"]["x-mchatai-grant"], "g_env")
        self.assertEqual(net.calls[0]["headers"]["authorization"], "Bearer " + tok)
        self.assertEqual(net.mints, [])                    # a token from the environment is used as it is

    def test_the_audience_defaults_to_the_proxy_url(self):
        net = GrantNet([reply("hello")], clock=self.clock)
        cloud_models.Client(cfg=self.cfg, transport=net, clock=self.clock, grant="g1",
                            proxy_url="https://p.example").chat("writer", "s", "u")
        self.assertEqual(net.mints[0]["query"]["audience"], ["https://p.example"])

    def test_a_bad_grant_id_is_refused_before_any_call(self):
        for bad in ("__a__", "a/b", "x" * 129):
            with self.subTest(bad=bad), self.assertRaises(ModelError) as e:
                self.client(GrantNet(), grant=bad)
            self.assertEqual(e.exception.code, "bad_grant")


class IdentityCache(Base):
    def test_the_token_is_cached_until_five_minutes_before_it_expires(self):
        net = GrantNet(lambda req: reply("ok"), clock=self.clock)
        c = self.client(net)
        c.chat("writer", "s", "u")
        c.chat("writer", "s", "u")
        self.assertEqual(len(net.mints), 1)
        self.clock.t = START + 3600 - 301                  # 5 min and a second before expiry: still good
        c.chat("writer", "s", "u")
        self.assertEqual(len(net.mints), 1)
        self.clock.t = START + 3600 - 299                  # inside the last five minutes: a new one
        c.chat("writer", "s", "u")
        self.assertEqual(len(net.mints), 2)
        auths = [x["headers"]["authorization"] for x in net.calls]
        self.assertEqual(auths, ["Bearer " + net.tokens[0]] * 3 + ["Bearer " + net.tokens[1]])

    def test_a_401_mints_a_fresh_token_once(self):
        net = GrantNet([error(401, "auth_error"), reply("ok")], clock=self.clock)
        self.assertEqual(self.client(net).chat("writer", "s", "u")["text"], "ok")
        self.assertEqual(len(net.mints), 2)
        self.assertEqual([x["headers"]["authorization"] for x in net.calls],
                         ["Bearer " + net.tokens[0], "Bearer " + net.tokens[1]])
        net = GrantNet([error(401, "auth_error"), error(401, "auth_error")], clock=self.clock)
        with self.assertRaises(ModelError) as e:
            self.client(net).chat("writer", "s", "u")
        self.assertEqual((e.exception.code, e.exception.status), ("auth_error", 401))
        self.assertIn("GRANT_AUDIENCE", str(e.exception))
        self.assertIn(AUDIENCE, str(e.exception))

    def test_an_environment_token_is_never_retried_and_an_expired_one_never_sent(self):
        os.environ["MCHATAI_GOOGLE_ID_TOKEN"] = jwt({"aud": AUDIENCE, "exp": int(START) + 3600})
        net = GrantNet([error(401, "auth_error")], clock=self.clock)
        with self.assertRaises(ModelError) as e:
            self.client(net).chat("writer", "s", "u")
        self.assertEqual((e.exception.code, len(net.calls)), ("auth_rejected", 1))
        self.assertIn("MCHATAI_GOOGLE_ID_TOKEN", str(e.exception))
        self.clock.t = START + 3601
        net = GrantNet([], clock=self.clock)
        with self.assertRaises(ModelError) as e:
            self.client(net).chat("writer", "s", "u")
        self.assertEqual((e.exception.code, net.calls), ("identity_expired", []))

    def test_an_unreachable_metadata_server_is_retryable(self):
        net = GrantNet([], clock=self.clock, metadata=[OSError("no route")] * 3)
        with self.assertRaises(ModelError) as e:
            self.client(net).chat("writer", "s", "u")
        self.assertEqual((e.exception.code, len(net.mints), net.calls), ("identity_unavailable", 3, []))
        self.assertIn(e.exception.code, cloud_models.RETRYABLE_CODES)
        self.assertIn("MCHATAI_GOOGLE_ID_TOKEN", str(e.exception))

    def test_no_token_is_printed(self):
        net = GrantNet([reply("ok")], clock=self.clock)
        printed = io.StringIO()
        with contextlib.redirect_stdout(printed), contextlib.redirect_stderr(printed):
            self.client(net).chat("writer", "s", "u")
        self.assertNotIn(net.tokens[0], printed.getvalue())


class GrantRefusals(Base):
    def test_a_used_up_revoked_or_expired_grant_stops_with_a_pause(self):
        for kind, words in (("grant_exhausted", "used up"), ("grant_revoked", "revoked"), ("grant_expired", "expired")):
            net = GrantNet([error(402, kind)], clock=self.clock)
            with self.subTest(kind=kind), self.assertRaises(ModelError) as e:
                self.client(net).chat("writer", "s", "u")
            self.assertEqual((e.exception.code, e.exception.status, len(net.calls)), (kind, 402, 1))   # never retried
            self.assertIn(words, str(e.exception))
            self.assertIn("job pauses", str(e.exception))
            self.assertIn(kind, cloud_models.PAUSE_CODES)

    def test_a_forbidden_caller_names_grant_callers(self):
        net = GrantNet([error(403, "grant_caller_forbidden")], clock=self.clock)
        with self.assertRaises(ModelError) as e:
            self.client(net).chat("writer", "s", "u")
        self.assertEqual((e.exception.code, len(net.mints), len(net.calls)), ("grant_caller_forbidden", 1, 1))
        self.assertIn("GRANT_CALLERS", str(e.exception))
        self.assertNotIn(e.exception.code, cloud_models.PAUSE_CODES | cloud_models.RETRYABLE_CODES)


# ── the runner ───────────────────────────────────────────────────────────────

GOOD_EVENT = {"what": "She won the Association's presidency at a Tuesday meeting.", "date": "1901",
              "evidence": "was elected president of the Ladies' Library Association at its meeting on Tuesday evening"}
CLEAR = {"blocking": [], "notes": []}
TOKENS = {"gatherer": 4, "writer": 10, "auditor": 6}


class Runner(Base):
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
        self.asked = []

    def scripted(self, **queues):
        """A proxy answering each role from its queue, in order: a dict or str is a reply's JSON or text, a
        tuple a raw (status, headers, body), an exception is raised."""
        queues = {k: list(v) for k, v in queues.items()}

        def answer(req):
            system = req["body"]["messages"][0]["content"]
            who = ("gatherer" if system.startswith("You gather the facts") else
                   "auditor" if "You audit one chapter" in system else "writer")
            self.asked.append((who, req["headers"].get("x-mchatai-grant")))
            if not queues.get(who):
                self.fail(f"an unexpected {who} call")
            item = queues[who].pop(0)
            if isinstance(item, (tuple, BaseException)):
                return item
            return reply(item if isinstance(item, str) else json.dumps(item), tokens=TOKENS[who])
        return GrantNet(answer, clock=self.clock)

    def go(self, steps, net, grant="g_1", job_id=None):
        steps, problems = book_job.validate_plan(steps)
        self.assertEqual(problems, [])
        return book_job.run_job(self.project, steps, self.client(net, grant=grant), self.cfg, job_id=job_id,
                                out=self.lines.append)

    def job(self):
        return _hw.load_json(self.project.path("cloud", "job.json"))

    def gather_write(self, **write):
        return [{"step": "gather", "chapter": 1, "sources": ["s1"]}, {"step": "write", "chapter": 1, **write}]

    def test_the_steps_run_in_order_and_checkpoint_each(self):
        net = self.scripted(gatherer=[{"events": [GOOD_EVENT]}], writer=[self.clean], auditor=[CLEAR])
        code, job = self.go(self.gather_write(rounds=3, budget=600), net, job_id="job-ch1")
        self.assertEqual(code, 0, self.lines)
        self.assertEqual(self.asked, [("gatherer", "g_1"), ("writer", "g_1"), ("auditor", "g_1")])
        saved = self.job()
        self.assertEqual(saved, job)
        self.assertEqual((saved["status"], saved["billing"], saved["grant"], saved["grants"], saved["jobId"]),
                         ("done", "grant", "g_1", ["g_1"], "job-ch1"))
        self.assertEqual([s["key"] for s in saved["steps"]], ["01-gather-ch01", "02-write-ch01"])
        self.assertEqual([s["status"] for s in saved["steps"]], ["done", "done"])
        self.assertEqual([s["computeTokens"] for s in saved["steps"]], [4, 16])
        self.assertEqual(saved["computeTokens"], 20)
        self.assertEqual(saved["steps"][0]["result"]["kept"], 1)
        self.assertEqual((saved["steps"][1]["result"]["status"], saved["steps"][1]["result"]["rounds"]), ("audited", 1))
        self.assertEqual(saved["steps"][1]["grant"], "g_1")
        self.assertEqual(self.project.chapter(1)["status"], "audited")
        everything = json.dumps(saved) + "\n".join(self.lines)
        self.assertFalse(any(t in everything for t in net.tokens))

    def test_a_rerun_skips_the_steps_that_are_done(self):
        net = self.scripted(gatherer=[{"events": [GOOD_EVENT]}], writer=[self.clean], auditor=[CLEAR])
        self.assertEqual(self.go(self.gather_write(), net)[0], 0)
        dead = GrantNet(lambda req: self.fail("a rerun called the model"), clock=self.clock)
        code, job = self.go(self.gather_write(), dead)
        self.assertEqual(code, 0, self.lines)
        self.assertEqual((job["runs"], [s["attempts"] for s in job["steps"]], job["computeTokens"]), (2, [1, 1], 20))

    def test_a_used_up_grant_pauses_the_job_and_a_new_grant_resumes_it(self):
        net = self.scripted(gatherer=[{"events": [GOOD_EVENT]}], writer=[error(402, "grant_exhausted")])
        code, job = self.go(self.gather_write(), net, grant="g_1")
        self.assertEqual(code, 3, self.lines)
        self.assertEqual(job["status"], "paused")
        self.assertEqual([s["status"] for s in job["steps"]], ["done", "paused"])
        self.assertIn("used up", job["steps"][1]["reason"])
        self.assertIn("02-write-ch01", job["reason"])
        self.assertEqual(self.job()["status"], "paused")
        # The user approves more: a new grant, the same plan.
        net = self.scripted(writer=[self.clean], auditor=[CLEAR])
        code, job = self.go(self.gather_write(), net, grant="g_2")
        self.assertEqual(code, 0, self.lines)
        self.assertEqual(self.asked[-2:], [("writer", "g_2"), ("auditor", "g_2")])
        self.assertFalse(any(who == "gatherer" for who, g in self.asked if g == "g_2"))   # step 1 was not run again
        self.assertEqual((job["grant"], job["grants"]), ("g_2", ["g_1", "g_2"]))
        self.assertEqual((job["steps"][1]["attempts"], job["steps"][1]["grant"]), (2, "g_2"))
        self.assertEqual(job["computeTokens"], 20)

    def test_a_revoked_grant_pauses_the_job(self):
        net = self.scripted(writer=[self.clean], auditor=[error(402, "grant_revoked")])
        code, job = self.go([{"step": "write", "chapter": 1}], net)
        self.assertEqual((code, job["status"]), (3, "paused"))
        self.assertIn("revoked", job["reason"])
        self.assertEqual(job["steps"][0]["computeTokens"], 10)        # the writer's call before the refusal

    def test_a_hard_failure_blocks_the_job_and_later_steps_wait(self):
        net = self.scripted(writer=[self.bad, self.bad])
        steps = [{"step": "write", "chapter": 1, "rounds": 2}, {"step": "gather", "chapter": 1, "sources": ["s1"]}]
        code, job = self.go(steps, net)
        self.assertEqual(code, 1, self.lines)
        self.assertEqual((job["status"], [s["status"] for s in job["steps"]]), ("blocked", ["blocked", "pending"]))
        self.assertIn("hard finding", job["steps"][0]["reason"])
        self.assertEqual([w for w, _ in self.asked], ["writer", "writer"])
        self.assertEqual(self.project.chapter(1)["status"], "blocked")

    def test_the_chapter_budget_blocks_the_job(self):
        net = self.scripted(writer=[self.bad] * 4)
        code, job = self.go([{"step": "write", "chapter": 1, "budget": 15}], net)
        self.assertEqual((code, job["status"]), (1, "blocked"))
        self.assertIn("chapterBudgetTokens", job["reason"])
        self.assertEqual(len(self.asked), 1)

    def test_an_unavailable_model_fails_retryably_and_a_rerun_resumes(self):
        net = self.scripted(writer=[error(503)] * 3)
        code, job = self.go([{"step": "write", "chapter": 1}], net)
        self.assertEqual((code, job["status"]), (75, "failed"))
        self.assertIn("model_unavailable", job["reason"])
        net = self.scripted(writer=[self.clean], auditor=[CLEAR])
        code, job = self.go([{"step": "write", "chapter": 1}], net)
        self.assertEqual((code, job["status"], job["steps"][0]["attempts"]), (0, "done", 2))

    def test_an_interrupt_checkpoints_the_step_as_failed(self):
        net = self.scripted(writer=[book_job.Interrupted()])
        code, job = self.go([{"step": "write", "chapter": 1}], net)
        self.assertEqual((code, job["status"]), (75, "failed"))
        self.assertIn("SIGTERM", self.job()["steps"][0]["reason"])

    def test_a_changed_step_runs_again_from_there_and_replays(self):
        net = self.scripted(gatherer=[{"events": [GOOD_EVENT]}], writer=[self.clean], auditor=[CLEAR])
        self.assertEqual(self.go(self.gather_write(budget=500), net)[0], 0)
        dead = GrantNet(lambda req: self.fail("a replayed step called the model"), clock=self.clock)
        code, job = self.go(self.gather_write(budget=650), dead)
        self.assertEqual(code, 0, self.lines)
        self.assertEqual([s["attempts"] for s in job["steps"]], [1, 1])      # step 2 is a new record
        self.assertEqual(job["steps"][1]["spec"]["budget"], 650)
        self.assertEqual(job["steps"][1]["result"]["liveCalls"], 0)
        self.assertEqual([r["spec"]["budget"] for r in job["replaced"]], [500])

    def test_a_bad_plan_is_refused_before_any_call(self):
        plan = os.path.join(self.tmp, "steps.json")
        _hw.save_json(plan, [{"step": "gather", "chapter": 1}, {"step": "write", "chapter": "1", "fresh": True},
                             {"step": "publish", "chapter": 1}, {"step": "write", "chapter": 2, "budget": 0}])
        code = book_job.main(["book_job.py", "run", self.root, "--plan", plan], out=self.lines.append)
        self.assertEqual(code, 2)
        said = "\n".join(self.lines)
        for bit in ("`sources` must list", "unknown key(s) fresh", "`chapter` must be a whole number", "publish",
                    "`budget` must be"):
            self.assertIn(bit, said)
        self.assertFalse(os.path.exists(self.project.path("cloud", "job.json")))

    def test_a_bad_grant_in_the_environment_is_refused_before_any_call(self):
        plan = os.path.join(self.tmp, "steps.json")
        _hw.save_json(plan, [{"step": "write", "chapter": 1}])
        os.environ["MCHATAI_GRANT"] = "__a__"
        self.assertEqual(book_job.main(["book_job.py", "run", self.root, "--plan", plan], out=self.lines.append), 2)
        self.assertIn("bad_grant", "\n".join(self.lines))
        self.assertFalse(os.path.exists(self.project.path("cloud", "job.json")))

    def test_status_prints_the_job(self):
        net = self.scripted(gatherer=[{"events": [GOOD_EVENT]}], writer=[error(402, "grant_exhausted")])
        self.go(self.gather_write(rounds=6, budget=600), net)
        out = []
        self.assertEqual(book_job.main(["book_job.py", "status", self.root], out=out.append), 0)
        text = out[0]
        self.assertIn("status: paused", text)
        self.assertIn("grant g_1", text)
        self.assertIn("01-gather-ch01", text)
        self.assertIn("write ch01 6 rounds budget 600", text)
        self.assertIn("used up", text)
        out = []
        book_job.main(["book_job.py", "status", self.root, "--json"], out=out.append)
        self.assertEqual(json.loads(out[0])["status"], "paused")
        self.assertEqual(book_job.main(["book_job.py", "status", self.tmp], out=out.append), 1)


if __name__ == "__main__":
    unittest.main()
