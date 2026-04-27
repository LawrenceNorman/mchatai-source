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

