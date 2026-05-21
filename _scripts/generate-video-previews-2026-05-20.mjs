#!/usr/bin/env node
// Phase PC.11 - Generate video preview assets for the dreamsnap-video catalog.
//
// OpenRouter video API is asynchronous: POST kicks off a job, returns an id,
// poll the status endpoint until completed, then download the mp4 from the
// returned URL. After download we use ffmpeg to extract a still-frame thumb
// at t=1s and re-encode (if needed) for consistent web playback.
//
// Auth: mints a $10-cap OpenRouter sub-key from OPENROUTER_PROVISIONING_KEY
// (same pattern as PC.2). Each script invocation gets a fresh sub-key.
//
// Usage:
//   node generate-video-previews-2026-05-20.mjs --dry-run
//   node generate-video-previews-2026-05-20.mjs --only=cinematic-establishing-shot
//   node generate-video-previews-2026-05-20.mjs --limit 1
//   node generate-video-previews-2026-05-20.mjs                  # full batch
//
// Cost (xAI Grok Imagine Video at $0.05/s, 5s clips): ~$0.25/item, ~$3.75/15.
//
// NOTE on the OpenRouter video API: as of 2026-05-20 the exact endpoint shapes
// are still evolving. This script targets:
//   POST   /v1/videos/generations           {model, prompt, duration_seconds}
//   GET    /v1/videos/generations/{id}      -> {status: 'queued'|'processing'|'completed'|'failed', video?: {url}}
// If OpenRouter renames endpoints or response keys, only orPostVideo() +
// orPollVideo() need updating.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = '/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/prompt-examples/dreamsnap-video';
const GCS_BUCKET = 'mchatai-2367e.firebasestorage.app';
const GCS_PREFIX = 'prompt-previews/dreamsnap-video';
const PUBLIC_BASE = `https://storage.googleapis.com/${GCS_BUCKET}`;
const SECRET_PROJECT = 'mchatai-2367e';
const OR_BASE = 'https://openrouter.ai/api/v1';
const POLL_MAX_S = 240;            // give up after 4 min per clip
const POLL_INTERVAL_S = 5;
const TARGET_DURATION_S = 5;

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
  if (process.env.OPENROUTER_PROVISIONING_KEY) return process.env.OPENROUTER_PROVISIONING_KEY.trim();
  return execSync(
    `gcloud secrets versions access latest --secret=OPENROUTER_PROVISIONING_KEY --project=${SECRET_PROJECT}`,
    { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
  ).trim();
}
const provisioningKey = dryRun ? '<dry-run>' : fetchSecret();

