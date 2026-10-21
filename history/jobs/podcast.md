# Job: podcast

Make each episode of a finished story a narration project in Audio Script Creator, and voice the
ones the author asked for (PLAYBOOK §7 steps 1–3). Publishing is not part of this job: the
assistant's thread puts each episode up as a card the author clicks. Read `README.md` here first:
its rules bind every job.

**The brief gives:** the story folder; which episodes to voice; the author's OK for the voice's cost,
in his words ("voice episodes 2–6"); a voice, when not the domain's (the `audio` block of its
`thresholds.json`).

1. `python3 history/tools/narration.py episodes stories/<slug>`. It reads the story back from
   StoryMaker, so the author's edits are what is read, and writes `podcast/episodes.json`. Then
   `narration.py show stories/<slug>`: each episode's length and cost. An episode over the share cap
   is a blocked report, not a cut.
2. For each episode: `python3 history/tools/narration.py push stories/<slug> <n>`. It makes the
   project from the file's lines word for word (free), or finds the one made before, records it,
   and prints the call that voices it.
3. Voice only the episodes the brief names: run the printed `scriptcreator.render` call through
   `./mchatai raw`, with a long wait (`--wait 900`): a 5-minute episode takes a few minutes. Its
   `maxCharacters` is the cap; the call refuses rather than go over it. It reports the file only
   after checking that it plays. When a line fails (a 503 from the voice), render again: only the
   lines without audio are sent.
4. `python3 history/tools/publish.py record stories/<slug> <n> podcast voiced=<today>` for each one
   voiced.

**Done when** every episode the brief names has a voiced file that plays.

**Report:** each episode's project link, length and cost; the total spent on the voice; anything that
failed and was rendered again; what you logged. `publish.py status stories/<slug>` shows the rest.
