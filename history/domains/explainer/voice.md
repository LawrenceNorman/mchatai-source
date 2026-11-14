---
id: explainer-voice
version: 1
updated: 2026-11-10
appliesTo: explainer projects (project.json "domain": "explainer", "voice": 2)
extends: history/voice.md (version 5), with the writer's own sentences of domains/pivotal-history/voice.md §2a
enforcedBy: history/domains/explainer/lint-rules.json + thresholds.json + history/tools/gate.py, editor.py
---

# The voice: deltas for an explainer

An explainer teaches one idea from zero to the depth a practitioner works at: what a model is, how
a camera frame becomes a label, why a smaller number format makes a phone faster. It is written by
the History Writer's engine and keeps every rule in `history/voice.md` for its FACT sentences. What
changes is that most of an explainer is explanation, and explanation is the writer's own.

Rule ids in [brackets] are enforced by `tools/gate.py`; a rule with no id is enforced by the
independent audit and the author's read.

---

## 1. Who is reading, and who is writing

The reader is smart, busy and new to the subject. They want to understand it well enough to explain
it out loud to someone who knows it, and to come back months later and find the same pictures in
the same places. Every term is new to them until the book defines it.

The writer has done the reading and, where they can, the measuring. They teach: they pick one
picture for an idea, walk an example with real numbers, say where the picture stops being true, and
check that the reader can now say it. They are not a salesperson for the technology or a critic of
it.

Plain words, read aloud: sentences average 20 words or fewer, a short one after a long one, at
reading grade 8 to 12 [readability]. Technical words are long, so short sentences carry them.

## 2. Two kinds of sentence

**A fact sentence** anchors a claim: a number, a date, a name, a result, a documented behaviour. It
keeps every rule of `history/voice.md`, in the third person, with its quote [quote_unverified,
verbatim_copy]. A product fact carries its version or its date ("in iOS 27.3", "as of November
2026"), because software changes under a book [present_tense_now].

**A writer's sentence** anchors no claim. It explains, gives the picture, walks a step, asks the
question a reader would ask, or tells the reader what to draw. It may speak in the present tense, to
"you", as "we", and give directions ("draw a box for the camera"). It never adds a fact: every
number, name and month in it must already be stated by an anchored sentence of the same chapter or
be a glossary entry [writer_specific]. Most of an explainer is the writer's: up to 80% of a chapter
[writer_share].

The author may speak as "I" only where the book reports the author's own measurement or the
author's own answer (the "From my platform" and "Say it out loud" boxes in a book that has
them). Nowhere else is the narrator an "I".

## 3. Every number is sourced, measured or computed

The base number gate holds unchanged: a number in the prose appears in a claim's evidence
[number_unsourced]. In an explainer many numbers are worked out, not quoted: a tensor's shape after
a layer, a rounded frame budget, a parameter count, a memory size. Those come from a computation the
project can run again. A script in the project's `figures/` folder prints each one with its working
("frame budget at 30 frames a second: 1000 / 30 = 33.3 milliseconds"); its printout is fetched as a
source (`fetch.py file`, kind `measurement`, licence `own`) and the claim quotes the line. Rounding is
arithmetic: "about 33 milliseconds" needs a printed "33". A number nobody printed, measured or
published is cut.

A measurement made on the author's own device is a source like any paper: the report file is fetched
as kind `measurement`, licence `own`, and the claim quotes it. It says what was measured, on what,
and when.

## 4. The glossary is the cast

Every term and every acronym is defined in plain English where it first appears, once. The dossier
lists the terms the way an episode lists its people (`people[]`, each with `name`, `aliases`, `who`
as the one-sentence definition, `source`, `evidence`); the plan assigns each to the chapter that
teaches it (`introduces`). That chapter defines it in the paragraph of its first mention, with a
claim of kind `cast` [cast_unintroduced]; a term used before its chapter is noted
[cast_before_intro], and in an explainer that is hard: a reader meets every word defined. An acronym
is spelled out at its first use, and every technical name or acronym in the prose (a word with two or
more capitals) is a glossary entry or an alias of one [acronym_undefined]. The book's Glossary page is built
from the same list, each entry with the chapter that teaches it.

## 5. The fixed boxes

A book in this domain may give every chapter the same small set of boxes, so a reader always knows
where to look. Each box is a paragraph that is exactly its title, followed by its body [box_missing].
The titles and their rules are content (thresholds `boxes`, a project's `plan.boxes`); no title
carries a number, since the number gate would ask every chapter to source it. The usual set is:

- **The picture.** The chapter's analogy, said as one, then where it breaks, in one sentence.
- **Say it out loud.** The spoken answer, 55 to 95 words, about thirty seconds said aloud
  [box_spoken_length].
- **Draw it.** The whiteboard: what to draw, in the order to draw it, matching the chapter's diagram.
- **From my platform** (or the book's own name for it). Where this lives in a real system, with one
  real number and its source.
- **Check yourself.** Three questions a reader would be asked, each followed by its full answer
  [box_questions].

## 6. One picture per idea, the same every time

Each idea gets one analogy, and the book uses it the same way every time it comes back. It is
introduced as an analogy ("Think of …"), and the sentence after it says where it breaks. The
project's analogy bank (`plan.analogies`) is the list; the audit checks that a chapter does not
switch pictures for an idea the bank already has, and that no picture is used for two ideas.

## 7. Documented, observed, unknown

A vendor's documentation is a source. What a vendor has not documented is not a fact, however
plausible: an internal name read in a log, the engine a layer seemed to run on, a buffer size seen in
a trace. Such a thing is stated as observed, with the run that observed it as the source ("in our
runs, the Neural Engine sat idle"), never as how the system works. Where nobody outside the vendor
knows, the writer says so in a writer's sentence and moves on.

## 8. No hype, no magic, no minds

A label in place of the mechanism is cut [hype_label]: show how it works, what it costs and where it
stops. "Obviously" and "simply" hide the step a newcomer needs [dismissive_easy]. A model does not
think, know or want; it computes. Shorthand that gives it a mind is noted [model_mind], and is kept
only when the next sentence says what it really does.

## 9. The opening

An explainer opens on the thing it explains, in the slot a history gives its portrait: a real
picture of the object or the example the book follows (a botanical plate of the plants a classifier
tells apart; a photograph of the machine). Its caption names the thing by one of the dossier's
`place` names [opening_missing, opening_not_ground].

## 10. Pictures and diagrams

Real pictures first, under `history/voice.md` §14: public-domain plates and photographs, museum
objects, the author's own screenshots and traces. A diagram is the writer's drawing and is captioned
as one ("Diagram: …"). A generated picture of a real person, or one made to look like a photograph or
a period artwork, is refused as in the base voice. Every chapter carries at least one picture
[picture_floor].

## 11. The introduction

The introduction (`history/voice.md` §13) opens on one concrete moment, asks the book's question in
the writer's own sentence [intro_question_missing], and says what the reader will be able to do by
the end. An explainer keeps no ending back.

---

## Change log

- **v1, 2026-11-10.** First version, for the first explainer (Phase FN). The fact sentences keep
  the base voice; the explanation is the writer's own; numbers come from sources, measurements or
  rerunnable computations; the glossary is the cast; fixed boxes; one picture per idea.
