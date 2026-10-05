# History Writer playbook

The steps, in order, for any CLI agent: Claude Code, Codex or Antigravity. Every check here is
a command with an exit code. A step is done when its command exits 0, not when it looks done.

Commands assume you are in the Workbench working folder, where `./history` (this folder) and
`./mchatai` (the app) are linked. Elsewhere, put the path to this folder in place of
`history/`. Each story is one project folder, laid out as `tools/_hw.py` describes:
`stories/<slug>/`.

Read `voice.md` and `sourcing.md` in full before step 1. They are short, and every rule in them
exists because something went wrong without it.

---

Every tool's usage is one call away: `python3 history/tools/help.py` (or `help.py cite maps` for
some). Read that, not the tools' source.

**Models.** The work that writes prose or judges facts runs in subagents pinned to the strongest
model (`history/agents/`: `history-chapter-writer`, `history-auditor`, `history-editor`; design
D8). The thread running a story only plans from the dossier, hands out work, runs the gates and
lands, so it may run on a lighter model, and so may `history-picture-placer`, which
`images.py check` gates. A writer on the lighter model was measured on one chapter of Sam
Smith's story (2026-10-04): its draft copied a facts-only source, carried a misquotation, a wrong
date and two unsupported claims, and was the thinnest of five. The book editor, not told which
chapter it was, named it the weakest. Writers stay on the strongest model. Install the subagents
once per workdir, before a run starts (a CLI reads them when it starts): `mkdir -p
.claude/agents && cp history/agents/*.md .claude/agents/`.

## 1. Scout a series (free on every plan)

Goal: five people per series whose documented lives can carry a story, each with a dossier
whose numbers say how long, and what shape, that story can be.

1. Read the series in `series.json`: membership, scout hints, sensitivity, and the history line
   (`historyLineYears`).
2. Gather 10–12 candidates from the archives in `sourcing.md` §7. Look where the standard
   histories do not. When the series has a `survey` block, start from its long list:
   `python3 history/tools/survey.py run <series> <dir>` (no model; leads from the encyclopedias
   that cover the community person by person, each with dates, a line about them, how strongly
   their entry ties them to the place, and pageviews), then `survey.py show <dir>` for the list
   by era. The author picks where to look; a lead is never a member until step 4.
   **The history line:** a life is history once the part of it the story tells is at least
   `historyLineYears` past (30 for Black Seattle, the author's call on 2026-10-05, after
   landmark practice). A sitting officeholder is not history yet; a mayor of the 1990s may be.
   Someone inside the line goes on a later list, not into this scout.
3. For each candidate, in `stories/<slug>/`:
   - Save every source with `tools/fetch.py`, never by hand:
     `python3 history/tools/fetch.py fetch stories/<slug> <url> --publisher <P> --kind <K> --license <L>`.
     It keeps the raw bytes, extracts the text to `sources/<id>.txt`, records it in
     `sources/index.json`, and refuses a blocked page, a stub or a "PDF" that is not one
     (exit 3). Your own web-fetch tool is for FINDING pages: it returns a model's summary, and a
     quote cannot be checked against a summary.
   - A site that refuses scripts: open it in AI Web and pipe its text in —
     `./mchatai raw '{"command":"applet","applet":"aiweb","verb":"openPage","args":{"url":"<url>"}}'`,
     then `./mchatai raw '{"command":"applet","applet":"aiweb","verb":"getCurrentPage"}' | python3 history/tools/fetch.py text stories/<slug> --url <url> --publisher <P> --kind <K> --license <L>`.
   - A local copy of a public record (a PDF or text you already have): `fetch.py file`, with the
     URL it is published at.
   - Read what you fetched through
     `python3 history/tools/richness.py mentions stories/<slug>`: the passages around each
     mention of the person, which are exactly the words the tier counts. Open a whole file only
     to settle something a passage raises. Whole sources are for writing a chapter, not for
     scouting; reading them whole is what made the first scout cost many times its estimate.
   - When a source is the person's own words (a letter, testimony, an oral history, a signed
     article), mark `ownWords` in `sources/index.json` and say which part is theirs:
     `"ownWordsSpan": "all"` when the whole text is, or `{"from": "<their first words>", "to":
     "<their last words>"}` for their piece on a newspaper page. Unmarked, only the passages
     naming them count. A page someone edited is not their words: forty such pages were once
     counted whole, ads and all.
   - Write `dossier.json` (`schemas/dossier.schema.json`): aliases (with `notAliases` for anyone a
     name also fits: a son named for his father, a brother), the identity basis and its
     source, dated events with life stages and source ids, and dead ends. Give every event an
     `evidence` quote of at least 8 words, copied from a `mentions` passage of one of its
     sources. The tool checks it, and an event whose quote fails does not count.
   - Run `python3 history/tools/richness.py dossier stories/<slug>`. Never type a tier yourself.
   - Note the pictures as you go: `python3 history/tools/images.py find stories/<slug>
     --article "<the person's Wikipedia title>" --commons "<name>"` saves the usable ones, with
     licences, to `images/candidates.json`. Choosing comes later.
