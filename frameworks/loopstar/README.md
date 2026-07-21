# LoopStar — Loop Packs

Content for the mChatAI+ **LoopStar** applet (Experimental): a native loop-performance
and arrangement instrument. Six lanes (drums, hats, percussion, bass, music, fx),
bar-quantized launching, scenes, and transitions at a fixed BPM.

## loops/ — "Warehouse 128" (`loopstar-house-v1`)

- 22 loops, 128 BPM, 4/4, key Am, 48 kHz stereo 16-bit WAV.
- Every file is an exact multiple of one bar (90,000 frames at 128 BPM/48 kHz).
- Every bar ends at true zero and starts from zero, so switching loops at any bar
  boundary is click-free by construction.
- `loopstar_manifest.json` describes the pack: loops (id, lane, bars, sceneHints,
  energy, oneShot) and the six default scenes (intro/groove/build/drop/breakdown/finale).
  Scenes are content — tune them via PR, no app rebuild needed.

## Authoring

The pack is 100% synthesized by a deterministic generator (byte-identical on every
run) in the mChatAI macOS repo: `mchatai_macOS/scripts/loopstar/`.

```bash
cd mchatai_macOS/scripts/loopstar
swift run -c release loopstar-pack-gen <outdir>
```

The generator enforces: exact bar-multiple frame counts, silent bar edges
(click-free switch guarantee), RMS floor, and manifest/scene cross-references.
To change the sound, edit the generator and regenerate — do not hand-edit WAVs.

Replacing a loop with an externally-authored WAV is fine as long as it keeps the
same frame-count and bar-edge contract; validate frame counts with `afinfo`.
