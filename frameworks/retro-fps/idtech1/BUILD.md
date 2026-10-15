# Building the engine (Woof! for the browser)

The engine in `../dist/` is Woof! at commit `d419d3167a3e1bfb345f8d71dbc76ef3f2806189`
(github.com/fabiangreffrath/woof, GPL-2.0-or-later) with `woof-web.patch` applied, compiled by
Emscripten 6.0.12.

- `source/woof-d419d31-web-src.tar.xz` is the complete corresponding source: that commit with the
  patch applied, plus OpenAL Soft 1.24.3's public headers in `web/AL/`. It leaves out the upstream
  directories the browser build never reads: soundfonts, examples, docs and the vcpkg overlays.
- `build.sh` rebuilds from that archive and regenerates `../dist/`. A rebuild produces a
  byte-identical `woof.wasm`. `woof.pk3` is a zip with the same 236 files and CRCs; only the file
  timestamps inside it differ.
- `woof-web.patch` is the same change as a readable diff against upstream.

## What the patch changes, and why

| Change | Why |
|---|---|
| CMake: SDL3 from Emscripten's port; OpenAL from Emscripten's Web Audio implementation, compiled against OpenAL Soft's headers; SDL3_net stubbed (`src/nw_web.c`); setup tool, man pages and packaging skipped | Woof requires all three libraries. Emscripten's own AL headers stop at core OpenAL 1.1, and Woof looks up every extension at run time, so the absent ones are already handled. |
| Link flags: `MODULARIZE`, `DYNAMIC_EXECUTION=0`, `INCOMING_MODULE_JS_API` including `wasmBinary`, 4 MB stack, memory growth | `DYNAMIC_EXECUTION=0` keeps `eval` and `new Function` out, so the mchatai.com upload scanner passes the glue. Without `wasmBinary` listed, a release build ignores the bytes the page hands it and fetches `woof.wasm`, which fails on `file://`. |
| `d_main.c`: the browser drives the main loop (`emscripten_set_main_loop`), uncapped, with no screen wipe | A wipe runs its own blocking frame loop, which a page cannot present from. |
| `i_video.c`: ask SDL for the `opengles2` renderer, then `software` | SDL otherwise picks its software renderer, which scales every frame on the CPU through a 2D canvas. WebGL scales on the GPU, and mChatAI's install check looks for a WebGL context. |
| `i_oalmusic.c`: music is pumped once per frame; the queue is primed before play; `AL_MAX_GAIN` is capped at 1 | There are no threads under `file://`. The web OpenAL follows the 1.1 spec and rejects a gain above 1. |
| `i_oalsound.c`: non-positional sounds get `AL_MAX_DISTANCE` 1, not 0 | Web Audio's `PannerNode` throws on `maxDistance` ≤ 0; with rolloff at 0 the value is inaudible. |
| 82 state actions widened to three parameters (`fix_action_arity.py`) | The engine calls every action as `p3(mobj, player, psp)`. Native code ignores extra arguments; WebAssembly traps ("function signature mismatch") the first time a monster acts. |
| `src/rfps_web.c` (new), exported with `_main`: `rfps_pause`, `rfps_set_volume`, `rfps_new_game`, `rfps_state`; `RFPS_WebFrame()` runs at the top of each browser frame | The page's start card and pause menu pause the game, switch music and sound, change difficulty and restart the level, and read the player's state (death hint, tests). Music switched off is paused rather than played silently, including after a level change. |
| `onExit` added to `INCOMING_MODULE_JS_API`; `UTF8ToString` exported | A release build otherwise ignores the page's `onExit`, and the page reads `rfps_state`'s JSON as a string. |

Things the runtime (`../runtime/rfps-runtime.js`) handles instead of the engine:
- The windowed config, so SDL sizes the canvas from the page's CSS.
- `!important` on the canvas size. When SDL recreates its window for WebGL, it leaves an inline 1px
  size behind and then stops following the page.
- A minimum hold of three tics on touch buttons. A quick tap otherwise presses and releases inside
  one tic and never fires.
- `dynamic_resolution 0` and a fixed `current_video_height` (600, or 400 on touch screens). Dynamic
  resolution compares each frame with the display's refresh, but a browser frame includes the wait
  for the next animation frame, so it fell to 400 lines within seconds and kept changing.
- Mouse movement reaches the engine only while the pointer is locked to the canvas. The engine reads
  relative motion every frame even with `grabmouse 0`, so any cursor or trackpad move over the page
  spun the view. A click on the game asks for the lock; losing it opens the pause menu.
- Key bindings in the config: Space, Ctrl and a click fire, E uses, Q changes weapon. The engine's
  defaults put use on Space, the first key a new player presses to shoot.
- An empty `M_PAUSE` patch in the game WAD, so the engine's PAUSE title does not sit above the
  page's menu, and the page title is kept (SDL sets it to "Commercial mode - Woof ...").

## Moving to a newer Woof

1. Check out the new commit and apply `woof-web.patch`. Resolve any rejects.
2. Run `python3 fix_action_arity.py <woof>/src`. New one-parameter actions get widened; the script
   is idempotent.
3. Build, then play `../examples/outpost-alpha/` in a browser and in the WKWebView probe. Check:
   - it boots;
   - a monster acts;
   - doors open;
   - music plays;
   - the canvas buffer equals its CSS size × devicePixelRatio.
4. Make a new source archive from the patched tree, update the commit in `build.sh` and here, and
   rebuild `dist/`.
