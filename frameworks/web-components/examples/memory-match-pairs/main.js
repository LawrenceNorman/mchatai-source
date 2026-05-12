import { getSwatchByID } from "../../resources/Swatches.js";
import { McMemoryMatchAssembly } from "./McMemoryMatchAssembly.js";

const game = new McMemoryMatchAssembly({
  root: "[data-web-component-example='memory-match-pairs']",
  boardTarget: "#boardMount",
  hudTarget: "#hudMount",
  metaTarget: "#metaMount",
  messageTarget: "#messageMount",
  difficultyContainer: ".memory-difficulty",
  restartBtnId: "restartBtn",
  swatch: getSwatchByID("retro-neon")
});

game.start();

globalThis.mchatMemoryMatchAssembly = game;
