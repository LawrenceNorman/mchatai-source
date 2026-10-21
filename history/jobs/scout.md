# Job: scout

Find candidates and write a dossier for each, so the author can pick a story from a table
(PLAYBOOK §1; the domain's `scout.md`). Free on every plan. Read `README.md` here first: its rules
bind every job.

**The brief gives:** what the author asked for, in his words ("sieges won by engineering"); how many
candidates; any he named or ruled out; the folder names to use (`stories/<slug>`, one per candidate).

1. Read PLAYBOOK §1, then `history/domains/<domain>/scout.md` in full. `python3 history/tools/help.py`
   prints every tool's usage.
2. One candidate per subagent, each in its own fresh context; never hand one subagent a second
   candidate. Up to four at once, in the foreground. Each saves its sources with `fetch.py`, reads
   them only through `richness.py mentions`, writes `dossier.json` and runs `richness.py dossier
   stories/<slug>` until it exits 0. Notes pictures with `images.py find` as it goes.
3. The re-check (PLAYBOOK §1 step 4, and the domain's own: for pivotal histories, the edge
   re-check): a fresh subagent per candidate tries to refute it from the sources. Drop what cannot
   stand.
4. `python3 history/tools/richness.py table stories` for the table. Write the scout report with
   `aiwrite.createDoc`: one row per candidate (why it, tier, ceiling words, independent sources,
   dated events, dead ends), and the five you recommend.

**Done when** every candidate kept passes `richness.py dossier`.

**Report:** one line per candidate (name, tier, ceiling words, one reason), the five you recommend,
the report's link, and what you logged. The author picks; nothing else runs until he does.
