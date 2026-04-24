# macOS SwiftPM App Scaffold

Reference scaffold for AIWizard-generated macOS apps shipped via Swift Package Manager. Use this template whenever the user asks for a "macOS app", "Mac app", "desktop app for Mac", or similar — and the chosen artifact type is `macOSApp`.

## When to use

- Artifact type = `macOSApp`
- Backend = any CLI (Claude Code / Codex / Gemini) running through the Meta.W runner
- Output target = a launchable `.app` bundle the user can double-click

## Files

| File | Role |
|---|---|
| `Package.swift` | SwiftPM manifest with one `executableTarget`. **Target name MUST match the directory under `Sources/` AND the `@main` struct's filename root.** |
| `Sources/<TargetName>/<TargetName>App.swift` | Holds the `@main struct <TargetName>App: App`. Contains the activation-policy + window-promotion init() that fixes the "built fine but no window" failure. |
| `Sources/<TargetName>/ContentView.swift` | Root SwiftUI view. Always declares an explicit `.frame(minWidth:, minHeight:)`. |
| `build_app.sh` | Builds the package, then assembles a proper `.app` bundle at `build/<slug>-v<NNNN>.app`. mChatAI+ FSEventStream watches this path. |
| `Info.plist.template` | Bundle metadata stamped into the produced `.app`. |

## The three failures this scaffold prevents

1. **"Built but no window appears."** `setActivationPolicy(.regular)` + `activate(ignoringOtherApps:)` + `promoteWindowWhenReady()` ensures the window comes to the foreground. See wisdom rule `mac-001`.
2. **"Linker error `_<TargetName>_main` not found."** Target name, directory name, and `@main` filename root all agree. See `mac-005`.
3. **"User can't open the result."** `build_app.sh` produces a versioned `.app` bundle (not a bare executable in `.build/...`). See `mac-004`.

## Customization rules for the generator

- Replace every `<TargetName>` literal with the kebab-cased-then-PascalCased app name (e.g. "Zombie Tower Defense" → `ZombieTowerDefense`).
- Replace every `<slug>` literal with the kebab-case slug (e.g. `zombie-tower-defense`).
- Replace `<DisplayName>` with the user-visible app name with spaces preserved.
- Keep the activation-policy + window-promotion code untouched. Move it inside `init()` only — never into `body`.
- Add additional Source files alongside `<TargetName>App.swift`; keep them under the same `Sources/<TargetName>/` directory so the linker resolves `_<TargetName>_main`.

## Why this lives in mchatai-source

This scaffold is content, not binary. Every improvement here ships to all installed mChatAI+ users on the next `refreshMchataisourceCache` — no rebuild, no App Store review. See the project's CLAUDE.md ABSOLUTE RULE #1.
