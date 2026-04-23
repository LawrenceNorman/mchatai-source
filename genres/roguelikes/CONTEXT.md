---
artifactID: genre.roguelikes
kind: genre
parent: games
origin: seed
lastUpdated: 2026-04-22
---

# Roguelikes

Dungeon-exploration games with permadeath, procedural generation, and turn-based combat. The "classic" Rogue / NetHack / Dwarf Fortress lineage.

## When this genre is the right seed

If the goal mentions: rogue, roguelike, or "dungeon" (in a game context) — this is the genre.

## Gameplay primitives a generator should expect

- Procedural dungeon generation (BSP, cellular automata, room-corridor)
- Grid-based movement (arrow keys / hjkl / WASD)
- Turn-based combat (player acts → enemies act)
- Inventory + item use (potions, scrolls, equipment)
- Permadeath + seeded or unseeded runs
- ASCII or simple tile graphics

## Visual style references

- Monospace font, colored glyphs (@-as-player tradition)
- Dark background, bright foreground
- Status line at top or bottom (HP, level, turn count)

## Not this genre

- Action-roguelikes (Hades, Enter the Gungeon) — these blend roguelike with real-time action; treat as a learned sub-genre later
- Deck-building roguelikes (Slay the Spire) — blend of card-games + roguelikes; classic polymorphism case, MVP GC punts on this
