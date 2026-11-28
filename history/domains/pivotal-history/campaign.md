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
- **When no commander's account survives** (Hannibal's War: the histories written in Hannibal's camp
  are lost), the main accounts are the campaign file's `mainAccounts`, the historians nearest the
  events. They are not `ownWords`. A season is marked `ownWords` only for a participant's words a
  source quotes at length and says it copies (a letter, a treaty), with `ownWordsSpan` around just
  those words. Without one, the season has no immersive (L1) passage.
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

## 6. A campaign that is not a war

The author, 2026-11-21: *"I think for pivotal histories I would like to do a history of
mathematics."* A campaign can be an idea's history. `campaigns/history-of-mathematics.json` tells
mathematics as a book of episodes, each one a problem people needed solved (a scribe's rations, an
astronomer's sums, a gambler's stake, a lost planet) and the idea that solved it. Everything above
holds, with these changes:

- **A season is an episode, not a year.** The seasons are chosen, not consecutive. A season the
  record cannot carry is dropped, or swapped for one of the file's `bench`, on the author's word.
  It is not told short to fill a gap (§2's "a war book cannot skip a year" does not apply).
- **The main account is the mathematician's own text**: a treatise, a table's preface, a letter,
  in an old translation (the file's `mainAccounts`). It is `ownWords`, with `ownWordsSpan` around
  the part about the season's idea, and it earns the immersive passages (`voice.md` §2): the
  reader is placed, by declaration, at the page or the table where the work was done. A legend
  about a mathematician (a drowning, a bath, last words to a soldier) is never own words. It is
  attributed to the writer who tells it, with that writer's distance from the events
  (`storytelling.md`, weighing).
- **The edge is the idea**, shown with Mechanism, Cost and Limit (`voice.md` §3): how it works,
  worked once on a small example; what it took (years of hand-computed tables, a lifetime's
  notebooks); where it stopped (what it could not solve, which a later season may).
- **The edge re-check also tries to refute priority and legend.** Did someone have the idea first
  (Babylon's tablets and the Pythagorean theorem; Kerala's series and the calculus)? Did anyone
  who was there tell the story of the discovery? When the story is legend, the season keeps the
  idea and tells the story as legend.
- **Every worked number is computed.** A sum, a bound or a table entry the prose works out comes
  from a script in the story's `figures/` folder, whose printout is fetched as kind `measurement`
  with licence `own`; the claim quotes the printed line (`domains/explainer/voice.md` §3). A
  number a source prints is quoted from that source, as always.
- **Mathematics read aloud.** The book is heard as well as read (the podcast, the audiobook). A
  formula is said in words ("the square on the long side equals the squares on the other two
  together"), with symbols only beside the words. A chapter has at most one worked example, short
  enough to follow by ear. A shape is shown as a picture (`images.py diagram`) and described in the
  sentence that shows it. That holds for the story's chapters; the lesson that teaches the idea is §7.
- **Never tell a later season's idea** (as with a war's outcomes, §3). Zero does not appear in the
  Greek seasons' prose, and the calculus does not appear in Archimedes' season except in a
  writer's sentence that looks ahead without naming it.

## 7. Every season teaches its mathematics

The author, 2026-11-27: *"I want to be sure that there are mathematical useful concepts with each
point in history so that students can learn both the history of mathematics and mathematics and
then obviously this will accelerate as we move toward the future."* So a season of a campaign whose
file gives its seasons a `mathematics` block is a story and a lesson. The story is told as §6 says.
The lesson is one more chapter, after the story's last chapter and before the afterword, and it
teaches the idea well enough that a student can use it.

- **The ladder.** Each season's `mathematics` (in the campaign file) names its `concepts` (an `id`,
  the `idea` in one plain line, the `terms` that name it, and `buildsOn`: the earlier concepts it
  stands on), its `level` (a plain grade band), the lesson's `lessonWords`, how many `tryIt`
  questions it asks, and leads for what it quotes, works and leaves open. The ladder climbs:
  season 1 is grade-school arithmetic, the last is first-year university, so the lessons taken in
  order are a course. A concept builds only on its own season's concepts or earlier ones, never on a
  later season's: `python3 history/tools/lesson.py check <campaign id>` refuses a ladder that reaches
  forward, and `lesson.py ladder <campaign id>` prints it. Later seasons carry more concepts, longer
  lessons and more questions, and each reuses an earlier tool by name: season 11 does Archimedes'
  four-thirds again in two lines, season 14 runs Euclid's greatest common measure as a program. The
  file's `lessons.threads` are the ideas that come back (how good each age's pi was; the diagonal;
  rules a machine could follow), for a lesson's last question to pick up.
- **The lesson in the plan.** One chapter with `"role": "lesson"`, no events, `concepts` set to this
  season's concept ids (and any earlier one it revisits), and `pictures`. It takes no share of the
  story's ceiling: its length is the season's `lessonWords`. `richness.py plan` refuses a season's
  plan without it (`lesson_missing`), with two, out of place, with events, or listing a concept no
  season up to this one teaches.
- **Six boxes, in this order,** each a paragraph that is exactly its title, followed by its body
  (thresholds `boxes`; `gate.py chapter` checks them):
  1. **The idea**: the season's idea said aloud in about thirty seconds (55 to 95 words).
  2. **As it was written**: the problem or the rule as the main account sets it, quoted, with who
     wrote it and when. A legend is not a source here either.
  3. **How it works**: the method in today's words, with today's notation beside the words. The
     student reads today, so digits, the decimal point, a letter for the unknown and the equals sign
     are allowed from season 1. A later season's idea is not: no logarithm before season 9, no
     derivative before 11.
  4. **Worked example**: one or two, every step's number printed by the story's `figures/` script
     and quoted from its printout (§6). The example starts small and ends on the size the source
     itself worked.
  5. **Try it**: the season's `tryIt` questions, easy to harder. Each is a sentence ending in a
     question mark, followed at once by its answer and the short working, every number from the
     printout. Where the ladder allows, the last question needs an earlier season's tool.
  6. **Where it stopped**: the Limit (voice.md §3) as a question the reader can now ask: what this
     tool cannot do. It never names the later idea that answers it.
- **Read aloud.** The lesson is heard as well as read. Formulas are said in words with the symbols
  beside them; each worked example can be followed by ear in about a minute; a table too long to
  say is a picture, and the sentence says what it shows. §6's one worked example a chapter is the
  story's rule, not the lesson's.
- **Mostly the writer's own.** The explanation is the writer's (up to thresholds `writer`
  `lessonMaxShare`), and it may say "you". Every number and every historical fact in it is still a
  claim. It gives no one a feeling, and picks no world facts.
- **A picture.** At least one, as for any chapter: the source's own page from Commons (the
  papyrus's table, a manuscript's completed square, Napier's rods) or a diagram the author drew and
  hosts (`images.py diagram`).
- **The quiz.** The chapter's quiz (`quiz.py`) draws on the lesson as on any chapter: questions on
  the history, and worked questions whose answers are the printout's.
- **Never tell a later season's idea** (§3, §6) holds in every chapter. `gate.py chapter` notes
  (soft, `later_idea`) any word that names a later season's concept (its `terms`) outside a
  quotation, for the auditor to weigh: "a cubic" in a Greek season may be a solid. `lesson.py terms
  stories/<slug>` lists them for a whole season.
- **Cost.** A lesson is one more writer and auditor, about 7M tokens a season (jobs/README.md,
  Cost): about 105M for fifteen seasons, on top of the outline's estimate of 1.4 billion.
