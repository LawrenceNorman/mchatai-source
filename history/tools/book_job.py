#!/usr/bin/env python3
"""A book's cloud stages as one job: gather and write steps run in order through cloud_writer.py,
checkpointed after each step, resumable, billed through an ED.6 grant (Phase ED.11a).

  book_job.py run    <project> --plan <steps.json>    run the plan's steps not yet done
  book_job.py status <project> [--json]               print the job

steps.json is a list (or {"steps": [...]}) of steps, run in order:

  {"step": "gather", "chapter": 12, "sources": ["s81", "s82"], "budget": 400}
  {"step": "write",  "chapter": 12, "rounds": 6, "budget": 600, "withGathered": true}

`budget` (compute tokens for that chapter's run) and `rounds` default to history/cloud-writer.json;
`withGathered` is cloud_writer.py write's --with-gathered. Any other key is refused before a call.

Billing: with the env MCHATAI_GRANT set, every call bills that grant as the job's Google identity
(cloud_models.py, grant mode: MCHATAI_GRANT_AUDIENCE, COMPUTE_PROXY_URL); without it, the signed-in
session in MCHATAI_SESSION, as cloud_writer.py does. MCHATAI_JOB_ID, when set, is recorded.

The checkpoint is <project>/cloud/job.json: the job's status, the grant id(s) it ran under, and per
step its status, attempts, compute tokens and result. It is written when a step starts and when it
ends. A rerun skips the steps that are done and runs the rest; inside a step cloud_writer replays
every reply it saved, so a rerun pays only for calls not yet answered. A plan whose step changed
(a new budget, other sources) keeps the unchanged steps before it and runs the changed one and every
later one again (their saved replies still replay where the request is the same).

Statuses and exit codes:
  done     0   every step done
  blocked  1   a hard failure: the gate's hard findings after the last round, the chapter's budget,
               a reply cut off, a refused request; its reason says what the author must change
  paused   3   the grant is used up, revoked or expired, or the account is out of tokens: rerun once
               the user approves more (a new grant id in MCHATAI_GRANT)
  failed   75  the model or the identity was unavailable after retries, or the job was interrupted
               (SIGTERM): rerun as it is
  usage    2   a bad plan or command line; job.json is not touched
"""
import hashlib
import json
import os
import signal
import sys
import traceback
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cloud_models  # noqa: E402
import cloud_writer  # noqa: E402
from cloud_models import PAUSE_CODES, RETRYABLE_CODES, ModelError  # noqa: E402
from _hw import Project, load_json, save_json  # noqa: E402

EXIT = {"done": 0, "blocked": 1, "paused": 3, "failed": 75}
STEP_KEYS = {"gather": {"step", "chapter", "sources", "budget"},
             "write": {"step", "chapter", "rounds", "budget", "withGathered"}}


class Interrupted(BaseException):
    """SIGTERM (a Cloud Run task timeout or a cancel). A BaseException, so no step's error handling
    takes it for a model error: the runner checkpoints the step as failed and exits 75."""


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def job_path(project):
    return project.path("cloud", "job.json")


# ── the plan ─────────────────────────────────────────────────────────────────

def _int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def validate_plan(raw):
    """(steps, problems): each step normalised (sorted keys, sources as strings)."""
    rows = raw.get("steps") if isinstance(raw, dict) else raw
    if not isinstance(rows, list) or not rows:
        return [], ["the plan is not a non-empty list of steps (or {\"steps\": [...]})"]
    steps, problems = [], []
    for i, s in enumerate(rows, 1):
        where = f"step {i}"
        if not isinstance(s, dict):
            problems.append(f"{where} is not an object")
            continue
        kind = s.get("step")
        if kind not in STEP_KEYS:
            problems.append(f"{where}: `step` must be one of {', '.join(sorted(STEP_KEYS))}, not {kind!r}")
            continue
        extra = sorted(set(s) - STEP_KEYS[kind])
        if extra:
            problems.append(f"{where} ({kind}): unknown key(s) {', '.join(extra)}")
        if not _int(s.get("chapter")) or s["chapter"] < 0:
            problems.append(f"{where} ({kind}): `chapter` must be a whole number, 0 for the introduction")
        if kind == "gather":
            src = s.get("sources")
            if not isinstance(src, list) or not src or not all(isinstance(x, (str, int)) and str(x).strip() for x in src):
                problems.append(f"{where} (gather): `sources` must list source ids")
        if "rounds" in s and (not _int(s["rounds"]) or s["rounds"] < 1):
            problems.append(f"{where} ({kind}): `rounds` must be a whole number of at least 1")
        if "budget" in s and (not _num(s["budget"]) or s["budget"] <= 0):
            problems.append(f"{where} ({kind}): `budget` must be a number of compute tokens above 0")
        if "withGathered" in s and not isinstance(s["withGathered"], bool):
            problems.append(f"{where} ({kind}): `withGathered` must be true or false")
        spec = {k: s[k] for k in sorted(s)}
        if kind == "gather" and isinstance(spec.get("sources"), list):
            spec["sources"] = [str(x).strip() for x in spec["sources"]]
        steps.append(spec)
    return steps, problems


