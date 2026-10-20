---
id: pivotal-history-voice
version: 2
updated: 2026-10-19
appliesTo: Pivotal Histories stories (project.json "domain": "pivotal-history")
extends: history/voice.md (version 4)
readWith: storytelling.md (the writer's moves and where they come from)
enforcedBy: history/domains/pivotal-history/lint-rules.json + thresholds.json + history/tools/gate.py, editor.py
---

# The voice: deltas for pivotal histories

A pivotal history tells one EPISODE (a battle, a siege, a crossing, a campaign season, a codebreak)
whose outcome turned on an edge: a tactic, a technology, a piece of science or a system of supply.
It is written by the History Writer's engine and keeps **every rule in `history/voice.md`**. Nothing
there is relaxed here except where this file says so, by name: inside a declared passage (§2), inside
the writer's own sentences (§2a), and in the introduction, which §10 replaces for an episode. Read
that file first, then `storytelling.md` beside this one; this one only adds.

Rule ids in [brackets] are enforced by `tools/gate.py`; a rule with no id is enforced by the
independent audit and the author's read.

**Which stories version 2 binds.** A story whose `project.json` says `"voice": 2`. The episodes
told before v2 (Midway, Hampton Roads, Syracuse, Xiangyang, the Armada, and Alesia's first telling)
keep version 1.1's rules until they are told again. They get only v2's measures, as notes:
`writer_absent`, `intro_question_missing`, and `readability`. Alesia is told again first, and the
author reads it against the first telling before any other episode changes.

---

## 1. Who is reading

The reader chose this episode, or the place it happened. They want to understand what happened,
why the edge mattered, and what it was like to be there. They are not a specialist, and they
should finish a chapter able to explain the edge to a friend.

The writer has done the reading and explains the mechanism in plain words. They are not a
war-gamer, a partisan of either side, or a fan of a commander. They are also not absent. The first
telling of Alesia kept every rule and read, in the author's words, as "very stale and nearly
unengaging": all 222 of its sentences paraphrased a source, and none asked, compared, weighed or
reacted. An episode has three armies, a dozen peoples and two thousand years of distance, and the
reader needs someone to orient them, ask the question, and say what it all required. That is the
writer, in their own sentences (§2a).

Write for a reader of high-school age who reads for pleasure: plain words, read aloud. Sentences
average 22 words or fewer, a short one after a long one, at reading grade 8 to 12 (Flesch–Kincaid;
`editor.py check` [readability]). Every name is introduced at the first meeting (§11).

## 2. The point-of-view ladder

Every passage is in one declared mode. Modes are never silently mixed.

**L0, sourced narrative.** The default, and the whole of most chapters: the History Writer's
voice, past tense, third person, every specific a claim.

**L1, immersive frame.** A passage that places the reader where the sources place the people: on
the wall, in the line, on the deck. It is allowed only on these terms, each checked:

- **Earned by the record.** The dossier must hold a participant's or eyewitness's own account
  (`ownWords`, with its span). `richness.py dossier` writes `computed.pov`; a passage in a story
  whose dossier says `L0` fails. [l1_not_earned]
- **Declared in the chapter file and in the text.** The chapter lists the passage in `passages`
  (`{"mode": "L1", "from": "<its first words>", "to": "<its last words>"}`), and its first
  sentence tells the reader the mode has changed, in the declared subjunctive: "Had you stood on
  the outer wall that morning, …", "If you had been aboard the Monitor, …". [l1_undeclared,
  l1_span_unresolved]
- **Every sentence carries a sourced detail.** Each sentence anchors at least one claim. A
  sentence with nothing from a source in it is invention and is cut. [l1_unanchored]
- **Perception, never feeling.** What was there to see, hear and smell, from the sources. No
  feeling, thought or hope for the reader or anyone else unless a source records it. [l1_interior]
- **Short.** At most 35% of a chapter. And do not LAND it on a figure: a passage's last
  sentence is where an attributed number drifts in (a count only a commander's report gives is
  not something a bystander perceives). Put such figures in the plain narrative after the
  passage, attributed (§4). (Alesia ch.4's audit, 2026-10-18.) The narrative carries the chapter. [l1_share]
- **Inside it, and only inside it,** the frame may say "in front of you stands …" (the base
  `stage_direction` rule is exempt there, by name in `thresholds.json` `pov.l1ExemptRules`).
  Every other rule holds: no invented dialogue, no "must have", no "today".
- **Outside it,** a scene's "would have seen" is a defect [undeclared_immersive], and so is "you"
  in a sentence that states a fact [reader_address]. "You" for the reader in their own world belongs
  to the writer's own sentences (§2a).

**L2, historical fiction** (an invented protagonist on a true scaffold) is **not a mode of this
assistant.** No invented soldier, no composite witness, no invented name, ever. A chapter that
declares `L2` fails. [pov_mode_unknown]

## 2a. The writer's own sentences

**A sentence that anchors no claim is the writer's own.** There is nothing to declare: the anchors
draw the line, and `tools/storytelling.py writer <story> <n>` prints a chapter with each sentence
marked. An immersive passage keeps its stricter rule, a claim in every sentence (§2).

A writer's sentence makes one of five moves. Each is described in `storytelling.md`, with the
published method of the historians it comes from:

- **question**: what the chapter or the book is trying to answer ("How do you hold a wall that
  faces both ways?"). It comes before the facts that answer it, and the book answers it.
- **scale**: a sourced fact in terms the reader can hold, and the awe a feat deserves ("you could not
  have seen one end of it from the other"). A comparison that needs a figure of its own (Manhattan's
  length) makes that figure a claim of kind `scale`, sourced; the sentence that anchors only scale
  claims is relaxed as a writer's sentence is.
- **weighing**: whose word we are taking, by the person's name; what the sources dispute; when we
  cannot know ("For most of what happened at Alesia we have one witness, and he wrote for Rome").
- **reading**: an interpretation of a decision or a mechanism from facts already stated, offered as
  one, with its reasons ("The better reading is that …").
- **lesson**: what still holds, or the modern juxtaposition. It clarifies a size or a mechanism and
  never claims the past was the present. Mostly in the afterword (§12).

What a writer's sentence may not do:

- **Add a fact.** A number, a month, a name or a place that no anchored sentence of the chapter (or
  the cast, §11) states, or any quotation: anchor a claim on the sentence, or cut it.
  [writer_specific]
- **Give anyone who was there a feeling or a thought.** "Caesar was terrified" is invention whoever
  writes it. A reading is about a decision, in the open, never about a mind. [writer_feeling]
- **Speculate in narration's clothes**: "must have", "surely", "no doubt" stay defects everywhere.
  [speculation]
- **Say "I".** The book speaks as "we" (the writer and the reader together: "we have only Caesar's
  word for this") and "you" (the reader in their own world). [writer_first_person]
- **Run long.** At most a quarter of a chapter's words (`thresholds.writer.maxShare`); the afterword
  up to 70%. [writer_share] And at least one: a chapter with no sentence of the writer's is the old
  stiffness. [writer_absent]

**Relaxed inside a writer's sentence, by name** (`thresholds.writer.exemptRules`, as
`pov.l1ExemptRules` works inside a passage): `flourish` (a question may set up its answer),
`stage_direction`, `source_framing` (sources set against each other is the weighing move),
`present_tense_now` (for a comparison or a lesson, never for a fact about a place today), and
`reader_address`. Every other rule holds in them: the base voice's §3 (no document tells anything:
"Caesar wrote", never "the Commentaries say"), §5 on peoples, `edge_label`, `othering_label`,
`praise_label`.

## 3. The edge: Mechanism, Cost, Limit

When the story credits a tactic or a technology with an outcome, it shows three things, each a
claim, in the chapter where the edge first matters:

- **Mechanism:** how it worked, plainly enough to explain to a friend.
- **Cost:** what it took to field: years of training, remounts, timber, labour, money.
- **Limit:** where it stopped working: range, weather, ground, supply, the enemy's answer.

Never a label in place of the mechanism: no "decisive", "revolutionary", "game-changing",
"genius". [edge_label] And never more credit than the sources give. When they name other causes
(numbers, weather, disease, a quarrel among allies, a traitor), the story names them too. An edge
that the sources do not tie to the outcome is not the story's edge.

## 4. Numbers the sources disagree on

Army sizes and losses are where old sources are least reliable, and where a writer is most
tempted to settle the matter quietly.

- Give a figure as its source gives it, and say who gave it, by naming the PERSON: "Caesar put
  the relief army at …", "the Novgorod chronicler wrote that …". A participant counting his enemy is making a
  claim, and the reader should know whose. A person is a historical actor; a document is not, so
  "the chronicle says" stays a defect (history/voice.md §3). [chronicle_testifies]
- Two sources, two figures, both given and both attributed. Never an average, a midpoint, or a
  rounding of either: a number no source prints fails the number gate. [number_unsourced]
- A modern estimate is given as a modern estimate, with its author.

## 5. War, its dead, and living peoples

- **The dead are people.** State losses plainly, attributed, as numbers or names the sources give.
  No relish, no gore beyond what a source states and the story needs.
- **Atrocity is stated, not dressed up or skated over,** in the plain words of history/voice.md §7:
  "massacred", "enslaved", "burned the town".
- **Peoples by their own names.** Rus' princes, Cumans, Mongols, Gauls, Arverni: the period's
  names, never a later nation's name for an earlier people. A chronicler's word for an enemy
  ("Tatars", "barbarians", "the godless") stays in quotation marks, credited. [othering_label]
- **Living nations.** Many of these peoples have descendants and states today. Treat them as
  history/voice.md §7 treats living communities: proportionate, never a caricature, never closing
  on the injury alone.

## 6. The opening: the ground, and declared illustrations

History Writer stories open with the subject's portrait (history/PLAYBOOK.md §5.4). An episode has
no single face, so **an episode opens with its ground** (the author's decision, 2026-10-18): the
introduction's first picture is a map or plan of the place (a period one, or one drawn from a free
basemap) or a photograph of the site, captioned with the place's name then, and now where a source
gives it. Set it with `images.py opening` (the portrait's slot, with the same licence, caption and
placement checks), then `images.py open`. `gate.py story` refuses a story with no opening, and an
opening whose caption does not name the place by one of the dossier's `place` names (the
period's and today's).
[opening_missing, opening_not_ground] Only the author can record that no such picture exists.

Pictures are real: photographs, period maps, plans and drawings from open archives
(history/voice.md §14). The one exception is a **declared illustration** (the author's yes,
2026-10-19: "under $3 for some images and then I can review"), on these terms:

- **Only for what no photograph or period picture can show**: the works in section, a mechanism, the
  ground as it was. Never a real person's face, and never in a period style passed off as period.
  [illustration_person]
- **Made from a written spec whose every detail is a verbatim quote** ("five feet deep", "eight rows,
  three feet apart"), each with its source and evidence, and a view ("a cut-away section of the works
  from the town outward"). `images.py illustrate` writes the prompt from the spec and nothing else;
  `--dry-run` prints it and its cost and calls nothing. [illustration_spec_unverified]
- **Labelled** under the picture and in the credits: "Illustration generated from <the sources>; not a
  photograph or a period image". [illustration_unlabelled]
- **Approved by the author before it is placed.** A generated picture waits in
  `images/illustrations.json` and on its review page; only the author's approval moves it into the
  story (`images.py review`, then the author's `images.py approve … --by`). [illustration_unapproved]
  The model and the budget are content (thresholds `illustrations`: at most 12 a story and $3), and
  every picture made counts, approved or not. [illustration_budget]

## 7. The world around the episode

history/voice.md §9's era context: what a day's march covered, what a soldier carried, who ruled
whom, each a claim of kind `era`. An episode needs orientation the chapter that meets a people has to
give, so the 30% cap is measured over the book's chapters, not each one (`eraShareScope: book`;
`gate.py story`), and the introduction's orientation is not counted. [era_share]

## 8. The ledger: forces, shown in action

The story's ledger (`plan.json` `ledger`, fields from `story/schemas/campaign.json`) tracks what
changed across the episode: an army's strength, supply and ground held; a commander's rank and
allegiance; the arms an army fielded. Each row is dated, with a verbatim quote from a fetched
source, which `richness.py plan` checks. Each change is shown in the prose in action, never
listed, and never printed as a stat. [growth_unshown, status_box] Two sources' different figures
are two rows, never one averaged row (§4).

## 9. Sources and licences

`sources.json` in this folder is the domain's source list, each with its licence class
(history/sourcing.md §5). Two rules carry the weight:

- **Wikipedia is CC BY-SA: take the fact, never the passage.** It is `facts-only` and an
  encyclopedia; it finds leads and confirms facts, and its sentences never reach a paid book.
  [verbatim_copy]
- **A translation's date decides its licence, not the original's.** Caesar is two thousand years
  old; a 2019 translation of him is copyrighted. A translation published in the United States
  before 1930 is public domain there; a modern one is `facts-only`.

## 10. The introduction: a cold open that keeps the ending

For an episode, this replaces history/voice.md §13's "say … what she did that the chapters will
show". For a life that is an introduction; for a siege it is the ending. The introduction is still
`chapters/00.json`, 200 to 600 words, gated by `gate.py intro`, written after the chapters:

1. **One true scene** from the sources, the most striking thing in the dossier, as claims.
2. **The question** the book answers (`plan.json` `question`), in a writer's sentence.
   [intro_question_missing]
3. **Orientation**: who the sides were and how they stood to each other, who is telling us, and why
   we are here, as claims of kind `era` and `cast`. The cast it meets is introduced here (§11).
4. **No outcome.** The dossier's `outcome` names the events that resolve the episode and the phrases
   that would give it away ("surrendered", "laid down their arms"). An introduction whose claims quote
   one of those events' evidence, or whose prose carries one of the phrases, fails.
   [intro_spoils_outcome, outcome_unmarked]

Every chapter ends on its **turn** (`plan.json` chapters' `turn`): what the reader wants to know
next, never a summary [turn_missing, at planning]. Where the sources allow, a chapter alternates the
sides (Caesar's camp, the town, the relief army) rather than following one. The book editor reads for
a chapter that closes flat (an editor's note of kind `turn`).

## 11. The cast, introduced on first meeting

The reader of the first Alesia met the Mandubii and Napoleon III with no word of who they were. The
cast is every person (dossier `people[]`) and every people (`peoples[]`: the Gauls, the Arverni, the
Mandubii, the legions, the German horsemen) the book names, each with `who` (one line), `source` and
`evidence`, checked like a claim [cast_quote_unverified, cast_who_missing].

- The plan assigns each to the chapter that introduces it (`introduces`, or `plan.intro.introduces`)
  [cast_unassigned, cast_assigned_twice, plan_unknown_cast].
- That chapter says who they were in the paragraph where it first names them, with a claim of kind
  `cast` whose `about` names the entry [cast_unintroduced]. A name used in an earlier chapter than its
  introduction is noted [cast_before_intro].
- `cite.py book` prints a **Who's who** from the cast after the introduction, one line each, its
  sources numbered into the Notes like any paragraph's.

## 12. The question, the observations, and the afterword

At planning, `plan.json` holds the book's `question` [question_missing] and two to four
`observations`: what makes this episode worth telling, each with the chapter that lands it, the
events that carry it, and phrases (`shows`) the prose will contain [observations_count,
observation_incomplete]. `editor.py check` notes one that never lands [observation_unlanded].

The book ends on an **afterword**: one chapter after the last, `"role": "afterword"` in the plan
[afterword_not_last], 300 to 600 words, with no events of its own. The writer's share may reach 70%
of it: the weighing (what the sources are, what historians still dispute, by name), the observations
in full, the modern scale, and the lesson that holds. Its facts are claims like any other's.

## 13. Pictures in every chapter

Every chapter carries at least one picture [picture_floor]; the afterword may go without. The plan
lists, per chapter, what a reader should SEE (`pictures`: the double ring in section, the stakes, the
hill), and `images.py find` works from it with more searches: Commons categories, the plates of
public-domain books (Napoleon III's atlas of 1866), museum open access. What no picture can show may
be a declared illustration (§6).

---

## Change log

**v2 — 2026-10-19.** The author read the first Alesia: "very stale and nearly unengaging", the
introduction gives the ending away, people arrive unintroduced, too few pictures, no modern scale and
no debate; "Dan Carlin's Hardcore History podcast should be the template". Measured: 222 of 222
sentences anchored a claim, 0 questions, 25.8 words a sentence (docs/PIVOTAL_HISTORY_STORYTELLING_PLAN.md
§2). Added the writer's own sentences and their five moves (§2a, with `storytelling.md`); split "you"
out of `undeclared_immersive` as `reader_address`; plain words read aloud (§1); declared
illustrations (§6); era context capped over the book (§7); the cold open that keeps the ending (§10);
the cast and the Who's who (§11); the question, observations and afterword (§12); a picture in every
chapter (§13). Nothing here relaxes the bargain: no invented dialogue, inner life, scenes or numbers.

**v1.1 — 2026-10-18.** The author agreed the opening rule proposed in v1: an episode opens with its
ground (§6), enforced by `gate.py story`.

**v1 — 2026-10-16.** The author's direction (docs/PIVOTAL_HISTORY_ENGINE.md): apply the Black
Seattle wisdom to pivotal histories without relearning it. Every History Writer rule holds. Added
the L0/L1 ladder with its declaration and checks (§2), Mechanism / Cost / Limit for the edge (§3),
attributed and never-averaged numbers (§4), war and living peoples (§5), the opening as a proposal
(§6), and the campaign ledger (§8). L2 is out of scope.
