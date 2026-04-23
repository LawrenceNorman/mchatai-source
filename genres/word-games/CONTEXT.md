---
artifactID: genre.word-games
kind: genre
parent: games
origin: seed
lastUpdated: 2026-04-22
---

# Word Games

Vocabulary and letter-manipulation games. Often daily-play (wordle), or session-based (scrabble, boggle).

## When this genre is the right seed

If the goal mentions: wordle, crossword, hangman, boggle, scrabble, or the compound noun "word game" — this is the genre.

## Gameplay primitives a generator should expect

- A word list (curated dictionary, filtered by length / difficulty)
- Letter-grid rendering (wordle 5×6, boggle 4×4, crossword variable)
- Guess validation against dictionary
- Feedback rendering (wordle color-coding, hangman limb count)
- Daily-seed mode OR unlimited-play mode

## Visual style references

- Bold sans-serif letter tiles
- Color coding for feedback (green/yellow/gray for wordle)
- Clean, high-contrast, accessible (word games skew older audience)

## Not this genre

- Trivia/quiz — that's its own category (trivia-quiz in the legacy tree)
- Flashcard-style memorization — that's learning tools, not games
