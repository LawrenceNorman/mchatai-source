import { BlackjackGame } from "./BlackjackGame.js";

const game = new BlackjackGame({
  root: document,
  startingBankroll: 100,
  baseBet: 10
});

game.start();
globalThis.mchatBlackjackExample = game;
