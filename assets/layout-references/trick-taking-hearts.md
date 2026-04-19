# Trick-Taking Hearts — Layout Reference Notes

**File:** `trick-taking-hearts.html`
**Applies to:** Hearts, Spades, Bridge, Euchre, Whist, and any 4-player trick-taking game with one human seat.

## Why this reference exists

Every Hearts/Spades/etc. mini-app generated before 2026-04-19 shipped with one of these bugs, even after the card-games wisdom pack was loaded:

1. **All four seats stacked at the top** → trick area empty, human cards invisible or tiny
2. **Only human and one AI visible** → missing East/West zones entirely
3. **Human cards rendered as card backs** → game literally unplayable
4. **No trick area** → played cards vanished, player couldn't see what was played
5. **Cards rendered too small to read** or outside the viewport

The wisdom rules `cg-009` / `cg-011` / `cg-012` / `cg-013` / `cg-020` describe the right behavior in prose. LLMs read prose and improvise — they invent their own layout. This reference ships the **exact DOM structure** so improvisation isn't required.

## What the Generator MUST preserve

**Structural invariants** (the evaluator will check for these):

| Element | ID / class | Purpose |
|---|---|---|
| Table container | `#table` | `position:relative; height:100vh;` — the cross layout depends on this being a viewport-height positioning parent |
| North AI zone | `#zoneN` | Top-center, card backs only |
| West AI zone | `#zoneW` | Left-middle, card backs only |
| East AI zone | `#zoneE` | Right-middle, card backs only |
| Human zone | `#zoneS` | Bottom-center, **face-up** card faces only (every card shows rank + suit) |
| Trick area | `#trick` | Dead center, 3×3 grid with four slots (N/E/S/W) |
| HUD | `#hud` | Top-center, shows score per seat + whose turn |
| Toast / status | `#toast` | Mid-bottom, high-contrast background (cg-005 contrast rule) |
| Card face | `.card` | White bg, black rank text, red for `[data-suit="♥"]` + `[data-suit="♦"]` (cg-012, vq-008) |
| Card back | `.card-back` | Diagonal stripe pattern, NO rank text (cg-020) |

**CSS variables** at the top of the file let generators retheme (change `--felt-a`, `--card-bg`, etc.) without breaking the layout.

## What the Generator MAY replace

- **Game rules** (`isLegalPlay`, `resolveTrick`, scoring) — swap for Spades bidding, Bridge auctions, Euchre trump, etc.
- **AI heuristics** (`cpuPlayTurn`) — currently picks random legal moves. Real AI goes here.
- **Seat names / theme** — `North/East/West` → any names. Change `SEAT_NAMES` dict.
- **Scoring semantics** — Hearts counts hearts + Q♠. Spades uses bids + nil. Euchre has tricks per hand.
- **New-game flow** — multi-hand matches, score-to-win thresholds, passing phase, trump selection.

## What the Generator MUST NOT remove

- The four zone divs (N/E/W/S). If the user asks for 2-player or 3-player, adjust seat count but keep the cross-layout principle.
- The `isLegalPlay` concept — every trick-taking game requires a "follow suit" check. Even if the specific rule differs, the gate between click → play must exist.
- `cpuPlayTurn` with a setTimeout delay (300-800ms). Instant AI plays look broken (vq-007).
- Hand sorting on deal + after each play (cg-013).
- The click → playCard → resolveTrick flow. No "pure display" static grids — the game must be PLAYABLE (cg-001).

## Ready-to-run sanity check

Open `trick-taking-hearts.html` in a browser. You should see:
- Four seats arranged in a cross on a green felt background
- 13 card backs in each AI zone with a count badge
- 13 face-up cards along the bottom with rank + suit visible (hearts in red)
- HUD at top with score per seat
- Click a playable (highlighted) card → it slides into the center trick area
- After 4 plays, toast announces the winner and leads next trick
- "New Game" button top-right

If any of the above is missing from a generated mini-app, the reference wasn't followed.
