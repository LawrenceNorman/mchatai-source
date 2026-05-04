# mChatAI macOS Components Catalog — Overview

**Date:** 2026-05-04
**Coverage:** 18/18 recipes have goldenAssemblies + Lego components.
**Status:** 18/18 catalog reference apps build clean from goldenAssemblies (verified via `/tmp/build_all_catalog_apps.py`).

---

## Where things live

```
mchatai-source repo (workspace clone — where you commit):
  /Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/

Cache (what mChatAI+ actually reads from at runtime):
  ~/Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/source-cache/mchatai-source/

Catalog reference apps (built fresh from goldenAssemblies — runnable):
  /tmp/catalog-builds/<recipe-id-with-dashes>/build/<AppName>.app

Shipped product apps (mChatAI+ end-products):
  ~/Library/Containers/.../mChatAI/MacOSApps/<slug>/
    .mchatdev/Build/<Name>.app                     ← runnable via `open`
    OR Sources/<Target>/                           ← raw Swift source

Test stagings (Swift Playground transient builds):
  /var/folders/.../SwiftPlayground/pg-<hash>-<Name>/<Name>.app
```

---

## Reference apps — all 18 freshly built and runnable

These are clean reference builds straight from the goldenAssembly. They demonstrate
the canonical Lego composition pattern; each app should launch with a window, accept
keyboard/mouse input, and play correctly.

```bash
# Run them all (or pick the ones you want to validate)
open /tmp/catalog-builds/recipe-native-word-game/build/WordGame.app
open /tmp/catalog-builds/recipe-native-crossword/build/MiniCrossword.app
open /tmp/catalog-builds/recipe-mastermind/build/Mastermind.app
open /tmp/catalog-builds/recipe-minesweeper/build/Minesweeper.app
open /tmp/catalog-builds/recipe-match3/build/Match3.app
open /tmp/catalog-builds/recipe-arcade-asteroids/build/Asteroids.app
open /tmp/catalog-builds/recipe-arcade-pong/build/Pong.app
open /tmp/catalog-builds/recipe-arcade-adventure/build/CastleAdventure.app
open /tmp/catalog-builds/recipe-arcade-grid/build/Frogger.app
open /tmp/catalog-builds/recipe-maze-arcade/build/PacMan.app
open /tmp/catalog-builds/recipe-platformer/build/Platformer.app
open /tmp/catalog-builds/recipe-tower-defense/build/TowerDefense.app
open /tmp/catalog-builds/recipe-blackjack/build/Blackjack.app
open /tmp/catalog-builds/recipe-poker/build/Poker.app
open /tmp/catalog-builds/recipe-checkers/build/Checkers.app
open /tmp/catalog-builds/recipe-chess/build/Chess.app
open /tmp/catalog-builds/recipe-music-piano/build/Piano.app
open /tmp/catalog-builds/recipe-spritekit-physics/build/SpriteKitPhysics.app
```

To rebuild after a catalog change:
```bash
python3 /tmp/build_all_catalog_apps.py
```

---

## Recipe-by-recipe (with components, examples, shipped apps, audit)

Each recipe has:
- **Components folder** = canonical Lego Swift files copied verbatim into generated apps
- **Golden example** = `examples/<recipe>/` minimal SwiftUI glue (copied as ContentView/App init)
- **Reference app** = `/tmp/catalog-builds/.../build/<Name>.app` ready to launch
- **Shipped apps** = end-products in mChatAI+'s MacOSApps/ folder
- **Lego audit** = does the shipped app actually compose the canonical symbols?

### Word & Puzzle (5 recipes)

#### 1. recipe.native-word-game (Wordle-style)
- Components: `components/word-game/` (WordGameEngine, WordGameLexicon, WordGameKeyboardHandling, WordGameSmokeTests)
- Example: `examples/word-game/`
- Reference: `/tmp/catalog-builds/recipe-native-word-game/build/WordGame.app`
- Shipped: `MacOSApps/com.mchatai.wizard.wordle-clone` (3 glue refs to WordGameEngine ✓)<br>`MacOSApps/com.mchatai.wizard.native-word-game` (0 refs — needs audit)

#### 2. recipe.native-crossword (NYT mini)
- Components: `components/crossword/` + `components/grid-puzzle/`
- Reference: `/tmp/catalog-builds/recipe-native-crossword/build/MiniCrossword.app`
- Shipped: `MacOSApps/com.mchatai.wizard.mini-crossword/.mchatdev/Build/MiniCrossword.app` ✅ runnable

#### 3. recipe.mastermind
- Components: MastermindEngine + MastermindSmokeTests
- Reference: `/tmp/catalog-builds/recipe-mastermind/build/Mastermind.app`
- Shipped: (none yet) — generate one to validate

#### 4. recipe.minesweeper
- Components: MinesweeperEngine + MinesweeperSmokeTests
- Reference: `/tmp/catalog-builds/recipe-minesweeper/build/Minesweeper.app`
- Shipped: (none yet)

