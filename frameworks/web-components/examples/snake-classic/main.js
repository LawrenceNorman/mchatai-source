import { getSwatchByID } from "../../resources/Swatches.js";
import { McSnakeAssembly } from "./McSnakeAssembly.js";

const game = new McSnakeAssembly({
  canvasId: "gameCanvas",
  root: "[data-web-component-example='snake-classic']",
  hudTarget: "#hudMount",
  metaTarget: "#metaMount",
  messageTarget: "#messageMount",
  controlsSelector: ".snake-controls",
  swatch: getSwatchByID("retro-neon")
});

game.start();

globalThis.mchatSnakeAssembly = game;
