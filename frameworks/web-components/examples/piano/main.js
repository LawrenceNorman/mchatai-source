import { PianoGame } from "./PianoGame.js";

import { MiniHeader } from "../../ui/MiniHeader.js";

if (typeof MiniHeader !== "undefined" && MiniHeader && typeof MiniHeader.mount === "function") {
  MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Piano", subtitle: "Tap keys or use A through K. Notes light up." });
}
const game = new PianoGame({
  root: document
});

game.start();
globalThis.mchatPianoExample = game;
