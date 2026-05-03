import { CrosswordGame } from "./CrosswordGame.js";

const game = new CrosswordGame({
  root: document
});

game.start();
globalThis.mchatCrosswordExample = game;