#### 5. recipe.match3
- Components: Match3Engine + Match3SmokeTests
- Reference: `/tmp/catalog-builds/recipe-match3/build/Match3.app`
- Shipped: (none yet)

### Arcade (Foundation engines + Canvas rendering — 7 recipes)

#### 6. recipe.arcade-asteroids
- Components: AsteroidsEngine + ArcadeCore
- Reference: `/tmp/catalog-builds/recipe-arcade-asteroids/build/Asteroids.app`
- Shipped: `MacOSApps/asteroids-vector/.mchatdev/Build/Asteroids.app` (no marker — pre-Lego)

#### 7. recipe.arcade-pong (also Breakout, Atari Basketball)
- Components: PongEngine + ArcadeCore
- Reference: `/tmp/catalog-builds/recipe-arcade-pong/build/Pong.app`
- Shipped: `MacOSApps/com.mchatai.wizard.native-pong/.mchatdev/Build/NativePong.app` (3 PongEngine refs ✓)<br>`MacOSApps/com.mchatai.wizard.pong-clone` (3 refs ✓)<br>`MacOSApps/macos-breakout` (no marker — pre-Lego)

#### 8. recipe.arcade-adventure (Atari Adventure-style) ⭐ NEW today
- Components: GridAdventureEngine + ArcadeCore + GridPuzzleCore
- Reference: `/tmp/catalog-builds/recipe-arcade-adventure/build/CastleAdventure.app`
- Shipped: (none yet)

#### 9. recipe.arcade-grid (Frogger)
- Components: GridAdventureEngine (different seed)
- Reference: `/tmp/catalog-builds/recipe-arcade-grid/build/Frogger.app`
- Shipped: `MacOSApps/installed/swiftui-frogger-game-for-macos/versions/v0001.app` (pre-Lego)

#### 10. recipe.maze-arcade (Pac-Man)
- Components: GridAdventureEngine (pacmanArcadeMap seed)
- Reference: `/tmp/catalog-builds/recipe-maze-arcade/build/PacMan.app`
- Shipped: `MacOSApps/installed/macos-pac-man-clone-game/versions/v0001.app` (pre-Lego)<br>`MacOSApps/wizard.recovered.macos.28a4ad02` (7 GridAdventureEngine refs ✓)

#### 11. recipe.platformer (Mario-style) ⭐ NEW today
- Components: PlatformerEngine + ArcadeCore + GridPuzzleCore (note: `coins: Set<PuzzlePoint>` requires GridPuzzleCore — fixed in commit 7fa865f)
- Reference: `/tmp/catalog-builds/recipe-platformer/build/Platformer.app`
- Shipped: (none yet)

#### 12. recipe.tower-defense
- Components: TowerDefenseEngine + ArcadeProjectile + ArcadeCore + GridPuzzleCore
- Reference: `/tmp/catalog-builds/recipe-tower-defense/build/TowerDefense.app`
- Shipped: (none yet)

### Card games (2 recipes)

#### 13. recipe.blackjack
- Components: BlackjackEngine + CardGameCore + CardGameSmokeTests
- Reference: `/tmp/catalog-builds/recipe-blackjack/build/Blackjack.app`
- Shipped: `MacOSApps/com.mchatai.wizard.native-blackjack/.mchatdev/Build/NativeBlackjack.app` (2 BlackjackEngine refs ✓)
- 🟡 Earlier user feedback: shipped app rendered "C"/"D" suits — fixed at catalog level today via `PlayingCardSuit.glyph` + mac-021. Re-fire to validate.

#### 14. recipe.poker (Texas hold'em)
- Components: PokerHandEvaluator + CardGameCore
- Reference: `/tmp/catalog-builds/recipe-poker/build/Poker.app`
- Shipped: `MacOSApps/com.mchatai.wizard.native-poker/.mchatdev/Build/NativePoker.app` (4 refs ✓)
- ✅ User flagged as ready to publish

### Board games (2 recipes)

#### 15. recipe.checkers
- Components: CheckersRules + BoardGameCore
- Reference: `/tmp/catalog-builds/recipe-checkers/build/Checkers.app`
- Shipped: `MacOSApps/com.mchatai.wizard.native-checkers/.mchatdev/Build/NativeCheckers.app` (10 refs ✓)
- ✅ User flagged as ready to publish

#### 16. recipe.chess
- Components: ChessRules + BoardGameCore
- Reference: `/tmp/catalog-builds/recipe-chess/build/Chess.app`
- Shipped: `MacOSApps/com.mchatai.wizard.native-chess/.mchatdev/Build/NativeChess.app` (14 refs ✓ STRONGEST composition)
- ✅ User flagged as ready to publish

### Music (1 recipe)

