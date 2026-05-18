// Register the new LevelProgression Lego, wire it into recipe.match3, and
// refresh entities.chess-ai's summary to reflect the PST + depth-3 default.
// ASCII-only strings per Swift catalog decoder gotcha.
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'frameworks/web-components/_index.json';
const d = JSON.parse(readFileSync(path, 'utf-8'));

// --- 1. Register entities.level-progression (idempotent) -------------------
const NEW_COMPONENT = {
  id: 'entities.level-progression',
  name: 'LevelProgression',
  category: 'entities',
  path: 'entities/LevelProgression.js',
  exports: ['LevelProgression'],
  status: 'ready',
  summary: 'N-level progression manager with cumulative score tracking across cleared levels. Mounts a hidden [data-mchatai-score] DOM element so the hosted-page leaderboard bridge reads the full run (sum of cleared levels + partial current), not the per-level reset value. Default ships 12 levels with a smooth difficulty curve; pass { levels: [...] } to override. Exposes onLevelChange + onCumulativeChange callbacks for HUD wiring. Plain JS class, NOT a custom element.',
  tags: ['levels', 'progression', 'leaderboard', 'cumulative', 'puzzle'],
  contracts: {
    factory: 'new LevelProgression({ levels?, onLevelChange?, onCumulativeChange? })',
    helpers: [
      'mount()',
      'start()',
      'recordLevelScore(score)',
      'advance()',
      'newGamePlus()',
      'retryLevel()',
      'currentMeta()',
      'getCumulativeScore()'
    ]
  },
  goodFits: ['match-three', 'candy-match', 'puzzle-ladder', 'tile-puzzle']
};

const existingIdx = d.components.findIndex((c) => c.id === NEW_COMPONENT.id);
if (existingIdx >= 0) {
  d.components[existingIdx] = NEW_COMPONENT;
  console.log('UPDATE entities.level-progression');
} else {
  d.components.push(NEW_COMPONENT);
  console.log('ADD    entities.level-progression');
}

// --- 2. Refresh entities.chess-ai summary ---------------------------------
const chessAI = d.components.find((c) => c.id === 'entities.chess-ai');
if (chessAI) {
  chessAI.summary = 'MinimaxAI wrapper with chess-specific evaluator: material values + piece-square tables (PST). Default depth 3 plays competently and stays under ~1s on typical hardware thanks to MinimaxAI capture-first move ordering. Pass { depth: 4 } for stronger but slower (~3s) play. Pass depth: 0 for random legal moves.';
  console.log('UPDATE entities.chess-ai summary (PST + depth-3)');
}

// --- 3. Refresh entities.minimax-ai summary -------------------------------
const miniAI = d.components.find((c) => c.id === 'entities.minimax-ai');
if (miniAI) {
  miniAI.summary = (miniAI.summary || '') + ' Phase 2026-05-17: now sorts moves by capture/promotion before recursing for alpha-beta cutoff bait (about 3x faster on chess at depth 3).';
  console.log('UPDATE entities.minimax-ai summary (move ordering)');
}

// --- 4. Wire LevelProgression into recipe.match3 --------------------------
const match3 = d.compositionRecipes.find((r) => r.id === 'recipe.match3');
if (match3) {
  for (const arr of ['starterComponents', 'requiredComponents']) {
    if (Array.isArray(match3[arr]) && !match3[arr].includes('entities.level-progression')) {
      match3[arr].push('entities.level-progression');
    }
  }
  // Append assemblyNote about cumulative + many-levels — ASCII only.
  const note = "Use LevelProgression to manage 8-12 levels with cumulative score. Do not reset the leaderboard score per level: LevelProgression.mount() injects a hidden [data-mchatai-score] element that the hosted-page bridge reads, so submitted scores reflect the entire run. After the final level, show a New Game+ button instead of looping back to level 1.";
  if (!match3.assemblyNotes.includes(note)) {
    match3.assemblyNotes.push(note);
    console.log('ADD    recipe.match3 assemblyNote (LevelProgression)');
  }
}

// --- 5. Bump catalog version + last_updated -------------------------------
d.last_updated = '2026-05-17';

writeFileSync(path, JSON.stringify(d, null, 2) + '\n');
console.log('Wrote', path);
