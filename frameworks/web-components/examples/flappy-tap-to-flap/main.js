import { getSwatchByID } from "../../resources/Swatches.js";
import { FlappyClassicGame } from "./FlappyClassicGame.js";

const game = new FlappyClassicGame({
  canvasId: "gameCanvas",
  root: "[data-web-component-example='flappy-tap-to-flap']",
  hudTarget: "#hudMount",
  metaTarget: "#metaMount",
  messageTarget: "#messageMount",
  swatch: getSwatchByID("retro-neon")
});

game.start();

globalThis.mchatFlappyExample = game;
