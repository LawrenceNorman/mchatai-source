# Scouting pivotal episodes

The History Writer's scout (history/PLAYBOOK.md §1), generalised from a life to an episode. Every
rule there holds: sources are fetched with `fetch.py`, read through `richness.py mentions`, and
counted by `richness.py dossier`; nobody types a tier. This file says only what changes.

## 1. What a candidate is

A **pivotal episode** is a bounded stretch (a battle, a siege, a crossing, a campaign season, a
codebreak) that passes three tests:

1. **An edge decided it, by the sources' own account.** A tactic (a feigned retreat, a double
   envelopment), a technology (a counterweight trebuchet, an ironclad, radar), a piece of science
   (cryptanalysis, a weather forecast), or a system of supply (remounts, a road, an airlift). Not
   "the bigger army won".
2. **It was pivotal.** Something changed because of the outcome, and a source says what.
3. **The record can carry it.** Participants or eyewitnesses wrote it down, and their words can be
   fetched under a licence a paid book may use, or at least facts-only.

## 2. The steps

1. **The long list.** `candidates.json` in this folder: 10–15 episodes, each with its edge, why it
   was pivotal, the sources worth fetching first (from `sources.json`) and its aliases. Building it
   is cheap and may be done by any model; it is a list of leads, never a ranking.
2. **One episode per scout, in a fresh context** (PLAYBOOK §1.3, unchanged):
   - `stories/<slug>/project.json`: `{"slug", "subject", "series": "pivotal-histories",
     "domain": "pivotal-history"}`. The `domain` line is what turns on this folder's thresholds
     and lint rules. Without it, the History Writer's rules apply and the dates before 1500 and
     the immersive passages fail.
   - **Aliases are the episode's names and its place's names** ("Alesia", "Alise"; "Midway"),
     because `wordsAboutSubject` counts the words around them. A commander's name is an alias only
     in a source limited to the episode; otherwise it counts their whole life.
   - Fetch, best licence first. A participant's or eyewitness's account is `ownWords`, with
     `ownWordsSpan` marking their part ("all" for a commentary that is wholly theirs).
   - Every event: a date (`52 BC`, `1223`, `4 June 1942` all read), a `phase` (prelude, march,
     siege, battle, aftermath, …) and a verbatim `evidence` quote. `eventEvidenceRequired` is on in
     this domain, so an event without a checked quote does not count.
   - Every figure likely to become a ledger row (a strength, a supply, a loss): check the
     OTHER fetched sources for the same quantity (`mentions --terms` with the number's words)
     and record each source's figure as its own event. Two sources, two rows, never one
     (voice.md §4; Alesia 2026-10-18: Plutarch's figures for both armies surfaced only at a
     chapter audit, because the scout had pulled them from Caesar alone).
   - `when` is the episode's date as a reader should see it ("52 BC", "June 1942", "1268–1273"): the
     title block prints it under the name, and the series book orders its stories by it.
   - `place` names the ground, the period's name and today's ("Alesia", "Alise-Sainte-Reine"). The
     story's opening picture is captioned with one of them (voice.md §6).
   - `identityBasis` holds the membership claim: "<the edge> decided <the outcome>", and
     `identitySource` the source id that says so.
   - `python3 history/tools/richness.py dossier stories/<slug>` computes the tier, the mode, the
     licence counts and the point of view (`L0`, or `L0+L1` when a participant's account earns
     immersive passages).
3. **The edge re-check** (the identity re-check, PLAYBOOK §1.4). A second reader, on the strongest
   model, tries to REFUTE "the edge decided it" from the fetched sources: did they credit numbers,
   weather, disease, treachery, or a commander's blunder instead? Record the verdict in the
   dossier as `edgeCheck`: `{"verdict": "holds" | "partial" | "fails", "why": "…", "otherCauses":
   ["…"]}`. The same reader then checks each EVENT: every clause of its `what` (a name, a date, a
   cause) must be in its own `evidence` quote, and a `what` that says more is corrected or split
   before planning (Midway, 2026-10-18: a wrong ship, a wrong date and a sentence about the wrong
   admiral reached the chapters and cost three audits). A `fails` is dropped. A `partial` is kept, and the story names the other causes
   (voice.md §3).
4. **The table for the author.** One row per candidate: the episode, the edge, tier, mode, point of
   view, ceiling words, independent and licence-clean sources, dated events, the participants'
   own words, and the re-check verdict. `python3 history/tools/richness.py table stories` prints
   it from the dossiers. Recommend one pilot and say why.

**Planning an episode** (PLAYBOOK §2) also: write each ledger row's `shows` as a short paraphrase,
never a clipped span of its quote (`richness.py plan` names one copied from a facts-only source:
the prose would have to reproduce that source to pass); and when the sources disagree by a rule (a
time zone, Old and New Style dates), record the rule once in `plan.json` `notes`, with its quote,
for every writer (Midway's writers each rediscovered Nimitz's two-hour zone offset). And one twist: a dossier event far outside the
episode's own window (an excavation centuries later, a commemoration) belongs inside the chapter
it explains, and the plan says so in `plan.endNote`. `story_end_before_record` reads chapter spans,
not allotted events, so without the note it fires (the Alesia pilot, 2026-10-18).

**Stop.** The author picks the pilot. Nothing is planned or written until they do.

## 3. Cost

The first Black Seattle scout cost about 100M tokens for ten people, nearly all of it scouts
re-reading whole sources in their own context. Here: one episode per scout, passages through
`mentions` only, at most six sources each in a first pass, and the long list and the scouts may
run on a cheaper model because every event's quote is checked. The re-check and every later stage
that judges facts or writes prose stay on the strongest model (design D8).
