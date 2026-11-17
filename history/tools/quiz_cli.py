#!/usr/bin/env python3
"""A chapter's quiz set on the author's own subscriptions, not mChatAI compute tokens.

  quiz_cli.py <project> <n> [--count 5] [--avoid-from <m>] [--checker claude|codex] [--dry]

Lawrence, 2026-11-16: "We should just be using our claude code plan for this rewrite!" and "CHECK WITH ME BEFORE USING
COMPUTE TOKENS or API Keys or anything that's not in my claude code plan". The learning service (web-api
/v1/learn/quizzes/generate) is for the app's users and bills their compute tokens. For the author's own book the same steps
run here on his Claude Code plan: the service's writer prompt (learning/prompts/quiz-writer.md) on `claude -p` (never
`--bare`, and ANTHROPIC_API_KEY is removed: either would bill an API key), the service's code checks (structure, a verbatim
quote of 8+ words, duplicates), and its blind open-book check (learning/prompts/quiz-checker.md) in a separate, fresh
`claude -p` session that never sees the key (his choice, 11-16: the same family, all on his plan). `--checker codex` uses
Codex on his ChatGPT plan instead (another family); that is outside the Claude Code plan, so only when he says so. Then
rule 7: a question that needs the text open is dropped (quiz.py `quiz_not_standalone`).

The set is quiz-set.v2 with the service's keep rule (the checker picks the key, does not call it ambiguous, finds no other
option also true; a short answer keeps only the rubric points the checker supports), so `quiz.py check` gates it as it gates
a set from the service. The previous set is copied to <project>/.quiz-previous/ first (never into quiz/, which the pack
builders read whole).
"""
import datetime
import hashlib
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import Project, load_json, norm, save_json  # noqa: E402
import quiz  # noqa: E402

LEARNING = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "learning")
MIN_QUOTE_WORDS = 8
DUPLICATE = 0.8
LEVEL_DIFFICULTY = {"remember": "easy", "understand": "medium", "apply": "medium", "analyze": "hard"}


def prompt_file(name):
    with open(os.path.join(LEARNING, "prompts", name), encoding="utf-8") as f:
        return f.read()


def json_in(text):
    """The first JSON object in a model's reply (fenced or not)."""
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    raw = m.group(1) if m else text[text.find("{"): text.rfind("}") + 1]
    return json.loads(raw)


def claude(prompt, model="opus", timeout=900):
    env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")}
    # No tools: the whole input is in the prompt. With tools on, a writer sometimes reached for one (num_turns 2) and the
    # one-turn session ended in error_max_turns with nothing written (podcast_cli, 2026-11-17).
    run = subprocess.run(["claude", "-p", "--output-format", "json", "--max-turns", "1", "--tools", "", "--model", model],
                         input=prompt, capture_output=True, text=True, timeout=timeout, env=env)
    envelope = json.loads(run.stdout) if run.stdout.strip().startswith("{") else None
    if not envelope or envelope.get("is_error") or run.returncode != 0:
        raise SystemExit(f"claude -p failed ({run.returncode}): {(run.stdout or run.stderr)[-400:]}")
    # modelUsage also lists a small model claude -p uses on the side (Haiku, a few tokens): name the one asked for.
    usage = envelope.get("modelUsage") or {}
    used = next((k for k in usage if model in k), None) or max(usage, key=lambda k: usage[k].get("outputTokens", 0), default=model)
    return envelope.get("result", ""), used


def codex(prompt, timeout=900):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "last.txt")
        run = subprocess.run(["codex", "exec", "--skip-git-repo-check", "--ephemeral", "-s", "read-only", "-o", out, prompt],
                             capture_output=True, text=True, timeout=timeout, cwd=tmp)
        if run.returncode != 0 or not os.path.exists(out):
            raise SystemExit(f"codex exec failed ({run.returncode}): {(run.stderr or run.stdout)[-400:]}")
        with open(out, encoding="utf-8") as f:
            return f.read()


def codex_model():
    try:
        with open(os.path.expanduser("~/.codex/config.toml"), encoding="utf-8") as f:
            m = re.search(r'^model\s*=\s*"([^"]+)"', f.read(), re.M)
            return m.group(1) if m else "codex"
    except OSError:
        return "codex"


def stems(text):
    return {w[:6] for w in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(w) > 2}


def similar(a, b):
    return len(a & b) / max(1, len(a | b))


