import { WordQuestGame } from "./WordQuestGame.js";

import { MiniHeader } from "../../ui/MiniHeader.js";

MiniHeader.mount(document.querySelector("[data-mini-header]"), { title: "Word Quest", subtitle: "Six guesses. Five letters. Green, gold, gray feedback." });

const game = new WordQuestGame({
  root: document.querySelector("[data-app]"),
  answerWords: ["CRANE", "PLANT", "BRAVE", "STONE", "LIGHT", "RIVER", "MOUSE", "SPARK"],
  dictionary: [
    "CRANE", "PLANT", "BRAVE", "STONE", "LIGHT", "RIVER", "MOUSE", "SPARK",
    "HEART", "GRACE", "TRAIL", "CLOUD", "SHARP", "BRAIN", "QUEST", "WORLD"
  ]
});

game.start();
