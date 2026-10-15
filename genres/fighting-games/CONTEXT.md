---
artifactID: genre.fighting-games
kind: genre
parent: games
origin: seed
lastUpdated: 2026-10-15
---

# Fighting Games

One-on-one versus fighters: two fighters on one screen, special moves from motion inputs, blocking,
combos, knockdowns, best-of-three rounds with a timer, a CPU opponent or a second player.

## When this genre is the right seed

The goal asks for a "Street Fighter type" game, a versus, tournament or martial-arts fighter, special
moves and combos, or two fighters facing each other. Not side-scrolling beat-'em-ups against crowds,
platform fighters, or dogfights between planes.

## How to build it

On the vendored versus-fighter runtime: read `frameworks/versus-fighter/CONTEXT.md`, model the page
on `frameworks/versus-fighter/examples/demo.html`, write the game as JSON (fighters, special moves,
stages), and check it with `frameworks/versus-fighter/tools/vf-check.js`. Every fighter, move,
stage and the title get original names.
