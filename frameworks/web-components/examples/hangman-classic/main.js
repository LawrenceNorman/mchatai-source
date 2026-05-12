import { getSwatchByID } from "../../resources/Swatches.js";
import { HangmanClassicGame } from "./HangmanClassicGame.js";

const game = new HangmanClassicGame({
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

globalThis.mchatHangmanExample = game;
