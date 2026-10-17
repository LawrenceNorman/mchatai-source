---
id: pivotal-history-voice
version: 1
updated: 2026-10-16
appliesTo: Pivotal Histories stories (project.json "domain": "pivotal-history")
extends: history/voice.md (version 4)
enforcedBy: history/domains/pivotal-history/lint-rules.json + history/tools/gate.py
---

# The voice: deltas for pivotal histories

A pivotal history tells one EPISODE (a battle, a siege, a crossing, a campaign season, a codebreak)
whose outcome turned on an edge: a tactic, a technology, a piece of science or a system of supply.
It is written by the History Writer's engine and keeps **every rule in `history/voice.md`**. Nothing
there is relaxed here except where this file says so, inside a declared passage, by name. Read
that file first; this one only adds.

Rule ids in [brackets] are enforced by `tools/gate.py`; a rule with no id is enforced by the
independent audit and the author's read.

---

## 1. Who is reading

The reader chose this episode, or the place it happened. They want to understand what happened,
why the edge mattered, and what it was like to be there. They are not a specialist, and they
should finish a chapter able to explain the edge to a friend.

The writer has done the reading and explains the mechanism in plain words. They are not a
war-gamer, a partisan of either side, or a fan of a commander.

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
- **Short.** At most 35% of a chapter. The narrative carries the chapter. [l1_share]
- **Inside it, and only inside it,** the frame may say "in front of you stands …" (the base
  `stage_direction` rule is exempt there, by name in `thresholds.json` `pov.l1ExemptRules`).
  Every other rule holds: no invented dialogue, no "must have", no "today".
- **Outside it,** "you" and a scene's "would have seen" are defects. [undeclared_immersive]

**L2, historical fiction** (an invented protagonist on a true scaffold) is **not a mode of this
assistant.** No invented soldier, no composite witness, no invented name, ever. A chapter that
declares `L2` fails. [pov_mode_unknown]

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

## 6. The opening

History Writer stories open with the subject's portrait (history/PLAYBOOK.md §5.4, the author's
rule), and `gate.py story` enforces it. An episode has no single face. **The equivalent rule for
episodes is a PROPOSAL waiting on the author's decision** (docs/PIVOTAL_HISTORY_ENGINE.md §9), and
until it is decided the portrait gate stands unchanged: a pilot opens with the portrait of the
person at the centre of the episode, or the author records why not.

## 7. The world around the episode

history/voice.md §9's era context, unchanged: what a day's march covered, what a soldier carried,
who ruled whom, each a claim of kind `era`, at most 30% of a chapter. [era_share]

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

---

## Change log

**v1 — 2026-10-16.** The author's direction (docs/PIVOTAL_HISTORY_ENGINE.md): apply the Black
Seattle wisdom to pivotal histories without relearning it. Every History Writer rule holds. Added
the L0/L1 ladder with its declaration and checks (§2), Mechanism / Cost / Limit for the edge (§3),
attributed and never-averaged numbers (§4), war and living peoples (§5), the opening as a proposal
(§6), and the campaign ledger (§8). L2 is out of scope.
