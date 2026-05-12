import { getSwatchByID } from "../../resources/Swatches.js";
import { McSquaredleAssembly } from "./McSquaredleAssembly.js";

const game = new McSquaredleAssembly({
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

globalThis.mchatSquaredleAssembly = game;
