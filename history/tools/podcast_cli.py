#!/usr/bin/env python3
"""A chapter's two-voice teaching podcast script on the author's own Claude Code plan, checked line by line.

  podcast_cli.py <project> <n> [--words 1300] [--show "Money, Plainly"] [--dry]

The learning service's podcast route (web-api /v1/learn/podcasts/script) is for the app's users and bills their compute
tokens. For the author's own book the same steps run here, on his Claude Code plan (Lawrence, 2026-11-16: "CHECK WITH ME
BEFORE USING COMPUTE TOKENS or API Keys or anything that's not in my claude code plan"):

  1. the service's writer prompt (learning/prompts/podcast-writer.md) on `claude -p --model opus` (never `--bare`;
     ANTHROPIC_API_KEY is removed: either would bill an API key);
  2. the service's code checks: both speakers, every digit number verbatim in the chapter, every number word ("three",
     "fifth") a word of the chapter, the required sentence said exactly once; plus the learner's share of the words
     (the teacher leads: his rule for every podcast);
  3. the service's blind check (learning/prompts/podcast-checker.md) in a fresh `claude -p` session that sees only the
     chapter and what the listener hears, one verdict per line;
  4. up to two revisions with the problems (the writer prompt's `revise` input), then the checks again.

A script that still has a problem after the revisions is written with `"passed": false` and the command exits 1: fix it by
hand and run `--recheck`. Output in <project>/podcast/: NN.json (the script, the checks, the models) and NN.md (the
TEACHER:/LEARNER: text that a local renderer voices; `## ` headings are section breaks, `[pause N]` is silence).
"""
import datetime
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import Project, load_json, save_json  # noqa: E402
from quiz_cli import claude, json_in, prompt_file  # noqa: E402

MUST_SAY = "This is education, not investment advice."
LEARNER_SHARE = (0.10, 0.30)
NUMBER_WORDS = set("""zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen
seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion trillion
half halves quarter quarters double triple twice thrice once first second third fourth fifth sixth seventh eighth ninth
tenth dozen percent""".split())
DIGIT_TOKEN = re.compile(r"\$?\d[\d,]*(?:\.\d+)?%?")
CHECK_HEADING = "Check yourself"


def notes(show, title, next_title):
    closing = (f'The last teacher line is "Next time: {next_title[0].lower() + next_title[1:]}. Thanks for listening to {show}."'
               if next_title else f'The last teacher line is "Thanks for listening to {show}."')
    return (
        f'The show is "{show}", one episode per chapter of a plain-language handbook. In the Hook section, after the one '
        f'surprising true thing, the teacher says "This is {show}. Today: <the chapter\'s topic in a few words>." and then the '
        f"required sentence. The learner is a beginner and speaks about a fifth of the words. Use the chapter's own section "
        f"order. After the sections: a section headed \"Recap\" where the learner says the main ideas back and the teacher "
        f"corrects anything off, then a section headed \"{CHECK_HEADING}\" where the teacher asks a few questions the chapter "
        f"answers, one line each ending in a question mark, each followed by a teacher line that answers it. {closing} "
        f"Never name a company, product, fund or person the chapter does not name. Education only: say what the chapter says "
        f"people do or consider, never what the listener should do.")


def lines_of(script):
    out, n = [], 0
    for s in script.get("sections", []):
        for line in s.get("lines", []):
            n += 1
            line["id"] = f"L{n}"
            out.append(line)
    return out


def code_problems(script, chapter_text):
    chapter_words = set(re.findall(r"[a-z]+", chapter_text.lower()))
    lines = lines_of(script)
    problems = []
    for who in ("teacher", "learner"):
        if not any(l.get("speaker") == who for l in lines):
            problems.append(f"the {who} never speaks")
    bad = [l["id"] for l in lines if l.get("speaker") not in ("teacher", "learner")]
    if bad:
        problems.append(f"lines {', '.join(bad)}: every line is spoken by \"teacher\" or \"learner\"")
    said = sum(l.get("text", "").count(MUST_SAY) for l in lines)
    if said != 1:
        problems.append(f'say "{MUST_SAY}" exactly once, word for word (said {said} times)')
    texts = [(l["id"], l.get("text", "")) for l in lines] + [("title", script.get("title", ""))] + \
        [(f"heading {s.get('heading')}", s.get("heading", "")) for s in script.get("sections", [])]
    for lid, text in texts:
        text = text.replace(MUST_SAY, "")
        for tok in DIGIT_TOKEN.findall(text):
            tok = tok.rstrip(",.")
            if tok not in chapter_text:
                problems.append(f'{lid}: "{tok}" is not in the chapter as written; copy the chapter\'s figure or say it without a number')
        for word in re.findall(r"[a-z]+", text.lower()):
            if word in NUMBER_WORDS and word not in chapter_words:
                problems.append(f'{lid}: the number word "{word}" is not in the chapter; say "a few", "some" or the chapter\'s own words')
    words = {w: sum(len(l.get("text", "").split()) for l in lines if l.get("speaker") == w) for w in ("teacher", "learner")}
    total = max(1, sum(words.values()))
    share = words["learner"] / total
    if not LEARNER_SHARE[0] <= share <= LEARNER_SHARE[1]:
        problems.append(f"the learner speaks {share:.0%} of the words; the teacher leads and the learner speaks about a fifth")
    if not any(s.get("heading") == CHECK_HEADING for s in script.get("sections", [])):
        problems.append(f'end with a section headed "{CHECK_HEADING}" before the closing line')
    return problems, words


