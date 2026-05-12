import { getSwatchByID } from "../../resources/Swatches.js";
import { SolitaireClassicGame } from "./SolitaireClassicGame.js";

const game = new SolitaireClassicGame({
  root: "[data-web-component-example='solitaire-klondike']",
  stockTarget: "#stockMount",
  wasteTarget: "#wasteMount",
  foundationsTarget: "#foundationsMount",
  tableauTarget: "#tableauMount",
  hudTarget: "#hudMount",
  metaTarget: "#metaMount",
  messageTarget: "#messageMount",
  newDealBtnId: "newDealBtn",
  undoBtnId: "undoBtn",
  swatch: getSwatchByID("retro-neon")
});

game.start();

globalThis.mchatSolitaireExample = game;
