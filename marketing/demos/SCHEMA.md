# Marketing Demo Schema

> Every file in this directory is a **data-driven marketing demo** for the mChatAI iOS app.
> Adding or tweaking a demo is a git PR — no iOS rebuild required.

## File layout

- `chat.json` — Chat surface focused demo
- `todo.json` — AI ToDo applet
- `aiwrite.json` — AI Write
- `<applet>.json` — one focused 30-60s clip per applet

The iOS XCUITest at [`ScriptedDemoFlow.swift`](../../mchatai/mChatAI/mChatAIUITests/Demos/ScriptedDemoFlow.swift) reads ONE active demo at a time from `/tmp/mchatai-demo-active.json` (placed there by the orchestrator script) and executes each scene's actions while writing a narrated sidecar.

## Top-level shape

```json
{
  "schemaVersion": 1,
  "flowName": "ChatDemoFlow",
  "description": "Focused 45-60s clip of the Chat surface ...",
  "scenes": [ /* DemoSceneDef */ ]
}
```

- `schemaVersion` — bump only on breaking changes. iOS test enforces.
- `flowName` — used in sidecar + final artifact directory naming (e.g. `marketing/drafts/<flowName>-<stamp>/`).
- `description` — free-form, shown in QA reports.
- `scenes` — sequential list, each one narration + UI actions + optional visual validation.

## Scene shape

```json
{
  "name": "Tap Chat",
  "narration": "Tap Chat to start a conversation.",
  "requires": ["Apple Foundation LLM", "Enter message"],
  "fallbackNarration": "Tap Chat to open the chat surface.",
  "actions": [
    {"type": "tapCard", "id": "chat-card"},
    {"type": "beat", "seconds": 3.0}
  ]
}
```

- `name` — short label, appears in test activity reports and screenshot filenames.
- `narration` — the line the narrator will read while the body plays. Match the visible screen state at the time of speaking — **lying about what's on screen is the bug this whole flow exists to prevent.**
- `requires` (optional) — accessibility identifiers OR label substrings that MUST be findable on screen AFTER the actions run. Case-insensitive CONTAINS match across staticTexts / buttons / otherElements / cells / textViews / navigationBars, plus a `value`-predicate pass for text-input contents. If empty / missing, no validation.
- `fallbackNarration` (optional) — alternative line used if any of `requires` are missing. If absent, the intended narration is used anyway with a soft warning.
- `actions` — UI steps that drive the simulator. Run in order.

## Supported actions

Each action is a JSON object with a `type` field. The iOS test target owns the executable behaviors; add a case in [`DemoSceneDefinition.DemoAction`](../../mchatai/mChatAI/mChatAIUITests/Support/DemoSceneDefinition.swift) when a new behavior is needed.

| Type | Required fields | Behavior |
|---|---|---|
| `beat` | `seconds` (Double) | Wait N seconds. Camera-readable hold. |
| `tapCard` | `id` (String) | Tap a feature card on home by accessibility identifier (e.g. `chat-card`). Scrolls if not visible. |
| `tapButton` | `match` (String) | Tap a button whose accessibility label CONTAINS the substring (case-insensitive). |
| `tapNavBarButton` | `label` (String) | Tap a nav-bar button by exact label (e.g. `Done`, `Save`). |
| `tapTextInput` | `placeholder` (String) | Focus a text input whose placeholder CONTAINS the substring. Leaves focus active for subsequent `type`. |
| `type` | `text` (String) | Type a literal string into the currently focused input. |
| `typeReturn` | — | Press the keyboard's Return / Send / Go key (whichever the active field surfaces). |
| `navigateBack` | — | Tap the leading nav-bar button (back chevron). |
| `swipeUp` / `swipeDown` / `swipeLeft` / `swipeRight` | — | Swipe gestures on the app frame. |
| `longPress` | `match` (String), `durationSec` (Double, default 1.0) | Long-press the first element whose label CONTAINS the substring. Used for opening SwiftUI context menus. |
| `tapMenuItem` | `label` (String) | Tap an item in an open context menu by label. |

## Authoring a new demo

1. Decide the ONE feature this clip showcases (don't try to cover three at once).
2. Sketch 6-10 scenes, each ~3-6 seconds. End on a return-to-home so the clip composes cleanly into a reel.
3. Write narration that matches the screen — don't claim "Anthropic, Google, Meta" if the picker only shows two options.
4. For each scene, add `requires` matching what should be visible AFTER its actions complete. The iOS validator will catch hallucinations.
5. Add a `fallbackNarration` for scenes where reality might differ (e.g. typing only works when a text input is present).
6. Run: `mchatai_macOS/scripts/marketing/record-and-narrate.sh <name>` (where `<name>.json` matches your file).
7. Review the QA records in the sidecar JSON for any scenes that needed fallback or warned. Iterate.

## Validation rules to keep demos honest

- Every narration claim about content on screen MUST have a matching `requires` substring.
- Every narration claim that depends on a transient state (e.g. "and the answer comes back") needs a `fallbackNarration` for the simulator/offline case.
- Never name a model / provider / feature that isn't actually on screen.
- Use accessibility IDs (`chat-card`) for stable hooks; use label substrings (`Apple Foundation LLM`) for verifying user-visible text.
- Prefer pure visual storytelling over voiceover that "explains" something the viewer can't see.
