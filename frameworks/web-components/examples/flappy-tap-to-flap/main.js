import { getSwatchByID } from "../../resources/Swatches.js";
import { McFlappyAssembly } from "./McFlappyAssembly.js";

const game = new McFlappyAssembly({
  canvasId: "gameCanvas",
  root: "[data-web-component-example='flappy-tap-to-flap']",
  hudTarget: "#hudMount",
  metaTarget: "#metaMount",
  messageTarget: "#messageMount",
  swatch: getSwatchByID("retro-neon")
});

game.start();

globalThis.mchatFlappyAssembly = game;
