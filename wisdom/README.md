# Wizard Wisdom

Quality guidelines for AI-generated apps. Domain-specific checklists that prevent recurring mistakes.

## Available Packs

| Pack | File | Guidelines | Key Rules |
|------|------|-----------|-----------|
| Universal | `packs/universal.json` | 5 | Human must interact, min touch targets, clear state, no placeholders, preserve features |
| Card Games | `packs/card-games.json` | 8 | Human has controls, card backs, hand evaluation, chip management, shuffle, pot display |
| Board Games | `packs/board-games.json` | 4 | Human clicks to move, validate moves, detect win/draw, alternating grid |
| Arcade | `packs/arcade-games.json` | 4 | Keyboard input, rAF game loop, score HUD, collision detection |
| Productivity | `packs/productivity.json` | 3 | localStorage persistence, full CRUD, empty states |

## How It Works

1. **Bundled guidelines** inject into the wizard's system prompt before generation
2. **User corrections** are detected and accumulated as wisdom candidates
3. **At 3+ local hits**, a candidate becomes a local guideline
4. **At 3+ hits**, candidates upload to Firestore (`wizard_wisdom_candidates`)
5. **Admin reviews** at mchatai.com/admin/wisdom and publishes the best ones
6. **All users download** published guidelines from Firestore on app launch

## Contributing

Guidelines are learned automatically from user corrections. The most impactful corrections get promoted to community guidelines. You can also submit guidelines by opening an issue or PR on this repo.
