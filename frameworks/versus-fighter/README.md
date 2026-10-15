# versus-fighter — a 1v1 fighting-game track

A fixed fighting runtime where the AI writes each game as data (fighters, moves, stages), the way
`frameworks/retro-fps` does for shooters. Design and status: `mchatai_macOS/docs/VERSUS_FIGHTER_TRACK.md`.

**Status (2026-10-15): VF.0–VF.2 done (two bodies, projectiles, sharp rendering, WebKit check).** Not routed yet: no goal
reaches this track until VF.3.

- `runtime/vf-runtime.js` — the engine (`VersusFighter.mount(el, game)`, `VersusFighter.state()`).
- `sprites/<base>/` — a CC0 sprite set cut into named animations: `map.json` (hand-mapped frame
  lists, active windows, recolor groups, the body's feel), `atlas.png` + `atlas.json` (built by
  `tools/vf-slice.py`). Bodies: `ava` (an agile kickboxer: pixel art, Scale4x-smoothed at build
  time) and `komato` (an armored brute: a 3D render kept at full size). Both atlases are trimmed
  per frame and stored as palette PNGs. The runtime draws at the screen's resolution (capped at 3x
  the 384 x 216 game on touch devices, 5x on desktops); `"look": "pixel"` keeps the chunky pixels.
- `tools/vf-build.py` — writes `dist/vf.js` and `dist/vf-base-<base>.js` (atlas + sheet as a data
  URI, so recoloring works under file://).
- `tools/vf-preview.py` — draws every animation of a body as a strip with its hurt and hit boxes:
  the check after changing a map.
- `tools/vf-check.js` — validates a game page (exit 1 on errors).
- `examples/demo.html` — four original fighters on both bodies (run `tools/vf-build.py` first).

Rebuild after changing a map or the runtime:

    python3 tools/vf-slice.py sprites/ava/map.json <AvaLee-sheet.gif>
    python3 tools/vf-slice.py sprites/komato/map.json <32bits-spritesheet-blades.png>
    python3 tools/vf-preview.py sprites/komato /tmp/komato.png 1
    python3 tools/vf-build.py

Art: the Alpha Strikers sprites by Puffolotti, CC0 (see `LICENSES/`). Fighter and move names in
games must be original.
