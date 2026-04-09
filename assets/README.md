# Asset Packs

Visual asset packs for AI-generated mini-apps and macOS apps. CSS/SVG/JS assets that inline directly into single-file HTML apps.

## Available Packs

| Pack | File | Description |
|------|------|-------------|
| Casino Card Game | `packs/casino-card-game.json` | Card faces (SVG renderer), felt texture, chips, card backs, dealer button |
| Board Game | `packs/board-game.json` | Chess/checkers grid, dice renderer, tokens, score panels |
| Arcade & Retro | `packs/arcade-retro.json` | CRT scanlines, neon text, pixel sprite renderer, retro HUD |
| Productivity UI | `packs/productivity-ui.json` | Dashboard cards, badges, progress bars, buttons, inputs, tables |

## Format

Each pack is a single JSON file with:
- `promptInjection` — full LLM-ready usage instructions with code snippets
- `css` — named CSS assets (backgrounds, components, animations)
- `svg` — named SVG assets (inline-ready graphics)
- `js` — named JS assets (renderer functions like `renderCard(rank, suit)`)

## Usage

The `AssetPackService` in mChatAI+ loads these packs and injects matching ones into the wizard's system prompt based on keyword matching against the user's goal.
