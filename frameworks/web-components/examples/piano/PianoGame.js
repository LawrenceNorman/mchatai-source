import { PianoKeyboard } from "../../ui/PianoKeyboard.js";
import { KeyboardInput } from "../../ui/KeyboardInput.js";
import { AudioManager } from "../../resources/AudioManager.js";
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";

const SHORTCUTS = ["a", "s", "d", "f", "g", "h", "j", "k"];
const NOTES = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];

function pianoQuery(root, selector) {
  return root.querySelector(selector);
}

export class PianoGame {
  constructor(options = {}) {
    this.root = options.root || document;
    this.audio = new AudioManager({ masterVolume: 0.08 });
    this.notes = options.notes || NOTES;
    this.trail = [];
    this.currentNote = pianoQuery(this.root, "#currentNote");
    this.currentKey = pianoQuery(this.root, "#currentKey");
    this.noteCount = pianoQuery(this.root, "#noteCount");
    this.noteTrail = pianoQuery(this.root, "#noteTrail");
    this.keyboard = null;
    this.keyInput = null;
  }

  start() {
    applySwatchVariables(document.documentElement, getSwatchByID("retro-neon"));
    this.keyboard = new PianoKeyboard({
      root: pianoQuery(this.root, "#pianoMount"),
      notes: this.notes,
      audio: this.audio,
      onNote: (note, frequency) => this.recordNote(note, frequency)
    });
    this.bindShortcuts();
    pianoQuery(this.root, "#playScaleButton").addEventListener("click", () => this.playScale());
    pianoQuery(this.root, "#clearButton").addEventListener("click", () => this.clearTrail());
    this.decorateKeys();
    this.render();
  }

  bindShortcuts() {
    this.keyInput = new KeyboardInput({
      target: window,
      onAction: (note) => this.playNote(note)
    });
    const bindings = {};
    this.notes.forEach((note, index) => {
      bindings[SHORTCUTS[index]] = note;
    });
    this.keyInput.bindMany(bindings);
  }

  decorateKeys() {
    this.keyboard.buttons.forEach((button, index) => {
      button.innerHTML = `<span>${this.notes[index]}</span><small>${SHORTCUTS[index].toUpperCase()}</small>`;
    });
  }

  playNote(note) {
    this.keyboard.play(note);
  }

  recordNote(note, frequency) {
    const shortcut = SHORTCUTS[this.notes.indexOf(note)] || "";
    this.trail.unshift({ note, shortcut, frequency });
    this.trail = this.trail.slice(0, 12);
    this.flashKey(note);
    this.currentNote.textContent = note;
    this.currentKey.textContent = shortcut.toUpperCase();
    this.render();
  }

  flashKey(note) {
    const index = this.notes.indexOf(note);
    const button = this.keyboard.buttons[index];
    if (!button) {
      return;
    }
    button.dataset.active = "true";
    window.setTimeout(() => {
      button.dataset.active = "false";
    }, 140);
  }

  playScale() {
    this.notes.forEach((note, index) => {
      window.setTimeout(() => this.playNote(note), index * 130);
    });
  }

  clearTrail() {
    this.trail = [];
    this.currentNote.textContent = "Ready";
    this.currentKey.textContent = "A-K";
    this.render();
  }

  render() {
    this.noteCount.textContent = String(this.trail.length);
    this.noteTrail.innerHTML = "";
    this.trail.forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = `${entry.note} ${entry.shortcut.toUpperCase()}`;
      this.noteTrail.appendChild(item);
    });
  }
}
