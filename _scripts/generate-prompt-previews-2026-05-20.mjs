#!/usr/bin/env node
// Phase PC.2 - Generate preview assets for the Prompt Catalog.
//
// Reads each prompt JSON under mchatai-source/prompt-examples/{appletId}/*.json,
// skips items that already have non-null preview URLs (idempotent), generates
// the preview by calling OpenRouter (using the same OPENROUTER_PROVISIONING_KEY
// the compute-proxy uses), uploads to GCS, and writes the resulting public URLs
// back into the JSON in place.
//
// Auth: pulls OPENROUTER_PROVISIONING_KEY from GCP Secret Manager via
//   `gcloud secrets versions access`. No env var needed if gcloud is auth'd.
//
// Image flow (dreamsnap):
//   OpenRouter chat-completions with model=google/gemini-2.5-flash-image,
//   extract base64 PNG, downscale via macOS `sips` to 1024px main + 256px thumb,
//   upload both to gs://mchatai-2367e.firebasestorage.app/prompt-previews/dreamsnap/{slug}/
//   Write `previewURL` (1024) and `previewThumbURL` (256) back into the JSON.
//
// Audio flow (audio-library):
//   OpenRouter chat-completions with model=google/lyria-3-pro-preview,
//   extract base64 audio (likely m4a), trim to 15s via `ffmpeg -t 15`,
//   upload to gs://mchatai-2367e.firebasestorage.app/prompt-previews/audio-library/{slug}/preview.m4a
//   Write `audioPreviewURL` + `previewDurationSec` (15) back into the JSON.
//
// Usage:
//   node generate-prompt-previews-2026-05-20.mjs              # full batch
//   node generate-prompt-previews-2026-05-20.mjs --dry-run    # list what would run, no API calls
//   node generate-prompt-previews-2026-05-20.mjs --limit 2    # do at most 2 items
//   node generate-prompt-previews-2026-05-20.mjs --only=astronaut-cat,lofi-cafe-jazz
//   node generate-prompt-previews-2026-05-20.mjs --kind=image   # only dreamsnap items
//   node generate-prompt-previews-2026-05-20.mjs --kind=audio   # only audio-library items

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = '/Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai-source/prompt-examples';
const GCS_BUCKET = 'mchatai-2367e.firebasestorage.app';
const GCS_PREFIX = 'prompt-previews';
const PUBLIC_BASE = `https://storage.googleapis.com/${GCS_BUCKET}`;
const SECRET_PROJECT = 'mchatai-2367e';
const OR_BASE = 'https://openrouter.ai/api/v1';

// ---- CLI args -----------------------------------------------------------
const args = process.argv.slice(2);
const argLimit = pickArg('--limit') ? parseInt(pickArg('--limit'), 10) : null;
const argOnly = pickArg('--only')?.split(',').filter(Boolean) ?? null;
const argKind = pickArg('--kind') ?? null;       // 'image' | 'audio' | null
const dryRun = args.includes('--dry-run');

function pickArg(name) {
  const idx = args.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (idx < 0) return null;
  const tok = args[idx];
  if (tok.includes('=')) return tok.split('=', 2)[1];
  return args[idx + 1];
}

