# Mapping a draft onto a story structure

The author asks "what is my draft missing?" You answer by mapping their outline or chapters onto
one beat pack in `story/canon/beats/` and showing which beats the draft has, which it lacks, and
which land early or late. A pack is a rubric, not a formula: many good books skip beats on
purpose. You report; the author decides. You never rewrite or add chapters here (new chapters
are the planner's job, `story/planner/PLANNER.md`, and only when the author asks).

## 1. Pick the pack with the author

`story/canon/beats/_index.json` lists the packs; each has a `displayName`, a `summary` and
`bestFor`. Offer the one or two that fit the book, in plain words, and let the author choose. If
the author names a structure by a common name ("save the cat", "hero's journey"), each pack's
`_commonNames` tells you which pack and beat they mean; show the author the pack's own names.

## 2. Save the draft

- An outline: save `storymaker.getOutline {project}`'s result as `planning/outline.json`. It is
  placed by chapter: each chapter is an equal share of the book.
- Written chapters: `storymaker.getProject {project}` lists them; read each with
  `storymaker.getChapter` and save `{"chapters": [{"title": "…", "text": "…"}]}` as
  `planning/manuscript.json`. Prose is placed by its words.

## 3. Map it

For each beat, read its `describe` and `lookFor`, and find the chapter where it happens. Write
`planning/beat-map.json`:

```json
{"pack": "fifteen-beats", "basis": "outline",
 "beats": [{"beat": "catalyst", "chapter": 2, "evidence": "a short quote from chapter 2, word for word"}],
 "notes": "anything the author should know about how you read it"}
```

- **Quote, never paraphrase.** The evidence is copied from that chapter's text exactly (40 words
  at most). If you cannot quote a chapter for a beat, the draft does not have that beat yet:
  leave it out. Never stretch a beat onto a chapter that only hints at it.
- A beat that spans chapters (a long middle section) may appear more than once; its first
  chapter is where it starts.
- Do not list what is missing: the check computes that from what you mapped.

## 4. Check it

    python3 story/tools/beat_map.py check --manuscript planning/outline.json planning/beat-map.json

It refuses a quote that is not in its chapter (fix the quote, or drop the beat), a beat or
chapter that does not exist, and a malformed map. It reports what is missing (the middle first),
what lands early or late, and what is out of order. Never show the author a map with a hard
finding.

## 5. Show the author

Plain words, in this order:

1. **Missing in the middle**: the middle is where drafts most often sag, and this is the most
   useful thing the map tells them.
2. Missing elsewhere.
3. Early or late beats, with the chapter and where the beat usually falls.
4. What the draft already has, briefly.

Say what each missing beat would do for the book, from its `describe`, not what to write. If
the author wants options for filling a gap, that is a planning request: follow
`story/planner/PLANNER.md`, and record each option there.
