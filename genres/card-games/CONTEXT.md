---
artifactID: genre.card-games
kind: genre
parent: games
origin: seed
lastUpdated: 2026-04-22
---

# Card Games

Games played with a virtual deck of 52 playing cards (occasionally jokers or custom decks). Turn-based. Often one-vs-dealer (blackjack) or multi-player around a table (hearts, spades, rummy).

## When this genre is the right seed

If the goal mentions: blackjack, poker, solitaire, hearts, spades, rummy, or the compound noun "card game" — this is almost certainly the right match.

## Gameplay primitives a generator should expect

- A `Deck` model (52 cards, optionally jokers, shuffle/deal/draw)
- A `Card` model (suit, rank, optionally face-up state)
- A `Hand` collection per player
- Turn dispatch + rule validation per variant
- Scoring at end-of-hand or end-of-game

## Visual style references

- Classic green-felt table background
- Card faces rendered with corner indices + center suit
- Card backs with simple patterned back-face
- Chip stacks or counters for betting variants

## Not this genre

- Card games with deckbuilding progression across runs (those lean roguelike)
- Trading-card-game battles (MTG-likes) — different genre (TBD)
- Solitaire-with-extra-stuff (e.g. "solitaire but with monsters") — goal should trigger disambiguation
