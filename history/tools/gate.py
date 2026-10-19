#!/usr/bin/env python3
"""The one command a writer runs before a chapter leaves its hands.

  gate.py chapter <project> <n>   quotes, voice, numbers, growth, corrections and anchors for one chapter
  gate.py intro   <project>       the introduction (chapters/00.json): the same, minus what needs a plan,
                                  plus its length (thresholds.introWords)
  gate.py story   <project>       every chapter, plus the story-level checks

An episode (a domain whose thresholds ask: domains/pivotal-history/voice.md v2) also gets the
writer's own sentences checked in every chapter (writer_*), its cast introduced at the first
meeting (cast_*), a cold-open introduction that asks its question and keeps the ending
(intro_question_missing, intro_spoils_outcome), a picture in every chapter (picture_floor) and its
era context capped over the book. `storytelling.py writer <project> <n>` shows which sentences are
the writer's.

Exit 0 only when no HARD finding remains. Fix the CAUSE, not the wording: a sentence that
narrates the record is deleted, never softened; a number no source gave is removed or sourced.

The gate proves the rules it encodes and nothing else. A clean gate is necessary, not
sufficient — the independent audit still hunts specifics no claim covers, and the author
still reads it.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import checks  # noqa: E402
import cite  # noqa: E402
import images  # noqa: E402
import quotes  # noqa: E402
import richness  # noqa: E402
import storytelling  # noqa: E402
import voice_lint  # noqa: E402
from _hw import Project, finding, report, thresholds, words  # noqa: E402


def chapter_findings(project, n):
    if int(n) == 0:
        return intro_findings(project)
    return (quotes.claim_findings(project, n)
            + quotes.copy_findings(project, n)
            + voice_lint.chapter_findings(project, n)
            + checks.number_findings(project, n)
            + checks.growth_findings(project, n)
            + checks.correction_findings(project, n)
            + cite.anchor_findings(project, n)
            + storytelling.cast_findings(project, n, project.chapter(n) or {}))


def intro_findings(project):
    """voice.md §13. The introduction is chapter 0: every rule a chapter keeps, minus the ones
    that need the plan (growth, the chapter's ceiling), plus a length range of its own."""
    ch = project.chapter(0)
    if ch is None:
        return [finding("intro_missing", "hard", "chapters/00.json does not exist — write the introduction (voice.md §13)")]
    out = (quotes.claim_findings(project, 0) + quotes.copy_findings(project, 0)
           + voice_lint.chapter_findings(project, 0) + checks.number_findings(project, 0)
           + checks.correction_findings(project, 0) + cite.anchor_findings(project, 0))
    # An episode's cold open (domain voice §10): it asks the book's question, introduces the cast it
    # meets, and keeps the ending. Each is off unless the domain asks for it.
    out += (storytelling.question_findings(project, ch, voice_lint.pov_findings(project, ch, ch.get("text", ""), thresholds(project))[0])
            + storytelling.outcome_findings(project, ch) + storytelling.cast_findings(project, 0, ch))
    lo, hi = thresholds(project).get("introWords", [200, 600])
    n = words(ch.get("text", ""))
    if n > hi:
        out.append(finding("over_ceiling", "hard", f"the introduction is {n} words, over its {hi}-word ceiling — cut, do not reword"))
    elif n < lo:
        out.append(finding("under_floor", "soft", f"the introduction is {n} words, under {lo}"))
    return out


def story_findings(project):
    out = []
    planned = [int(c.get("n")) for c in project.plan.get("chapters", [])]
    written = project.chapter_numbers()
    if 0 not in written:
        out.append(finding("intro_missing", "hard", "every story opens with an introduction (voice.md §13); chapters/00.json does not exist"))
    for n in planned:
        if n not in written:
            out.append(finding("chapter_unwritten", "hard", f"the plan has chapter {n}; chapters/{n:02d}.json does not exist"))
    for n in written:
        hard = [f for f in chapter_findings(project, n) if f["severity"] == "hard"]
        if hard:
            out.append(finding("chapter_not_clean", "hard", f"chapter {n} has {len(hard)} violation(s) — run gate.py chapter {project.root} {n}"))
    # The author's rule (2026-10-11, the third time he asked): every history opens with its subject's portrait.
    out += images.portrait_findings(project)
    # An episode's book (domain voice §11, §13): every chapter has a picture, and era context is
    # capped over the whole book. Off unless the domain asks.
    out += storytelling.picture_floor_findings(project) + storytelling.era_book_findings(project)
    # voice.md §4 — the story may not end before the record does.
    out += [f for f in richness.validate_plan(project, write=False) if f["rule"] == "story_end_before_record"]
    return out


def main(argv):
    if len(argv) >= 4 and argv[1] == "chapter":
        project = Project(argv[2])
        return report(f"gate ch{argv[3]}", chapter_findings(project, argv[3]))
    if len(argv) >= 3 and argv[1] == "intro":
        return report("gate intro", intro_findings(Project(argv[2])))
    if len(argv) >= 3 and argv[1] == "story":
        return report("gate story", story_findings(Project(argv[2])))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
