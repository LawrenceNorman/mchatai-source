#!/usr/bin/env node
// LoopStar phrase-library validator (Phase ML.1).
// Usage: node validate_phrases.mjs [phrasesDir]
// Validates every {genre}/*.json against SPEC.md schema v1: structure, vocab,
// bounds, id conventions, provenance, velocity life, and index sanity.
// Exit 0 = all green; exit 1 = failures (printed per file).

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2] || dirname(fileURLToPath(import.meta.url)) + '/..';
const LANE_FILES = { 'hooks.json': 'hook', 'bass.json': 'bass', 'comping.json': 'comp', 'drums.json': 'drums' };
const ARTS = new Set(['stac', 'legato', 'accent', 'ghost', 'dead', 'grace', 'slide', 'flam']);
// Drum ROLES name the voice, never a note number, so one pattern plays on any kit.
const DRUMS = new Set(['kick', 'kick2', 'snare', 'snare2', 'rim', 'clap',
  'hat', 'hatPedal', 'hatOpen', 'crash', 'ride', 'rideBell',
  'tomLow', 'tomMid', 'tomHigh', 'tamb', 'cowbell', 'conga', 'congaLow',
  'clave', 'maraca', 'shaker']);
const ROLES = new Set(['R', '2', 'b3', '3', '4', '5', '6', 'b7', '7', 'oct', 'app', 'ghost', 'dead']);
const VOICES = new Set(['triad', 'shell', 'rootless', 'rootless9', 'drop2', 'power']);
const SNAPS = new Set(['chord', 'scale', 'lock']);
const KINDS = new Set(['cell', 'phrase', 'fill']);
const PHRASE_ROLES = new Set(['hook', 'riff', 'comp', 'pad', 'fill']);
const QUALITIES = new Set(['', 'm', '7', 'm7', 'maj7', '6', 'm6', 'sus2', 'sus4', 'dim', 'dim7', 'aug', 'm7b5']);
const WORKS = new Set(['static', 'progression']);

let failures = 0;
const seenIds = new Set();
const fail = (file, msg) => { failures++; console.error(`FAIL ${file}: ${msg}`); };

function checkAscii(file, text) {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 126) { fail(file, `non-ASCII char at offset ${i} (${JSON.stringify(text[i])})`); return; }
  }
}

function checkEvent(file, pid, ev, i, lane, lengthBars) {
  const ctx = `${pid} events[${i}]`;
  if (typeof ev.b !== 'number' || ev.b < 0 || ev.b >= lengthBars * 4)
    fail(file, `${ctx}: b must be in [0, ${lengthBars * 4})`);
  if (typeof ev.d !== 'number' || ev.d <= 0 || ev.d > 16) fail(file, `${ctx}: bad d`);
  if (typeof ev.vel !== 'number' || ev.vel < 1 || ev.vel > 127) fail(file, `${ctx}: vel must be 1-127`);
  if (ev.art !== undefined && !ARTS.has(ev.art)) fail(file, `${ctx}: unknown art "${ev.art}"`);
  if (ev.glide !== undefined && (!Number.isInteger(ev.glide) || Math.abs(ev.glide) > 12))
    fail(file, `${ctx}: glide must be int -12..12 semitones`);
  if (ev.glideBeats !== undefined && (typeof ev.glideBeats !== 'number' || ev.glideBeats < 0.02 || ev.glideBeats > 4))
    fail(file, `${ctx}: glideBeats must be 0.02-4`);
  if (ev.glide !== undefined && lane === 'comp')
    fail(file, `${ctx}: glide is monophonic-only (bass/melody), not comping`);
  if (lane === 'hook') {
    if (!Number.isInteger(ev.deg) || ev.deg < 1 || ev.deg > 7) fail(file, `${ctx}: deg must be int 1-7`);
    if (ev.acc !== undefined && ![-1, 0, 1].includes(ev.acc)) fail(file, `${ctx}: acc must be -1|0|1`);
    if (ev.oct !== undefined && (!Number.isInteger(ev.oct) || Math.abs(ev.oct) > 2)) fail(file, `${ctx}: oct out of range`);
    if (ev.snap !== undefined && !SNAPS.has(ev.snap)) fail(file, `${ctx}: unknown snap`);
  } else if (lane === 'bass') {
    if (!ROLES.has(ev.role)) fail(file, `${ctx}: unknown role "${ev.role}"`);
    if (ev.role === 'app' && ![1, -1].includes(ev.dir)) fail(file, `${ctx}: app needs dir +1|-1`);
    if ((ev.role === 'ghost' || ev.role === 'dead') && ev.vel > 50) fail(file, `${ctx}: ghost/dead vel must be <= 50`);
    if (ev.oct !== undefined && (!Number.isInteger(ev.oct) || Math.abs(ev.oct) > 2)) fail(file, `${ctx}: oct out of range`);
  } else if (lane === 'drums') {
    if (!DRUMS.has(ev.drum)) fail(file, `${ctx}: unknown drum "${ev.drum}"`);
    if (ev.art === 'ghost' && ev.vel > 50) fail(file, `${ctx}: ghost vel must be <= 50`);
    if (ev.deg !== undefined || ev.role !== undefined || ev.voice !== undefined)
      fail(file, `${ctx}: drum events use "drum", not deg/role/voice`);
  } else if (lane === 'comp') {
    if (ev.art === 'dead') { /* muted scratch: voice optional */ }
    else if (!VOICES.has(ev.voice)) fail(file, `${ctx}: unknown voice "${ev.voice}"`);
    if (ev.inv !== undefined && (!Number.isInteger(ev.inv) || ev.inv < 0 || ev.inv > 3)) fail(file, `${ctx}: inv must be 0-3`);
    if (ev.top !== undefined && !ROLES.has(ev.top)) fail(file, `${ctx}: unknown top "${ev.top}"`);
  }
}

