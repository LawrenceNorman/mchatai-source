# Job: chapters

Write every chapter and the introduction (and the afterword, when the domain has one), each
audited and gated (PLAYBOOK §3; §5 step 1). Land nothing: the finish job lands the whole book.
This job hands out the work, runs the gates and keeps the plan; it never reads source text. Read
`README.md` here first: its rules bind every job.

**The brief gives:** the story folder; the author's direction for this story; anything never to
touch.

1. For each body chapter in `plan.json`, a `history-chapter-writer` subagent writes it (PLAYBOOK §3
   steps 1–4). Give each writer:
   - the chapter number, its events, its ledger rows and its source ids, and in an episode its
     `turn`, its `introduces` and any observation whose `chapter` is this one;
   - `plan.json`'s `notes`, if it has any;
   - "aim for your chapter's targetWords in plan.json";
   - no pictures: the finish job places them;
   - the domain's line for writers, word for word, when its `jobs.md` § chapters has one.
   Up to four writers at once, in ONE message, in the foreground.
2. A `history-auditor` subagent for each chapter (§3 step 5), every one briefed alike (with the
   domain's line), in the foreground.
3. Any part the domain adds (an afterword: its `jobs.md` § chapters), then its auditor.
4. The introduction (§5 step 1) by a `history-chapter-writer` subagent briefed for it, then
   `python3 history/tools/gate.py intro stories/<slug>` until it exits 0, then an auditor.

**Done when** every chapter passes `gate.py chapter stories/<slug> <n>` and the introduction passes
`gate.py intro stories/<slug>`. Run them yourself at the end: a status a subagent wrote proves
nothing on its own.

**Report:** each chapter's words, claims and gate result (in an episode, its own sentences: count and
share); the introduction's gate; what you logged.
