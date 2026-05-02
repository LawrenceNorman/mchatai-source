import { WordQuestGame } from "./WordQuestGame.js";

const game = new WordQuestGame({
  root: document.querySelector("[data-app]"),
  answerWords: ["CRANE", "PLANT", "BRAVE", "STONE", "LIGHT", "RIVER", "MOUSE", "SPARK"],
  dictionary: [
    "CRANE", "PLANT", "BRAVE", "STONE", "LIGHT", "RIVER", "MOUSE", "SPARK",
    "HEART", "GRACE", "TRAIL", "CLOUD", "SHARP", "BRAIN", "QUEST", "WORLD"
  ]
});

game.start();
