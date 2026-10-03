#!/usr/bin/env python3
"""The one command a writer runs before a chapter leaves its hands.

  gate.py chapter <project> <n>   quotes, voice, numbers, growth and corrections for one chapter
  gate.py story   <project>       every chapter, plus the story-level checks

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
import quotes  # noqa: E402
import richness  # noqa: E402
import voice_lint  # noqa: E402
from _hw import Project, finding, report  # noqa: E402


def chapter_findings(project, n):
    return (quotes.claim_findings(project, n)
            + quotes.copy_findings(project, n)
            + voice_lint.chapter_findings(project, n)
            + checks.number_findings(project, n)
            + checks.growth_findings(project, n)
            + checks.correction_findings(project, n))


def story_findings(project):
    out = []
    planned = [int(c.get("n")) for c in project.plan.get("chapters", [])]
    written = project.chapter_numbers()
    for n in planned:
        if n not in written:
            out.append(finding("chapter_unwritten", "hard", f"the plan has chapter {n}; chapters/{n:02d}.json does not exist"))
    for n in written:
        hard = [f for f in chapter_findings(project, n) if f["severity"] == "hard"]
        if hard:
            out.append(finding("chapter_not_clean", "hard", f"chapter {n} has {len(hard)} violation(s) — run gate.py chapter {project.root} {n}"))
    # voice.md §4 — the story may not end before the record does.
    out += [f for f in richness.validate_plan(project, write=False) if f["rule"] == "story_end_before_record"]
    return out


def main(argv):
    if len(argv) >= 4 and argv[1] == "chapter":
        project = Project(argv[2])
        return report(f"gate ch{argv[3]}", chapter_findings(project, argv[3]))
    if len(argv) >= 3 and argv[1] == "story":
        return report("gate story", story_findings(Project(argv[2])))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
