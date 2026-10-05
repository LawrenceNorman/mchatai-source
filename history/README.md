# history/

The History Writer: long-form narrative nonfiction about real people, researched from the
historical record and written chapter by chapter, with every fact sourced. The author edits
in StoryMaker. Everything here is content, so the voice, the thresholds and the gates improve
by PR with no app rebuild.

| File | What it is |
|---|---|
| `voice.md` | How a story is told. Version 1, derived from the Seattle Landmarks narration rules (version 8). |
| `sourcing.md` | What counts as a source, licence classes, and where to look in Seattle. |
| `PLAYBOOK.md` | The steps for any CLI agent: scout, plan, write, listen, finish. |
| `series.json` | The first four series: Women Who Built Seattle, Black Seattle, Indigenous Seattle, Settler Seattle. |
| `thresholds.json` | Every number the tools use: quote length, era cap, tiers, the length ratio. |
| `lint-rules.json` | The voice's phrase rules as data. The 13 rules carried from the landmark lint are byte-identical to it. |
| `OFFSPIN.md`, `offspin.json` | A light job beside a series: well-known people ranked by Wikipedia pageviews, tied to the places of their lives by checked quotes, told as short sub-stories, with the places as a Ledger table that exports to a map pack. |
| `schemas/` | The project files: sources index, dossier, plan, chapter, and a famous person's ties. |
| `tools/` | Deterministic gates, standard-library Python. `gate.py` is the one a writer runs. `images.py` gathers and checks pictures, `maps.py` draws a map for each landmark a story names, `cite.py book` assembles what lands in StoryMaker, `editor.py` reads the finished book as a whole (free checks, and the gate on a fresh reader's suggestions). |
| `fixtures/demo-project/` | A FICTIONAL project for the tests: one clean chapter, one with a planted defect per gate. |

The person's ledger uses the `biography` pack in `story/schemas/biography.json`. The
assistant is `assistants/history-writer/`, whose Workbench sessions get this folder linked in
as `./history`.

Run the tests:

```
python3 history/tools/test_tools.py
```

Design and status: `mchatai_macOS/docs/HISTORY_WRITER_ARCHITECTURE.md` (Phase HW).