4. **Identity re-check.** For every candidate you would include, a second pass with fresh
   eyes tries to REFUTE series membership from the sources. Drop anyone it cannot be
   established for.
5. Write the scout report for the author with `aiwrite.createDoc`: one row per candidate with
   name, why them, tier, mode, ceiling words, independent sources, dated events, own words,
   dead ends, and whether community review applies. Recommend five.

**Stop.** The author picks the subjects and the order. Nothing below runs until they do.

## 2. Plan the story

Plan from `dossier.json`: every event there already has its date and verbatim evidence. Do not
read sources to plan. Use `richness.py mentions` only to settle one specific question. The
thread that runs the story **never loads source text**: every call it makes re-reads its whole
context, so a context full of sources costs that much on every step (Cost, below).

1. `storymaker.createProject` with the person's name. Record the returned id in
   `stories/<slug>/project.json` as `storymakerProject`.
2. Write `plan.json` (`schemas/plan.schema.json`):
   - **chapters** with a concrete title, a date span, and the dossier events each tells.
   - the **ledger**: one row per change in the person's life (field = a `bio.*` key from
     `story/schemas/biography.json`), each with the chapter it lands in, the phrases that show
     it (`shows`), and verbatim evidence.
   - an **endNote** if the story stops before the record does.
   - **targetWords**, optional: the length you choose, when it is shorter than the dossier's
     ceiling. The ceiling is a maximum, not a quota. A target lowers each chapter's starved
     floor and leaves its ceiling where the dossier put it. Choose it before you write, and
     never pad to meet a floor.
3. Run `python3 history/tools/richness.py plan stories/<slug>`. It checks every reference and
   writes each chapter's ceiling.
4. Give each chapter in `plan.json` a `summary` (one or two sentences: what happens in it), then
   `python3 history/tools/cite.py outline stories/<slug>`. It sets StoryMaker's outline from
   the plan with no shell quoting to break (a plan typed into a shell string lost its
   apostrophes, 2026-10-05), and `cite.py land` keeps the same summaries. **Whenever
   `plan.json`'s chapters change** (a merge, a split, a corrected summary), run it again. The
   author reviews from the outline, and a stale one shows chapters that no longer exist (the
   first pilot merged two chapters and left five in the outline, 2026-10-02).

## 3. Write one chapter

Each chapter is written by a **fresh subagent** (`history-chapter-writer`) that reads only that
chapter's sources, and it is audited (step 5) by another fresh subagent that did not write it
(`history-auditor`). The writer reads its
sources end to end as step 1 says: `richness.py mentions` for long newspaper pages, where other
news fills the columns, and a biography or encyclopedia entry whole, because `mentions` skips
the passages that say "he" instead of the name. The thread running the
story keeps the plan, hands each writer the chapter's events and source ids, runs the gates and
lands the result. Ask each subagent for a report of a few lines; the files hold the rest.

1. Read `voice.md` again. Read every source the chapter's events cite, end to end; the human
   story is often past the halfway mark of a document.
