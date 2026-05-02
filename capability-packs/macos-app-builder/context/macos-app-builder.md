# macOS App Builder Capability Pack

Use this pack when AIWizard is generating, fixing, testing, or packaging a native macOS app.

## Product Rules

- Generate a Swift Package or Xcode-compatible SwiftUI macOS app, not HTML or UIKit.
- Prefer explicit macOS scenes: `WindowGroup`, `Window`, `Settings`, `MenuBarExtra`, or `DocumentGroup`.
- Design for pointer, keyboard, menu commands, toolbars, sidebars, and multiple windows.
- Keep non-trivial apps multi-file from the first generation: App, Views, Models, Stores, Services, Support.
- Use system-adaptive colors and materials. Avoid fixed white backgrounds unless the user requested a fixed theme.

## Build Contract

- Output a complete `macosapp` artifact with `Package.swift` and source files.
- Build success alone is not a completion signal.
- The generated app must run, emit lightweight smoke-test output, and produce a screenshot or runtime status that can be evaluated.
- Native apps need Open App / Reveal in Finder semantics, not an inline web preview.

## Native Lego Component Contract

When the context includes a `macOS Components Recipe`, that recipe is mandatory, not inspirational. Build the app as source-copy composition:

- Add a root `files` entry named `mchatai-macos-components-used.json`.
- Copy each selected component source file verbatim into `Sources/<TargetName>/MChatAIComponents/<ComponentFile>.swift`.
- Preserve the `BEGIN mChatAI macOS Component` and `END mChatAI macOS Component` comments in copied files.
- Put only app-specific SwiftUI/AppKit glue in `ContentView.swift`, `Views/*.swift`, `Models/*.swift`, or the `@main` app file.
- Never rewrite the copied engines into a monolithic replacement just because it seems shorter. The Lego gate rejects apps that compile but do not prove source-copy provenance.

The marker file is an actual file in the `macosapp.files` dictionary, for example:

```json
"mchatai-macos-components-used.json": "{\"recipe\":\"recipe.native-word-game\",\"components\":[\"wordgame.lexicon\",\"wordgame.engine\"],\"mode\":\"source-copy\"}"
```

## QA Flywheel

1. Generate files.
2. Compile/package through the playground or shell bridge.
3. Run the app.
4. Inspect stdout/stderr and playground status/log.
5. Capture screenshot when possible.
6. Evaluate against the feature manifest.
7. Feed compile/runtime/eval failures into the next fix turn.

## Common Failure Recipes

- If a window never appears, check scene choice, `WindowGroup` launch behavior, app activation policy, and menu-bar-only assumptions.
- If keyboard input fails, avoid unsupported `.onKeyPress(keys: .letters, ...)`; use stable focused keyboard handling for the target macOS version.
- If word games reject every guess, add a larger dictionary or a permissive fallback for valid-length guesses.
- If generated string literals are corrupted, sanitize quotes and apostrophes before rebuilding.
- If the app compiles but runtime output is empty, add a lightweight smoke path that exercises core state transitions.
