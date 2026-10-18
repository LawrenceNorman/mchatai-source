#!/usr/bin/env python3
"""The prose gate for StoryMaker chapters, mechanically (STORYMAKER_AUTHORSHIP_PLAN.md QG.1).

  prose_lint.py chapter FILE [--against FILE ...]   one chapter; repeats checked against the others
  prose_lint.py book FILE [FILE ...]                every chapter, and repeats across them
  prose_lint.py text < chapter.txt                  any text from stdin
  options: --rules PATH (default story/lint-rules-fiction.json), --also PATH (a book's own rules,
           e.g. the voice rules its author accepted, story/voice/VOICE.md; repeatable), --json

Rules are DATA (story/lint-rules-fiction.json, the shape of history/lint-rules.json): stock
phrases, an explaining last paragraph, a stat-screen budget, and the same six or more words in
two places. Phrase rules read narration only: text inside double quotation marks is a character
speaking (a rule with "in": "all" reads dialogue too). Another kind of book passes its own rules
file; nothing here assumes fiction.

It does not judge good writing. HARD findings gate an AGENT's draft (repair the flagged span,
never regenerate the chapter); on the author's own text every finding is a note. Exit 1 when any
HARD rule fires.
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _story import STORY, finding, load_json, report  # noqa: E402

HARD = "hard"
DEFAULT_RULES = os.path.join(STORY, "lint-rules-fiction.json")
_QUOTED = re.compile(r"“[^”]*”|\"[^\"\n]*\"")
_WORD = re.compile(r"[A-Za-z0-9’']+")


def load_rules(path=None, also=()):
    """The rules file, with each `also` file's phrase rules added (a book's own rules). An id
    that is already a rule is an error: a book's rule never silently replaces a shared one."""
    rules = load_json(path or DEFAULT_RULES)
    if not isinstance(rules, dict):
        return rules
    rules = dict(rules, rules=list(rules.get("rules", [])))
    ids = {r["id"] for r in rules["rules"]}
    for extra in also:
        more = load_json(extra)
        if not isinstance(more, dict):
            raise ValueError(f"no rules at {extra}")
        for r in more.get("rules", []):
            if r["id"] in ids:
                raise ValueError(f"{extra}: rule {r['id']!r} is already a rule")
            ids.add(r["id"])
            rules["rules"].append(r)
    return rules


def scope_of(text, rule):
    """What a phrase rule reads: narration (dialogue blanked), or everything with "in": "all"."""
    return text if rule.get("in") == "all" else narration(text)


def narration(text):
    """The text with every double-quoted span blanked, positions kept."""
    return _QUOTED.sub(lambda m: " " * len(m.group(0)), text or "")


def line_of(text, pos):
    return text.count("\n", 0, pos) + 1


