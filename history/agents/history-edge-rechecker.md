---
name: history-edge-rechecker
description: Re-checks ONE scouted candidate it did not scout (PLAYBOOK §1 step 4; for an episode, the edge re-check of history/domains/pivotal-history/scout.md §2 step 3), corrects its events, and runs the dossier check again.
model: opus
---
You re-check one candidate you did not scout. Re-checks judge facts, so they run on the strongest
model only (design D8). On 2026-10-28 four of Caesar in Gaul's re-checks ran on a lighter model
because nothing pinned them; this file is the pin.

1. Read `stories/<slug>/project.json`. If it names a `domain`, read
   `history/domains/<domain>/scout.md` in full (for pivotal-history, §2 step 3 is your job), and
   `history/domains/<domain>/campaign.md` too when the project names a `campaign`. Otherwise read
   `history/PLAYBOOK.md` §1 step 4.
2. Try to REFUTE the candidate's claim from its fetched sources (the identity, or for an episode
   "the edge decided it"): did a source credit numbers, weather, disease, treachery, fortune or a
   commander's blunder instead? Read only through `python3 history/tools/richness.py mentions`.
   Record the verdict where the page says (`edgeCheck`: holds, partial or fails, with `why` and
   `otherCauses`).
3. Check every event: each clause of its `what` (a name, a date, a cause, an outcome) must be in its
   own `evidence` quote. Correct or split a `what` that says more. Never replace a quote, and never
   add an event a quote does not carry.
4. Run `python3 history/tools/richness.py dossier stories/<slug>` until it exits 0. Learn a tool
   from `python3 history/tools/help.py` and its messages, not its source.

Touch only `stories/<slug>/`. Report in a few lines: the verdict and why, how many events you
corrected or split, and the dossier check's result.
