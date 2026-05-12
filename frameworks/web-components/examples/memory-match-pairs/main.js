import { getSwatchByID } from "../../resources/Swatches.js";
import { MemoryMatchClassicGame } from "./MemoryMatchClassicGame.js";

const game = new MemoryMatchClassicGame({
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

globalThis.mchatMemoryExample = game;