#### 17. recipe.music-piano ⭐ NEW today
- Components: PianoEngine
- Reference: `/tmp/catalog-builds/recipe-music-piano/build/Piano.app`
- Shipped: `MacOSApps/com.mchatai.wizard.piano-app` (no marker — pre-Lego)<br>`MacOSApps/com.mchatai.wizard.audiokit-synth` (no marker — pre-Lego)

### SpriteKit physics (1 recipe — NEW today)

#### 18. recipe.spritekit-physics (Joust, Lunar Lander, Marble Madness)
- Components: SpriteKitPhysicsHelpers (factory + Sendable Snapshot + Categories)
- Reference: `/tmp/catalog-builds/recipe-spritekit-physics/build/SpriteKitPhysics.app`
- Shipped: `MacOSApps/lunar-lander-spritekit` (17 SKPhysicsHelpers refs ✓ STRONG)
- 🟡 User feedback on shipped Lunar Lander v1: thrust too weak, no restart button — both fixed at catalog level today via `lunarThrustForce=80` preset + `mac-022` rule.

---

## Audit summary — shipped apps with Lego markers

**Strong composition (uses canonical symbols in glue):**
- Native Chess (14 refs to ChessRules)
- Lunar Lander SpriteKit (17 refs to SKPhysicsHelpers)
- Native Checkers (10 refs)
- Mini Crossword recovered (7 refs)
- Pac-Man recovered (7 refs)
- Native Poker (4 refs)
- Native Pong / Pong Clone (3 refs each)
- Wordle Clone (3 refs)
- Native Blackjack (2 refs)

**Weak composition (Lego marker but minimal symbol usage in glue — investigate):**
- Mini Crossword (0 refs in glue — but engine ships in MChatAIComponents subdir)
- Native Word Game (0 refs)
- Wordle Game (0 refs)
- Pong Clone old variant (0 refs)

**Pre-Lego / non-catalog (older apps generated before Lego enforcement):**
- 35+ apps including joust-mac, lunar-lander, asteroids-vector, atari-basketball, bomberman, centipede, frogger-pond, galaga, etc.
- These should be re-generated through the new Lego-aware Harness once the WEDGE.RECOVER fix lands so they pull canonical components instead of hand-rolled engines.

---

## Promotion candidates for templates (mChatAI+ "New Project" picker)

After validating the reference apps + re-firing the flagged-good ones with today's catalog fixes:

**Tier 1 (validated, publish-ready):**
- Native Chess
- Native Checkers
- Native Poker
- Mini Crossword

**Tier 2 (good, with 1 catalog-level fix landed today — re-validate):**
- Native Blackjack (suit glyph fix)
- Native Pong (paddle hit-area fix)
- Lunar Lander (thrust + restart-button fix)
- Joust (restart-button + activation policy fix)

**Tier 3 (catalog reference works, no shipped app yet — generate one to validate):**
- Mastermind, Minesweeper, Match3, Castle Adventure, Platformer, Tower Defense, Piano

---

## Today's mchatai-source commits (12 total, none pushed yet)

```
7fa865f  recipe.platformer: add gridpuzzle.core dep + clarify in assemblyNotes
084dc61  full goldenAssembly coverage: platformer + arcade-adventure + music-piano (18/18)
24df5ba  recipe.spritekit-physics: add goldenAssembly + 4-file example reference
79cba9a  games: visible restart button rule (5 packs) + thrust force presets
1858976  arcade.pong AABB hit-area + cardgame suit glyphs + wisdom mac-021
d6cb830  wisdom: bump macos-app pack to v6
78b5d05  recipe.spritekit-physics: stronger composition guidance
9a1b861  wisdom mac-020: Swift literals — no literal newlines in double-quoted strings
39fe110  wisdom mac-017: clarify SKShapeNode(ellipseOf:) IS valid; only SKPhysicsBody isn't
5b4ed73  macos-components: add recipe.spritekit-physics for SpriteKit games
409bcc2  macos-components: SpriteKit physics helpers + wisdom rules from Joust rescue
```

All cache-synced. mChatAI+ reads them on next wizard fire.

---

## Open Harness bugs (pending mChatAI+ rebuild)

1. **WEDGE.RECOVER** — auto-fix returns no parseable code → tear session, even when workdir has clean build on disk. Fix written in `AIHarness+MacOSApp.swift` (~36 LOC), waiting for monitor-tunnel-issues agent to clear their build error.
2. **Lego provenance gate edge case** — wizard emits the marker file referencing the canonical Lego BUT the SwiftPM target's `MChatAIComponents/SpriteKitPhysicsHelpers.swift` is a **fake stub** with placeholder comments instead of the real canonical content. Bit BC283EDB Lunar v2 (today). Need to verify the writer pulls the actual content from cache, not LLM-fabricated text.
3. **Generator regen-loop wedge** — when initial macosapp JSON parse fails, regen prompt fires but the LLM emits another non-parseable response and the wizard goes silent for >12min with no recovery. Same family as #1 but earlier in the pipeline.
