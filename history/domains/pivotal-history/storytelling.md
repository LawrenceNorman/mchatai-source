---
id: pivotal-history-storytelling
version: 1
updated: 2026-10-19
appliesTo: Pivotal Histories stories (project.json "domain": "pivotal-history")
readBy: voice.md §2a (the writer's own sentences), the chapter writer, the auditor and the editor
---

# The writer's moves, and where they come from

The first telling of the Siege of Alesia (2026-10-18) followed every rule and read, in the author's
words, as "very stale and nearly unengaging". It was measured: 222 of its 222 sentences paraphrased a
sourced claim, none asked a question, and they averaged 26 words. Not one sentence was the writer's
own. The author named the remedy, "Dan Carlin's Hardcore History podcast should be the template":
a writer who asks, reacts, weighs and compares, in one voice.

This file says what the writer's own sentences may do. `voice.md` §2a says where they are allowed,
and `tools/voice_lint.py` checks them. The bargain does not move: no invented dialogue, inner life,
scenes or numbers. Every fact is still a claim with a verbatim quote. The moves below add no facts.
They help the reader hold the facts the claims already carry.

Each move is credited to the historians the author and the plan named, in their own published words
about how they work. Every quotation below is verbatim from a page saved to disk
(`_datasets/pivotal-history/storytelling/sources/`, beside the platform's other datasets; source ids
in brackets, listed at the end). Where we could not find an author's own statement of a method, this
file does not claim it for them.

---

## 1. The five moves

A **writer's sentence** is one that anchors no claim (`voice.md` §2a). It may make one of five
moves.

### question: what the chapter or the book is trying to answer

> "How do you hold a wall that faces both ways?"

A book asks one question in its introduction (`plan.json` `question`), and most chapters ask the
smaller question their events answer. The question comes before the facts that answer it. It is
never rhetorical: the chapter answers it, and a question with no answer in the book is cut.

**Where it comes from.** Carlin builds an episode on a question. His shows have "what we call here
when I'm doing them spines, philosophical spines" [s2], and "we try to find some deeper philosophical
question that the story highlights" [s2]. His example, from "Destroyer of Worlds": "can human beings
learn to live with the power of their ever-evolving weapons system?" [s2]

**What we take.** A spine for the book and a smaller question for each chapter. **What we leave.**
Carlin's spines are often philosophical, and ours stay with the episode: what the sources can
answer.

### scale: the fact in terms a reader can hold

> "Fourteen miles: you could not see one end of it from the other."

Scale turns a sourced number into something the reader can picture: a distance walked, a crowd
filling a stadium, a modern city's length. It is also where awe belongs. A feat the sources describe
(eleven miles of works dug in weeks) deserves the reader's attention to what it required.

The comparison may carry no number of its own. A comparison that needs a figure (Manhattan's length,
a stadium's seats) makes that figure a claim of kind `scale`, with its own source and quote, exactly
like any other fact.

**Where it comes from.** Carlin's reaction to a story is the reader's: "Oh my God, can you imagine
being here and these people in this time period?" [s2]. He calls his show history dramatised:
"Drama is just reality with the boring bits taken out. That's kind of how I look at the history
show." [s1] (He is quoting a line usually credited to Alfred Hitchcock.) Mary Beard's warning goes
with it: "to explore ancient Rome from the twenty-first century is rather like walking on a
tightrope, a very careful balancing act." [s15]

**What we take.** Awe at a feat, said once and earned by the facts beside it. **What we leave.**
"Can you imagine" in the reader's head is a feeling, and a feeling is never given to anyone who was
there (`writer_feeling`). Scale measures; it does not say the past was like now.

### weighing: whose word we are taking

> "For most of what happened at Alesia we have one witness, and he wrote for Rome."

Weighing sets sources against each other by the PERSON who wrote them: Caesar against Plutarch,
Napoleon III against the archaeologists who doubted him. It says what historians still dispute, and
when "we cannot know". It is the debate the author wants from a book, in one voice.

A document is still never the subject of a verb of telling (`history/voice.md` §3): "Caesar put the
relief army at …", never "the Commentaries say …". Two figures stay two figures, each attributed,
never averaged (`voice.md` §4).

**Where it comes from.**
- Carlin, on why his shows quote so much: "coming from the position that you know you're not an
  expert, you're not pretending to be an expert, when you make some sort of statement, we feel like
  you want "audio footnotes."" And then: "You want to say, "Listen, it's not me saying this—here's a
  couple of historical points of view." You're still picking and choosing, so it's not totally fair"
  [s1].
- Beard, on what the sources cannot settle: "I think it's very, very unlikely. But I think it's
  almost impossible now to know." On why a portrait in the sources may be a verdict: "the succeeding
  regime, in order to justify the assassination, builds up the wickedness of the guy they've killed.
  And you really can't see through that any longer." [s9] And on the field as a whole: "Roman
  history is always being rewritten, and always has been; in some ways we know more about ancient
  Rome than the Romans themselves did. Roman history, in other words, is a work in progress." [s15]
- Holland, on who wrote the record: "By and large, the men who are writing the histories are
  terrified by this." And: "when you're writing, it is quite difficult to get perspectives that are
  not centred on the imperial capital." [s12]

**What we take.** The reader is told who is speaking, what he had at stake, and where the others
disagree. "We cannot know" is allowed when it is true. **What we leave.** The weighing is of
sources, never of a people: no verdict on the Gauls or the Romans (`voice.md` §5).

### reading: the writer's interpretation, offered as one

> "The better reading is that Vercingetorix meant the hill to be bait."

A reading interprets a decision or a mechanism from facts the chapter has already stated. It says
it is a reading ("the better reading is", "it looks like", "the likeliest explanation is") and gives
its reasons. It is never speculation dressed as narration: "must have", "surely" and "no doubt" stay
defects everywhere (`speculation`), because they state a guess as a fact.

**Where it comes from.**
- Beard, labelling her own view: "In the end, I think we can't give any simple answer to that. But
  I do have a very strong hunch about what's going on here." [s9]
- Holland: "My own feeling is that he is actually much darker, verging on psychopathic" [s16]. He is
  setting "the man who in his correspondence is witty and charming set against the record of someone
  who brought unbelievable slaughter and mayhem to Gaul" [s16].
- Beard, on how a history is built at all: "The story has to be a bold work of reconstruction, which
  must squeeze individual pieces of evidence – a single fragment of pottery, or a few letters
  inscribed on stone – as hard as it can." [s15]
- Holland: "a lot of books on Ancient Rome, my own included, generally like to tell stories that take
  fragments of evidence and piece them together to make a coherent narrative." [s16]

**What we take.** An opinion, in the open, with its reasons, labelled as an opinion. The author asked
for a take "if it's warranted (but please do not call it that)". **What we leave.** "I". Beard and
Holland speak as themselves; a Pivotal Histories book speaks under the series' name, as "we" (the
writer and the reader together), so a reading needs its reasons more than its owner (`voice.md` §2a;
the author may overrule this, plan decision 1).

### lesson: what still holds, and the modern juxtaposition

> "Armies have been losing the two-front problem ever since."

A lesson says what the episode still teaches, or sets it beside something the reader knows. The
author's question: "What fundamental concepts still have value today … what 'in modern terms' could
we compare with in the story for scope?" A lesson is the one place the present tense is allowed, and
only for the lesson, never for a fact about a place as it is now.

**Where it comes from, and its limit.** Holland deliberately wrote modern parallels into *Rubicon*
and later turned against leaning on them: "a lot of things that seemed recognizable and familiar
only serve to heighten all the things that weren't." And: "I don't want to talk about the parallels,
because I think the parallels are very dim and distant. I think what is fascinating, actually, is
just how completely different the Romans were to us." [s7] Carlin names the same trap in judging
the past: "the criteria we're using is the criteria of whatever time we're doing the assessment in,
and that is an inherently flawed problem because that's a moving target" [s2]. Beard: "It is a
dangerous myth that we are better historians than our predecessors. We are not." [s15]

**What we take.** One lesson a chapter at most, mostly saved for the afterword (`voice.md` §12). A
comparison clarifies a size or a mechanism (a supply problem, a two-front problem), and never claims
the Romans were us. **What we leave.** Moralising, and judging the past by today's standards without
saying so.

---

## 2. Structure: suspense without invention

The moves are sentences. The shape of the book is the other half, and it is where Erik Larson, who
keeps our rule exactly, gets his page-turners.

- **His rule is ours.** "In my work, anything that appears in quote is something that came from a
  historical document." "I know there are those who do try to imagine dialogue. But I don't think you
  can do that and stay in the realm of nonfiction." [s4] The note he puts in his books: "Anything
  between quotation marks is from a written document. All dialogue that appears in this book is
  taken verbatim from the sources in which it initially appeared." [s6]
- **Suspense comes from the record's own order.** "We're not talking about making things up; we're
  talking about where the story is in real life." [s6] "This detailed chronology is my secret weapon.
  Because chronological order is the key to any story." [s6]
- **Chapters end where the next thing is coming.** "there are obvious places where I can see that if
  I end this scene there and jump here, that's good foreshadowing." [s6] Asked about his chapter
  endings: "But they're very natural breaks." [s6]
- **Threads alternate.** "My chronology says, "This happened then," and, "Meanwhile, this is going on
  here, and it will influence the outcome of that scene."" [s6] "If you can cut from one to the
  other, and you know one's going to sink the other, that's suspense." [s4]

**What we take.**
- **The introduction keeps the ending** (`voice.md` §10). The reader of a siege should not learn the
  surrender on the first page.
- **Every chapter ends on a turn**, the thing the reader wants to know next, never a summary
  (`plan.json` `turn`).
- **Where the sources allow, a chapter alternates the sides**: Caesar's camp, the town, the relief
  army.

## 3. Who speaks

**"We" and "you", never "I".** "We" is the writer and reader together: "we have only Caesar's word
for this". "You" is the reader in their own world: "you could not have seen one end of it from the
other". A reader placed in the past ("you would have seen") is still an immersive passage, declared
and sourced (`voice.md` §2).

Carlin's first person is his own, and the series has no one person to give it to. The author may
choose otherwise (plan decision 1).

**One voice, and a podcast hook.** The author likes a two-voice podcast format that debates and uses
analogies. A book has one voice, so the debate is the **weighing** move in that one voice. A podcast
edition could later give those passages to two voices. That is noted as a hook, not built.

## 4. What was looked for and not found

Recorded so that no one later credits these to the authors from memory:

- **Carlin on doubting ancient numbers, and "think about who is telling us this".** It is a common
  description of his shows, but no statement in his own words was found on a page we could save.
  The weighing move rests on his "audio footnotes" [s1] and on Beard and Holland.
- **Holland on Caesar's *Commentaries* as self-presentation.** No statement in his own words about
  the *Commentaries* was found. His preface to *Rubicon* could not be fetched. The nearest is his
  contrast of Caesar's letters with the record [s16].
- **Beard's "A Don's Life" columns** were not reached. Her *SPQR* prologue and her Fresh Air
  interview carry the method.

## 5. Sources

Saved with `history/tools/fetch.py` (raw bytes and extracted text) on 2026-10-19, each checked
verbatim with `_hw.norm`. They are interviews and book extracts under copyright, so they are quoted
briefly here and are not kept in this repository.

| id | Who speaks | Where |
|---|---|---|
| s1 | Dan Carlin, interviewed by Sam Harris | "Shouldering the Burden of History", podcast transcript, samharris.org, about 2015 |
| s2 | Dan Carlin, interviewed by Nick Gillespie | "Hardcore History's Dan Carlin: What the Past Can—and Can't—Teach Us", nickgillespie.substack.com, about 2024 |
| s4 | Erik Larson | "Q&A: Author Erik Larson", Knoxville Mercury, 17 March 2016 |
| s6 | Erik Larson | "Encounter: Erik Larson", Creative Nonfiction |
| s7 | Tom Holland | "The Arc of History: Tom Holland Interview", Aspects of History |
| s9 | Mary Beard, interviewed by Dave Davies | "From Gladiator Duels To Caesar's Last Words: The Myths Of Ancient Rome", NPR Fresh Air, 30 November 2015 (transcript) |
| s12 | Tom Holland | "The shadow of Pax Romana", UnHerd, July 2023 (an edited talk) |
| s15 | Mary Beard | *SPQR: A History of Ancient Rome* (Profile Books, 2015), the Prologue, publisher's extract |
| s16 | Tom Holland | "The best books on Ancient Rome, recommended by Tom Holland", Five Books |

URLs are in the dataset's `sources/index.json`.

---

## Change log

**v1 — 2026-10-19.** Written for voice v2 (`docs/PIVOTAL_HISTORY_STORYTELLING_PLAN.md`, phase P0)
after the author's read of the first Alesia. The five moves of plan §4.1, each with its authors'
published statements of method, fetched and checked verbatim. Holland's and Beard's cautions on
modern parallels narrowed the lesson move from the plan's sketch: a comparison clarifies a size or a
mechanism, and never says the past was the present.
