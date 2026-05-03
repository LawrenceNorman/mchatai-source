import { MastermindGame } from "./MastermindGame.js";

const game = new MastermindGame({
  root: document,
  maxTurns: 10
});

game.start();
globalThis.mchatMastermindExample = game;
