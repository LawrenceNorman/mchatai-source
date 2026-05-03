import { PianoGame } from "./PianoGame.js";

const game = new PianoGame({
  root: document
});

game.start();
globalThis.mchatPianoExample = game;