function checkPhrase(file, genre, lane, p) {
  const pid = p.id || '(no id)';
  if (!p.id || !p.id.startsWith(`${genre}.`)) fail(file, `${pid}: id must start with "${genre}."`);
  if (seenIds.has(p.id)) fail(file, `${pid}: duplicate id`);
  seenIds.add(p.id);
  if (!KINDS.has(p.kind)) fail(file, `${pid}: kind must be cell|phrase|fill`);
  if (!Number.isInteger(p.lengthBars) || p.lengthBars < 1 || p.lengthBars > 4)
    fail(file, `${pid}: lengthBars must be int 1-4`);
  if (typeof p.energy !== 'number' || p.energy < 0 || p.energy > 1) fail(file, `${pid}: energy must be 0-1`);
  if (!PHRASE_ROLES.has(p.role)) fail(file, `${pid}: unknown phrase role "${p.role}"`);
  if (!Array.isArray(p.worksOver) || !p.worksOver.length || p.worksOver.some(w => !WORKS.has(w)))
    fail(file, `${pid}: worksOver must be non-empty subset of static|progression`);
  if (p.mode !== undefined && !['major', 'minor'].includes(p.mode))
    fail(file, `${pid}: mode must be "major" or "minor"`);
  if (!p.provenance || !(p.provenance.inspiration || p.provenance.pdSource))
    fail(file, `${pid}: provenance.inspiration or .pdSource is mandatory`);
  if (!Array.isArray(p.events) || p.events.length < 1) { fail(file, `${pid}: events missing`); return; }
  let lastB = -1;
  p.events.forEach((ev, i) => {
    checkEvent(file, pid, ev, i, lane, p.lengthBars);
    if (typeof ev.b === 'number') {
      if (ev.b < lastB) fail(file, `${pid} events[${i}]: not sorted by b`);
      lastB = ev.b;
    }
  });
  // Velocity life: more than 2 events must not be a single flat value.
  const vels = new Set(p.events.map(e => e.vel));
  if (p.events.length > 3 && vels.size < 2) fail(file, `${pid}: flat velocity (add accents/ghosts)`);
  // Density sanity (drums carry more events per bar than pitched lanes).
  const perBar = p.events.length / p.lengthBars;
  if (lane === 'drums' ? perBar > 48 : perBar > 20) fail(file, `${pid}: ${perBar.toFixed(1)} events/bar is too dense`);
  if (lane === 'drums' && p.role !== 'fill') {
    const voices = new Set(p.events.map(e => e.drum));
    if (!voices.has('kick') && !voices.has('snare') && !voices.has('rim'))
      fail(file, `${pid}: a groove needs a kick, snare or rim`);
    // Velocity life: a flat drum pattern is a drum machine, not a drummer.
    const vs = p.events.map(e => e.vel);
    if (vs.length > 4 && Math.max(...vs) - Math.min(...vs) < 15)
      fail(file, `${pid}: flat velocities (accent the backbeat, add ghosts)`);
  }
}