// ---- Auth ---------------------------------------------------------------
function fetchSecret() {
  if (process.env.OPENROUTER_PROVISIONING_KEY) return process.env.OPENROUTER_PROVISIONING_KEY.trim();
  try {
    return execSync(
      `gcloud secrets versions access latest --secret=OPENROUTER_PROVISIONING_KEY --project=${SECRET_PROJECT}`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
  } catch (e) {
    console.error('Could not read OPENROUTER_PROVISIONING_KEY from secrets:', e.message);
    process.exit(2);
  }
}

const provisioningKey = dryRun ? '<dry-run>' : fetchSecret();
if (!dryRun && !provisioningKey) { console.error('No OPENROUTER_PROVISIONING_KEY'); process.exit(2); }

// OpenRouter rejects direct provisioning-key calls with 401 "User not found".
// We mint a one-off sub-key per run, scoped to this script with a $10 cap.
// (Production compute-proxy mints one per-user via sub-key-store.cjs.)
async function mintSubKey() {
  const stamp = new Date().toISOString().slice(0, 10);
  const r = await fetch(`${OR_BASE}/keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provisioningKey}`,
      'HTTP-Referer': 'https://mchatai.com',
      'X-Title': 'mchatai-prompt-catalog',
    },
    body: JSON.stringify({
      name: `mchatai-prompt-catalog-${stamp}-${Math.random().toString(36).slice(2, 6)}`,
      label: `pc.2-${stamp}`,
      limit: 10,   // USD cap
    }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`mint sub-key failed: ${r.status}: ${text.slice(0, 400)}`);
  const json = JSON.parse(text);
  const key = json.key || json.api_key;
  if (!key) throw new Error(`mint sub-key returned no key: ${text.slice(0, 400)}`);
  return { key, hash: json.data?.hash || json.hash };
}

let orKey = '<dry-run>';
if (!dryRun) {
  const minted = await mintSubKey();
  orKey = minted.key;
  console.log(`Minted sub-key (hash=${(minted.hash || 'unknown').slice(0, 12)}..., $10 cap).`);
}

// ---- Load all prompt JSONs ----------------------------------------------
function loadAll() {
  const items = [];
  for (const appletId of ['dreamsnap', 'audio-library']) {
    const dir = join(ROOT, appletId);
    for (const fname of readdirSync(dir).sort()) {
      if (!fname.endsWith('.json') || fname.startsWith('_')) continue;
      const path = join(dir, fname);
      items.push({ appletId, path, data: JSON.parse(readFileSync(path, 'utf-8')) });
    }
  }
  return items;
}

const all = loadAll();
console.log(`Loaded ${all.length} items (${all.filter(i=>i.appletId==='dreamsnap').length} image, ${all.filter(i=>i.appletId==='audio-library').length} audio)`);

// ---- Filter to TODO -----------------------------------------------------
const todo = all.filter((item) => {
  if (argOnly && !argOnly.includes(item.data.id)) return false;
  const isImage = item.appletId === 'dreamsnap';
  if (argKind === 'image' && !isImage) return false;
  if (argKind === 'audio' && isImage) return false;
  if (isImage && item.data.previewURL) return false;          // already done
  if (!isImage && item.data.audioPreviewURL) return false;    // already done
  return true;
});
const batch = argLimit ? todo.slice(0, argLimit) : todo;
console.log(`Will generate: ${batch.length} (skipping ${all.length - todo.length} already-done${argLimit ? `, limited from ${todo.length}` : ''})`);

if (dryRun) {
  for (const item of batch) console.log(`  [DRY] ${item.appletId}/${item.data.id}`);
  process.exit(0);
}

// ---- Run ----------------------------------------------------------------
const TMP_ROOT = join(tmpdir(), `prompt-previews-${Date.now()}`);
mkdirSync(TMP_ROOT, { recursive: true });

let ok = 0, failed = 0;
for (let i = 0; i < batch.length; i++) {
  const item = batch[i];
  const tag = `[${i + 1}/${batch.length}] ${item.appletId}/${item.data.id}`;
  console.log(`${tag} ...`);
  try {
    if (item.appletId === 'dreamsnap') await runImage(item);
    else await runAudio(item);
    writeFileSync(item.path, JSON.stringify(item.data, null, 2) + '\n');
    ok++;
    console.log(`${tag} OK`);
  } catch (e) {
    failed++;
    console.error(`${tag} FAIL: ${e.message}`);
  }
}
console.log(`\nDone. ok=${ok} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);

// ---- IMAGE PATH ---------------------------------------------------------
async function runImage(item) {
  const slug = item.data.id;
  const model = `google/${item.data.modelHint}`;   // 'gemini-2.5-flash-image' -> 'google/...'
  const reqBody = {
    model,
    messages: [{ role: 'user', content: item.data.prompt }],
    modalities: ['image', 'text'],   // tell Gemini we want image output
  };
  const resp = await orPost('/chat/completions', reqBody);
  const png = extractImagePNG(resp);
  if (!png) throw new Error(`No PNG in response: ${JSON.stringify(resp).slice(0, 300)}`);

  const rawPath = join(TMP_ROOT, `${slug}.raw.png`);
  const mainPath = join(TMP_ROOT, `${slug}.png`);
  const thumbPath = join(TMP_ROOT, `${slug}.thumb.png`);
  writeFileSync(rawPath, png);
  // sips -Z N preserves aspect, fits longest edge to N.
  execSync(`sips -Z 1024 ${shell(rawPath)} --out ${shell(mainPath)}`, { stdio: ['ignore','ignore','pipe'] });
  execSync(`sips -Z 256  ${shell(rawPath)} --out ${shell(thumbPath)}`, { stdio: ['ignore','ignore','pipe'] });

  const mainGcs = `${GCS_PREFIX}/dreamsnap/${slug}/preview.png`;
  const thumbGcs = `${GCS_PREFIX}/dreamsnap/${slug}/thumb.png`;
  gcsUpload(mainPath, mainGcs, 'image/png');
  gcsUpload(thumbPath, thumbGcs, 'image/png');

  item.data.previewURL = `${PUBLIC_BASE}/${mainGcs}`;
  item.data.previewThumbURL = `${PUBLIC_BASE}/${thumbGcs}`;
}

function extractImagePNG(resp) {
  const msg = resp?.choices?.[0]?.message;
  if (!msg) return null;
  // OpenRouter Gemini image gen typically returns the image as a data URL
  // inside message.images[].image_url.url OR as content[].image_url.url OR
  // as raw base64 inside message.content. Handle all three.
  // 1. message.images (newer OR shape)
  if (Array.isArray(msg.images)) {
    for (const im of msg.images) {
      const url = im?.image_url?.url || im?.url;
      if (typeof url === 'string') {
        const b64 = url.includes(',') ? url.split(',', 2)[1] : url;
        try { return Buffer.from(b64, 'base64'); } catch {}
      }
    }
  }
  // 2. content as array of parts
  if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      const url = part?.image_url?.url || part?.url;
      if (typeof url === 'string') {
        const b64 = url.includes(',') ? url.split(',', 2)[1] : url;
        try { return Buffer.from(b64, 'base64'); } catch {}
      }
    }
  }
  // 3. content as raw base64 string (gpt-image-1 pattern via OR)
  if (typeof msg.content === 'string') {
    const c = msg.content;
    // strip ```...``` fences if any
    const stripped = c.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
    // accept data: URL too
    const b64 = stripped.includes(',') && stripped.startsWith('data:') ? stripped.split(',', 2)[1] : stripped;
    try {
      const buf = Buffer.from(b64, 'base64');
      // PNG magic header check 89 50 4E 47
      if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return buf;
    } catch {}
  }
  return null;
}

// ---- AUDIO PATH ---------------------------------------------------------
async function runAudio(item) {
  const slug = item.data.id;
  const model = item.data.modelHint;   // already OR-prefixed: 'google/lyria-3-pro-preview'
  const reqBody = {
    model,
    messages: [{ role: 'user', content: item.data.prompt }],
    modalities: ['audio', 'text'],
    audio: { format: 'mp3' },
    stream: true,   // Lyria requires streaming for audio output
  };
  const audio = await orStreamAudio(reqBody);
  if (!audio || audio.buf.length < 1024) {
    throw new Error(`No audio chunks collected (got ${audio?.buf?.length || 0} bytes)`);
  }

  const ext = audio.ext || 'mp3';
  const rawPath = join(TMP_ROOT, `${slug}.raw.${ext}`);
  const trimmedPath = join(TMP_ROOT, `${slug}.m4a`);
  writeFileSync(rawPath, audio.buf);
  // Trim to 15s, transcode to m4a/AAC 96kbps.
  execSync(`ffmpeg -y -loglevel error -t 15 -i ${shell(rawPath)} -c:a aac -b:a 96k ${shell(trimmedPath)}`,
    { stdio: ['ignore','ignore','pipe'] });

  const audioGcs = `${GCS_PREFIX}/audio-library/${slug}/preview.m4a`;
  gcsUpload(trimmedPath, audioGcs, 'audio/mp4');

  item.data.audioPreviewURL = `${PUBLIC_BASE}/${audioGcs}`;
  item.data.previewDurationSec = 15;
}

async function orStreamAudio(body, attempt = 1) {
  const r = await fetch(`${OR_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${orKey}`,
      'HTTP-Referer': 'https://mchatai.com',
      'X-Title': 'mchatai-prompt-catalog',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`OR ${r.status}: ${(await r.text()).slice(0, 400)}`);

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let format = 'mp3';
  let buffered = '';
  let textBuffer = '';   // capture any text content so we can show it on failure
  let finishReason = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, nl).trim();
      buffered = buffered.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      let evt;
      try { evt = JSON.parse(payload); } catch { continue; }
      const choice = evt?.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;
      const delta = choice.delta || choice.message;
      if (!delta) continue;
      if (delta.audio?.data) {
        chunks.push(Buffer.from(delta.audio.data, 'base64'));
        if (delta.audio.format) format = delta.audio.format;
        continue;
      }
      // Some providers stream audio chunks as base64 inside delta.content (string).
      // Distinguish real base64 audio (long, base64-charset only) from English text
      // (which has spaces, punctuation, etc.) so we don't decode prose into garbage.
      if (typeof delta.content === 'string' && delta.content.length > 0) {
        const c = delta.content;
        const isLikelyB64 = c.length > 200 && /^[A-Za-z0-9+/=\n\r]+$/.test(c.trim());
        if (isLikelyB64) {
          try { chunks.push(Buffer.from(c.trim(), 'base64')); } catch {}
        } else {
          textBuffer += c;
        }
        continue;
      }
      if (Array.isArray(delta.content)) {
        for (const p of delta.content) {
          const data = p?.audio?.data || p?.input_audio?.data;
          if (data) chunks.push(Buffer.from(data, 'base64'));
          else if (typeof p?.text === 'string') textBuffer += p.text;
        }
      }
    }
  }

  const buf = Buffer.concat(chunks);
  if (buf.length < 1024 && attempt === 1) {
    // Transient flake — Lyria sometimes sends only a text header and no audio.
    // Retry once with the same request before giving up.
    console.log(`  [audio] no audio on attempt 1 (text="${textBuffer.slice(0, 120)}", finish=${finishReason}), retrying...`);
    return orStreamAudio(body, 2);
  }
  if (buf.length < 1024) {
    throw new Error(`No audio after retry. finish_reason=${finishReason} text="${textBuffer.slice(0, 200)}"`);
  }
  return { buf, ext: format };
}

// ---- HTTP + GCS ---------------------------------------------------------
async function orPost(path, body) {
  const r = await fetch(`${OR_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${orKey}`,
      'HTTP-Referer': 'https://mchatai.com',
      'X-Title': 'mchatai-prompt-catalog',
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`OR ${r.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

function gcsUpload(localPath, gcsRelPath, contentType) {
  // -a public-read makes the object world-readable via storage.googleapis.com.
  // Set cache-control so the CDN holds it; previews are immutable per-slug.
  execSync(
    `gsutil -h "Content-Type:${contentType}" -h "Cache-Control:public, max-age=31536000, immutable" ` +
    `cp -a public-read ${shell(localPath)} gs://${GCS_BUCKET}/${gcsRelPath}`,
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
}

function shell(s) { return `'${s.replace(/'/g, "'\\''")}'`; }
