# LoopStar — Loop Packs

Content for the mChatAI+ **LoopStar** applet (Experimental): a native loop-performance
and arrangement instrument. Six lanes (drums, hats, percussion, bass, music, fx),
bar-quantized launching, scenes, and transitions at a fixed per-pack BPM.

## Multi-pack layout

- `packs.json` — the pack index: `{id, name, bpm, manifest}` per pack. Add a pack
  by adding a directory with its manifest + WAVs and listing it here — no app
  rebuild needed.
- Each pack directory holds one manifest JSON plus its WAVs as siblings.
- Manifest filenames and WAV filenames must be **globally unique across all
  packs** (Xcode sync groups flatten the app's bundled Resources fallback into
  one flat directory), so each pack uses its own file prefix.

| Pack | Directory | Prefix | BPM | Bar (48 kHz) | Swing |
|---|---|---|---|---|---|
| Warehouse 128 (`loopstar-house-v1`) | `loops/` | `ls_` | 128 | 90,000 frames | straight (0.5) |
| Boom Clack 90 (`loopstar-boombap-v1`) | `boombap/` | `lsb_` | 90 | 128,000 frames | 0.58 |

## loops/ — "Warehouse 128" (`loopstar-house-v1`)

- 22 loops, 128 BPM, 4/4, key Am, 48 kHz stereo 16-bit WAV.
- Every file is an exact multiple of one bar (90,000 frames at 128 BPM/48 kHz).
- Every bar ends at true zero and starts from zero, so switching loops at any bar
  boundary is click-free by construction.
- `loopstar_manifest.json` describes the pack: loops (id, lane, bars, sceneHints,
  energy, oneShot) and the six default scenes (intro/groove/build/drop/breakdown/finale).
  Scenes are content — tune them via PR, no app rebuild needed.

## boombap/ — "Boom Clack 90" (`loopstar-boombap-v1`)

- 22 loops (20 groove loops + 2 fills), 90 BPM, 4/4, key Am, 48 kHz stereo 16-bit WAV.
- Every file is an exact multiple of one bar (128,000 frames at 90 BPM/48 kHz),
  with the same click-free bar-edge contract as Warehouse 128.
- **Swing:** 16th-note swing 0.58 is baked into the rendered audio — odd 16th
  steps are delayed so each 8th-note pair splits 0.58 : 0.42 (0.5 would be
  straight). The manifest does not carry a swing field; players just play bars.
- Voices: deep 808-style boom kick, crack snare, dusty swung hats, shaker + rim,
  sub-sine bass (root-heavy, slight portamento), mellow e-piano stabs, warm pad,
  vinyl-crackle texture, riser, impact.
- `loopstar_boombap_manifest.json` uses the same schema and the same six scene
  ids as Warehouse 128; the intro scene is beatless (keys + crackle only).

## Authoring

Both packs are 100% synthesized by a deterministic, pack-parametric generator
(byte-identical on every run) in the mChatAI macOS repo: `mchatai_macOS/scripts/loopstar/`.

```bash
cd mchatai_macOS/scripts/loopstar
swift run -c release loopstar-pack-gen <outdir> loopstar-house-v1
swift run -c release loopstar-pack-gen <outdir> loopstar-boombap-v1
```

The generator enforces: exact bar-multiple frame counts, silent bar edges
(click-free switch guarantee), RMS floor, per-pack file prefixes, and
manifest/scene cross-references. A pack is a `PackSpec` (id, name, bpm, key,
swing, file prefix, loop builders, scenes) rendered by shared machinery; the
step sequencer supports per-pack 16th swing. To change the sound, edit the
generator and regenerate — do not hand-edit WAVs.

Replacing a loop with an externally-authored WAV is fine as long as it keeps the
same frame-count and bar-edge contract; validate frame counts with `afinfo`.
