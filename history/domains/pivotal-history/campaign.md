# A war told in episodes

The author, 2026-10-28: *"Yes go ahead and do this: turn Alesia into a book about Caesar's whole war
in Gaul (58–50 BC)."* A campaign is one war told as a book of episodes, one campaign season to an
episode, read in order. Each season is a story like any other pivotal history: its own folder,
dossier, plan, chapters and StoryMaker project, the same gates and the same voice (v2). This page
says only what changes when the stories are seasons of one war. The campaign's file,
`campaigns/<id>.json`, lists the seasons, their leads and the story already written.

Why seasons and not one long story: a story's ceiling is earned by its own sources and tops out at
the book-length tier (`thresholds.json`), and a season is the bounded stretch an edge decides
(`scout.md` §1). A book of seasons is long enough to be a book, and each season stays an episode a
podcast or a video can carry on its own.

## 1. The folder

`stories/<slug>/project.json`, besides `scout.md` §2.2: `"campaign": "<id>"` and `"episode": <n>`,
both from the campaign's file. `series` stays `pivotal-histories`, so the series site, the podcast
and the video title blocks treat a season like any other episode.

## 2. Scouting a season

Every rule of `scout.md` holds. What changes:

- **The main account is the commander's own.** For Caesar in Gaul it is the Commentaries, one book a
  year (the campaign file's `commentaries`). Mark it `ownWords`, with `ownWordsSpan` running from
  that year's book's first sentence to its last, quoted from the fetched text.
- **Aliases are the season's places and peoples** (the campaign file's `aliases`, and any the
  sources add). Never the commander or the state ("Caesar", "Rome", "the Gauls"): those words fill
  the whole war, and `wordsAboutSubject` would count all of it for every season.
- **The cast carries across seasons.** Before you write `people[]` and `peoples[]`, read the
  dossiers of every earlier season that has one (a lower `episode`, and the landed story the
  campaign file names). Anyone already there keeps the same `who` line, word for word, with
  `evidence` found in your own sources. A new entry's `who` must hold for the whole war ("Caesar's
  second-in-command in Gaul"), not just for this season. Seasons scouted side by side cannot read
  each other, so when every season has a dossier, one reader aligns them: the same person or
  people gets one `who` line across the war (the landed story's line first, then the earliest
  season's), its `evidence` re-found in each story's own sources, and `richness.py dossier` is
  run again on every season it touched.
- **Figures across seasons.** A number a later season will lean on (a legion's strength, a people's
  muster) is recorded where the sources give it, attributed by name, like any other figure
  (`voice.md` §4).
- **A season the edge re-check fails is not dropped.** A war book cannot skip a year without saying
  so. Keep the dossier, and propose in the report either a short season or folding it into the
  season before or after. The author decides.
- **The outcome** is the season's own (`scout.md` §2.2). Its `phrases` never include a word every
  season shares.

- **One world for the whole war.** The seasons share one world pool, `stories/_world/<campaign
  id>/` (`history/jobs/world.md`), named in each season's `project.json` as `"world"`. A fact one
  season tells, no other season tells again (`context_repeat`): who the Gauls were belongs to the
  season that first needs it.

## 3. Planning and writing a season

- **Read the earlier seasons first.** The plan reads `plan.json` of every earlier season that has
  one, so this season's cold open, question and turns follow on from what the reader has already met.
- **A callback is a claim.** "The same legion that had broken at the Sabis" is a fact, so it is
  quoted from this story's own sources (the Commentaries hold the whole war), never put in a
  writer's sentence.
- **Every season still introduces its cast** (`voice.md` §11), since a podcast or video episode may
  be someone's first. For an entry an earlier season met, the introduction is a reminder of one
  clause, with its `cast` claim like any other.
- **Never tell how a later season ends.** Alesia, Uxellodunum and Vercingetorix's fate belong to
  their own seasons, and the reader of an early season must not have them given away. That holds
  for world facts too: one whose `tells` is a later season is refused (`context_later_season`;
  the 57 BC pass, 2026-10-29, told 54 BC's siege of Quintus Cicero's camp). A writer's
  sentence may look ahead without telling an outcome ("the Arverni had not yet been heard from").
- **The afterwords.** Each season's afterword weighs that season's sources. The war's end (what
  came after the last season) belongs to the last season's afterword, or to the book's own, as the
  outline decides.

## 4. The scout's report is the book's outline

For a campaign, the scout report (`jobs/scout.md` step 4) is the outline the author approves before
any season is planned:

1. The table (`richness.py table stories`), one row a season, in episode order, the landed story
   included.
2. For each season: its span, the edge and the re-check's verdict, tier and ceiling words, the
   commander's own words about it, the cast it meets first, and the turn that leads into the next
   season.
3. The book's question, proposed as one short line in the author's voice (16 words at most), for him
   to approve or change. It goes into the campaign file's `question` only when he has.
4. Seasons in doubt, each with the proposal of §2.
5. The writing cost, in tokens, from the measured stages (`jobs/README.md`, Cost): about 89M a
   season at Alesia's size, and the total.

Then stop. Nothing is planned until the author has approved the outline and the question.

## 5. The book

Seasons are read in `episode` order. Where a landed story already sums up a season the book now
tells in full (Alesia's chapter 1 sums up Book VII's first half in 1,500 words), the book build
decides how the two meet: the published episode is never changed for the book. The campaign file's
`book.skip` names what the book leaves out, with why.

`python3 history/tools/campaign_book.py status <stories> <id>` says which seasons have landed and
what waits on the author. `campaign_book.py narration <stories> <id> <out.json>` gives the book as it
is read aloud, one track for each season's introduction, chapter and afterword, with the sources said
once at the end. The audiobook is built from that file.

On the series' site (`series_book.py build`, PLAYBOOK §6) a campaign is one entry of the contents:
its title, span and question, then its published seasons in `episode` order, filed into the part its
first season falls in. A season's page names its place in the war ("Caesar in Gaul, part 3 of 9").
Each season is still published on the author's word, recorded in its own `project.json` `review`.
