import { getSwatchByID } from "../../resources/Swatches.js";
import { AsteroidsGame } from "./AsteroidsGame.js";

const game = new AsteroidsGame({
  canvasId: "gameCanvas",
  root: "[data-web-component-example='asteroids']",
  hudTarget: "#hudMount",
  metaTarget: "#metaMount",
  messageTarget: "#messageMount",
  swatch: getSwatchByID("vector-noir")
});

game.start();

globalThis.mchatAsteroidsExample = game;
