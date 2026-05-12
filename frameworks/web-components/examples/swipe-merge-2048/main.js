import { getSwatchByID } from "../../resources/Swatches.js";
import { SwipeMergeClassicGame } from "./SwipeMergeClassicGame.js";

const game = new SwipeMergeClassicGame({
  root: "[data-web-component-example='swipe-merge-2048']",
  boardTarget: "#boardMount",
  hudTarget: "#hudMount",
  metaTarget: "#metaMount",
  messageTarget: "#messageMount",
  restartBtnId: "restartBtn",
  swatch: getSwatchByID("retro-neon")
});

game.start();

globalThis.mchatSwipeMergeExample = game;
