---
artifactID: genre.arcade-games
kind: genre
parent: games
origin: seed
lastUpdated: 2026-04-22
---

# Arcade Games

Fast-reflex single-screen games in the mold of 1970s–80s arcade cabinets. Immediate feedback, high-score tables, no save state (deliberately).

## When this genre is the right seed

If the goal mentions: snake, breakout, space invaders, pac-man, pong, flappy (bird), or the generic "arcade" keyword — this is the genre.

## Gameplay primitives a generator should expect

- Game loop (requestAnimationFrame for web, SKScene for macOS/iOS)
- Collision detection (AABB or circle for most arcade classics)
- Score accumulator + high-score persistence (localStorage or AppStorage)
- Player input: keyboard (arrows/space/WASD) or touch
- Simple sound effects for key moments (hit, lose, score)

## Visual style references

- CRT / pixelated aesthetic common but not required
- Black-background + bright-sprite tradition
- Score + high-score in monospace font at screen top

## Not this genre

- Platformers (those are action-adventure or their own genre)
- Shoot-em-ups with deep progression (bullet-hell might warrant its own genre post-learning)
