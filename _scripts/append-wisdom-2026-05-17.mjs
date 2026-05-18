// One-shot wisdom-pack update: port lessons from the Chess/Checkers/Candy
// Match GCS patches (HUB-13/15/21) into mchatai-source wisdom so future
// AIWizard generations bake them in. ASCII-only strings (Swift catalog
// decoder rejects em-dashes / smart quotes silently — see memory
// gotchas_swift_decoder_non_ascii_strings.md).
import { readFileSync, writeFileSync } from 'node:fs';

function append(path, newRules) {
  const pack = JSON.parse(readFileSync(path, 'utf-8'));
  pack.version = (pack.version || 0) + 1;
  pack.guidelines = pack.guidelines || [];
  const existingIds = new Set(pack.guidelines.map((g) => g.id));
  let added = 0;
  for (const rule of newRules) {
    if (existingIds.has(rule.id)) {
      console.log(`SKIP ${path} :: ${rule.id} already exists`);
      continue;
    }
    pack.guidelines.push(rule);
    added++;
    console.log(`ADD  ${path} :: ${rule.id}`);
  }
  writeFileSync(path, JSON.stringify(pack, null, 2) + '\n');
  return added;
}

// Board games: 4 new rules ---------------------------------------------------
append('wisdom/packs/board-games.json', [
  {
    id: 'bg-import-rules-do-not-inline',
    rule: 'When building chess, checkers, or other classic board games, IMPORT the existing Rules + AI Lego from entities/ (ChessRules + ChessAI, CheckersRules + CheckersAI). Do NOT inline-implement legal-move generation, minimax, or piece-square-table eval. The shipped Lego already handles edge cases (king moves, en passant, captures) and integrates with MinimaxAI for alpha-beta search.',
    why: 'Inline implementations consistently ship bugs the Lego already fixed. Examples we have seen: a chess artifact with a purely random move picker (no minimax at all); a checkers artifact that hard-coded forced-capture rules so the player could not decline a jump; both shipped before the Lego entities existed and have now been retrofitted by direct GCS patch. Each patch only fixes ONE published artifact. The fix MUST land in the Lego so the next prompt-generated game inherits it.',
    severity: 'critical',
    appliesTo: 'board-games',
    examples: [
      'import { ChessRules } from "./entities/ChessRules.js"; import { ChessAI } from "./entities/ChessAI.js";',
      'import { CheckersRules } from "./entities/CheckersRules.js"; import { CheckersAI } from "./entities/CheckersAI.js";',
      'BAD: writing your own getLegalMoves() / minimax() / evaluateBoard() inside the game module.'
    ]
  },
  {
    id: 'bg-checkers-captures-optional-by-default',
    rule: 'In checkers/draughts, captures are OPTIONAL by default. The player may decline a jump and play a normal move instead. CheckersRules.legalMoves() already returns both jump moves and simple moves together; do not filter out simple moves when a jump is available unless the user opted into tournament-strict mode.',
    why: 'Forced captures frustrate casual players. The user explicitly asked for this: "forces jumping when player wants other moves. Should be optional unless tournament-strict." Defaulting to optional is friendlier and matches casual checkers conventions; tournament-strict is opt-in via a constructor option.',
    severity: 'high',
    appliesTo: 'board-games',
    examples: [
      'new CheckersRules() // optional captures (default)',
      'new CheckersRules({ forceCaptures: true }) // tournament-strict',
      'Status text should read JUMP AVAILABLE when a jump exists, NOT JUMP REQUIRED.'
    ]
  },
  {
    id: 'bg-chess-ai-default-depth-three',
    rule: 'ChessAI default search depth is 3, not 2. Depth 2 plays at a beginner level (often missing material threats); depth 3 plays competently and still moves in under 1 second on typical hardware. Pass { depth: 4 } only if you can afford ~3 second think times.',
    why: 'A user reported the prior depth-2 default produced random-feeling moves: "I want a version of chess that is more competitive." Depth 3 with material + PST eval gives an opponent that defends pieces, threatens captures, and plays sensible openings.',
    severity: 'high',
    appliesTo: 'board-games',
    examples: [
      'new ChessAI({ rules, depth: 3 }) // recommended default',
      'new ChessAI({ rules, depth: 4 }) // strong, slow'
    ]
  },
  {
    id: 'bg-unicode-piece-text-shadow',
    rule: 'When rendering Unicode chess/checkers/cards glyphs (\\u2654-\\u265F, suit symbols) on light-colored squares, apply a text-shadow such as text-shadow: 0 0 1px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.30) to the cell or piece element. Hollow white-piece glyphs on light-tan board squares are nearly invisible without this.',
    why: 'User reported "better B/W contrast" as a chess ask. Unicode chess outline-style white pieces (U+2654-U+2659) lack their own fill, so they read poorly on light squares without a stroke or shadow. Black pieces (U+265A-U+265F) are solid but still benefit slightly.',
    severity: 'medium',
    appliesTo: 'board-games',
    examples: [
      '.cell { text-shadow: 0 0 1px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.30); }',
      'Or apply text-stroke equivalent via SVG filter for sharper outlines.'
    ]
  }
]);

// Leaderboard-games: 2 new rules ---------------------------------------------
append('wisdom/packs/leaderboard-games.json', [
  {
    id: 'lb-015-cumulative-across-levels',
    rule: 'In level-based games (match-three, candy match, puzzle ladders), the leaderboard score MUST be cumulative across all cleared levels in the run, not the per-level reset value. Maintain a cumulativeScore variable that adds each clearedLevel.score on level complete; expose it to the hosted-page leaderboard bridge via a hidden <span data-mchatai-score id="leaderboardScore">N</span> element.',
    why: 'Per-level reset is the default the bridge will read (it picks up [id*="score"]). Leaderboards then show the score from whichever level the player was on when they ran out of moves, which is often tiny. Players who cleared 7 levels and got stuck on level 8 should see their full run on the board.',
    severity: 'high',
    appliesTo: 'leaderboard-games',
    examples: [
      'let cumulativeScore = 0; on level-complete: cumulativeScore += levelScore; document.getElementById("leaderboardScore").textContent = String(cumulativeScore);',
      'The hidden span is read by pickScoreFromDOM tier-1 selector ([data-mchatai-score]).'
    ]
  },
  {
    id: 'lb-016-many-levels-or-endless',
    rule: 'Level-based games MUST ship with at least 8 levels of progressive difficulty, OR be endless with rising targets/declining moves. Looping back to level 1 after 3 levels is shipped repeatedly and feels broken; the final-level path should say "New Game+" and reset cumulative on explicit user action, not auto-loop.',
    why: 'User shipped a candy-match with only 3 levels that looped back to level 1, breaking the leaderboard run and frustrating the user mid-play. Future candy-match / puzzle-ladder generations should ship 8-12 levels by default, plus an explicit New Game+ flow.',
    severity: 'high',
    appliesTo: 'leaderboard-games',
    examples: [
      'const LEVELS = [{target:1500,moves:30},{target:3000,moves:30},{target:5000,moves:28},{target:7500,moves:26},{target:10500,moves:25},{target:14000,moves:24},{target:18000,moves:22},{target:22500,moves:22},{target:28000,moves:20},{target:34500,moves:20},{target:42000,moves:18},{target:50000,moves:18}];',
      'On last-level win: button label = "New Game+", click handler resets cumulativeScore and starts level 0.'
    ]
  }
]);
