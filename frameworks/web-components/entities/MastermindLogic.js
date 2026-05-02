export class MastermindLogic {
  constructor(options = {}) {
    this.colors = options.colors ?? ["red", "blue", "green", "yellow", "purple", "orange"];
    this.codeLength = options.codeLength ?? 4;
    this.allowDuplicates = options.allowDuplicates !== false;
  }

  generateCode() {
    const pool = this.colors.slice();
    const code = [];
    for (let i = 0; i < this.codeLength; i += 1) {
      const index = Math.floor(Math.random() * pool.length);
      code.push(pool[index]);
      if (!this.allowDuplicates) {
        pool.splice(index, 1);
      }
    }
    return code;
  }

  scoreGuess(guess, code) {
    const exact = [];
    const remainingGuess = [];
    const remainingCode = [];

    for (let i = 0; i < code.length; i += 1) {
      if (guess[i] === code[i]) {
        exact.push(i);
      } else {
        remainingGuess.push(guess[i]);
        remainingCode.push(code[i]);
      }
    }

    let colorOnly = 0;
    const counts = new Map();
    for (const color of remainingCode) {
      counts.set(color, (counts.get(color) ?? 0) + 1);
    }
    for (const color of remainingGuess) {
      const count = counts.get(color) ?? 0;
      if (count > 0) {
        colorOnly += 1;
        counts.set(color, count - 1);
      }
    }

    return {
      exact: exact.length,
      colorOnly,
      solved: exact.length === code.length
    };
  }
}
