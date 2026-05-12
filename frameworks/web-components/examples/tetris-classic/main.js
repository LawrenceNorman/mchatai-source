import { getSwatchByID } from "../../resources/Swatches.js";
import { McTetrisAssembly } from "./McTetrisAssembly.js";

const game = new McTetrisAssembly({
  root: "[data-web-component-example='tetris-classic']",
  canvasId: "gameCanvas",
  nextCanvasId: "nextCanvas",
  hudTarget: "#hudMount",
  metaTarget: "#metaMount",
  messageTarget: "#messageMount",
  linesElId: "linesValue",
  levelElId: "levelValue",
  controlsSelector: ".tetris-controls",
  swatch: getSwatchByID("retro-neon")
});

game.start();

globalThis.mchatTetrisAssembly = game;
