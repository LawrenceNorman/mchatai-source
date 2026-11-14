# Explainers

Science and technology explainers: one idea taught from zero to the depth a practitioner works at,
written by the History Writer's engine. The first is the AI Fundamentals book (Phase FN,
`mchatai_macOS/docs/AI_FUNDAMENTALS_BOOK_PLAN.md`).

**What holds from the engine.** Sources are bytes on disk before they are cited; every fact sentence
anchors a claim with a verbatim quote; every number in the prose is in a claim's evidence; no
quotation that is not verbatim; the writer's own sentences add no fact; the cast is introduced where
it is first named; every chapter has a picture; the book editor reads it whole; StoryMaker is the
editor and the author's text wins.

**What this folder adds:**

| File | What it is |
|---|---|
| `voice.md` | The deltas to `history/voice.md`: two kinds of sentence, numbers that are sourced, measured or computed, the glossary as the cast, the fixed boxes, one picture per idea, documented versus observed |
| `thresholds.json` | Overlay: tiers for a book of 12–24 chapters, the writer's share at 80%, no immersive passages, an opening on the thing explained, the boxes, free local voices |
| `lint-rules.json` | Phrase rules added to the base: hype labels, "obviously", a model given a mind |
| `series.json` | The domain's series |

**Sources of an explainer** (`tools/fetch.py`): kinds `paper`, `documentation` and `measurement`
beside the base kinds, and the licence `own` for a measurement or a printout the project made itself.
A number worked out by arithmetic comes from a script in the project's `figures/` folder; its printout
is fetched with `fetch.py file … --kind measurement --license own`, and the claim quotes the printed
line.

**How a project joins:** its `project.json` says `"domain": "explainer"` and `"voice": 2`. The steps
are `history/PLAYBOOK.md`, planning from a dossier whose `events` are the book's facts (each with a
verbatim quote) and whose `people` are its glossary terms.

**Its own checks** (`tools/explainer.py`, run by `gate.py`): every technical name or acronym is a
glossary entry (`acronym_undefined`), a term is defined before any chapter uses it (`cast_before_intro`,
hard here), and every chapter carries the fixed boxes (`box_missing`, `box_spoken_length`,
`box_questions`). `explainer.py terms <project>` lists the names the glossary still lacks.

**Not here yet:** the Glossary page title in `cite.py book` (it renders the cast as a Who's who) and
sources of kind `measurement` with `local:` addresses in the Sources list. Built with the first book.
