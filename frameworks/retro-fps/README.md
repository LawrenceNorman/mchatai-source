# retro-fps

Classic first-person shooters for mChatAI mini-apps and the mchatai.com hub. The engine is Woof!
(a Doom source port, GPL-2.0-or-later) compiled to WebAssembly; the art, sound and music are
Freedoom's (BSD-3-Clause). A game is one small `index.html` whose levels are text, so an agent
writes a whole game, and a campaign of several levels, without touching the engine.

- Writing a game: `CONTEXT.md`, and `examples/outpost-alpha/index.html` (two levels).
- Agent rules: `../../wisdom/packs/retro-fps.json` (injected for shooter goals).
- Licenses and corresponding source: `LICENSES/README.md`, `idtech1/`.

## Layout

| Path | What it is |
|---|---|
| `dist/rfps.js` | the runtime plus the engine's JavaScript glue (0.27 MB) |
| `dist/rfps-data.js` | engine wasm, Woof's resource pack and the Freedoom base art, gzipped and base64'd (11.6 MB) |
| `dist/rfps-names.json`, `dist/VERSION.json` | the texture, flat and music names; versions, sizes and sha256s |
| `runtime/rfps-runtime.js` | the runtime source: the level compiler, boot, canvas sizing, touch controls |
| `tools/build_dist.py` | rebuilds `dist/` |
| `tools/rfps-check.js` | checks the levels in a page with Node |
| `idtech1/` | engine source archive, patch, build script and notes |
| `examples/` | complete games |
| `LICENSES/` | the license of every part |

## How a game gets made, installed and published

1. **Writing.** A shooter goal injects the `retro-fps` wisdom pack. The agent writes an
   `index.html` that holds the levels and loads `./libs/rfps.js` and `./libs/rfps-data.js`.
2. **Installing.** mChatAI+'s WEBLIB step (`frameworks/_index/web-libs.json`, entries `rfps` and
   `rfps-data`) copies both files from `dist/` into the game's `libs/` folder. The game then runs
   offline from `file://`.
3. **Playing.** The runtime compiles the level text in the page and boots the engine with WebGL.
   The canvas follows the page's size. Phones get a joystick, turn-by-drag and FIRE / USE / GUN /
   MAP buttons.
4. **Publishing.** Publishing rewrites `./libs/<file>` to `https://mchatai.com/v/lib/<file>`, so both
   files must be hosted there (under `mchataiweb/public/v/lib/`) before a retro-fps game is published.
   Every published game then shares one cached copy of the engine.

## Maintenance

```bash
python3 tools/build_dist.py                       # after editing runtime/rfps-runtime.js
node tools/rfps-check.js examples/outpost-alpha/index.html
idtech1/build.sh                                  # after changing the engine (needs Emscripten 6.0.12)
python3 tools/build_dist.py --freedoom freedoom2.wad   # new Freedoom release (maps and demos are stripped)
```

When `dist/` changes, play `examples/outpost-alpha/` in a browser and on a phone-sized touch screen
before committing.

## Measured (2026-10-14)

- **Chromium from `file://`:** 60 fps. WebGL on, and the canvas buffer equals its CSS size × the
  device pixel ratio, both on desktop and on an 844×390, 3× phone.
- **The WKWebView that installed mini-apps use:** same result, but 30 fps on a Mac in Low Power
  Mode, where WebKit caps animation frames.
- **An iPhone:** not measured yet.