async function mintSubKey() {
  const stamp = new Date().toISOString().slice(0, 10);
  const r = await fetch(`${OR_BASE}/keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provisioningKey}`,
      'HTTP-Referer': 'https://mchatai.com',
      'X-Title': 'mchatai-prompt-catalog-video',
    },
    body: JSON.stringify({
      name: `mchatai-prompt-catalog-video-${stamp}-${Math.random().toString(36).slice(2, 6)}`,
      label: `pc.11-${stamp}`,
      limit: 10,
    }),
  });
  if (!r.ok) throw new Error(`mint sub-key failed: ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j.key || j.api_key;
}

let orKey = '<dry-run>';
if (!dryRun) {
  orKey = await mintSubKey();
  console.log(`Minted sub-key (... ${orKey.slice(-6)}), $10 cap.`);
}

const TMP_ROOT = join(tmpdir(), `video-previews-${Date.now()}`);
mkdirSync(TMP_ROOT, { recursive: true });

const items = [];
for (const fname of readdirSync(ROOT).sort()) {
  if (!fname.endsWith('.json') || fname.startsWith('_')) continue;
  items.push({ path: join(ROOT, fname), data: JSON.parse(readFileSync(join(ROOT, fname), 'utf-8')) });
}
console.log(`Loaded ${items.length} video prompts.`);

const todo = items.filter(it => {
  if (argOnly && !argOnly.includes(it.data.id)) return false;
  if (it.data.videoPreviewURL) return false;
  return true;
});
const batch = argLimit ? todo.slice(0, argLimit) : todo;
console.log(`Will generate ${batch.length} (${items.length - todo.length} already done${argLimit ? `, limited from ${todo.length}` : ''}).`);

if (dryRun) {
  for (const it of batch) console.log(`  [DRY] ${it.data.id} model=${it.data.modelHint}`);
  process.exit(0);
}

let ok = 0, failed = 0;
for (let i = 0; i < batch.length; i++) {
  const it = batch[i];
  const tag = `[${i + 1}/${batch.length}] ${it.data.id}`;
  try {
    console.log(`${tag} submit ...`);
    const jobId = await orSubmitVideo(it.data);
    console.log(`${tag} job=${jobId}, polling ...`);
    const videoURL = await orPollVideo(jobId);
    console.log(`${tag} fetched: ${videoURL}`);

    const slug = it.data.id;
    const mp4Path = join(TMP_ROOT, `${slug}.mp4`);
    const thumbPath = join(TMP_ROOT, `${slug}.png`);
    await downloadFile(videoURL, mp4Path);
    execSync(`ffmpeg -y -loglevel error -ss 1 -i ${shell(mp4Path)} -vframes 1 -vf "scale=512:-1" ${shell(thumbPath)}`,
      { stdio: ['ignore', 'ignore', 'pipe'] });

    const mp4Gcs = `${GCS_PREFIX}/${slug}/preview.mp4`;
    const thumbGcs = `${GCS_PREFIX}/${slug}/thumb.png`;
    gcsUpload(mp4Path, mp4Gcs, 'video/mp4');
    gcsUpload(thumbPath, thumbGcs, 'image/png');

    it.data.videoPreviewURL = `${PUBLIC_BASE}/${mp4Gcs}`;
    it.data.videoPreviewDurationSec = TARGET_DURATION_S;
    it.data.previewURL = `${PUBLIC_BASE}/${thumbGcs}`;
    it.data.previewThumbURL = `${PUBLIC_BASE}/${thumbGcs}`;
    writeFileSync(it.path, JSON.stringify(it.data, null, 2) + '\n');
    ok++;
    console.log(`${tag} OK`);
  } catch (e) {
    failed++;
    console.error(`${tag} FAIL: ${e.message}`);
  }
}
console.log(`\nDone. ok=${ok} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);

async function orSubmitVideo(data) {
  const body = {
    model: data.modelHint,
    prompt: data.prompt,
    duration_seconds: TARGET_DURATION_S,
  };
  const r = await fetch(`${OR_BASE}/videos/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${orKey}`,
      'HTTP-Referer': 'https://mchatai.com',
      'X-Title': 'mchatai-prompt-catalog-video',
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`OR submit ${r.status}: ${text.slice(0, 400)}`);
  const j = JSON.parse(text);
  return j.id || j.job_id || j.generation_id;
}

async function orPollVideo(jobId) {
  const start = Date.now();
  while ((Date.now() - start) / 1000 < POLL_MAX_S) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_S * 1000));
    const r = await fetch(`${OR_BASE}/videos/generations/${encodeURIComponent(jobId)}`, {
      headers: { 'Authorization': `Bearer ${orKey}` },
    });
    const text = await r.text();
    if (!r.ok) {
      console.log(`  poll ${r.status}: ${text.slice(0, 200)}`);
      continue;
    }
    const j = JSON.parse(text);
    const status = j.status || j.state;
    if (status === 'completed' || status === 'succeeded' || status === 'success') {
      const url = j.video?.url || j.output?.url || j.url || j.video_url;
      if (!url) throw new Error(`completed but no URL in: ${text.slice(0, 300)}`);
      return url;
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`job failed: ${text.slice(0, 300)}`);
    }
    process.stdout.write('.');
  }
  throw new Error(`poll timed out after ${POLL_MAX_S}s`);
}

async function downloadFile(url, path) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}`);
  writeFileSync(path, Buffer.from(await r.arrayBuffer()));
}

function gcsUpload(localPath, gcsRelPath, contentType) {
  execSync(
    `gsutil -h "Content-Type:${contentType}" -h "Cache-Control:public, max-age=31536000, immutable" ` +
    `cp -a public-read ${shell(localPath)} gs://${GCS_BUCKET}/${gcsRelPath}`,
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
}

function shell(s) { return `'${s.replace(/'/g, "'\\''")}'`; }
