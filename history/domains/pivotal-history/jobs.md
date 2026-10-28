# Pivotal Histories: what each job adds

The jobs are `history/jobs/<kind>.md`; this page adds what a pivotal history needs on top. Every
new story is told in voice v2: its `project.json` says `"domain": "pivotal-history"` and
`"voice": 2` (the author accepted v2 on Alesia's second telling, 2026-10-20). The second line is
what turns on §2a, §10–§13 below; without it the gates hold the story to the first voice.

A story whose `project.json` names a `campaign` is one season of a war told as a book. Read
`campaign.md` and the campaign's file (`campaigns/<id>.json`) before your job's own steps: they
change the scout's aliases and cast, what the plan reads first, and what the report holds.

## scout

For a campaign (`campaign.md` §2 and §4): every season in the campaign file without a `story` is a
candidate, already chosen by the author, so the report recommends none. Each season's folder is the
file's `slug`, and its `project.json` carries `campaign` and `episode`. Up to four seasons at once,
one subagent each, as `jobs/scout.md` says; then the edge re-check, one fresh reader per season; then
the cast alignment of `campaign.md` §2, one reader over every dossier. The report is the book's
outline (`campaign.md` §4), written with `aiwrite.createDoc`.

## plan

Read `storytelling.md` (the five moves) with the voice, before you plan.

1. **The cast** (voice §11; `scout.md`). Complete `dossier.json` `people[]` and add `peoples[]`:
   every person and every people the book will name. Each has `who` (one plain line for a reader who
   has never heard of them), `source`, `evidence` (8+ words, verbatim, found with `richness.py
   mentions --terms`) and `aliases` (the other names the chapters may use). Then `python3
   history/tools/storytelling.py cast stories/<slug>`.
2. **plan.json**, besides PLAYBOOK §2:
   - `question`: the one the book answers, which the introduction asks.
   - Few, full body chapters (each costs a writer and an auditor, about 7M tokens, whatever its
     length), then the afterword as the last chapter (`"role": "afterword"`, no events).
   - Each chapter: a concrete title, its span, events, ledger rows (`campaign.*`), `summary`,
     `turn` (what the reader wants to know next; it ends on it), `introduces` (the cast it meets
     first; `plan.intro.introduces` for the introduction; every entry exactly once) and `pictures`
     (what a reader should see there).
   - Two to four `observations`, each with its `chapter`, `events` and `shows`, and only when the
     dossier carries it.
   - Where the sources allow, a chapter alternates the sides.
   - Name the chapter that explains the edge: its mechanism, cost and limit (voice §3).
   - At most one short immersive (L1) passage, noted `"l1"` in the chapter where the main account
     is densest.
   - An `endNote` when the story stops before the record does.
3. `richness.py plan stories/<slug>` until it exits 0 with no `question_missing`, `turn_missing`,
   `observations_count`, `observation_incomplete`, `cast_*` or `plan_unknown_cast` left.

## chapters

**The domain line.** Give it word for word to every writer and every auditor, with the source notes
after it (from `sources/index.json`: which source is the main account, quoted exactly; which is OCR,
quoted only in clean spans; which is Wikipedia, facts only and never its sentences):

> This story is in the pivotal-history domain, told in voice v2. Read history/voice.md, then
> history/domains/pivotal-history/voice.md in full, then
> history/domains/pivotal-history/storytelling.md. They bind you:
> - §2a: your own sentences, the ones that anchor no claim, ask the chapter's question, give a fact
>   a scale a reader can hold, weigh whose word we are taking, offer a reading, or draw a lesson.
>   They add no fact and give no one a feeling. They say "we" and "you", never "I". Keep them
>   between one and a quarter of the chapter.
> - §11: introduce every cast entry plan.json gives your chapter in `introduces`, in the paragraph
>   where you first name it, with a claim of kind `cast` and `about` set to its name.
> - §1: plain words, read aloud, sentences averaging 22 words or fewer.
> - §10: end on the chapter's `turn` from plan.json, never on a summary. Where the sources allow,
>   alternate the sides.
> - §3: the edge's mechanism, cost and limit, as claims.
> - §4: a figure only one side gives is attributed to that side by name, and two sources that
>   disagree are both given, never averaged.
> - §5: peoples by their own names.
> Run `python3 history/tools/storytelling.py writer stories/<slug> <n>` to see which sentences are
> your own, and `python3 history/tools/gate.py chapter stories/<slug> <n>` until it exits 0.

- **The L1 chapter** (its plan entry has `"l1"`), added to that writer's brief: "Your chapter
  carries one short immersive passage, where plan.json's l1 note says. Declare it in chapters/NN.json
  as `passages`: [{"mode": "L1", "from": "<its first words>", "to": "<its last words>"}]. Its first
  sentence opens 'Had you stood …' (domain voice §2). Every sentence in it anchors a claim. It gives
  what was there to see and hear, never a feeling, and never lands on a figure. It is at most 35% of
  the chapter. `gate.py chapter` checks each of these."
- **Auditors** also read every writer's sentence (`storytelling.py writer`) for an added fact, a
  feeling, a reading not offered as one, and a comparison that says the past was the present.
- **The afterword**, after the body chapters, by a writer given the domain line and this: "You write
  the AFTERWORD, the plan's last chapter, role afterword (domain voice §12): 300–600 words, and up to
  70% may be your own sentences. Cover the weighing (what the sources are and whom they wrote for;
  what they disagree on, by name), the plan's observations in full, the modern scale of the edge,
  and the lesson that still holds. Its facts are claims like any other's, quoted from the sources.
  No new events." Then its auditor.
- **The introduction** is the §10 cold open. Add to its writer's brief: "chapters/00.json, 200–600
  words: one true scene from the sources, the most striking in the dossier; the book's question
  (plan.json `question`) in your own sentence; orientation (who the sides were and how they stood,
  who is telling us, and why we are here) as claims of kind `era` and `cast`, introducing every
  entry in plan.intro.introduces. NO outcome: dossier.json `outcome` lists the events that resolve
  the episode and the phrases that would give it away, and `gate.py intro` fails an introduction
  that uses them. No immersive passage."

## finish

- **The opening** is the episode's ground (voice §6), not a portrait: a period plan or map of the
  place, or a photograph of the site today. Set it with `python3 history/tools/images.py opening
  stories/<slug> …`, then `images.py open stories/<slug>`.
- Every chapter but the afterword needs at least one picture (voice §13); `gate.py story` checks.
- Tell the book editor the story is in the pivotal-history domain, voice v2, and to read especially
  for an introduction that gives the ending away, a name met before anyone says who it is, a chapter
  that closes on a summary instead of its turn, and long sentences.
- Then `python3 history/tools/storytelling.py measure stories/<slug>`, and put its table in the report.

## video

- A picture of how the story ends (the dossier's `outcome`, and the `spoilers` in `visuals.json`)
  never shows before the episode that tells the ending; `visuals.py` holds this. If the author asks
  for one earlier, that is his call: say so in the report rather than work around it.
- Searches are tied to the story by its own cast and place names. When a story needs more (a weapon
  or a site only it has: "carnyx", "oppidum" for Alesia), put those words in
  `stories/<slug>/video/context.json`, a JSON list. Never a generic word ("siege", "battle", "ship"):
  it lets other sieges and other ships in.
