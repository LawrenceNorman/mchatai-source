import { getSwatchByID } from "../../resources/Swatches.js";
import { McSwipeMergeAssembly } from "./McSwipeMergeAssembly.js";

const game = new McSwipeMergeAssembly({
  root: "[data-web-component-example='swipe-merge-2048']",
  boardTarget: "#boardMount",
  hudTarget: "#hudMount",
  metaTarget: "#metaMount",
  messageTarget: "#messageMount",
  restartBtnId: "restartBtn",
  swatch: getSwatchByID("retro-neon")
});

game.start();

globalThis.mchatSwipeMergeAssembly = game;
