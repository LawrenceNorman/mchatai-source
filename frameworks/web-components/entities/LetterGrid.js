import { GridBoard } from "./GridBoard.js";

export class LetterGrid extends GridBoard {
  constructor(options = {}) {
    super({ ...options, rows: options.rows ?? 6, cols: options.cols ?? 5, fill: "" });
  }

  setWord(row, word) {
    const letters = String(word ?? "").toUpperCase().split("");
    for (let col = 0; col < this.cols; col += 1) {
      this.set(row, col, letters[col] ?? "");
    }
  }

  rowWord(row) {
    let out = "";
    for (let col = 0; col < this.cols; col += 1) {
      out += this.get(row, col) || "";
    }
    return out;
  }

  scoreGuess(row, answer) {
    const guess = this.rowWord(row);
    const target = String(answer ?? "").toUpperCase();
    const result = Array.from({ length: this.cols }, (_, col) => ({
      letter: guess[col] ?? "",
      status: "absent"
    }));
    const remaining = new Map();

    for (let col = 0; col < this.cols; col += 1) {
      if (guess[col] === target[col]) {
        result[col].status = "correct";
      } else {
        const letter = target[col];
        remaining.set(letter, (remaining.get(letter) ?? 0) + 1);
      }
    }

    for (let col = 0; col < this.cols; col += 1) {
      if (result[col].status === "correct") {
        continue;
      }
      const letter = guess[col];
      const count = remaining.get(letter) ?? 0;
      if (count > 0) {
        result[col].status = "present";
        remaining.set(letter, count - 1);
      }
    }
    return result;
  }
}