2. Write `chapters/NN.json` (`schemas/chapter.schema.json`): the prose, and one claim per
   specific fact with a verbatim quote of at least 8 words from the claimed source. Era
   context is claims of kind `era`; quoted words are claims of kind `quote`. Give every claim
   an `anchor`: a few words, copied exactly, of the sentence in your prose it supports. The
   notes a reader sees are placed from the anchors.
3. Place up to three pictures (`voice.md` §14): `python3 history/tools/images.py add
   stories/<slug> "File:…" --chapter <n> --after "<words from the paragraph it follows>"
   --caption "<what it shows, when>" --evidence "<words from its description>"`, then
   `images.py check stories/<slug>` until it exits 0. When the chapters are written in
   parallel, leave this to the finish stage: one `history-picture-placer` subagent per chapter,
   one at a time.
4. Run `python3 history/tools/gate.py chapter stories/<slug> <n>`. Fix the CAUSE of every
   finding and run it again until it exits 0. A sentence that narrates the record is deleted,
   never softened. A number no source gave is removed or sourced.
5. **Audit** with a fresh reader who did not write it. List every specific in the prose: a
   name, date, number, place or cause. Grep the sources for any specific no claim covers.
   Re-fetch a sample of URLs. Check §7 for every community in the chapter. Repair only what
   was flagged, then gate again. Repairs introduce new claims, so re-verify.
6. Land it: `storymaker.createChapter` with the chapter's prose, exactly as gated. The notes
   are not in the chapter; they land once, in the appendix, when the story is finished (step
   5). If the author has edited a chapter you wrote, do not replace it; use
   `storymaker.proposeSuggestion` instead.

Budget about three passes per chapter. A chapter that cannot pass after three repair rounds is
marked `"status": "blocked"`, with its findings, and goes to the author as a question, not as
prose.

## 4. Listen to the author

After the author reviews:

1. `storymaker.listEdits` shows each passage they changed, with a stable `id`.
2. **Fact changes** (a date, a name, a number) become entries in `corrections.json`, with the
   source that supports the fix. `checks.py corrections` holds every later regeneration to them.
3. **Style changes** are evidence about the voice. Collect them. When several edits point the
   same way, PROPOSE a rule to the author in plain words, with the edits that suggest it and a
   phrase pattern for `lint-rules.json` if one exists. Only the author adds it to `voice.md`.
   Never change the voice on your own.
4. `storymaker.listSuggestions` shows which of your proposals they accepted or rejected.
5. **Rebuild the apparatus over their text.** Save each chapter as they left it
   (`storymaker.getChapter`, its `text`) to `stories/<slug>/review/NN.txt`, then run
   `python3 history/tools/cite.py adopt stories/<slug>`. Their prose becomes the story's text,
   and the anchors follow it. Settle every claim it lists: set its `anchor`, or set
   `"retired": "cut by the author"` when they cut the fact. A question it raises (a number with
   no source, a quotation that changed) goes to the author. Never change their text. Then run
   `cite.py book` and land only `book/notes.txt` and `book/sources.txt`, with
   `storymaker.replaceChapter`. The chapters are theirs now.

## 5. Finish the story

1. **The introduction** (`voice.md` §13), written now that the whole life is known:
   `chapters/00.json`, 200 to 600 words, with claims and anchors like any chapter. Run
   `python3 history/tools/gate.py intro stories/<slug>` until it exits 0, then audit it as in
   step 3.5.
2. **Citable sources.** Run `python3 history/tools/cite.py check stories/<slug>`. A source with
   no title, or a title full of page furniture, gets `"cite": {"title": "…"}` on its record in
   `sources/index.json` (also `author`, `date`, `item` when you know them).
3. **Check every anchor.** `cite.py anchors stories/<slug> --list` prints each claim beside the
   sentence its note will follow. Fix any that are wrong. A chapter written before anchors
   existed gets them from `cite.py anchors stories/<slug> --write`, which sets only the
   certain ones and lists the rest for you.
