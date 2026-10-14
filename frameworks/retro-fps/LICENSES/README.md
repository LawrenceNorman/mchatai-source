# Licenses for the retro-fps track

`dist/rfps.js` and `dist/rfps-data.js` combine the parts below. Taken together they are
**GPL-2.0-or-later**, because Woof! is. The complete corresponding source for the engine is
`../idtech1/source/woof-d419d31-web-src.tar.xz`, with the readable patch and build steps beside it.

| Part | Where it is | License | Text |
|---|---|---|---|
| Woof! engine | compiled into `woof.wasm` + glue | GPL-2.0-or-later | `GPL-2.0-Woof.txt` |
| Woof! resources (`woof.pk3`) | `rfps-data.js` | GPL-2.0-or-later (part of Woof!) | `GPL-2.0-Woof.txt` |
| Nuked OPL3 (music synth) | compiled in | LGPL-2.1-or-later | `LGPL-2.1-NukedOPL3.txt` |
| textscreen, SHA-1 | compiled in | GPL-2.0-or-later | `GPL-2.0-Woof.txt` |
| miniz | compiled in | MIT | `miniz-MIT.txt` |
| libspng | compiled in | BSD-2-Clause | `spng-BSD-2-Clause.txt` |
| yyjson | compiled in | MIT | `yyjson-MIT.txt` |
| libebur128 | compiled in | MIT | `libebur128-MIT.txt` |
| PFFFT | compiled in | BSD-style (FFTPACK) | `pffft-BSD.txt` |
| minimp3 | compiled in | CC0-1.0 | `minimp3-CC0.txt` |
| base64 (wpa_supplicant) | compiled in | BSD | `base64-BSD-wpa_supplicant.txt` |
| MD5 (Colin Plumb) | compiled in | public domain | none needed |
| SDL 3.4.2 | compiled in | zlib | `SDL3-zlib.txt` |
| Emscripten runtime and libc | compiled in, and the JS glue | MIT / University of Illinois NCSA | `Emscripten-MIT-NCSA.txt` |
| Freedoom 0.13.0 art, sound and music (maps removed) | `rfps-data.js` | BSD-3-Clause | `Freedoom-COPYING.txt`, `Freedoom-CREDITS.txt` |

OpenAL Soft's public headers are used at compile time only (to declare extension constants); no
OpenAL Soft code is compiled in. Sound runs on Emscripten's own OpenAL implementation.

Levels that games write in `<script type="text/x-retro-fps-map">` blocks are data the engine loads.
They are the game author's own work, not part of the engine.

## When a game is published

A published game carries the engine, so its page must point to this source. The header comment at
the top of `dist/rfps.js` and `dist/rfps-data.js` names this directory, and every game page that loads
them keeps that comment.
