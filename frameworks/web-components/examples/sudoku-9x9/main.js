import { getSwatchByID } from "../../resources/Swatches.js";
import { SudokuClassicGame } from "./SudokuClassicGame.js";

const game = new SudokuClassicGame({
  root: "[data-web-component-example='sudoku-9x9']",
  boardTarget: "#boardMount",
  hudTarget: "#hudMount",
  metaTarget: "#metaMount",
  difficultyContainer: ".sudoku-difficulty",
  numpadContainer: "#numpadMount",
  swatch: getSwatchByID("retro-neon")
});

game.start();

globalThis.mchatSudokuExample = game;
