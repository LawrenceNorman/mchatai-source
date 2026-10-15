---
artifactID: genre.first-person-shooters
kind: genre
parent: games
origin: seed
lastUpdated: 2026-10-15
---

# First-Person Shooters

Classic first-person shooters: rooms and corridors, keys and doors, monsters, weapons, secrets, a
campaign of one or more levels.

## When this genre is the right seed

The goal asks for a first-person shooter: Doom-like, retro or boomer shooters, "a Call of Duty / Halo
type game", soldiers or space marines against aliens or demons, a base or campaign to fight through.
Not three.js arenas the user asks for by name, not vehicles or open 3D worlds.

## How to build it

On the vendored retro-fps engine: read `frameworks/retro-fps/CONTEXT.md`, model the page on
`frameworks/retro-fps/examples/outpost-alpha/index.html`, write the levels as text grids, and check
them with `frameworks/retro-fps/tools/rfps-check.js`. No legacy template seed (`templateSeeding: off`).