def sentence_around(text, start, end, width=90):
    a = max(0, start - width // 2)
    b = min(len(text), end + width // 2)
    return ("…" if a else "") + re.sub(r"\s+", " ", text[a:b]).strip() + ("…" if b < len(text) else "")


def paragraphs(text):
    """(start, end) of each paragraph: blank-line separated, or one per line when the chapter uses
    single newlines throughout (StoryMaker's Read mode treats a line break as a paragraph too)."""
    blocks = [(m.start(), m.end()) for m in re.finditer(r"\S(?:[^\n]|\n(?!\s*\n))*", text)]
    if len(blocks) <= 1:
        blocks = [(m.start(), m.end()) for m in re.finditer(r"[^\n]*\S[^\n]*", text)]
    return blocks


def stat_screens(text, cfg):
    """Runs of consecutive status-box lines: [(first_line, line_count)]."""
    rx = re.compile(cfg["linePattern"])
    runs, start, count = [], None, 0
    lines = text.split("\n")
    for i, line in enumerate(lines + [""]):
        if line.strip() and rx.match(line):
            if start is None:
                start, count = i + 1, 0
            count += 1
        else:
            if start is not None and count >= cfg.get("minLines", 2):
                runs.append((start, count))
            start, count = None, 0
    return runs


def chapter_findings(text, rules, name="chapter"):
    out = []
    for rule in rules.get("rules", []):
        rx = re.compile(rule["pattern"], re.I)
        for m in rx.finditer(scope_of(text, rule)):
            out.append(finding(rule["id"], rule.get("severity", HARD),
                               f"{m.group(0).strip()!r} — {rule['why']}",
                               f"{name}:{line_of(text, m.start())} {sentence_around(text, m.start(), m.end())}"))

    endings = rules.get("endings")
    if endings:
        paras = paragraphs(text)
        for a, b in paras[-endings.get("lastParagraphs", 1):]:
            body = narration(text[a:b])
            for pattern in endings["patterns"]:
                m = re.search(pattern, body, re.I)
                if m:
                    out.append(finding("explaining_ending", endings.get("severity", "soft"),
                                       f"{m.group(0).strip()!r} — {endings['why']}",
                                       f"{name}:{line_of(text, a + m.start())} {sentence_around(body, m.start(), m.end())}"))
                    break

    screens_cfg = rules.get("statScreens")
    if screens_cfg:
        screens = stat_screens(text, screens_cfg)
        sev = screens_cfg.get("severity", HARD)
        if len(screens) > screens_cfg["maxPerChapter"]:
            out.append(finding("stat_screens", sev,
                               f"{len(screens)} status boxes; the budget is {screens_cfg['maxPerChapter']} — "
                               f"{screens_cfg['why']}", f"{name}:" + ", ".join(str(s) for s, _ in screens)))
        for first, count in screens:
            if count > screens_cfg["maxLinesPerScreen"]:
                out.append(finding("stat_screen_long", sev,
                                   f"a status box of {count} lines; the budget is {screens_cfg['maxLinesPerScreen']}",
                                   f"{name}:{first}"))
    return out


def _grams(text, n, skip_lines=()):
    """{n-gram: (word index, char position)} over the narration's words, outside status boxes."""
    scan = narration(text)
    words = []
    for m in _WORD.finditer(scan):
        if line_of(text, m.start()) in skip_lines:
            continue
        words.append((m.group(0).lower().replace("’", "'"), m.start()))
    out = {}
    for i in range(len(words) - n + 1):
        gram = " ".join(w for w, _ in words[i:i + n])
        out.setdefault(gram, (i, words[i][1]))
    return out


def repeat_findings(chapters, rules):
    """The same `minWords` words in two chapters: ONE finding per shared run, however long."""
    cfg = rules.get("repeats")
    if not cfg:
        return []
    n = cfg.get("minWords", 6)
    screens_cfg = rules.get("statScreens")
    indexed = []
    for name, text in chapters:
        skip = set()
        if screens_cfg:
            for first, count in stat_screens(text, screens_cfg):
                skip.update(range(first, first + count))
        indexed.append((name, text, _grams(text, n, skip)))
    out = []
    for i, (name_a, text_a, grams_a) in enumerate(indexed):
        for name_b, text_b, grams_b in indexed[i + 1:]:
            shared = sorted(set(grams_a) & set(grams_b), key=lambda g: grams_a[g][0])
            run_end = -2
            for gram in shared:
                idx, pos = grams_a[gram]
                if idx <= run_end + 1:          # the same run, one word further on
                    run_end = idx
                    continue
                run_end = idx
                out.append(finding("repeated_phrase", cfg.get("severity", "soft"),
                                   f"'{gram}…' appears in {name_a} and {name_b} — {cfg['why']}",
                                   f"{name_a}:{line_of(text_a, pos)} / {name_b}:{line_of(text_b, grams_b[gram][1])}"))
                if len(out) >= cfg.get("maxReported", 12):
                    return out
    return out


def _read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("mode", choices=["chapter", "book", "text"])
    ap.add_argument("files", nargs="*")
    ap.add_argument("--against", nargs="*", default=[], help="other chapters to check repeats against")
    ap.add_argument("--rules", help="a rules file (default story/lint-rules-fiction.json)")
    ap.add_argument("--also", action="append", default=[], help="a book's own rules, added to the others")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    try:
        rules = load_rules(args.rules, args.also)
    except ValueError as e:
        ap.error(str(e))
    if not isinstance(rules, dict):
        ap.error(f"no rules at {args.rules or DEFAULT_RULES}")

    if args.mode == "text":
        chapters = [("text", sys.stdin.read())]
        others = []
    elif args.mode == "chapter":
        if len(args.files) != 1:
            ap.error("chapter takes one FILE")
        chapters = [(os.path.basename(args.files[0]), _read(args.files[0]))]
        others = [(os.path.basename(p), _read(p)) for p in args.against]
    else:
        if not args.files:
            ap.error("book takes the chapter files")
        chapters = [(os.path.basename(p), _read(p)) for p in args.files]
        others = []

    findings = []
    for name, text in chapters:
        findings += chapter_findings(text, rules, name)
    findings += repeat_findings(chapters + others, rules)
    if args.json:
        print(json.dumps({"ok": not any(f["severity"] == HARD for f in findings), "findings": findings},
                         indent=1, ensure_ascii=False))
        return 1 if any(f["severity"] == HARD for f in findings) else 0
    title = chapters[0][0] if len(chapters) == 1 else f"{len(chapters)} chapters"
    return report(title, findings)


if __name__ == "__main__":
    sys.exit(main())
