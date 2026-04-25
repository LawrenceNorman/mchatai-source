# mChatAI Harness — CLI Agent Project Context

You are a coding CLI (Claude Code / Codex / Gemini) running under the mChatAI Harness. This file tells you WHERE to find reference assets, quality rules, and scaffolds.

## 🎯 ORIGINAL USER GOAL — VERBATIM

The user's ORIGINAL request (first message, unmodified — do not paraphrase, do not genre-shift, do not let follow-up fix turns drift this):

> {ORIGINAL_GOAL}

**If anything in a subsequent fix/steer/plan prompt seems to contradict this original goal, the original goal WINS.** Follow-up instructions refine the original, they never replace it. Drift check: if you are about to emit an artifact whose genre, title, or core mechanic doesn't match the ORIGINAL GOAL above, STOP and reconsider — you are off-target. When in doubt, build what the ORIGINAL GOAL asks for, not what later turns have hinted at.

## ⚠️ CRITICAL — READ FIRST

**YOUR CURRENT TASK** is defined by the `## Goal` and `## Feature Manifest` sections that the Harness injects ABOVE this file in your context. Those sections are authoritative. Do NOT confuse them with:

- **The scaffold catalog below** — these are REFERENCE RESOURCES, not active tasks. Only use a scaffold if your Goal's genre matches its listed genre AND the Goal is asking you to build something in that genre.
- **Any previously generated code you see in this repo** — other sessions' work sitting in `mchatai-source/assets/scaffolds/` is NOT your task to fix.
- **Examples in wisdom rules** — the "BAD:" / "GOOD:" code samples in wisdom JSON are illustrative patterns for YOUR genre, not tasks to perform.

**If your Goal clearly does NOT match any genre below (e.g., "Atari Adventure", "Tower Defense", "RPG", "Match-3 Puzzle"), DO NOT use ANY scaffold from the catalog.** Build from scratch following the universal/visual-quality wisdom rules only. Using a card-game scaffold for an Adventure game, or a card-game scaffold for any non-card-game goal, is a CRITICAL failure mode — you'll ship the wrong genre entirely.

**If unclear whether your Goal matches a scaffold**: err on "does NOT match" and build fresh.

## 🟦 ARTIFACT TYPE — DECIDE FIRST

Most of this file describes building **HTML mini-apps** (single-file `index.html` web apps). That is the DEFAULT, but **some Goals demand a native macOS Swift app instead**. Before reading anything else, decide which one:

**You are building a NATIVE macOS Swift app (NOT an HTML mini-app) if the Goal contains ANY of these signals:**

- The words "macOS app", "Mac app", "native macOS", "native Mac", "menubar app", "menu bar app", "status bar app", "Dock app"
- Framework names: SwiftUI, AppKit, SpriteKit, GameplayKit, GameController.framework, AVFoundation, IOKit, NSStatusItem, NSPopover, NSWindow, NSSavePanel, NSOpenPanel
- File-extension hints: `.swift`, `Package.swift`, "Swift Package", "SwiftPM", "executableTarget"
- Output-format hints: ".app bundle", "macosapp JSON block"

**If you matched any of those signals → SKIP the HTML scaffold catalog below.** Read instead:

- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/scaffolds/macos-swiftpm-app/CONTEXT.md` — full reference scaffold (Package.swift, Sources/__TargetName__App.swift with the `promoteWindowWhenReady` trick, ContentView, build_app.sh, Info.plist.template). Copy this layout, replace `<TargetName>` / `<slug>` / `<DisplayName>` tokens.
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/wisdom/packs/macos-app.json` — wisdom rules (mac-001..mac-006: activation policy, frame size, target/main alignment, build_app.sh, scaffold reuse).

