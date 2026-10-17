# Pivotal Histories

Fact-anchored stories of pivotal episodes: battles, sieges, crossings and codebreaks whose outcome
turned on a tactical, scientific, technical or logistic edge. Written by the History Writer's
engine, for the Pivotal Histories assistant (`assistants/pivotal-history/`). The direction is
`mchatai_macOS/docs/PIVOTAL_HISTORY_ENGINE.md`.

**Nothing in the engine changes for this domain.** The voice, the sourcing rules, the playbook and
every gate in `history/` hold. This folder adds:

| File | What it is |
|---|---|
| `voice.md` | The deltas to `history/voice.md`: the L0/L1 point-of-view ladder, Mechanism / Cost / Limit for the edge, numbers the sources disagree on, war and living peoples |
| `scout.md` | How to scout episodes instead of lives, and the edge re-check |
| `sources.json` | Where to look, with the licence class of each source's text |
| `series.json` | The domain's series and its membership test |
| `candidates.json` | The scout's long list of episodes (leads, not a ranking) |
| `thresholds.json` | Overlay on `history/thresholds.json`: tiers with licence-clean sources, the point-of-view ladder, evidence required on every event |
| `lint-rules.json` | Phrase rules added to `history/lint-rules.json` |

**How a story joins the domain:** its `project.json` says `"domain": "pivotal-history"`. The tools
then read this folder's thresholds over the base ones and add its lint rules (`tools/_hw.py`
`thresholds(project)`, `lint_rules(project)`). A project without that line is a History Writer
story, and nothing here touches it.

The steps are `history/PLAYBOOK.md`, with `scout.md` in place of its §1. The bible is
`story/schemas/campaign.json` (armies, commanders, battles, technologies, places, sources).

**Not here yet, by decision:**

- **L2, historical fiction.** Out of scope for this assistant (voice.md §2).
- **The opening rule for an episode.** Proposed to the author; until it is decided, the portrait
  gate stands (voice.md §6).
- **Travel editions** (a destination's pivotal history × TouchLanguage × the Library). A later
  phase. The hooks: a story's places are `place` rows in the campaign bible with today's names, and
  `history/tools/series_book.py` already builds a series as one book.