def structure_problem(q):
    if q.get("type") == "mc":
        opts = [norm(o) for o in q.get("options") or []]
        if len(opts) != 4 or len(set(opts)) != 4 or opts.count(norm(q.get("correctAnswer", ""))) != 1:
            return "structure"
    elif q.get("type") == "short":
        if not q.get("rubric") or not q.get("modelAnswer"):
            return "structure"
    else:
        return "type"
    return None


def grounded(q, text_norm):
    quote = (q.get("source") or {}).get("quote", "")
    if len(quote.split()) < MIN_QUOTE_WORDS or norm(quote) not in text_norm:
        return False
    return all(norm(r.get("quote", "")) in text_norm for r in q.get("rubric") or [] if r.get("quote"))


def passage(quote, text):
    at = text.lower().find(quote.lower()[:60])
    if at < 0:
        return quote
    lo, hi = max(0, at - 350), min(len(text), at + len(quote) + 350)
    return ("… " if lo else "") + text[lo:hi] + (" …" if hi < len(text) else "")


def claim_for(quote, claims):
    q = norm(quote)
    for c in claims:
        if q and (q in norm(c.get("text", "")) or q in norm(c.get("evidence", ""))
                  or (c.get("anchor") and norm(c["anchor"]) in q)):
            return c
    return None


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    flags = argv[1:]
    if len(args) < 2:
        print(__doc__)
        return 2
    project, n = Project(args[0]), int(args[1])
    count = int(flags[flags.index("--count") + 1]) if "--count" in flags else 5
    checker_kind = flags[flags.index("--checker") + 1] if "--checker" in flags else "claude"
    if checker_kind not in ("claude", "codex"):
        print("--checker is claude (his Claude Code plan, the default) or codex (his ChatGPT plan: ask him first)")
        return 2
    avoid = []
    if "--avoid-from" in flags:
        other = load_json(project.path("quiz", f"{int(flags[flags.index('--avoid-from') + 1]):02d}.json"), {}) or {}
        avoid = [q["question"] for q in other.get("questions", [])]
    body = quiz.request_payload(project, n, count=count, types=("mc", "short"))
    src = body["source"]
    claims = src["claims"]
    text = "\n\n".join([src["text"]] + [c["evidence"] for c in claims if c.get("evidence")])
    text_norm = norm(text)
    ask = min(count * 2, 12)   # the checks and rule 7 drop some; the service asks 1.4x, this asks more
    if "--dry" in flags:
        print(f"ch{n}: would ask Claude Code for {ask} ({len(text.split())} words of source, avoid {len(avoid)}), then Codex blind")
        return 0

    writer_in = {"source": {"title": src["title"], "chapter": n, "text": text}, "count": ask, "types": ["mc", "short"],
                 "levels": ["understand", "apply", "analyze"], "avoid": avoid}
    reply, writer_model = claude(prompt_file("quiz-writer.md") + "\n\n## The input\n\n```json\n" + json.dumps(writer_in, ensure_ascii=False) + "\n```\n")
    written = json_in(reply).get("questions", [])
    dropped, kept, seen = [], [], [stems(a) for a in avoid]
    for i, q in enumerate(written, 1):
        q["id"] = f"w{i}"
        q.setdefault("source", {})
        why = structure_problem(q) or (None if grounded(q, text_norm) else "not_grounded") \
            or ("not_standalone" if quiz.leans_on_text(q.get("question", "")) else None)
        s = stems(q.get("question"))
        if not why and any(similar(s, t) >= DUPLICATE for t in seen):
            why = "duplicate"
        if why:
            dropped.append((q["id"], why, q.get("question", "")[:80]))
            continue
        seen.append(s)
        kept.append(q)

    # The blind open-book check, on another family: no key, no explanation, options shuffled.
    rng = random.Random(f"{project.root}:{n}")
    blind = []
    for q in kept:
        opts = list(q.get("options") or [])
        rng.shuffle(opts)
        blind.append({"id": q["id"], "type": q["type"], "question": q["question"], "options": opts,
                      "rubric": [r.get("point") or r.get("text") or "" for r in q.get("rubric") or []]})
    checker_in = {"mode": "open-book", "passages": {q["id"]: passage(q["source"]["quote"], text) for q in kept}, "questions": blind}
    checker_prompt = prompt_file("quiz-checker.md") + "\n\n## The input\n\n```json\n" + json.dumps(checker_in, ensure_ascii=False) + "\n```\n"
    if checker_kind == "codex":
        verdict_text, checker = codex(checker_prompt), f"{codex_model()} (Codex)"
    else:
        verdict_text, checker_model = claude(checker_prompt)   # a new session: it never saw the writer's turn or the key
        checker = f"{checker_model} (Claude Code, blind session)"
    verdicts = {r.get("id"): r for r in json_in(verdict_text).get("results", [])}
    checked = []
    for q in kept:
        o = verdicts.get(q["id"])
        checks = ["structure", "grounded", "deduped"]
        why = None
        if not o:
            why = "not_checked"
        elif q["type"] == "mc":
            key = norm(q["correctAnswer"])
            if norm(o.get("chosen") or "") != key:
                why = "checker_disagrees"
            elif o.get("ambiguous") is True:
                why = "ambiguous"
            elif any(v.get("verdict") == "also-true" and norm(v.get("option", "")) != key for v in o.get("options") or []):
                why = "distractor_also_true"
            else:
                checks.append("blind_open_book")
        else:
            marks = o.get("rubric") or []
            q["rubric"] = [r for i, r in enumerate(q["rubric"]) if i < len(marks) and marks[i] is True]
            if q["rubric"]:
                checks.append("rubric_supported")
            else:
                why = "rubric_unsupported"
        if why:
            dropped.append((q["id"], why, q["question"][:80]))
            continue
        c = claim_for(q["source"]["quote"], claims)
        if c:
            q["source"]["claimId"], q["source"]["sourceId"] = c["id"], c.get("source")
            checks.append("claim")
        q["checks"] = checks
        checked.append(q)

    shorts = [q for q in checked if q["type"] == "short"][:2]
    chosen = [q for q in checked if q in shorts or q["type"] == "mc"]
    chosen = [q for q in chosen if q in shorts] + [q for q in chosen if q not in shorts]
    chosen = sorted(chosen[:count], key=lambda q: checked.index(q))
    if len(chosen) < min(4, count):
        for d in dropped:
            print(f"  dropped {d[0]} ({d[1]}): {d[2]}")
        raise SystemExit(f"ch{n}: only {len(chosen)} questions survived; nothing saved")

    set_id = "qs-" + hashlib.sha256(f"{project.root}:{n}:{datetime.datetime.now().isoformat()}".encode()).hexdigest()[:10]
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    out = []
    for i, q in enumerate(chosen, 1):
        opts = list(q.get("options") or [])
        if q["type"] == "mc":
            random.Random(f"{set_id}:{q['question']}").shuffle(opts)   # writers put the key first
        out.append({
            "id": f"q{i}", "type": q["type"], "question": q["question"], "options": opts,
            "correctAnswer": q.get("correctAnswer", ""), "explanation": q.get("explanation", ""), "url": None,
            "tags": [q["concept"]] if q.get("concept") else [], "topic": src["title"],
            "difficulty": LEVEL_DIFFICULTY.get(q.get("level"), "medium"), "concept": q.get("concept"), "level": q.get("level"),
            "source": {"chapter": n, "claimId": q["source"].get("claimId"), "sourceId": q["source"].get("sourceId"),
                       "quote": q["source"]["quote"]},
            "rubric": q.get("rubric") or [], "modelAnswer": q.get("modelAnswer", ""),
            "validation": {"checks": q["checks"], "writer": f"{writer_model} (Claude Code)", "checker": checker,
                           "answerableWithoutSource": None, "date": now},
        })
    qset = {"schema": "quiz-set.v2", "id": set_id, "title": src["title"], "work": body.get("work"), "chapter": n,
            "unlocksAfter": n, "grounding": "source", "createdAt": now,
            "contentHash": hashlib.sha256(json.dumps(out, ensure_ascii=False).encode()).hexdigest()[:16],
            "warnings": [] if len(out) == count else [f"kept {len(out)} of {count} requested after the checks"],
            "questions": out}
    path = project.path("quiz", f"{n:02d}.json")
    if os.path.exists(path):
        keep = project.path(".quiz-previous")
        os.makedirs(keep, exist_ok=True)
        shutil.copy(path, os.path.join(keep, f"{n:02d}-{datetime.datetime.now().strftime('%Y%m%dT%H%M%S')}.json"))
    save_json(path, qset)
    hard = [f["rule"] for f in quiz.quiz_findings(project, n) if f["severity"] == "hard"]
    print(f"ch{n}: written {len(written)}, kept {len(out)} (writer {writer_model}, checker {checker}); "
          f"gate {'CLEAN' if not hard else hard}")
    for d in dropped:
        print(f"  dropped {d[0]} ({d[1]}): {d[2]}")
    return 0 if not hard else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
