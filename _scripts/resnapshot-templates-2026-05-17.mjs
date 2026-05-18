// Re-snapshot the 3 stale game templates' reference.html from their
// post-patch GCS source artifacts, and bump templateVersion to 2.
//
// Why: the templates at harness/templates/miniapps/{board-checkers-mono,
// chess-game-board, match-three-puzzle-game} were extracted at v1 from
// hub-published artifacts that contained the bugs we just fixed (forced
// jumps, random AI, 3-level loop). The AIWizard reads these templates as
// "this is what a great X looks like" reference material — so even with our
// new wisdom + Lego in place, the wizard learns the OLD code shape from
// these reference files. Re-snapshotting from the just-patched artifacts
// fixes that.
//
// We also rewrite checkers-mono's qualityNotes which literally says
// "Preserve the board[][] 2D-array model and the legal-move-generation
// function" — that direction told the wizard to preserve the forced-jump
// bug. Updated to call out optional captures.
//
// This script needs to be run with firebase-admin available, and reads
// from the user-projects bucket on Cloud Storage. Run from a directory
// where firebase-admin is installed (e.g. mchataiweb/functions/).
import admin from 'firebase-admin';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

admin.initializeApp({ projectId: 'mchatai-2367e' });
const bucket = admin.storage().bucket('mchatai-user-projects');

const __dirname = dirname(fileURLToPath(import.meta.url));
// mchatai-source root is one level up from _scripts/
const SOURCE_ROOT = join(__dirname, '..');

const TEMPLATES = [
  {
    id: 'board-checkers-mono',
    sourcePrefix: 'GI1GHQ7wpLQKjJyf9QRQATyw5e33/checkers-mono',
    qualityNotes: 'Hand-curated from mchatai.com/hub/checkers-mono/play. Working 8x8 diagonal-move logic, multi-jump chain support, king promotion. Monochrome IBM Plex Mono aesthetic. v2 update 2026-05-17: optional captures (jumping is no longer required; UI says JUMP AVAILABLE). Preserve the board[][] 2D-array model AND the optional-capture semantics — do not regress to forced captures unless the user explicitly asks for tournament-strict rules.',
  },
  {
    id: 'chess-game-board',
    sourcePrefix: 'GI1GHQ7wpLQKjJyf9QRQATyw5e33/playable-chess',
    qualityNotes: 'Promoted 2026-04-30. v2 update 2026-05-17: AI swapped from random-move-picker to minimax depth-3 with material + piece-square-table eval and capture-first move ordering (~1s per move). Cell text-shadow added for piece contrast on light squares. Preserve these — do not regress to random AI.',
  },
  {
    id: 'match-three-puzzle-game',
    sourcePrefix: 'GI1GHQ7wpLQKjJyf9QRQATyw5e33/candy-match',
    qualityNotes: 'Promoted from candy-match. v2 update 2026-05-17: future generations of this category should use the LevelProgression Lego (entities/LevelProgression.js) for 8+ levels with cumulative score across cleared levels, exposed to the leaderboard bridge via hidden [data-mchatai-score] element. See wisdom rules lb-015 + lb-016.',
  },
];

for (const t of TEMPLATES) {
  const gcsPath = `user-projects/${t.sourcePrefix}/index.html`;
  const [buf] = await bucket.file(gcsPath).download();
  const html = buf.toString('utf-8');

  const templateDir = join(SOURCE_ROOT, 'harness', 'templates', 'miniapps', t.id);
  const refPath = join(templateDir, 'reference.html');
  const manifestPath = join(templateDir, 'template-manifest.json');

  // Write new reference.html
  writeFileSync(refPath, html);
  console.log(`Wrote ${refPath} (${html.length} bytes)`);

  // Update manifest: bump version, refresh qualityNotes, set extractedAt.
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  manifest.templateVersion = (manifest.templateVersion || 1) + 1;
  manifest.qualityNotes = t.qualityNotes;
  manifest.extractedAt = '2026-05-17';
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`  Bumped ${manifestPath} to v${manifest.templateVersion}`);
}

console.log('\nDone. Stage + commit + push from mchatai-source/.');
process.exit(0);