def blind_check(script, chapter):
    items = [{"id": "title", "speaker": "heading", "text": script.get("title", "")}]
    for i, s in enumerate(script.get("sections", [])):
        items.append({"id": f"H{i + 1}", "speaker": "heading", "text": s.get("heading", "")})
        for line in s.get("lines", []):
            text = line.get("text", "").replace(MUST_SAY, "").strip()
            if text:
                items.append({"id": line["id"], "speaker": line.get("speaker"), "text": text})
    checker_in = {"source": {"title": chapter["title"], "text": chapter["text"]}, "lines": items}
    reply, model = claude(prompt_file("podcast-checker.md") + "\n\n## The input\n\n```json\n"
                          + json.dumps(checker_in, ensure_ascii=False) + "\n```\n")
    verdicts = {r.get("id"): r for r in json_in(reply).get("results", [])}
    failed = []
    for it in items:
        v = verdicts.get(it["id"])
        if not v:
            failed.append({"id": it["id"], "text": it["text"], "note": "not checked"})
        elif v.get("verdict") == "unsupported":
            failed.append({"id": it["id"], "text": it["text"], "note": v.get("note", "")})
    return failed, model, len(items)


def render_text(script, chapter_n, show):
    parts = [f"# {script.get('title', '')}", "",
             f"Chapter {chapter_n} of {show}, two voices (TEACHER leads, LEARNER asks). Written and checked by "
             f"podcast_cli.py; do not edit by hand without a --recheck. `## ` headings are not spoken.", ""]
    for s in script.get("sections", []):
        parts += [f"## {s.get('heading', '')}", ""]
        for line in s.get("lines", []):
            text = line.get("text", "").strip()
            if s.get("heading") == CHECK_HEADING and line.get("speaker") == "teacher" and text.endswith("?"):
                text += " [pause 2.5]"
            parts += [f"{line['speaker'].upper()}: {text}", ""]
    return "\n".join(parts).rstrip() + "\n"


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    flags = argv[1:]
    if len(args) < 2:
        print(__doc__)
        return 2
    project, n = Project(args[0]), int(args[1])
    words_target = int(flags[flags.index("--words") + 1]) if "--words" in flags else 1300
    show = flags[flags.index("--show") + 1] if "--show" in flags else (project.plan.get("title") or "the handbook")
    chapter = load_json(project.chapter_path(n))
    if not chapter or not chapter.get("text"):
        print(f"no chapter {n} text")
        return 2
    numbers = project.chapter_numbers()
    later = [m for m in numbers if m > n]
    next_title = (load_json(project.chapter_path(later[0])) or {}).get("title") if later else None
    out_json, out_md = project.path("podcast", f"{n:02d}.json"), project.path("podcast", f"{n:02d}.md")
    if "--dry" in flags:
        print(f"ch{n} '{chapter['title']}': {len(chapter['text'].split())} words of chapter → ~{words_target} spoken; next: {next_title}")
        return 0

    history = []
    if "--recheck" in flags:
        record = load_json(out_json)
        script, writer_model = {"title": record["title"], "sections": record["sections"]}, (record.get("writer") or "").replace(" (Claude Code)", "")
    else:
        writer_in = {"source": {"title": chapter["title"], "text": chapter["text"]}, "minutes": round(words_target / 145),
                     "targetWords": words_target, "mustSay": [MUST_SAY], "notes": notes(show, chapter["title"], next_title)}
        reply, writer_model = claude(prompt_file("podcast-writer.md") + "\n\n## The input\n\n```json\n"
                                     + json.dumps(writer_in, ensure_ascii=False) + "\n```\n")
        script = json_in(reply)
    checker_model, checked = None, 0
    for attempt in range(3):
        problems, words = code_problems(script, chapter["text"])
        failed, checker_model, checked = blind_check(script, chapter)
        history.append({"pass": attempt + 1, "codeProblems": problems, "unsupported": failed, "words": words})
        print(f"ch{n} pass {attempt + 1}: {sum(words.values())} words (learner {words['learner']}), "
              f"{len(problems)} code problem(s), {len(failed)} unsupported of {checked}")
        if not problems and not failed:
            break
        if attempt == 2 or "--recheck" in flags:
            break
        revise = {"previous": {"title": script.get("title"), "sections": script.get("sections")},
                  "problems": problems + [f'{f["id"]} ("{f["text"][:120]}"): {f["note"]}' for f in failed]}
        writer_in = {"source": {"title": chapter["title"], "text": chapter["text"]}, "minutes": round(words_target / 145),
                     "targetWords": words_target, "mustSay": [MUST_SAY], "notes": notes(show, chapter["title"], next_title),
                     "revise": revise}
        reply, writer_model = claude(prompt_file("podcast-writer.md") + "\n\n## The input\n\n```json\n"
                                     + json.dumps(writer_in, ensure_ascii=False) + "\n```\n")
        script = json_in(reply)
    passed = not history[-1]["codeProblems"] and not history[-1]["unsupported"]
    lines_of(script)
    record = {"schema": "podcast-script.v1", "chapter": n, "title": script.get("title"), "show": show,
              "sections": script.get("sections"), "mustSay": [MUST_SAY], "passed": passed,
              "writer": f"{writer_model} (Claude Code)", "checker": f"{checker_model} (Claude Code, blind session)",
              "linesChecked": checked, "passes": history, "written": datetime.datetime.now().isoformat(timespec="seconds")}
    os.makedirs(project.path("podcast"), exist_ok=True)
    save_json(out_json, record)
    with open(out_md, "w", encoding="utf-8") as f:
        f.write(render_text(script, n, show))
    print(f"ch{n}: {'PASSED' if passed else 'NOT PASSED: fix by hand, then --recheck'} → {out_md}")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
