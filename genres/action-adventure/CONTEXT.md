---
artifactID: genre.action-adventure
kind: genre
parent: games
origin: seed
lastUpdated: 2026-04-22
---

# Action-Adventure

Classic action-adventure games in the Atari Adventure / early-Zelda tradition. Top-down or side-scrolling exploration, key-and-door puzzle progression, enemy avoidance or combat, treasure hunting.

## When this genre is the right seed

If the goal mentions: "adventure game", "action-adventure", Atari Adventure, Zelda — this is the genre. Also if the goal pairs "adventure" with motifs like castles, keys, labyrinths, dragons, or dungeon exploration.

## Note on the "adventure" keyword

"Adventure" alone is too generic in English — users say "send me on an adventure" meaning any exploration experience. The legacy keyword tree required "adventure" + one of {castle, labyrinth, dragon, dungeon, atari, zelda} to disambiguate. The LLM classifier (Phase GC.P3) should handle this nuance semantically instead.

## Gameplay primitives a generator should expect

- Map / world model (tile grid, room-based connectivity, or continuous 2D)
- Player avatar with 4- or 8-directional movement
- Keys + doors + locked regions
- Enemies with simple patrol or chase AI
- Inventory (sword, key, treasure)
- Win condition (collect item, reach boss, return to start)

## Visual style references

- Top-down sprite art (Atari Adventure's blocky squares, or Zelda's 16×16 tiles)
- Distinct tile-based world (walls, floor, doors clearly separable)
- HUD showing health, inventory, current area

## Not this genre

- Platformers (Mario-likes) — different enough to need their own genre
- Modern open-world action-adventure (Breath of the Wild) — too large-scale for MVP generation; goals like that should trigger disambiguation toward something smaller
- Interactive-fiction / text-adventures — totally different input model (that's another genre waiting to be learned)