def load_plan(path):
    try:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        raw = json.loads(text)
    except OSError as e:
        return [], [f"cannot read the plan {path}: {type(e).__name__}"], None
    except ValueError as e:
        return [], [f"the plan {path} is not JSON ({e})"], None
    steps, problems = validate_plan(raw)
    return steps, problems, hashlib.sha256(text.encode("utf-8")).hexdigest()


def step_key(i, spec):
    return f"{i + 1:02d}-{spec['step']}-ch{int(spec['chapter']):02d}"


def describe(spec):
    bits = [f"{spec['step']} ch{int(spec['chapter']):02d}"]
    if spec.get("sources"):
        bits.append("[" + ", ".join(spec["sources"]) + "]")
    if spec.get("rounds"):
        bits.append(f"{spec['rounds']} rounds")
    if spec.get("budget"):
        bits.append(f"budget {spec['budget']:g}")
    if spec.get("withGathered"):
        bits.append("with gathered")
    return " ".join(bits)


# ── the checkpoint ───────────────────────────────────────────────────────────

def new_step(i, spec):
    return {"key": step_key(i, spec), "spec": spec, "status": "pending", "attempts": 0, "computeTokens": 0}


def reconcile(job, steps):
    """The plan's steps over what job.json holds: a step keeps its record while it and every step
    before it are unchanged; from the first change on, each step starts again (its old record, if it
    ran, is kept under `replaced`)."""
    old = job.get("steps") or []
    out, kept = [], 0
    for i, spec in enumerate(steps):
        prev = old[i] if i < len(old) else None
        if kept == i and prev and prev.get("spec") == spec:
            out.append(prev)
            kept += 1
        else:
            out.append(new_step(i, spec))
    for prev in old[kept:]:
        if prev.get("attempts"):
            job.setdefault("replaced", []).append({**prev, "replacedAt": now_iso()})
    job["steps"] = out
    return job


def save(project, job):
    job["updatedAt"] = now_iso()
    save_json(job_path(project), job)


def spent_so_far(client):
    return sum(float(t.get("tokens") or 0) for t in client.tally.values())


# ── one step ─────────────────────────────────────────────────────────────────

def classify(code):
    if code in PAUSE_CODES:
        return "paused"
    if code in RETRYABLE_CODES:
        return "failed"
    return "blocked"


def run_step(project, spec, client, cfg, out):
    """(status, reason, result summary) for one step."""
    n = int(spec["chapter"])
    if spec["step"] == "gather":
        code, res = cloud_writer.gather(project, n, spec["sources"], client, cfg, budget=spec.get("budget"), out=out)
        res = res or {}
        summary = {"kept": len(res.get("kept") or []), "dropped": len(res.get("dropped") or []),
                   "facts": os.path.relpath(cloud_writer.gathered_path(project, n), project.root)}
        if code == 0:
            return "done", None, summary
        err = res.get("error")
        if not err:
            return "blocked", f"plan.json has no chapter {n}", summary
        if err.get("kind") == "stop":   # the chapter's gather budget
            return "blocked", err["message"], summary
        return classify(err.get("code")), err["message"], summary
    code, res = cloud_writer.write_chapter(project, n, client, cfg, rounds=spec.get("rounds"), budget=spec.get("budget"),
                                           gathered=bool(spec.get("withGathered")), out=out)
    summary = {k: res.get(k) for k in ("status", "rounds", "audits", "spent", "liveCalls") if k in res}
    if code == 0:
        return "done", None, summary
    if res.get("status") == "error":
        return classify(res.get("errorCode")), res.get("reason"), summary
    return "blocked", res.get("reason"), summary   # blocked (hard findings, audit), stopped (budget, cut off, ...)


# ── the job ──────────────────────────────────────────────────────────────────

