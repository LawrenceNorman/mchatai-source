# Job: plan

Plan one story the author picked (PLAYBOOK §2): its StoryMaker project, `plan.json` and the
outline. This job plans from `dossier.json` and never reads source text. Read `README.md` here
first: its rules bind every job.

**The brief gives:** the story folder; the StoryMaker title; the author's direction for this story
in his words (its length, what he wants seen, a model he named); anything never to touch (an
earlier telling's folder and project: you may read its `plan.json` for ledger rows, never write).

1. Read in full: `history/voice.md`, then the domain's `voice.md` and `storytelling.md` when it has
   them, the domain's `scout.md`, and PLAYBOOK §2. `python3 history/tools/help.py` prints every
   tool's usage.
2. `storymaker.createProject` with the title the brief gives. Record the id in `project.json` as
   `storymakerProject`.
3. Write `plan.json` (PLAYBOOK §2 step 2, and the domain's `jobs.md` § plan when it has one). Pull a
   ledger row's quote with `richness.py mentions` in a few batched calls; never read a source whole.
   A conflict the dossier records stays a conflict: the plan never settles one by choosing.
4. `python3 history/tools/richness.py plan stories/<slug>` until it exits 0.
5. Give each chapter its `summary`, then `python3 history/tools/cite.py outline stories/<slug>`.

**Done when** `richness.py plan` exits 0 and the outline is set. The chapters run in a job of their
own.

**Report:** the chapters with spans, targets and (in an episode) turns and who each introduces; the
book's question and observations when the domain has them; the StoryMaker project; what you logged.