4. **The book.** First draw the maps: `python3 history/tools/maps.py render stories/<slug>`
   draws one small street map for each designated landmark the story names, from the Seattle
   Landmarks site's own basemap (the same picture as the landmark page's map, credited to
   OpenStreetMap). Then `python3 history/tools/cite.py book stories/<slug>` writes `book/`: the book's
   title (the name, the years and the series) at the top of its first page, every
   chapter's prose with its pictures placed, its first mention of each designated landmark
   linked to the landmark's page, each landmark's map (linked to the same page) after the
   paragraph that first names it in the chapter that names it most, the Notes appendix (one note per paragraph, keyed by its
   opening words), the numbered Sources with their links and credits, and `manifest.json`
   with the order. It refuses while `images.py check` has a finding. Land it with
   `python3 history/tools/cite.py land stories/<slug>`. It makes the StoryMaker calls itself, so
   no chapter passes through your context:
   - the introduction is created before the first chapter, and the Notes and the Sources after
     the last;
   - a chapter whose landed text differs from `book/NN.txt` is replaced, unless the author has
     edited it. That one it reports, and you offer the change with `storymaker.proposeSuggestion`;
   - every chapter is read back afterwards, and the new ids are recorded;
   - the outline is set to the book's parts, each row linked to its chapter. If the author has
     edited the outline, it is left alone and reported.
5. Run `python3 history/tools/gate.py story stories/<slug>`. Every planned chapter and the
   introduction are written and clean, and the story does not end before the record does.
6. **The book editor**: the last read before the author's, by a fresh reader who wrote none of
   it (the `history-editor` subagent, or a new thread). Read the book as a reader will: `book/manifest.json`, then every file it
   lists, in order. Run `python3 history/tools/editor.py check stories/<slug>` for what the
   whole book says twice, or says out of scale or out of voice. Then write
   `stories/<slug>/editor/notes.json`, at most fifteen notes, the ones that matter most to the
   book as a whole. Each note is
   `{"chapter": <n>, "kind": "flow" | "tone" | "consistency" | "clarity" | "repetition",
   "quote": "<words copied exactly from that chapter as landed>", "note": "<what a reader
   meets there, in plain words>", "replacement": "<the passage, rewritten>"}`.
   - Look for:
     - how the chapters hand on to each other;
     - what a reader needs to know sooner;
     - the same thing told twice. The introduction especially: it introduces, and does not
       re-tell the chapters in their own words;
     - names, dates and numbers that disagree, and tense;
     - anything `voice.md` forbids.
   - A replacement changes words, never facts. It may cut, move or rephrase what the passage
     says, and adds nothing. A quotation stays exactly as printed or goes whole. A note with no
     fix goes in the letter: leave `replacement` out.
   - Run `python3 history/tools/editor.py verify stories/<slug>`. It drops, with the reason, any
     note whose passage is not in the chapter as landed, any changed quotation, any new name,
     number or date, and any change that fails a gate the chapter passed.
   - Land them: `python3 history/tools/editor.py land stories/<slug>`. It sends each entry of
     `editor/suggestions.json` as `storymaker.proposeSuggestion` through `./mchatai`, with no shell
     quoting (every editor before it fought the quoting, 2026-10-05), and never sends one twice.
     Never use `replaceChapter` here: the author accepts or rejects each one.
   - End with the editor's letter. Give the three to five things that matter most for the book
     as a whole, in plain words, including the notes in `editor/letter.json`, and say how many
     suggestions are waiting in StoryMaker.

Nothing is published from here. Publishing is the author's decision. It waits for their
review, and for a community reader when `dossier.communityReview` is true. §6 gathers a
series' stories into one book and enforces both.

---

## 6. Gather a series into a book

A series' landed stories become one book: a small static site, a companion to the place's
landmark guide, in the order the subjects arrived (2026-10-05, "Black Seattle").

1. The series' `book` block in `series.json`: the title, a short introduction, the parts (year
   ranges; a story files itself into the part its arrival year falls in, and an empty part is
   not shown) and the companion guide.
2. `python3 history/tools/series_book.py order stories <series>` prints the order and why: each
   story's earliest `arrival` event naming the place, from its dossier.
