import { getSwatchByID } from "../../resources/Swatches.js";
import { SquaredleClassicGame } from "./SquaredleClassicGame.js";

const game = new SquaredleClassicGame({
  root: "[data-web-component-example='squaredle-word-trace']",
  boardTarget: "#boardMount",
  hudTarget: "#hudMount",
  metaTarget: "#metaMount",
  currentWordTarget: "#currentWordMount",
  foundTarget: "#foundMount",
  messageTarget: "#messageMount",
  restartBtnId: "restartBtn",
  swatch: getSwatchByID("retro-neon")
});

game.start();

globalThis.mchatSquaredleExample = game;
