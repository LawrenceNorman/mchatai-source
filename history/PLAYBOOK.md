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

## 1. Scout a series (free on every plan)

Goal: five people per series whose documented lives can carry a story, each with a dossier
whose numbers say how long, and what shape, that story can be.

1. Read the series in `series.json`: membership, scout hints, sensitivity.
2. Gather 10–12 candidates from the archives in `sourcing.md` §7. Look where the standard
   histories do not.
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
   - Write `dossier.json` (`schemas/dossier.schema.json`): aliases, the identity basis and its
     source, dated events with life stages and source ids, and dead ends. Give every event an
     `evidence` quote of at least 8 words, copied from a `mentions` passage of one of its
     sources. The tool checks it, and an event whose quote fails does not count.
   - Run `python3 history/tools/richness.py dossier stories/<slug>`. Never type a tier yourself.
4. **Identity re-check.** For every candidate you would include, a second pass with fresh
   eyes tries to REFUTE series membership from the sources. Drop anyone it cannot be
   established for.
5. Write the scout report for the author with `aiwrite.createDoc`: one row per candidate with
   name, why them, tier, mode, ceiling words, independent sources, dated events, own words,
   dead ends, and whether community review applies. Recommend five.

**Stop.** The author picks the subjects and the order. Nothing below runs until they do.

## 2. Plan the story

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
4. `storymaker.setOutline` with the chapters (title, summary). **Whenever `plan.json`'s
   chapters change** (a merge, a split, a corrected summary), set the outline again. The
   author reviews from the outline, and a stale one shows chapters that no longer exist (the
   first pilot merged two chapters and left five in the outline, 2026-10-02).

## 3. Write one chapter

1. Read `voice.md` again. Read every source the chapter's events cite, end to end; the human
   story is often past the halfway mark of a document.
2. Write `chapters/NN.json` (`schemas/chapter.schema.json`): the prose, and one claim per
   specific fact with a verbatim quote of at least 8 words from the claimed source. Era
   context is claims of kind `era`; quoted words are claims of kind `quote`.
3. Run `python3 history/tools/gate.py chapter stories/<slug> <n>`. Fix the CAUSE of every
   finding and run it again until it exits 0. A sentence that narrates the record is deleted,
   never softened. A number no source gave is removed or sourced.
4. **Audit** with a fresh reader who did not write it. List every specific in the prose: a
   name, date, number, place or cause. Grep the sources for any specific no claim covers.
   Re-fetch a sample of URLs. Check §7 for every community in the chapter. Repair only what
   was flagged, then gate again. Repairs introduce new claims, so re-verify.
5. Land it: `storymaker.createChapter` with the text. If the author has edited a chapter you
   wrote, do not replace it; `storymaker.proposeSuggestion` instead.

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

## 5. Finish the story

Run `python3 history/tools/gate.py story stories/<slug>`. Every planned chapter is written and
clean, and the story does not end before the record does.

Nothing is published from here. Publishing is the author's decision. It waits for their
review, and for a community reader when `dossier.communityReview` is true.

---

## Cost

A long story is a long run: three model passes over each chapter's sources, plus the
story-level passes. That is several million tokens for a book-length story. Scout every
series first. Write one story end to end, measure it, and only then go on.

Measured on the first scout (Black Seattle, 2026-10-02): ten candidates cost about $75 at API
prices, roughly 100M tokens against an estimate of 1–2M. Nearly all of it was each scout
re-reading its own context after loading whole sources into it. Three rules keep a scout cheap:

- One person per scout, in its own fresh context. Never hand one scout a second person.
- Read through `richness.py mentions`, never whole files (step 1.3).
- A scout that only fetches, reads passages and lists events may run on a cheaper model once
  `eventEvidenceRequired` is on in `thresholds.json`. Each event then carries a checked quote,
  so a weaker model can miss events but cannot add any. Identity re-checks, audits and
  chapter writing stay on the strongest model (design D8).
