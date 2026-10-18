# A sourced research brief for a chapter

Some chapters turn on something the author has to get right and the bible does not cover: how a
trade worked, a period's medicine, a ship's rigging. You can write a short brief on it, from
sources you save and quote, for the author to read. The brief is research, never prose: it goes
to AI Write, linked from the chapter's plan, and nothing from it is pasted into the book.

## 1. Ask first

Research only when the author asks, or when a planned chapter names such a topic and you ask
("Chapter 9 turns on how salt was weighed; want a short sourced brief?") and they say yes.
Never fill a gap in the bible with research on your own: a fact about the book's own world is
the author's to decide.

## 2. Save sources, then read them

Make a folder for the topic, `research/<topic>/`, laid out as a History Writer project
(`history/README.md`). Find sources with `python3 history/tools/fetch.py get "<a search URL>"`
and save each one you will use with

    python3 history/tools/fetch.py fetch research/<topic> <url> --publisher "…" --kind … --license …

Only a saved source can be cited: no bytes on disk, no claim. Follow `history/sourcing.md` for
which sources count (a clue is never evidence) and how to choose the licence (when in doubt,
`facts-only`). Read each source in full before you write.

## 3. Write the brief

`research/<topic>/chapters/01.json`, in History Writer's chapter shape
(`history/schemas/chapter.schema.json`):

```json
{"chapter": 1, "title": "How a load of salt was weighed",
 "text": "Plain prose, a few paragraphs: what the author needs for the scene, in your own words.",
 "claims": [{"id": "c1", "text": "the fact, as the brief states it", "source": "s1",
             "evidence": "a quote of at least eight words, copied exactly from source s1"}]}
```

Every fact in the text is a claim with a verbatim quote. Write the text in your own words: a
facts-only source's facts are yours to use, its sentences are not.

## 4. Check it, then save it to AI Write

    python3 story/tools/research_brief.py check research/<topic>

It refuses a quote that is not in its source, a source never saved, a clue used as evidence, and
prose copied from a facts-only source. When it is clean,

    python3 story/tools/research_brief.py render research/<topic>

prints the brief with its quotes and numbered sources. Save that text with
`aiwrite.createDoc {title, text, folder: "<book> research"}`, then link it from the chapter's
plan with `storymaker.linkResearch {project, chapter, brief: <title>, open: <the doc's open link>}`.

## 5. Tell the author

In a few lines: what you found, how sure the sources are, and where the brief is. What to do with
it in the chapter is the author's call, and the writer agent reads the brief only as background.
