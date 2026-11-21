# Godot games in the Harness — build context

Read this when the Goal names **Godot** (or continues a Godot build). A Godot game here is a **mini-app**
(its web build, one `index.html` with the game inside) plus **native downloads** (a Mac app and a
Windows game) from the same project. Pinned engine: **Godot 4.7.2** (`manifest.json`).

## The working folder

```
game/            the Godot project (project.godot, scenes, scripts, content/*.json, tests/)
index.html       the mini-app page: written by the build, never by hand
libs/            the shared engine (godot-4.7.2.js, godot-4.7.2-files.js): written by the build
builds/          builds/mac/<Name>-mac.zip, builds/windows/<Name>-windows.zip, builds/build.json
```

- **New game:** `cp -R <FRAMEWORK>/template game`, then set `config/name` in `game/project.godot` and
  `application/bundle_identifier` in `game/export_presets.cfg` (`com.mchatai.games.<slug>`).
- **An existing project the Goal names by path:** build FROM that path (`build_all.py <path> .`). Do not
  copy it in and do not edit it unless the Goal asks for changes; changes go to that project.
- **A follow-up turn:** change the project, then build again. The page and the downloads are rebuilt.

`<FRAMEWORK>` is the folder this file is in.

## Build (every turn that changes the game)

```bash
godot --headless --path game --import                                  # first time, and after new assets
godot --headless --path game -s res://tests/run_tests.gd               # must exit 0
python3 <FRAMEWORK>/tools/build_all.py game . web,macos,windows        # page + libs + downloads
```

Add `--blurb "<the premise in a sentence or two>"` to `build_all.py` (else it uses the project's
`application/config/description`): the page opens on a **start screen** with the game's name, that premise,
a loading bar and a **Play** button, plus a **Full screen** button that stays in the bottom-left corner
during play. Those are real HTML buttons: everything inside a Godot game is drawn on its canvas, so
without them the page has nothing a page check can click. Play only uncovers the canvas and gives it the
keyboard; the game is unchanged. If the game quits on the web, the page shows "Play again".

`build_all.py` checks the Godot version, exports each flavor from the project's presets, packs the web
export into `./index.html` (the game's pack inside, gzip+base64) with the engine in `./libs/`, zips the
native builds, and writes `builds/build.json`. It refuses a page over the Hub's 25 MB and says what to
shrink. Nothing here signs or notarizes: those are the owner's.

## Output — the page is a FILE

The page is ~1–25 MB, far too big to paste. End with the usual fence, but name the page instead of
carrying it:

```miniapp
{
  "id": "com.mchatai.wizard.<slug>",
  "name": "<Game name>",
  "manifest": "<one-line description>",
  "htmlFile": "index.html"
}
```

Never put the page in `html`, and never paste `libs/` or the pack. The Harness reads `index.html` from
this folder and vendors `./libs/` itself.

## Rules (each has a check)

1. **All player text lives in `content/*.json`**, never in `.gd` (a history game also runs its facts check).
2. **Full-screen controls:** `set_anchors_and_offsets_preset()`, never `set_anchors_preset()` (keeps a zero size).
3. **Typed arrays:** never assign a ternary or a literal from another script to `Array[T]`; use `.assign([...])`.
4. **The web build:** renderer `gl_compatibility`, thread support off (the template's presets). Hide any
   Quit button when `OS.has_feature("web")`.
5. **Screenshots:** the game takes its own (`--screenshot <path>`, in the template). After the build, run
   `godot --path game --resolution 1280x800 -- --screenshot shot.png` and LOOK at it before finishing.
   A hidden window stops drawing on macOS: in your own capture loops use `await process_frame` plus
   `RenderingServer.force_draw(true)`, never `await RenderingServer.frame_post_draw`.
6. **Devices:** these games are built for a mouse or a large touch screen. Unless the Goal asks for
   phones, design for a computer or an iPad in landscape (the Hub marks them so).
7. **Size:** pictures as `.png`/`.jpg` under `game/`; keep the game's pack small enough that the page stays
   under 25 MB (the build says so if not). Big media belongs on a URL, not in the pack.
8. **Never** put a signing identity, an API key or a personal path into the project.
9. **Never edit this framework folder** (`tools/`, `template/`, `dist/`, this file) from a game build: a change here
   reaches every Godot game. If the build seems to need one, finish the game without it and say what the
   framework should change in your final message. (2026-11-18: a build added the page's start screen to
   `pack_web.py` on its own; the change was good and kept after review, but it is a separate, reviewed change.)
