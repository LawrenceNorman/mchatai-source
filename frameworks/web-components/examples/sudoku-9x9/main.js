import { getSwatchByID } from "../../resources/Swatches.js";
import { McSudokuAssembly } from "./McSudokuAssembly.js";

const game = new McSudokuAssembly({
  root: "[data-web-component-example='sudoku-9x9']",
  boardTarget: "#boardMount",
  hudTarget: "#hudMount",
  metaTarget: "#metaMount",
  difficultyContainer: ".sudoku-difficulty",
  numpadContainer: "#numpadMount",
  swatch: getSwatchByID("retro-neon")
});

game.start();

globalThis.mchatSudokuAssembly = game;
