# Example ↔ Recipe Reconciliation (Move 5c, 2026-06-11)

## Corrected failure count: **6/36, not 25/36**

The optimization survey reported 25/36 examples failing `tests/check_component_usage.mjs`. Measured directly (no-arg invocation, all 36), the real number is **6 fail / 30 pass**. The 25/36 figure was stale — record the corrected number so the hard gate's authority isn't undermined by a phantom "most examples fail" belief.

```
PASS=30  FAIL=6
FAIL: blackjack, cribbage, poker, spades   (selected component import paths not found in source)
FAIL: candy-match                           (marker missing required entities.level-progression)
FAIL: word-quest                            (marker missing required effects.board-shake + effects.score-rise)
```

## Root cause (important — do NOT fake-fix)

All 36 `examples/*/index.html` are **thin marker manifests** (0–4 KB, zero `import` statements, zero inline component bodies) — they declare a `mchatai-web-components-used` marker, not a full app. In `mode: "module-imports"`, the validator additionally requires each declared component's catalog **`path` string to literally appear in the stub source** (`sourceText.includes(component.path)`). The 6 failures are stubs missing 1–3 of those path strings (and, for candy-match/word-quest, missing a required component id in the marker too).

**The fix is to regenerate the stubs from their canonical hosted sources** (so the marker + path list reflect what the real app at `mchatai.com/hub/<id>/play` actually composes) — NOT to append fake `// entities/Foo.js` path comments to satisfy the substring check. Adding decorative path strings to make the validator green is exactly the spoofed-marker behavior the validator exists to catch; it would erode the gate's authority (the survey's own risk note). Treat this as a deliberate stub-regeneration chore, not a quick patch.

## Per-example fix recipe (for the regeneration pass)

| Example | Action |
|---|---|
| candy-match | Regenerate marker to include `entities.level-progression` (recipe.match3 requires it) + ensure all path strings present. The level trio (Move 5a) is now the canonical progression path. |
| word-quest | Add `effects.board-shake` + `effects.score-rise` to the marker + source path strings. |
| blackjack / cribbage / poker / spades | Regenerate from hosted source so every declared card component's path string is present. If a hosted source genuinely omits a component, drop it from the marker rather than faking it. |

Alternatively, if these stubs are meant to be *manifest-only* (not full apps), add a `mode: "manifest"` to the validator that checks marker↔recipe consistency **without** the path-inclusion requirement — a one-line validator change that legitimately distinguishes "reference manifest" from "shipped artifact." That is the cleaner systemic fix and is preferable to per-stub edits.

## Not in scope for the data fix

Two card games (and several others) embed SwiftUI-flavored guidance via the genre wisdom packs (`.spring(response:)`, `ContentView`, `AVAudioPlayer`) that targets *macOS* mini-apps, not web. That cross-platform contamination is flagged in `docs/CONTEXT_LAYER_AUDIT.md` (Move 4) and is a wisdom-pack consolidation concern, separate from this marker reconciliation.