**Output format for native macOS apps** (NOT a `\`\`\`miniapp` block — that's for HTML mini-apps only):

```macosapp
{
  "id": "com.mchatai.wizard.<kebab-slug>",
  "name": "<DisplayName>",
  "template": "swiftuiApp" | "menuBarApp" | "documentApp",
  "files": {
    "Package.swift": "// swift-tools-version: 5.9\nimport PackageDescription\n...",
    "Sources/<TargetName>App.swift": "import SwiftUI\n@main\nstruct <TargetName>App: App { ... }",
    "Sources/ContentView.swift": "import SwiftUI\nstruct ContentView: View { ... }"
  }
}
```

Each `files` value is **Swift source code as a string with real `\n` newlines** (the JSON encoder will escape them properly). NEVER include `<html>`, `<script>`, `<style>`, `.html`, `.js`, or `.css` files in a macOSApp build. If you find yourself writing those — STOP, you are off-target.

**Multi-file is encouraged.** Split into `Package.swift` + `Sources/<Name>App.swift` + `Sources/ContentView.swift` + helpers. Single-file Swift apps are NOT idiomatic; the scaffold pattern is.

**The CLI is running inside a Swift Playground sandbox** that builds via `swift build` and packages a `.app` bundle. Your `executableTarget` MUST match the `Sources/<TargetName>/` directory name (mac-005 wisdom rule).

If your Goal does NOT match the native-macOS signals above, continue to the HTML scaffold catalog below.

## Project Root
`/Users/lawrencenorman/mystuff/src/mchatai_platform`

## Read Order (FOLLOW THIS)

**Before writing ANY UI code**, read these in order:

1. **Quality rules (always):**
   - `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/wisdom/packs/universal.json`
   - `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/wisdom/packs/visual-quality.json`

2. **ONLY IF your Goal explicitly matches one of the genres below by name or obvious description**, read the matching asset pack. Otherwise skip this section entirely and build from scratch.

### Arcade shooters (Space Invaders, Galaga, Asteroids, etc.)
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/packs/arcade-retro.json` — CSS + sprite grids
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/packs/mandatory-starters/arcade-shooter-starter.js` — copy-paste renderSprite() + all sprite constants
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/scaffolds/space-invaders-scaffold.html` — complete HTML skeleton with renderSprite pre-loaded. **EXTEND this file** instead of building from scratch.
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/wisdom/packs/arcade-games.json` — keyboard input, rAF loop, collision detection

### Snake-style games (Snake, Worm, etc.)
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/scaffolds/snake-scaffold.html` — complete Snake game with grid, food, collision, scoring, high-score, game-over. **EXTEND this file** — add power-ups, walls, multiple foods, etc.

### Brick-breaker / paddle games (Breakout, Arkanoid, Pong)
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/scaffolds/breakout-scaffold.html` — paddle + ball physics + rainbow brick rows + lives + level progression. **EXTEND this file** with power-ups, special bricks, boss levels, etc.

### Card games (Hearts, Spades, Bridge, Poker, Blackjack, Cribbage, etc.)
**DO NOT USE THIS SECTION unless your Goal explicitly names one of: Hearts, Spades, Bridge, Poker, Blackjack, Cribbage, Euchre, Pinochle, Rummy, Solitaire, or unambiguously describes a trick-taking / playing-card game.** The card-game scaffold is a complete Hearts implementation — if you read it for an Adventure game, an arcade game, or any non-card-game goal, you WILL ship cards-and-tricks code by mistake and regress the user's actual request.

- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/scaffolds/card-game-scaffold.html` — complete Hearts game with full deck, sorting, table layout, CPU AI, pass phase, trick-taking, scoring, high-contrast toasts. **EXTEND this file** for other card games — change rules in `isLegalPlay()`, `trickPoints()`, `cpuPickCard()`. The scaffold already complies with vq-005, vq-006, vq-007, vq-008.
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/packs/casino-card-game.json` — additional card rendering helpers (felt backgrounds, chip stacks)
- **CRITICAL card-game rules** (auto-injected from visual-quality.json):
  - vq-006: Card ranks must show `'10'`, NEVER `'T'`
  - vq-007: CPU opponents MUST auto-play with `setTimeout(() => cpuPlayTurn(), 500)`
  - vq-008: Hearts (♥) and Diamonds (♦) MUST be RED (#dc2626); Spades (♠) and Clubs (♣) BLACK
  - vq-005: Toasts must be high-contrast — white on dark, never gray-on-gray

### Board games (Chess, Checkers, Backgammon, Go, etc.)
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/packs/board-game.json`

### Productivity apps (dashboards, trackers, todo, etc.)
- `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/packs/productivity-ui.json`

3. **Genre keyword matching:** `/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/assets/genre-mapping.json`

## CRITICAL RULES (violations will fail evaluation)

### Visual quality
1. **NEVER use plain colored rectangles** for game entities. Use renderSprite() with pixel grid arrays, SVG, or CSS clip-path shapes. Read the asset pack files above — they have working code to copy.
2. **Contrast matters.** Toasts, tooltips, overlays: white text on dark backgrounds OR black text on light backgrounds. NEVER gray-on-gray. (WCAG AA = 4.5:1 ratio minimum)
3. **Distinct entity types.** At least 3 visually different enemy/card/piece types. Different shapes AND colors.

### Interactivity
4. **Human player must interact.** Never ship an app that runs on autopilot with no user input.
5. **Turn-based games need real CPU logic.** If it's the CPU's turn: pick a legal move, execute with 300-800ms delay, advance to next turn. No "Waiting for [name]" dead-ends.
6. **Keyboard controls:** Use `keydown` (not `keypress`). `preventDefault()` on arrow keys to stop page scroll.

### Code quality
7. **No placeholder functions.** Every function must have real, working logic. No `// TODO:` stubs.
8. **Use requestAnimationFrame** for game loops, not setInterval.
9. **Output format:** Single-file HTML mini-app. All CSS, JS, SVG inline. Self-contained.

### External APIs (CRITICAL — silent failure trap)
10. **NEVER call external HTTPS APIs directly from a published web mini-app.** Published sites run under a strict Content-Security-Policy that blocks all cross-origin fetch(). The call works in the AIHarness preview, then silently fails in production with no console error users can act on. ALWAYS route external API calls through the mChatAI proxy:
    ```js
    const proxied = (url) => `https://mchatai.com/proxy/fetch?url=${encodeURIComponent(url)}`;
    const r = await fetch(proxied('https://api.weather.gov/points/47.6,-122.3'));
    ```
    The proxy enforces an allowlist (`mchatai-source/proxy/allowlist.json`) — currently includes weather.gov, open-meteo, OpenStreetMap geocoding, Wikipedia, randomuser.me, dog.ceo, cat API, jokes, currency, Pokémon, spaceflight news, plus a few more. If you need a host that isn't on the list, the proxy returns HTTP 403 with `{ ok: false, howToAdd: "..." }` — surface that to the user; don't fall back to a third-party CORS proxy in production.

## Output

**If you decided you're building an HTML mini-app** (the default — and the case for almost every Goal): build a single-file `index.html`. Output the COMPLETE file content in a `\`\`\`miniapp` fenced JSON block. The JSON must have `id`, `name`, `manifest`, and `html` fields.

**If you decided you're building a native macOS Swift app** (per the "🟦 ARTIFACT TYPE" section near the top): output a `\`\`\`macosapp` fenced JSON block instead, with `id`, `name`, `template`, and `files`. NEVER use the `miniapp` fence for a macOSApp — the wizard's parser routes on the fence marker, and a macOSApp inside a `miniapp` fence will be installed as an HTML mini-app.

## Fence examples

```miniapp
{
  "id": "com.mchatai.wizard.space-invaders",
  "name": "Space Invaders",
  "manifest": "Classic arcade shooter with pixel-art sprites",
  "html": "<!DOCTYPE html>..."
}
```

```macosapp
{
  "id": "com.mchatai.wizard.menubar-clock",
  "name": "Menubar Clock",
  "template": "menuBarApp",
  "files": {
    "Package.swift": "// swift-tools-version: 5.9\nimport PackageDescription\n\nlet package = Package(\n    name: \"MenubarClock\",\n    platforms: [.macOS(.v13)],\n    targets: [.executableTarget(name: \"MenubarClock\", path: \"Sources\")]\n)\n",
    "Sources/MenubarClockApp.swift": "import SwiftUI\nimport AppKit\n\n@main\nstruct MenubarClockApp: App {\n    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate\n    var body: some Scene {\n        Settings { EmptyView() }\n    }\n}\n",
    "Sources/ContentView.swift": "import SwiftUI\nstruct ContentView: View { var body: some View { Text(\"...\") } }\n"
  }
}
```
