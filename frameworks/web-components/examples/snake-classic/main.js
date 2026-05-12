import { getSwatchByID } from "../../resources/Swatches.js";
import { SnakeClassicGame } from "./SnakeClassicGame.js";

const game = new SnakeClassicGame({
  canvasId: "gameCanvas",
  root: "[data-web-component-example='snake-classic']",
  hudTarget: "#hudMount",
  metaTarget: "#metaMount",
  messageTarget: "#messageMount",
  controlsSelector: ".snake-controls",
  swatch: getSwatchByID("retro-neon")
});

game.start();

globalThis.mchatSnakeExample = game;
