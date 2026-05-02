# macOS Component Absorption Process

The native macOS Lego system extracts reusable SwiftUI/AppKit/SpriteKit source files from known-good generated apps.

## Flow

1. Promote or select a known-good native macOS app.
2. Extract one small primitive at a time into `components/<family>/`.
3. Add the component to `_index.json` with exports, contracts, recipe membership, and good-fit prompts.
4. Reassemble a golden example from copied components plus thin app-specific glue.
5. Run `tests/check_macos_component_usage.mjs` against the example before marking the component ready.

## Quality Bar

- Components are plain Swift source files copied into the generated SwiftPM target.
- Components must not define `@main`; the generated app owns scenes and app lifecycle.
- Components should compile without extra SPM packages unless the recipe explicitly declares dependency requirements.
- Component APIs should be narrow and documented in `_index.json`.
- Generated artifacts must include `mchatai-macos-components-used.json`.
- Copied component files must preserve the canonical `BEGIN mChatAI macOS Component` markers.
- Matching type names are not enough. The checker must find the canonical component source bodies.

## QA Loop

Run:

```bash
node mchatai-source/frameworks/macos-components/tests/check_macos_component_usage.mjs <generated-app-dir-or-json> <expected-recipe-id>
```

Treat checker failure as a Harness failure even if the Swift app compiles and launches. A compiling monolith is not a successful Lego composition.

## Current Families

- `recipe.native-word-game`: native five-letter word guessing apps with reusable engine, dictionary, keyboard, and smoke-test helpers.

## Planned Families

- Desktop shell: settings scenes, sidebar-detail shells, command routing, and menu-bar affordances.
- Productivity: local list stores, inspector panels, table editors, and export helpers.
- SpriteKit arcade: scene baseplate, keyboard/gamepad input, HUD, entity movement, and smoke-test hooks.
