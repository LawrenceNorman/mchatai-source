# versus-fighter — a 1v1 fighting-game track

A fixed fighting runtime where the AI writes each game as data (fighters, moves, stages), the way
`frameworks/retro-fps` does for shooters. Design and status: `mchatai_macOS/docs/VERSUS_FIGHTER_TRACK.md`.

**Status (2026-10-15): VF.0–VF.1.** Not routed yet: no goal reaches this track until VF.3.

- `runtime/vf-runtime.js` — the engine (`VersusFighter.mount(el, game)`, `VersusFighter.state()`).
- `sprites/<base>/` — a CC0 sprite set cut into named animations: `map.json` (hand-mapped frame
  ranges and active windows), `atlas.png` + `atlas.json` (built by `tools/vf-slice.py`).
- `tools/vf-build.py` — writes `dist/vf.js` and `dist/vf-base-<base>.js` (atlas + recolor palette +
  sheet as a data URI, so recoloring works under file://).
- `examples/demo.html` — three original fighters on the Ava base (run `tools/vf-build.py` first).

Rebuild after changing a map or the runtime:

    python3 tools/vf-slice.py sprites/ava/map.json <AvaLee-sheet.gif>
    python3 tools/vf-build.py

Art: the Alpha Strikers sprites by Puffolotti, CC0 (see `LICENSES/`). Fighter and move names in
games must be original.
