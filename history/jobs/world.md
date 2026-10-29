# Job: world

Gather the world around a story, or around every season of a war told as a book: a pool of period
facts, each with a verbatim quote, that the plan hands out to chapters a few at a time (voice.md §9).
Read `README.md` here first: its rules bind every job.

The author, 2026-10-28: *"bringing up relevant time-capsule items would help bring the reader back to
that period, be accurate (and verifyable) … just drop a few factual nuggets here and there"*.

**The brief gives:** the pool's id (a campaign's id, or the story's slug), the stories it serves, the
time and place, and the author's words on what he wants a reader to learn (quoted, with the date).

1. **The pool's folder**, `stories/_world/<id>/`: `project.json` with the stories' `domain` and
   `"pool": true`, an empty `world.json` (`{"id": "<id>", "facts": []}`) and `sources/`. Add
   `"world": "<id>"` to the `project.json` of every story the brief names. Install the subagents if
   the workdir lacks them (PLAYBOOK, Models).
   For a war told in seasons, each fact also says `tells`: the season whose event it narrates
   (`"54 BC"`: the siege of Quintus Cicero's camp), or `null` for a custom any season may tell
   (the Druids' courts). A season never tells a later season's event (`context_later_season`), and
   `world.py check` asks for `tells` wherever a fact's `when` names a year of the war.
2. **Gather** (one `history-world-gatherer` subagent per group of topics, up to four at once, in the
   foreground). Split thresholds `world.topics` among them, give each a block of ids (w1–w49,
   w50–w99, …) and a count. The pool needs about three facts for every one its chapters will tell,
   so the plan has a choice: a story's body chapters times two, times three. Weight the topics by the
   author's words and the domain's voice (pivotal-history voice §7).
3. **Re-check** (one `history-world-checker` subagent per gatherer's block, none checking its own
   block's gatherer, in the foreground).
4. `python3 history/tools/world.py check stories/_world/<id>` until it exits 0.

**Done when** the check exits 0 and every topic the brief weights holds facts.

**Report:** the facts per topic, the sources (whose words, which age), what the re-check mended and
dropped, three facts a reader would remember, and what you logged.

## Telling the facts

The pool is only the choice. The plan job picks (`plan.json` chapter `context`:
`[{"fact": "w12", "at": "<the moment in the chapter it belongs to>"}]`, about one a page or two or
three, thresholds `context`), runs `world.py adopt stories/_world/<id> stories/<slug> <ids…>` so the
facts' sources are the story's own, and `richness.py plan` checks the picks. The writers tell each
pick as claims of kind `era` with `"about": "<fact id>"`, and `gate.py chapter` checks they did.

A story written before its pool existed gets the same in a **context pass** (the domain's `jobs.md`
§ context): picks added to its plan, each chapter revised only to tell its picks, audited and gated
again, and landed again if it had landed.
