# Job: video

Make one episode's video draft: what each line can show, the pictures for it, a contact sheet, the
AI Slides deck that is its storyboard, and the Video Recorder project (pictures that move,
captions on), exported (PLAYBOOK §7 steps 5–9). The author looks at the contact sheet and watches
the draft before it goes anywhere. Read `README.md` here first: its rules bind every job.

The video reads the podcast's lines, so it says what the podcast says. Every picture is real and
free to use, with a caption built from its own record that says what it is and when; that is what
`visuals.py check` holds.

**The brief gives:** the story folder and the episode number; the author's direction for this
episode in his words: a picture he asked for (its Commons file name), a picture he rejected, "the
deck exists, update it".

1. `podcast/episodes.json` must exist (`narration.py episodes`). `python3 history/tools/publish.py
   status stories/<slug>` shows what this episode already has.
2. **A rejected picture** goes in `video/broll-rejected.json` (a JSON list of its "File:…" names)
   before anything is searched.
3. **The things pass** (your own judgement, the one model step): `python3 history/tools/visuals.py
   things stories/<slug> <n>` prints the task and the numbered lines. Write `video/things-<n>.json`
   exactly as it says. Every `thing` is words copied from its line. Give `match` words wherever a
   search could take the wrong thing (a ship named *Gaul* is not the Gauls; a 1799 siege of Acre is
   not this one). Then `visuals.py things stories/<slug> <n> --check` until it says CLEAN.
4. `python3 history/tools/visuals.py find stories/<slug> <n>`: Commons pictures for what the story's
   own pictures do not cover. Free licences only, wide enough for video, each captioned from its
   own record. A lookup is made once and kept.
5. `visuals.py beats stories/<slug> <n>`, then `visuals.py check stories/<slug>` until it exits 0.
   `check` holds each caption to its own record; it cannot tell whether the picture is the right
   subject for its line. So **look at every Commons beat's picture against its line** (open the file
   under `video/broll/`). A wrong subject or a wrong event goes in `video/broll-rejected.json`: a
   Battle of Magnesia relief for a Gallic charge, a sword-belt fitting named for its amphora shape,
   "Alesia-type" brooches found in England, a modern museum building for an 1860s dig (all found on
   Alesia, 2026-10-20). Log each one in `stories/_issues.md` with its line and why: the list also holds
   the author's rejections, and the log says whose each is. Then run `beats` again; a line whose
   picture was rejected holds on the story's own pictures, which is the right fallback.
6. `visuals.py sheet stories/<slug> <n> stories/<slug>/video/sheet-<n>.html`: the contact sheet,
   every beat's words, picture, caption and licence, for the author.
7. `python3 history/tools/deck.py plan stories/<slug> <n> --beats`, then `deck.py push
   stories/<slug> <n>`. When `project.json` already has this episode's deck (`video.<n>.deck`; the
   status shows it), push `--into <that deck>`: updating it in place keeps every voiced line in the
   Video Recorder. A `video/deck-<n>.json` with no deck in `project.json` is a leftover from an
   earlier pipeline: `plan` makes it afresh. Push prints the deck's link and the
   `aividrecorder.fromDeck` call to make.
8. **The Video Recorder.** A new episode: run the printed `fromDeck` call exactly as printed,
   through `./mchatai raw` with `--wait 900` (the voice, the cap, the pacing, the end card's hold).
   An episode that has a Video Recorder project already (`publishing.<n>.video.recorder`): call
   `aividrecorder.updateFromDeck {id}` instead; only changed lines are voiced again. If either says
   "NOT narrated", call `aividrecorder.narrate {id, provider: "openAI", voice: "onyx",
   maxCharacters}`: only lines without a take are sent.
9. `aividrecorder.export {id, preset: "youtube"}`: an mp4 with the captions in it, and an `.srt`
   beside it. Its reply names the file.
10. `python3 history/tools/deck.py description stories/<slug> <n>`: `video/description-<n>.txt`,
    every picture's credit and source, for the upload.
11. `python3 history/tools/publish.py record stories/<slug> <n> video recorder=<id> export=<file>
    sheet=video/sheet-<n>.html`.

**Updating an episode that has a video** (the author's changes, or the tools improved): the lines
and the pictures already found stay. Put any picture he rejected in `video/broll-rejected.json`, run
`find` only if he asked for a new picture, then from step 5: `beats`, `check`, `sheet`, `deck.py plan
--beats`, `deck.py push --into <the episode's deck>`, `aividrecorder.updateFromDeck {id}` (only changed
slides are drawn again, and a line that did not change keeps its voice), `export`, `description`,
`publish.py record`. Report what changed on screen, slide by slide.

**Done when** `visuals.py check` exits 0, every Commons picture has been looked at against its
line, and the export exists. Never upload it anywhere.

When a story read fails ("could not read the story back"), another job's long app call (`fromDeck`,
`narrate`, `export`) is holding the app: run the command again once it finishes.

**Report:** the beats and the length; how many pictures of each kind (the book's, Commons, maps,
cards) and how many holds; `visuals.py check`'s result; the contact sheet, the export and the
description (their paths), and the deck and Video Recorder links; what the voice cost; any line with
nothing worth showing; what you logged.
