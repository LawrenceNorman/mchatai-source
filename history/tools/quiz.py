#!/usr/bin/env python3
"""Quizzes for a finished chapter (Phase QL.2, with the mchatai.com service in
mchatai_macOS/docs/EDUCATION_CLOUD_SERVICES.md).

  quiz.py request <project> <n> [--count 10] [--types mc,short] [--require-claim]
        print the request body for web-api POST /v1/learn/quizzes/generate: the chapter's prose and
        its claims (sentence, verbatim evidence, source id), so the service can name the claim each
        question tests. Post it with the author's ID token; save the returned `set` as quiz/NN.json.
  quiz.py check <project> <n>     (also: gate.py quiz <project> <n>)
        prove offline that quiz/NN.json still fits the chapter: quiz set v2; every question quotes the
        chapter or a claim's evidence word for word; every claimId is a claim of this chapter whose
        source still holds its evidence; every question passed the service's blind second-model check.

The service checks a set when it is made. This check runs again whenever the chapter changes, because
a revised chapter can leave a question quoting a sentence that is gone.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import Project, finding, load_json, norm, report  # noqa: E402

TYPES = {"mc", "tf", "short", "essay"}
BLIND = {"mc": "blind_open_book", "tf": "blind_open_book", "short": "rubric_supported", "essay": "rubric_supported"}


def quiz_path(project, n):
    return project.path("quiz", f"{int(n):02d}.json")


def chapter_claims(ch):
    return [c for c in (ch or {}).get("claims", []) if c.get("id") and (c.get("text") or c.get("evidence"))]


def request_payload(project, n, count=10, types=("mc", "short"), require_claim=False):
    ch = project.chapter(n)
    if not ch:
        raise SystemExit(f"chapter {n} not found at {project.chapter_path(n)}")
    meta = load_json(project.path("project.json"), {}) or {}
    plan_ch = project.plan_chapter(n) or {}
    claims = [{"id": str(c["id"]), "text": c.get("text", ""), "evidence": c.get("evidence", ""),
               "source": str(c.get("source", "")) or None} for c in chapter_claims(ch)]
    title = plan_ch.get("title") or ch.get("title") or f"Chapter {n}"
    return {
        "source": {"title": f"{meta.get('subject') or meta.get('slug') or 'Book'} · {title}", "chapter": int(n),
                   "text": ch.get("text", ""), "claims": claims, "requireClaim": bool(require_claim and claims)},
        "count": count, "types": list(types), "work": meta.get("slug"),
    }


def quiz_findings(project, n):
    ch = project.chapter(n)
    if not ch:
        return [finding("quiz_chapter_missing", "hard", f"chapter {n} not found")]
    qs = load_json(quiz_path(project, n))
    if not qs:
        return [finding("quiz_missing", "hard", f"no quiz at quiz/{int(n):02d}.json (quiz.py request, then save the service's set)")]
    if qs.get("schema") != "quiz-set.v2" or not isinstance(qs.get("questions"), list):
        return [finding("quiz_schema", "hard", "quiz/NN.json is not a quiz-set.v2 set")]
    claims = {str(c["id"]): c for c in chapter_claims(ch)}
    where = [norm(ch.get("text", ""))] + [norm(c.get("evidence", "")) for c in claims.values()]
    quoted = lambda q: bool(q) and any(norm(q) in w for w in where if w)  # noqa: E731
    checked_sources = {}
    out = []
    for q in qs["questions"]:
        qid = q.get("id", "?")
        kind = q.get("type")
        if kind not in TYPES:
            out.append(finding("quiz_type", "soft", f"{qid}: type {kind!r} is skipped by readers"))
            continue
        if kind in ("mc", "tf"):
            opts = [norm(o) for o in q.get("options", [])]
            if (kind == "mc" and len(opts) != 4) or opts.count(norm(q.get("correctAnswer", ""))) != 1 or len(set(opts)) != len(opts):
                out.append(finding("quiz_structure", "hard", f"{qid}: the key must be exactly one of distinct options", q.get("question", "")))
        elif not q.get("rubric"):
            out.append(finding("quiz_structure", "hard", f"{qid}: an open question needs its rubric", q.get("question", "")))
        quote = (q.get("source") or {}).get("quote", "")
        if not quoted(quote):
            out.append(finding("quiz_quote_unverified", "hard", f"{qid}: its quote is no longer in the chapter or a claim's evidence", quote))
        for r in q.get("rubric") or []:
            if r.get("quote") and not quoted(r["quote"]):
                out.append(finding("quiz_quote_unverified", "hard", f"{qid}: a rubric point's quote is no longer in the chapter", r["quote"]))
        cid = (q.get("source") or {}).get("claimId")
        if cid:
            claim = claims.get(str(cid))
            if not claim:
                out.append(finding("quiz_claim_unknown", "hard", f"{qid}: claim {cid} is not a claim of chapter {n}"))
            elif claim.get("source") and claim.get("evidence"):
                sid = str(claim["source"])
                if sid not in checked_sources:
                    checked_sources[sid] = project.source_text(sid)
                text = checked_sources[sid]
                if text is not None and norm(claim["evidence"]) not in norm(text):
                    out.append(finding("quiz_claim_source_changed", "hard", f"{qid}: source {sid} no longer holds claim {cid}'s evidence"))
        if BLIND[kind] not in ((q.get("validation") or {}).get("checks") or []):
            out.append(finding("quiz_unchecked", "hard", f"{qid}: it did not pass the second-model check ({BLIND[kind]})"))
    if not qs["questions"]:
        out.append(finding("quiz_empty", "hard", "the set has no questions"))
    return out


def main(argv):
    args = argv[1:]
    if len(args) >= 3 and args[0] == "request":
        count, types, require = 10, ("mc", "short"), False
        rest = args[3:]
        while rest:
            flag = rest.pop(0)
            if flag == "--count":
                count = int(rest.pop(0))
            elif flag == "--types":
                types = tuple(t for t in rest.pop(0).split(",") if t)
            elif flag == "--require-claim":
                require = True
        print(json.dumps(request_payload(Project(args[1]), args[2], count, types, require), ensure_ascii=False, indent=2))
        return 0
    if len(args) >= 3 and args[0] == "check":
        return report(f"quiz ch{args[2]}", quiz_findings(Project(args[1]), args[2]))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