3. `python3 history/tools/series_book.py build stories <series> <out-dir>` reads every chapter
   back from StoryMaker, so the author's edits are what the book shows: a chapter they added is
   in it, one they deleted is not. Every story is marked a draft, with the reasons it waits.
   That build is for the author to read; `--files` builds from `book/` without the app.
4. Publishing is the author's decision, story by story. Record it in `project.json`:
   `"review": {"author": "<date>", "community": {"reader": "<who>", "date": "<date>"}}`
   (`community` only when `dossier.communityReview` is true). `build … --publish` leaves out a
   story without them, or with editor suggestions still waiting in StoryMaker, and refuses any
   picture a hosted page could not show (a hosted page loads images only from its own site).
5. The book's `resources/places.json` lists the landmarks its stories name. The landmark guide
   links back only to a PUBLISHED book, through its `client.json` `companions` entry. Deploy the
   book first, then rebuild and deploy the guide, so no link arrives before its page.

The contents page shows a portrait only when a picture's caption names the subject as its
subject: its first clause is the subject's name, after at most a title ("Seattle City
Councilmember Sam Smith, June 1990"). Otherwise it shows initials. `"portrait": "<image id>"`
(or `null`) in `project.json` overrides. On an identity series a wrong face is worse than none:
the first rule, "the caption mentions the surname", put a grandson and two buildings on cards.

---

## Cost

A long story is a long run: three model passes over each chapter's sources, plus the
story-level passes. That is several million tokens for a book-length story. Scout every
series first. Write one story end to end, measure it, and only then go on.

Measured on the second story (John Thomas Gayton, 2026-10-04): the thread running it read
passages from about a hundred newspaper pages into its own context while planning. That came to
**5M tokens in 29 calls**, about 170k per call, before a word was written. That is why the story's
own thread never reads sources, and every chapter gets its own writer.

With writers and auditors as subagents, the chapters cost 78.7M tokens in 480 calls: each writer
5.6–8.1M, each auditor 3.8–7.2M, and the orchestrating thread 30M. The orchestrating thread still
grew to 327k, from long subagent reports and whole chapter files. Two rules keep it small:

- **A subagent reports in a few lines:** what it wrote, the gate's result, and anything left
  open. The files hold the rest.
- **Each stage runs in its own fresh thread:** the plan, the chapters and the finish. A stage
  hands over through files (plan.json, chapters/, book/) and `_issues.md`, never through
  conversation.

Measured on the third story (Horace Roscoe Cayton, 2026-10-04), the first with the stage threads
on Sonnet and the writers, auditors and editor on Opus: **72.6M tokens over 558 calls, 54.1M of
them on Opus**, for about 7,100 landed words. Gayton's took 95.6M, all on Opus, for 5,067. The
chapters stage's own thread cost 4.7M, against 30M. Each writer cost 3.4–7.1M and each auditor
2.6–5.2M. About 95% of every figure is cache reads, a thread re-reading its own context, so a
short thread saves more than short prose does.

Measured on the tier-B stories (2026-10-05): Edwin Pratt, William Grose and Powell Barnett each
cost about 70M tokens, as much as the book-length stories, for half the words. The cost follows the
number of chapters, not their length: each chapter's writer and auditor came to about 7M tokens
whether the chapter ran 300 words or 900. Thelma Dewitty's two chapters cost 35M. **Plan few,
full chapters for a short story:** `richness.py plan` notes any chapter aimed under
`thinChapterWords` (450).

Measured on the first scout (Black Seattle, 2026-10-02): ten candidates took roughly 100M
tokens against an estimate of 1–2M. Nearly all of it was each scout re-reading its own context
after loading whole sources into it. The whole first run, scout through a finished pilot with
its introduction and notes, took about 221M tokens over 1,132 model calls. Three rules keep a
scout cheap:

- One person per scout, in its own fresh context. Never hand one scout a second person.
- Read through `richness.py mentions`, never whole files (step 1.3).
- A scout that only fetches, reads passages and lists events may run on a cheaper model once
  `eventEvidenceRequired` is on in `thresholds.json`. Each event then carries a checked quote,
  so a weaker model can miss events but cannot add any. Identity re-checks, audits and
  chapter writing stay on the strongest model (design D8).