def run_job(project, steps, client, cfg=None, plan=None, plan_sha=None, job_id=None, out=print):
    """Run the steps not yet done. (exit code, job)."""
    cfg = cfg or cloud_models.load_config()
    job = load_json(job_path(project), None) or {
        "_comment": "A book's cloud job (history/tools/book_job.py): one record per plan step, checkpointed after "
                    "each. Compute tokens: 1 = $0.01, what this job's live calls were charged.",
        "version": 1, "startedAt": now_iso(), "runs": 0, "computeTokens": 0, "grants": [], "steps": []}
    job = reconcile(job, steps)
    grant = client.grant
    job.update(billing="grant" if grant else "session", grant=grant, status="running", reason=None,
               runs=int(job.get("runs") or 0) + 1, plan=plan, planSha256=plan_sha)
    if job_id or os.environ.get("MCHATAI_JOB_ID"):
        job["jobId"] = job_id or os.environ.get("MCHATAI_JOB_ID")
    if grant and grant not in job.setdefault("grants", []):
        job["grants"].append(grant)
    save(project, job)
    todo = [r for r in job["steps"] if r["status"] != "done"]
    out(f"job {os.path.basename(project.root)}: {len(job['steps']) - len(todo)} of {len(job['steps'])} step(s) done; "
        f"billing {'grant ' + grant if grant else 'the signed-in session'}")

    for rec in todo:
        rec.update(status="running", attempts=int(rec.get("attempts") or 0) + 1, startedAt=now_iso(), endedAt=None,
                   reason=None, grant=grant)
        save(project, job)
        out(f"── {rec['key']}: {describe(rec['spec'])} (attempt {rec['attempts']})")
        before = spent_so_far(client)
        try:
            status, reason, summary = run_step(project, rec["spec"], client, cfg, out)
        except Interrupted:
            status, reason, summary = "failed", "interrupted (SIGTERM: the task's timeout, or a cancel); rerun to resume", None
        except ModelError as e:   # raised outside cloud_writer's own handling (the identity, a bad grant id)
            status, reason, summary = classify(e.code), f"{e.code}: {e}", None
        except Exception as e:  # noqa: BLE001 — a bug or a broken project file ends the job, never silently
            traceback.print_exc(file=sys.stderr)
            status, reason, summary = "blocked", f"unexpected {type(e).__name__}: {e}", None
        used = round(spent_so_far(client) - before, 4)
        rec["computeTokens"] = round(float(rec.get("computeTokens") or 0) + used, 4)
        job["computeTokens"] = round(float(job.get("computeTokens") or 0) + used, 4)
        rec.update(status=status, reason=reason, endedAt=now_iso())
        if summary is not None:
            rec["result"] = summary
        save(project, job)
        out(f"   {rec['key']}: {status} ({used:g} compute tokens)" + (f" — {reason}" if reason else ""))
        if status != "done":
            job.update(status=status, reason=f"{rec['key']}: {reason}")
            save(project, job)
            out(f"job: {status} at {rec['key']} ({job['computeTokens']:g} compute tokens in all)")
            return EXIT[status], job
    job.update(status="done", reason=None)
    save(project, job)
    out(f"job: done ({job['computeTokens']:g} compute tokens in all)")
    return 0, job


def status_text(job):
    lines = [f"status: {job.get('status')}" + (f" — {job['reason']}" if job.get("reason") else ""),
             (f"billing: grant {job['grant']}" if job.get("grant") else "billing: the signed-in session")
             + (f" · grants used {', '.join(job['grants'])}" if len(job.get("grants") or []) > 1 else "")
             + (f" · job {job['jobId']}" if job.get("jobId") else ""),
             f"compute tokens: {float(job.get('computeTokens') or 0):g} · runs: {job.get('runs')} · updated {job.get('updatedAt')}"]
    for r in job.get("steps") or []:
        res = r.get("result") or {}
        extra = (f" · kept {res['kept']}, dropped {res['dropped']}" if "kept" in res else
                 f" · {res.get('rounds')} round(s), {res.get('audits')} audit(s)" if "rounds" in res else "")
        lines.append(f"  {r['key']:<16} {r['status']:<8} {float(r.get('computeTokens') or 0):>8g} tokens  "
                     f"{describe(r['spec'])}{extra}" + (f"\n{'':19}{r['reason']}" if r.get("reason") and r["status"] != "done" else ""))
    if job.get("replaced"):
        lines.append(f"  ({len(job['replaced'])} earlier step record(s) replaced by a changed plan)")
    return "\n".join(lines)


# ── command line ─────────────────────────────────────────────────────────────

def _on_sigterm(signum, frame):
    raise Interrupted()


def main(argv, out=print):
    if len(argv) >= 3 and argv[1] == "status":
        project = Project(argv[2])
        job = load_json(job_path(project))
        if not job:
            out(f"no job in {job_path(project)}")
            return 1
        out(json.dumps(job, indent=1, ensure_ascii=False) if "--json" in argv else status_text(job))
        return 0
    if len(argv) >= 3 and argv[1] == "run":
        plan_path = cloud_writer._flag(argv, "--plan")
        if not plan_path:
            out("run needs --plan <steps.json>")
            return 2
        project = Project(argv[2])
        if not os.path.isdir(project.root):
            out(f"no project folder {project.root}")
            return 2
        steps, problems, sha = load_plan(plan_path)
        if problems:
            for p in problems:
                out(f"plan: {p}")
            return 2
        cfg = cloud_models.load_config()
        try:
            client = cloud_models.Client(cfg=cfg)
        except ModelError as e:
            out(f"{e.code}: {e}")
            return 2
        signal.signal(signal.SIGTERM, _on_sigterm)
        code, _ = run_job(project, steps, client, cfg, plan=os.path.abspath(plan_path), plan_sha=sha, out=out)
        return code
    out(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
