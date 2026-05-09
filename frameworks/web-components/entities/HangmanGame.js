// BEGIN mchatai-web-components: entities.hangman-game (entities/HangmanGame.js)

/**
 * Hangman game state machine. Letter-by-letter word-guessing classic.
 *
 * Mechanics:
 *   - Pick a target word (string of letters, normalized to uppercase).
 *   - Player guesses letters one at a time.
 *   - Correct letter → revealed in all positions; doesn't count as a wrong guess.
 *   - Incorrect letter → adds to wrongGuesses. Player loses on maxWrong (default 6).
 *   - Player wins when all letters in the target are guessed.
 *
 * Rendering-agnostic. Caller draws the gallows / hangman per state.wrongCount and
 * the masked-word string per state.maskedWord(). Standard hangman has 6 limbs:
 * head, body, left arm, right arm, left leg, right leg.
 */
export class HangmanGame {
  constructor(options = {}) {
    this.maxWrong = options.maxWrong ?? 6;
    this.target = ""; // uppercase
    this.guessed = new Set(); // uppercase letters tried
    this.wrongCount = 0;
    this.state = "idle"; // "idle" | "playing" | "won" | "lost"
  }

  /** Start a new round with `word`. Resets all state. */
  newRound(word) {
    const upper = String(word ?? "").toUpperCase().replace(/[^A-Z]/g, "");
    if (upper.length < 2) throw new Error(`hangman target must be ≥2 letters; got "${word}"`);
    this.target = upper;
    this.guessed = new Set();
    this.wrongCount = 0;
    this.state = "playing";
  }

  /** Guess a single letter. Returns:
   *   { kind: "correct" | "incorrect" | "repeat" | "ignored", letter,
   *     positions?: [indices], wrongCount, state, masked } */
  guessLetter(letter) {
    const L = String(letter ?? "").toUpperCase();
    if (this.state !== "playing") {
      return { kind: "ignored", letter: L, reason: "not-playing", wrongCount: this.wrongCount, state: this.state, masked: this.maskedWord() };
    }
    if (L.length !== 1 || L < "A" || L > "Z") {
      return { kind: "ignored", letter: L, reason: "not-a-letter", wrongCount: this.wrongCount, state: this.state, masked: this.maskedWord() };
    }
    if (this.guessed.has(L)) {
      return { kind: "repeat", letter: L, wrongCount: this.wrongCount, state: this.state, masked: this.maskedWord() };
    }
    this.guessed.add(L);
    if (this.target.includes(L)) {
      const positions = [];
      for (let i = 0; i < this.target.length; i += 1) {
        if (this.target[i] === L) positions.push(i);
      }
      // Check win
      if (this.isFullyRevealed()) this.state = "won";
      return { kind: "correct", letter: L, positions, wrongCount: this.wrongCount, state: this.state, masked: this.maskedWord() };
    } else {
      this.wrongCount += 1;
      if (this.wrongCount >= this.maxWrong) this.state = "lost";
      return { kind: "incorrect", letter: L, wrongCount: this.wrongCount, state: this.state, masked: this.maskedWord() };
    }
  }

  /** Reveal mask: letter if guessed, "_" otherwise. Spaces preserved as " ". */
  maskedWord() {
    let out = "";
    for (const ch of this.target) {
      if (ch === " ") out += " ";
      else if (this.guessed.has(ch)) out += ch;
      else out += "_";
    }
    return out;
  }

  /** True if every letter in the target has been guessed. */
  isFullyRevealed() {
    for (const ch of this.target) {
      if (ch === " ") continue;
      if (!this.guessed.has(ch)) return false;
    }
    return true;
  }

  /** True if game is in a terminal state (won or lost). */
  isOver() {
    return this.state === "won" || this.state === "lost";
  }

  /** Letters remaining in A-Z that haven't been guessed yet. Useful for
   *  driving an A-Z keyboard's enabled/disabled state. */
  remainingLetters() {
    const out = [];
    for (let i = 0; i < 26; i += 1) {
      const L = String.fromCharCode(65 + i);
      if (!this.guessed.has(L)) out.push(L);
    }
    return out;
  }
}

/** Default word list — 100 common 4-8 letter words. Caller should pass
 *  their own thematic list (animals, foods, movies, etc.) for variety. */
export const HANGMAN_DEFAULT_WORDS = [
  "ANCHOR","APPLE","ARROW","AUTUMN","BAKERY","BANANA","BANJO","BASKET","BICYCLE","BIRTHDAY",
  "BISCUIT","BLANKET","BLOSSOM","BOTTLE","BRANCH","BRIDGE","BUBBLE","BUTTON","CABBAGE","CACTUS",
  "CAMEL","CANDLE","CANVAS","CARROT","CASTLE","CHAIR","CHEESE","CHERRY","CIRCUS","CLOUD",
  "COMET","COMPASS","COTTON","COURAGE","CRAYON","CRYSTAL","DESERT","DIAMOND","DOLPHIN","DRAGON",
  "EAGLE","EMERALD","FALCON","FEATHER","FLOWER","FOREST","FROZEN","GARDEN","GIRAFFE","GLACIER",
  "GUITAR","HARBOR","HARVEST","HELMET","HONEY","ICEBERG","IGLOO","ISLAND","JACKET","JEWEL",
  "JUNGLE","KETTLE","KEYBOARD","KITCHEN","LADDER","LANTERN","LIBRARY","LIZARD","MARBLE","MASTER",
  "MEADOW","MIRROR","MOUNTAIN","MUSEUM","NATURE","ORANGE","ORCHARD","PARROT","PEBBLE","PENCIL",
  "PENGUIN","PIANO","PIRATE","PLANET","PLAYFUL","POCKET","PUZZLE","RAINBOW","RIVER","ROBOT",
  "SAILBOAT","SANDWICH","SHADOW","SILVER","SUMMER","TIGER","TURTLE","UMBRELLA","VOLCANO","WHISPER"
];
// END mchatai-web-components: entities.hangman-game
