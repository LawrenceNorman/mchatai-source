# godot

Godot 4.7.2 games as mChatAI mini-apps, with Mac and Windows builds from the same project. A game's
web build becomes **one `index.html`** (the game's pack inside it) that loads the **shared engine** from
`./libs/`, the same shape as `retro-fps`: it installs, versions, previews and publishes like any
mini-app, and every published game shares one cached copy of the engine.

- Building one (the agent's guide): `CONTEXT.md`.
- The build profile mChatAI+ reads: `manifest.json` (engine pin, flavors, libs, page limit, devices).
- Plan and decisions: `mchatai_macOS/docs/GODOT_LANE_PLAN.md` §11.

## Layout

| Path | What it is |
|---|---|
| `manifest.json` | the build profile: engine version, the three flavors (web, macos, windows), the libs, the 25 MB page limit, default devices |
| `dist/godot-4.7.2.js` | Godot's engine JavaScript, unchanged (0.28 MB) |
| `dist/godot-4.7.2-files.js` | the engine's wasm (gzip+base64) and its two audio worklets (13.4 MB) |
| `dist/VERSION.json` | the template's sha256s and the dist files' sizes and sha256s |
| `template/` | the smallest game in the right shape: three export presets, words in `content/ui.json`, a headless test, a `--screenshot` hook |
| `tools/build_all.py` | builds every flavor: page + libs + `builds/` + `builds/build.json` |
| `tools/pack_web.py` | turns a Godot web export into the page + libs |
| `tools/build_dist.py` | rebuilds `dist/` from the official `web_nothreads_release.zip` |

## How a game gets made, installed and published

1. **Building.** A Goal that names Godot points the CLI here (`harness/prompts/cli-project-context.md`).
   It works in `game/`, runs `tools/build_all.py`, and ends with a `miniapp` fence that names the page
   (`"htmlFile": "index.html"`) because the page is too big to paste.
2. **Installing.** mChatAI+ reads the page from the build's working folder (GD.7a), then its WEBLIB step
   (`frameworks/_index/web-libs.json`, entries `godot-4.7.2` and `godot-4.7.2-files`) copies both engine
   files into the mini-app's `libs/`. The game then runs offline from `file://`.
3. **Loading.** The page's loader answers Godot's `fetch()` of its wasm and its pack, and its
   `audioWorklet.addModule()` of the two worklets, from memory (worklets as `data:` URLs: a `file://`
   page has an opaque origin, and Chromium refuses a worklet from `blob:null`). Nothing is read from
   disk, so no fetch→XHR shim is needed.
3b. **The page frame.** HTML controls around the canvas, because everything inside a Godot game is drawn on
   it and a page check (or a hand) would find nothing to press: a start screen (name, premise from `--blurb`
   or the project's `config/description`, a loading bar, Play), a Full screen button in the corner during
   play, and "Play again" if the game quits. Play only uncovers the canvas and gives it the keyboard.
   (Added by a Harness build of Alesia, reviewed and kept 2026-11-18.) The start screen's HTML opens the
   `<body>`, ahead of the pack, and the loader names each step under its bar ("Unpacking the engine…",
   "Starting the game…"): before 2026-11-21 the pack came first and a phone showed a blank page until it
   had read all of it (Lawrence on iOS: "I thought it was hung"). Measured on a 6×-throttled iPhone 13
   emulation: the start screen in 0.16 s instead of 1.2 s, ready in 8.8 s instead of 10.3 s.
4. **Publishing.** Publishing rewrites `./libs/<file>.js` to `https://mchatai.com/v/lib/<file>.js`, so both
   dist files must be hosted under `mchataiweb/public/v/lib/` before a Godot game is published (GD.8).
   The page itself must stay under the Hub's 25 MB.
5. **Native builds.** `builds/mac/*.zip` (an unsigned universal .app unless the preset signs) and
   `builds/windows/*.zip` (an unsigned x86-64 .exe with the pack embedded) are downloads, not Hub items.
   Notarizing, Windows code signing and store uploads are the owner's decisions.

## Measured (2026-11-18)

- **Alesia, 52 BC** (`pivotal-games/gallic-war`): web page 21.1 MB (pack 15.9 MB inside), libs 13.7 MB;
  boots from `file://` in headless Chromium (title drawn, Begin opens Act 1, no errors) and in a WKWebView
  with the mini-app runtime's two file-access prefs (title drawn, no errors).
- **The template:** all three flavors build in 24 s; page 64 KB; the Mac zip holds `My Game.app`; the
  Windows zip holds a PE32+ x86-64 GUI executable. Not yet run on Windows.
- `dist/` equals what `pack_web.py` writes into a game's `libs/`, byte for byte.

## Maintenance

```bash
python3 tools/build_dist.py            # after installing a new Godot version's templates (then bump manifest.json)
```

A new engine version is a new pair of files (`godot-<v>.js`, `godot-<v>-files.js`), new `web-libs.json`
entries and new hosted files; games on the old version keep working.