function checkProgression(file, genre, pr) {
  const pid = pr.id || '(no id)';
  if (!pr.id || !pr.id.startsWith(`${genre}.prog.`)) fail(file, `${pid}: id must start with "${genre}.prog."`);
  if (seenIds.has(pr.id)) fail(file, `${pid}: duplicate id`);
  seenIds.add(pr.id);
  if (!['major', 'minor'].includes(pr.mode)) fail(file, `${pid}: mode must be major|minor`);
  const degOK = d => (Number.isInteger(d) && d >= 1 && d <= 7) ||
                     (typeof d === 'string' && /^[b#]?[1-7]$/.test(d));
  if (!Array.isArray(pr.degrees) || !pr.degrees.length || pr.degrees.some(d => !degOK(d)))
    fail(file, `${pid}: degrees must be ints 1-7 or accidental tokens like "b2"/"#4"`);
  if (pr.qualities !== undefined) {
    if (!Array.isArray(pr.qualities) || pr.qualities.length !== pr.degrees.length)
      fail(file, `${pid}: qualities length must match degrees`);
    else pr.qualities.forEach(q => { if (!QUALITIES.has(q)) fail(file, `${pid}: unknown quality "${q}"`); });
  }
  if (!Number.isInteger(pr.barsPerChord) || pr.barsPerChord < 1 || pr.barsPerChord > 8)
    fail(file, `${pid}: barsPerChord must be int 1-8`);
  if (pr.weight !== undefined && (!Number.isInteger(pr.weight) || pr.weight < 1 || pr.weight > 9))
    fail(file, `${pid}: weight must be int 1-9`);
}

function checkMeta(file, genre, m) {
  if (m.schemaVersion !== 1) fail(file, 'schemaVersion must be 1');
  if (m.genre !== genre) fail(file, `genre field must be "${genre}"`);
  if (m.defaultMode !== undefined && !['major', 'minor'].includes(m.defaultMode)) fail(file, 'bad defaultMode');
  const r = m.registers || {};
  for (const k of ['bassLow', 'bassHigh', 'melodyLow', 'melodyHigh'])
    if (r[k] !== undefined && (!Number.isInteger(r[k]) || r[k] < 12 || r[k] > 108)) fail(file, `registers.${k} out of range`);
  if (r.bassLow !== undefined && r.bassHigh !== undefined && r.bassLow >= r.bassHigh) fail(file, 'bass register inverted');
  if (r.melodyLow !== undefined && r.melodyHigh !== undefined && r.melodyLow >= r.melodyHigh) fail(file, 'melody register inverted');
  const rb = m.rubric;
  if (rb !== undefined) {
    if (typeof rb !== 'object') fail(file, 'rubric must be an object');
    else {
      for (const k of ['notesPerBarMin', 'notesPerBarMax'])
        if (rb[k] !== undefined && (typeof rb[k] !== 'number' || rb[k] <= 0 || rb[k] > 32))
          fail(file, `rubric.${k} out of range`);
      if (rb.notesPerBarMin !== undefined && rb.notesPerBarMax !== undefined
          && rb.notesPerBarMin >= rb.notesPerBarMax) fail(file, 'rubric density band inverted');
    }
  }
  const progs = m.programs || {};
  for (const lane of Object.keys(progs))
    for (const p of progs[lane] || [])
      if (!Number.isInteger(p) || p < 0 || p > 127) fail(file, `programs.${lane}: GM program ${p} out of 0-127 (0-based!)`);
}

let genres = 0, phrases = 0, progressions = 0;
for (const entry of readdirSync(ROOT)) {
  const dir = join(ROOT, entry);
  if (!statSync(dir).isDirectory() || entry === 'tests' || entry.startsWith('_')) continue;
  genres++;
  for (const fname of readdirSync(dir)) {
    if (!fname.endsWith('.json')) continue;
    const file = `${entry}/${fname}`;
    const text = readFileSync(join(dir, fname), 'utf8');
    checkAscii(file, text);
    let json;
    try { json = JSON.parse(text); } catch (e) { fail(file, `JSON parse: ${e.message}`); continue; }
    if (fname === 'pack-phrases.json') { checkMeta(file, entry, json); continue; }
    if (fname === 'progressions.json') {
      if (json.schemaVersion !== 1) fail(file, 'schemaVersion must be 1');
      for (const pr of json.progressions || []) { checkProgression(file, entry, pr); progressions++; }
      continue;
    }
    const lane = LANE_FILES[fname];
    if (!lane) { fail(file, 'unknown file name (expected pack-phrases/hooks/bass/comping/progressions .json)'); continue; }
    if (json.schemaVersion !== 1) fail(file, 'schemaVersion must be 1');
    for (const p of json.phrases || []) { checkPhrase(file, entry, lane, p); phrases++; }
    if (!(json.phrases || []).length) fail(file, 'no phrases[]');
  }
  if (!existsSync(join(dir, 'pack-phrases.json'))) fail(entry, 'missing pack-phrases.json');
}

console.log(`${genres} genre(s), ${phrases} phrase(s), ${progressions} progression(s) checked.`);
if (failures) { console.error(`${failures} failure(s).`); process.exit(1); }
console.log('All green.');
