export class PianoKeyboard {
  constructor(options = {}) {
    this.notes = options.notes ?? ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
    this.audio = options.audio ?? null;
    this.onNote = options.onNote ?? (() => {});
    this.root = options.root ?? document.createElement("div");
    this.root.className = options.className ?? "wc-piano-keyboard";
    this.buttons = [];
    this.render();
  }

  render() {
    this.root.innerHTML = "";
    this.buttons = this.notes.map((note) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "wc-piano-key";
      button.textContent = note;
      button.addEventListener("pointerdown", () => this.play(note));
      this.root.appendChild(button);
      return button;
    });
  }

  play(note) {
    const frequency = PianoKeyboard.noteFrequency(note);
    this.audio?.beep?.({ frequency, duration: 0.22, type: "sine" });
    this.onNote(note, frequency);
  }

  destroy() {
    this.root.replaceChildren();
    this.buttons = [];
  }

  static noteFrequency(note) {
    const match = /^([A-G])(#|b)?(\d)$/.exec(note);
    if (!match) {
      return 440;
    }
    const semitones = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
    let offset = semitones[match[1]] + (Number(match[3]) - 4) * 12;
    if (match[2] === "#") offset += 1;
    if (match[2] === "b") offset -= 1;
    return 440 * Math.pow(2, offset / 12);
  }
}
