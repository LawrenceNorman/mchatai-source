# Job: finish

Place the pictures, set the opening, land the whole book in StoryMaker and get the editor's letter
(PLAYBOOK §5). This job reads the book's own files, never source text. Read `README.md` here first:
its rules bind every job.

**The brief gives:** the story folder; the author's picture choices in his words (a file he named
for a chapter, and the date he named it); anything never to touch.

First:
- Re-run `python3 history/tools/gate.py chapter stories/<slug> <n>` on every chapter. A "gated"
  status left by a run that was cut off proves nothing.
- From the chapters job's notes in `stories/_issues.md`, correct only `dossier.json`, `plan.json`
  and the summaries where the chapters found them wrong (`cite.py land` sets the outline from them).
- Set `cite.title` in `sources/index.json` for any source `cite.py check` notes.

Then:
1. **Pictures** (voice.md §14): one `history-picture-placer` subagent per chapter, one at a time, in
   the foreground. Up to three per chapter, real and free only; `images/candidates.json` holds the
   candidates. A picture the brief names goes where it says. Then `images.py check stories/<slug>`
   until it exits 0. Never `images.py illustrate` or `images.py approve`: only the author approves
   an illustration.
2. **The opening** (PLAYBOOK §5 step 4): a life opens with its subject's portrait; a domain may
   open on something else (its `jobs.md` § finish). Never set `portraitNone` yourself.
3. PLAYBOOK §5 from step 2:
   - `cite.py check` and `cite.py anchors --list`; fix only what they flag;
   - `images.py check`, then `maps.py render`;
   - `cite.py book`, then `cite.py land` (it creates every part in StoryMaker, reads each back and
     sets the outline);
   - `gate.py story stories/<slug>` until it exits 0;
   - the book editor: a `history-editor` subagent (§5 step 6), in the foreground.

**Done when** `gate.py story` exits 0 and the editor's letter is in.

**Report:** the StoryMaker project and its parts with word counts; the gates' results; the pictures
in each chapter and the opening; how many editor suggestions wait for the author; the editor's
letter in two lines; what you logged.
