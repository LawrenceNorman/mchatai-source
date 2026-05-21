#!/usr/bin/env node
// Phase PC.10 - Generate TTS preview assets for the audio-library-speech catalog.
//
// Reads each speech prompt JSON, calls OpenAI tts-1 with the configured voice,
// uploads the resulting mp3 to GCS, and writes the public URL back into the JSON.
// Idempotent (skips items that already have audioPreviewURL set).
//
// Auth: pulls OPENAI_API_KEY from GCP Secret Manager via gcloud.
//
// Usage:
//   node generate-tts-previews-2026-05-20.mjs                 # full batch
//   node generate-tts-previews-2026-05-20.mjs --dry-run
//   node generate-tts-previews-2026-05-20.mjs --only=cheerful-greeting-alloy
//   node generate-tts-previews-2026-05-20.mjs --limit 1
//
// Cost: tts-1 at $15 per 1M chars. Our 20 prompts average ~150 chars each
// (long fairytales + short demos) = ~3K chars total = ~$0.045 per full batch.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = '/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/prompt-examples/audio-library-speech';
const GCS_BUCKET = 'mchatai-2367e.firebasestorage.app';
const GCS_PREFIX = 'prompt-previews/audio-library-speech';
const PUBLIC_BASE = `https://storage.googleapis.com/${GCS_BUCKET}`;
const SECRET_PROJECT = 'mchatai-2367e';

// CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const argLimit = pickArg('--limit') ? parseInt(pickArg('--limit'), 10) : null;
const argOnly = pickArg('--only')?.split(',').filter(Boolean) ?? null;
function pickArg(name) {
  const i = args.findIndex(a => a === name || a.startsWith(`${name}=`));
  if (i < 0) return null;
  return args[i].includes('=') ? args[i].split('=', 2)[1] : args[i + 1];
}

function fetchSecret() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  return execSync(
    `gcloud secrets versions access latest --secret=OPENAI_API_KEY --project=${SECRET_PROJECT}`,
    { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
  ).trim();
}
const apiKey = dryRun ? '<dry-run>' : fetchSecret();
if (!dryRun && !apiKey) { console.error('No OPENAI_API_KEY'); process.exit(2); }

const TMP_ROOT = join(tmpdir(), `tts-previews-${Date.now()}`);
mkdirSync(TMP_ROOT, { recursive: true });

// Load all speech prompts
const items = [];
for (const fname of readdirSync(ROOT).sort()) {
  if (!fname.endsWith('.json') || fname.startsWith('_')) continue;
  const path = join(ROOT, fname);
  items.push({ path, data: JSON.parse(readFileSync(path, 'utf-8')) });
}
console.log(`Loaded ${items.length} speech prompts.`);

const todo = items.filter(it => {
  if (argOnly && !argOnly.includes(it.data.id)) return false;
  if (it.data.audioPreviewURL) return false;  // already done
  return true;
});
const batch = argLimit ? todo.slice(0, argLimit) : todo;
console.log(`Will generate ${batch.length} (${items.length - todo.length} already done${argLimit ? `, limited from ${todo.length}` : ''}).`);

if (dryRun) {
  for (const it of batch) console.log(`  [DRY] ${it.data.id} voice=${it.data.voiceHint}`);
  process.exit(0);
}

let ok = 0, failed = 0;
for (let i = 0; i < batch.length; i++) {
  const it = batch[i];
  const tag = `[${i + 1}/${batch.length}] ${it.data.id}`;
  try {
    console.log(`${tag} voice=${it.data.voiceHint || 'alloy'} ...`);
    const audio = await ttsRequest(it.data);
    const slug = it.data.id;
    const rawPath = join(TMP_ROOT, `${slug}.mp3`);
    writeFileSync(rawPath, audio);
    const gcsPath = `${GCS_PREFIX}/${slug}/preview.mp3`;
    gcsUpload(rawPath, gcsPath, 'audio/mpeg');
    it.data.audioPreviewURL = `${PUBLIC_BASE}/${gcsPath}`;
    // Approximate duration: 150 chars/sec is the OpenAI tts-1 nominal rate.
    // We don't probe with ffprobe here — durations are advisory in the UI.
    it.data.previewDurationSec = Math.max(2, Math.round(it.data.prompt.length / 15));
    writeFileSync(it.path, JSON.stringify(it.data, null, 2) + '\n');
    ok++;
    console.log(`${tag} OK (${audio.length} bytes, ~${it.data.previewDurationSec}s)`);
  } catch (e) {
    failed++;
    console.error(`${tag} FAIL: ${e.message}`);
  }
}
console.log(`\nDone. ok=${ok} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);

async function ttsRequest(data) {
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: data.modelHint || 'tts-1',
      voice: data.voiceHint || 'alloy',
      input: data.prompt,
      response_format: 'mp3',
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return Buffer.from(await r.arrayBuffer());
}

function gcsUpload(localPath, gcsRelPath, contentType) {
  execSync(
    `gsutil -h "Content-Type:${contentType}" -h "Cache-Control:public, max-age=31536000, immutable" ` +
    `cp -a public-read ${shell(localPath)} gs://${GCS_BUCKET}/${gcsRelPath}`,
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
}

function shell(s) { return `'${s.replace(/'/g, "'\\''")}'`; }
