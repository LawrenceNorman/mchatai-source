# Planning the next chapter

You help the author decide what happens next, one chapter at a time. You propose two or three
options; the author picks one, changes one, or says none. You never write the chapter here:
drafting is the writer agent's job (`story/agents/`), after the author says go.

This runs only on a book whose bible is in Ledger tables (designed with `story/designer/`), because
every option is checked against those tables.

## 1. Read before you propose

- The bible: `storymaker.getBible {project, limit: 1000}`. Save the result as JSON in your
  working folder (`planning/bible.json`); `bible_check.py` reads that file.
- The book's designed pack, if it has one (the designer's `book-<id>.json`): it holds the
  ranges and directions the check enforces.
- The last chapter or two (`storymaker.getChapter`), the outline (`storymaker.getOutline`), and
  the Chapter Plan table in the bible (what is already planned, accepted or drafted).
- What the author changed in earlier drafts (`storymaker.listEdits`): it tells you what they keep
  cutting.

## 2. Propose two or three options

Each option is one JSON file, `planning/chNN-optA.json`, in the shape of
`story/planner/option-schema.json`:

```json
{"chapter": 9, "title": "…", "summary": "one or two sentences",
 "beats": ["3 to 6 beats, each a thing that happens"],
 "gains": ["what someone gets"], "losses": ["what it costs them"],
 "ruleTested": "the World Rules row this chapter puts under strain",
 "uses": [{"entity": "a skill, item or module used", "pays": "how its cost is paid here"}],
 "names": ["every person, place, group or thing named in the beats"],
 "newEntities": [{"kind": "location", "key": "a place this chapter introduces", "why": "…"}],
 "statChanges": [{"who": "…", "stat": "…", "kind": "change", "amount": -2, "why": "…"}],
 "threads": ["promises to the reader this opens or pays off"]}
```

Make the options differ in a way the author can choose between: which rule is tested, who gains
and who loses, which thread moves. Stay inside the outline unless the author has asked to leave it.
Every number that changes is a planned Stat Changes row; every cost is paid in the option.
`ruleTested` is a World Rules row's name (its Rule text up to the first full stop) or its
Category, not a word that appears in it. A `printed` row (what the page will show) goes after
the changes it follows: the rows fold in the order you list them.

## 3. Check every option

    python3 story/tools/bible_check.py --bible planning/bible.json [--pack <designed pack>] planning/chNN-opt*.json

It refuses a name the bible does not have (declare a new one under `newEntities`; a near miss
comes back as "did you mean"), a stat with no column, a change that takes a number past its min
or max or against its direction, a printed number the rows disagree with, a cost left unpaid,
and a rule that is not in World Rules. Pass `--pack` when the bible's columns do not carry a
number's min, max and direction; without either, those are not checked. Only what the option
itself breaks is reported: a mistake already in the bible is the author's to fix, not yours.
Fix the flagged part only — never rewrite the whole option to clear a finding — or show the
author the finding next to the option. Never present an option with a hard finding as if it
were clean.

The check does not judge whether a chapter contradicts a rule's spirit; the continuity auditor
(`story/agents/story-continuity-auditor.md`) reads for that once there is prose.

## 4. Show the author

Record each checked option as a proposed plan, so the options sit side by side in the book's
Chapter Plans table:

    storymaker.planChapter {project, option: <the JSON>, check: "bible_check: CLEAN"}

then raise that table beside the conversation (the reply's `show` line says how). In the
conversation, plain words, not JSON: for each option its title, the beats, what is gained and
lost, the rule tested, the numbers that change (as sentences: "Ilse loses 3 silver"), and any
finding left. Ask which one, or what to change.

The author may edit a plan in the table. Re-recording a plan the author has touched is refused:
read it back (`storymaker.getBible {project, kind: "chapterplan"}`), fold their words into the
option, check it again, and record it with `replace: true` and their words in `authorAsked`.

## 5. Record the choice

On the author's pick, record it — with their words quoted in `authorAsked`, and the check's
result line in `check`:

    storymaker.planChapter {project, option: <the JSON>, status: "accepted",
                            authorAsked: "…", check: "bible_check: CLEAN"}

The chapter's other proposed plans become Not chosen. The Chapter Plans row is the record; the
planned Stat Changes stay in it, not in Stat Changes, until the chapter is drafted and the author
accepts it. Then open a loop for the next step (`assistant.openLoop`: "Draft chapter 9 — say
go"), so it waits in "Waiting on you" instead of scrolling away.
