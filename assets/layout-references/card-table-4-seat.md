# 4-Seat Card Table — Architectural Reference

**Archetype:** Any card game with 4 players around a central play area. Works for Poker (Texas Hold'em, Omaha), Hearts, Spades, Bridge, Euchre, Pinochle, Whist, Rummy, Crazy Eights, Uno, Blackjack (recast as 1 human + 3 AI with dealer).

**Extracted from:** the user's Texas Hold'em Poker mini-app (published to `mchatai.com/u/{uid}/texas-holdem-poker/`). That build is rated well and has a polished, playable 4-seat layout — so its DOM/CSS is the ground truth for this archetype. Genre-specific details (betting rounds, community-card flop, chip stacks) were stripped; structural primitives were kept.

## Why a cross-genre reference instead of per-game?

Prior approach: hand-authored `trick-taking-hearts.html` reference. Problem: the LLM still invented its own layout because the 540-line reference was longer than what it could faithfully copy. Evidence: round-4 Hearts generation preserved card rendering but collapsed 4 zones into 2 (N + S only).

New approach: one **archetype reference** per structural family (`4-seat card table`, `2-player card duel`, `grid puzzle`, `arcade scrolling`, `top-down roguelike`). Game-specific rules/AI/render snippets remain per-game (see `trick-taking-hearts.rules.js`, `trick-taking-hearts.ai.js`, `trick-taking-hearts.render.js` — all continue to work, they reference the same zone ids this layout provides).

## What the Generator MUST preserve

**Containers (validated by the working Poker build):**

| Element | Selector | Purpose |
|---|---|---|
| Main flex row | `.poker-container` | 70% table left / 30% info panel right |
| Table | `#poker-table` with `::before` felt oval | Rounded-rect felt with inner glow |
| Center | `.table-center` | Holds `#community-cards` (Poker) AND `#trick` (Hearts) AND `#pot` / score |
| Human seat | `#player-0` or `.player-area[data-seat="S"]` | Bottom center, **face-up** cards — this is the only seat with visible faces |
| AI seats | `#player-1..3` or `.player-area[data-seat="W|N|E"]` | Left / top / right, card backs only |
| Side panel | `#game-info` → `#game-log` + `#player-controls` | Log messages + action buttons (Fold/Call/Bet for Poker; empty for Hearts — click the cards directly) |
| Modals | `#rules-modal`, `#game-over-modal`, `#toast` | Rules reference + end-of-hand + transient status |

**Fixed seat positions (copied verbatim from the working Poker build):**

```
#player-0 / [data-seat="S"] : top: 80%; left: 50%; translateX(-50%)
#player-1 / [data-seat="W"] : top: 50%; left:  5%; translateY(-50%)
#player-2 / [data-seat="N"] : top: 10%; left: 50%; translateX(-50%)
#player-3 / [data-seat="E"] : top: 50%; left: 95%; translate(-100%, -50%)
```

Do NOT improvise new percentages. These values came from a playable build.

## What to customize per game

- **`#player-controls`**: action buttons per game.
  - Poker: `Fold` / `Check` / `Call` / `Bet`
  - Hearts / Spades: empty — the human plays by clicking a card
  - Blackjack: `Hit` / `Stand` / `Double` / `Split`
  - Uno: `Draw` / `Play` / `UNO`
- **`.pot-or-score` contents** — Poker shows pot in dollars; Hearts shows per-seat scores; Bridge shows contract + tricks taken.
- **Center children** — Poker uses `#community-cards` (5 face-up shared cards); Hearts uses `#trick` (4 cards in cross slots). The reference includes both; hide the one you don't need with `display: none`.
- **Dealer button** — on for dealer-rotation games (Poker, Hearts' 2♣ lead), off for rotation-agnostic games.
- **CSS variables** — retune `--felt-color`, `--accent-color`, etc.

## What to NOT remove

- Any `.player-area` div. Removing a seat breaks the 4-player contract.
- The center `.table-center` + at least one of `#community-cards` / `#trick`.
- The side panel — even if empty, drop an empty `<aside id="game-info">` so the flex row still balances.
- `.card.face-down` / `.card-back` class — every multi-player card game needs hidden AI hands.
- `<meta name="mchatai-version">` (Phase VIS — publish pipeline injects this; do not strip).

## Pairs well with

- `trick-taking-hearts.rules.js` — legal-play, trick resolution, Hearts scoring
- `trick-taking-hearts.ai.js` — random-legal CPU turn
- `trick-taking-hearts.render.js` — DOM update loop, human click handlers, toast
