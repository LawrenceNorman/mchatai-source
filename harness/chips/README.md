# mchatai-source/harness/chips/

**Phase HC.1 — Harness Chip Catalog**

Declarative source for user-facing chip pill strips the AIWizard harness shows
during a wizard turn (Target Device, artifact-type tiebreaker, template-pick,
etc.). One JSON file per chip set. The Swift binary loads these at runtime via
`HarnessChipCatalog`; iOS will later read the same files through a synced
catalog (Phase HC.3+).

This directory exists so the **set of options + their labels/icons can change
without an App Store rebuild**, per CLAUDE.md Rule #1 ("binaries are
skeletons").

## Schema

```jsonc
{
  "id": "<chipSetID>",                    // matches the Swift call-site lookup key
  "version": 1,                           // bump on breaking schema change
  "prompt": "Target device?",             // header line shown above the chips
  "headerIconSystemName": "rectangle.stack.fill",  // optional SF Symbol next to prompt
  "renderHint": "vertical-row-of-cards",  // "horizontal-pills" | "vertical-row-of-cards" | "wrap"
  "options": [
    {
      "id": "mobile",                     // canonical id passed to the dispatch handler
      "title": "Mobile",                  // primary line (required)
      "subtitle": "Touch - phone",        // optional secondary line
      "iconSystemName": "iphone",         // optional SF Symbol (preferred over glyph)
      "help": "Phone-sized layout."       // optional hover tooltip
    }
  ],
  "freeformAllowed": true,                // if true, plain text typed in chat also routes through dispatch
  "freeformHint": "Or describe the device in chat."
}
```

## ASCII / UTF-8 policy

These JSONs are read by `JSONDecoder().decode(HarnessChipSet.self, ...)`,
which handles UTF-8 fine. The `gotchas_swift_decoder_non_ascii_strings.md`
issue is **specific to** the `SourceCatalogValue` decoder used by
`_index.json` files in `mchatai-source/games/`, `mchatai-source/genres/`,
etc. — that decoder uses `try?` on a heterogeneous value type and silently
drops records on non-ASCII strings.

For chip catalog files: ASCII is preferred for `prompt`, `title`, `subtitle`,
`help` (defensive against future loader rewrites), but the `glyph` field is
explicitly UTF-8 (emoji are the whole point of that field).

Validate locally if you want a quick non-glyph audit:

```bash
LC_ALL=C grep -P '[^\x00-\x7F]' mchatai-source/harness/chips/*.json | grep -v '"glyph":'
```

## Files

| File | Used by | Migrated |
|---|---|---|
| `target-device.json` | `pendingTargetDeviceQuestion` chip — VD.7.16 | Yes (HC.1) — legacy `TargetDeviceChipStrip` removed |
| `artifact-type.json` | `pendingArtifactTypeQuestion` chip — AT.5 | Yes (HC.2) — legacy `ArtifactTypeChipStrip` kept as catalog-miss fallback |

## Identified-but-not-yet-migrated chip sets

The mac binary has 6 other chip rendering surfaces. They are tracked here so
follow-up PRs know what's queued and why:

| Surface | Current location | Why deferred |
|---|---|---|
| `artifact-type` (AT.5) | `wizard/artifact-type-chips.json` — already catalog-driven via `ArtifactTypeChipCatalog` | Has its own loader; absorb into unified catalog in a later phase to avoid double-mutation. |
| `template-pick` (0d.34) | Enum `PendingTemplatePick.ChipDescriptor` with `.useThis / .seeSimilar(count) / .iterateFrom / .buildFromScratch` | Needs schema extension for dynamic option state (`seeSimilar` count, `iterateFrom` prefill, `confidencePercent` header). Phase HC.2. |
| `stuck-step` (Phase C) | `PendingStuckStep.chips` — dynamic per backend | Needs schema extension for runtime-injected chip lists. Phase HC.2. |
| `visual-picker` (VD.7) | Image carousel `VisualPickerCarousel` | Not pill chips — full image-tile picker. Out of scope for this catalog. |
| `endproduct-clarifier` (WX-K.3.d) | Custom card UI with style + model pickers | Not pill chips — composite form. Out of scope. |
| `action-buttons` (post-message) | `WizardMessage.actionButtons` — per-message `WizardAction` array | Different concept (post-completion affordances, not pre-decision steering). Tracked separately. |

## Dispatch

This catalog v1 owns **render only**. Dispatch — what happens when the user
taps an option — stays in Swift handlers (`handleTargetDeviceTap`,
`handleTemplatePickAltChip`, etc.). The chip set's `id` and an option's `id`
together identify which handler receives the tap; the binding lives in the
Swift call-site.

When iOS lands (Phase HC.3), the bridge will gain a structured
`chipSelection: { setID, optionID }` payload so iOS taps re-enter the same
mac-side dispatcher rather than being routed through free-text.
