---
artifactID: genre.puzzle-games
kind: genre
parent: games
origin: seed
lastUpdated: 2026-04-22
---

# Puzzle Games

Logic, pattern-matching, and spatial-reasoning games. Self-paced, turn-based or tile-based, reward-per-level.

## When this genre is the right seed

If the goal mentions: 2048, sudoku, tetris, match-3, minesweeper, or the compound noun "puzzle game" — this is the genre.

## Gameplay primitives a generator should expect

- Grid model (typically 2D array of cells or tiles)
- Move/swap/merge rules per variant
- Win-condition checker (match N, solve board, reach target)
- Undo / hint (optional but common)
- Level progression OR daily-puzzle model

## Visual style references

- Clean, geometric, high-contrast tiles
- Color-coded pieces (tetris, 2048 number tiers)
- Minimalist UI chrome — the board is the focus

## Not this genre

- Word puzzles → word-games
- Dungeon roguelikes (also grid-based, but combat-driven) → roguelikes
- Physics puzzles (Angry Birds-likes) — different enough to warrant its own learned genre eventually
