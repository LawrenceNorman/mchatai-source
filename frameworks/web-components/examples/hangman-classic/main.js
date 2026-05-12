import { getSwatchByID } from "../../resources/Swatches.js";
import { McHangmanAssembly } from "./McHangmanAssembly.js";

const game = new McHangmanAssembly({
  root: "[data-web-component-example='hangman-classic']",
  hudTarget: "#hudMount",
  metaTarget: "#metaMount",
  gallowsCanvasId: "gallowsCanvas",
  wordTarget: "#wordMount",
  messageTarget: "#messageMount",
  keyboardTarget: "#keyboardMount",
  restartButtonId: "restartBtn",
  swatch: getSwatchByID("retro-neon")
});

game.start();

globalThis.mchatHangmanAssembly = game;
