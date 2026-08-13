#!/usr/bin/env node
// LoopStar Song Book validator (Phase SB).
// Usage: node validate_songbook.mjs [songbookDir] [--write-index]
//
// Validates every songs/*.json against SPEC.md schema v1: PD provenance, meter,
// chord/bar arithmetic, melody event vocabulary and bounds, form references,
// ASCII, and index freshness. Exit 0 = all green; exit 1 = failures.
//
// --write-index regenerates index.json from the song files (the catalogue is
// derived, never hand-edited).

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const WRITE_INDEX = args.includes('--write-index');
const ROOT = args.find(a => !a.startsWith('--')) || dirname(fileURLToPath(import.meta.url)) + '/..';
const SONGS_DIR = join(ROOT, 'songs');

// Chord qualities LoopStarHarmonyGuard actually voices. A symbol outside this
// set degrades silently at runtime, so it fails here instead.
const QUALITIES = new Set(['', 'm', '7', 'm7', 'maj7', '6', 'm6',
  'sus2', 'sus4', 'dim', 'dim7', 'aug', 'm7b5']);
const ARTS = new Set(['stac', 'legato', 'accent', 'ghost', 'grace', 'slide']);
const SNAPS = new Set(['chord', 'scale', 'lock']);
const MODES = new Set(['major', 'minor']);
const FEELS = new Set(['straight', 'swing']);
const CONFIDENCE = new Set(['high', 'medium']);
const PD_BASES = new Set(['published-pre-1930', 'traditional', 'author-died-pre-1930']);
const AFFINITY = new Set(['piano', 'guitar', 'both', 'voice', 'horn']);
// SM: meters the ENGINE actually plays (session-wide, generated-parts-only for
// non-4/4 -- see mchatai_macOS/docs/LOOPSTAR_METER_DESIGN.md). Melody beat
// bounds follow the meter below. 9/8, 5/4 etc. stay rejected until the engine
// grows them.
const METERS = new Set(['4/4', '3/4', '6/8', '7/8']);
const BEATS_PER_BAR = { '4/4': 4, '3/4': 3, '6/8': 6, '7/8': 7 };
// Lyrics are allowed but must carry their OWN pd block (words and music are
// separate works with separate terms). These loose aliases are rejected so a
// stray bag of words can never slip in beside the schema'd `lyrics` object,
// which is the only place text may live and the only place that is checked.
const BANNED_KEYS = ['lyric', 'words', 'verse_text', 'verses'];

const SECTION_BARS_MAX = 16;   // LoopStarPhraseCompiler compiles at most 16 bars
const FORM_MAX = 12;

let failures = 0;
let warnings = 0;
const fail = (file, msg) => { failures++; console.error(`FAIL ${file}: ${msg}`); };
const warn = (file, msg) => { warnings++; console.warn(`WARN ${file}: ${msg}`); };

function checkAscii(file, node, path = '') {
  if (typeof node === 'string') {
    for (let i = 0; i < node.length; i++) {
      if (node.charCodeAt(i) > 126) {
        fail(file, `non-ASCII char in ${path || 'value'}: ${JSON.stringify(node[i])} (${JSON.stringify(node.slice(0, 40))})`);
        return;
      }
    }
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => checkAscii(file, v, `${path}[${i}]`));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (BANNED_KEYS.includes(k.toLowerCase())) {
        fail(file, `banned key "${k}" -- the song book carries melody and harmony only, never lyrics (SPEC: PD policy)`);
      }
      checkAscii(file, v, path ? `${path}.${k}` : k);
    }
  }
}

/** "Bbm7" -> {root:"Bb", quality:"m7"}; null when unparseable. */
function parseChord(sym) {
  if (typeof sym !== 'string' || !sym.length) return null;
  const m = /^([A-G])([#b]*)(.*)$/.exec(sym.trim());
  if (!m) return null;
  return { root: m[1] + m[2], accidentals: m[2], quality: m[3] };
}

function checkPD(file, pd) {
  if (!pd || typeof pd !== 'object') {
    fail(file, 'missing `pd` block -- every song must state its public-domain basis');
    return;
  }
  if (!PD_BASES.has(pd.basis))
    fail(file, `pd.basis must be one of ${[...PD_BASES].join(' | ')} (got ${JSON.stringify(pd.basis)})`);
  if (typeof pd.detail !== 'string' || pd.detail.trim().length < 12)
    fail(file, 'pd.detail must be a real sentence naming the publication / origin');
  if (typeof pd.sourceEdition !== 'string' || pd.sourceEdition.trim().length < 8)
    fail(file, 'pd.sourceEdition must name the score or edition that was read');
}

function checkYearAgainstBasis(file, song) {
  const { year, pd } = song;
  if (!Number.isInteger(year)) { fail(file, 'year must be an integer'); return; }
  if (pd?.basis === 'published-pre-1930' && year >= 1930)
    fail(file, `year ${year} is not < 1930 but pd.basis claims published-pre-1930`);
  if (pd?.basis === 'traditional' && year >= 1900)
    warn(file, `traditional basis with year ${year} -- confirm circulation before 1900`);
}

function checkChords(file, sec) {
  if (!Array.isArray(sec.chords) || sec.chords.length === 0) {
    fail(file, `section "${sec.id}": chords must be a non-empty array`);
    return;
  }
  let total = 0;
  sec.chords.forEach((c, i) => {
    const ctx = `section "${sec.id}" chords[${i}]`;
    const parsed = parseChord(c.symbol);
    if (!parsed) { fail(file, `${ctx}: unparseable chord symbol ${JSON.stringify(c.symbol)}`); return; }
    if (!QUALITIES.has(parsed.quality))
      fail(file, `${ctx}: quality "${parsed.quality}" in "${c.symbol}" is not in the engine's vocabulary (${[...QUALITIES].filter(Boolean).join(' ')})`);
    if (!Number.isInteger(c.bars) || c.bars < 1 || c.bars > SECTION_BARS_MAX)
      fail(file, `${ctx}: bars must be an int 1-${SECTION_BARS_MAX}`);
    else total += c.bars;
  });
  if (total !== sec.bars)
    fail(file, `section "${sec.id}": chord bars sum to ${total} but section declares ${sec.bars} bars`);
}

function checkMelody(file, sec, mode, beatsPerBar = 4) {
  if (sec.melody === undefined) return;
  const mel = sec.melody;
  if (!mel || !Array.isArray(mel.events) || mel.events.length === 0) {
    fail(file, `section "${sec.id}": melody present but has no events`);
    return;
  }
  const beatsInSection = sec.bars * beatsPerBar;
  let lastB = -1, sounding = 0, accents = 0, unique = new Set();
  mel.events.forEach((ev, i) => {
    const ctx = `section "${sec.id}" melody[${i}]`;
    if (typeof ev.b !== 'number' || ev.b < 0 || ev.b >= beatsInSection)
      fail(file, `${ctx}: b must be in [0, ${beatsInSection}) -- b is measured from the SECTION start`);
    // A 16th grid keeps the encoding honest; triplets are not representable and
    // silently land off-grid rather than swinging.
    else if (Math.abs(ev.b * 4 - Math.round(ev.b * 4)) > 1e-6)
      fail(file, `${ctx}: b=${ev.b} is off the 16th grid (multiples of 0.25)`);
    if (typeof ev.d !== 'number' || ev.d <= 0 || ev.d > 16)
      fail(file, `${ctx}: d must be > 0 and <= 16 beats`);
    if (!Number.isInteger(ev.deg) || ev.deg < 1 || ev.deg > 7)
      fail(file, `${ctx}: deg must be an int 1-7 (scale degree, not a MIDI note)`);
    if (ev.acc !== undefined && ![-1, 0, 1].includes(ev.acc))
      fail(file, `${ctx}: acc must be -1 | 0 | 1`);
    if (ev.oct !== undefined && (!Number.isInteger(ev.oct) || Math.abs(ev.oct) > 2))
      fail(file, `${ctx}: oct must be an int -2..2`);
    if (typeof ev.vel !== 'number' || ev.vel < 1 || ev.vel > 127)
      fail(file, `${ctx}: vel must be 1-127`);
    if (ev.art !== undefined && !ARTS.has(ev.art))
      fail(file, `${ctx}: unknown art "${ev.art}"`);
    if (ev.snap !== undefined && !SNAPS.has(ev.snap))
      fail(file, `${ctx}: unknown snap "${ev.snap}"`);
    if (typeof ev.b === 'number') {
      if (ev.b < lastB) fail(file, `${ctx}: events must be in ascending beat order (b=${ev.b} after ${lastB})`);
      lastB = ev.b;
    }
    if (typeof ev.d === 'number') sounding += ev.d;
    if (ev.art === 'accent' || ev.vel >= 104) accents++;
    unique.add(`${ev.deg}:${ev.acc || 0}:${ev.oct || 0}`);
  });

  // A tune that never rests is an exercise, not a melody.
  const density = sounding / beatsInSection;
  if (density > 1.02)
    warn(file, `section "${sec.id}": melody has no breathing room (${density.toFixed(2)} beats sounding per beat) -- check for overlapping durations`);
  if (unique.size < 3)
    fail(file, `section "${sec.id}": melody uses only ${unique.size} distinct pitches -- that is not a tune`);
  if (accents === 0)
    warn(file, `section "${sec.id}": melody has flat velocity (no accents) -- it will sound stamped out`);

  // Harmonic minor's leading tone is deg 7 + acc 1. A minor tune with a bare
  // deg 7 everywhere is usually this bug, not a modal choice.
  if (mode === 'minor') {
    const sevens = mel.events.filter(e => e.deg === 7);
    if (sevens.length >= 2 && sevens.every(e => !e.acc))
      warn(file, `section "${sec.id}": every deg 7 is natural in a minor tune -- confirm this is modal and not a missing raised leading tone (deg 7, acc 1)`);
  }
}

/// Lyrics stand or fall on the LYRICIST's dates, not the composer's -- a PD tune
/// routinely carries in-copyright words. Checked independently, and hard.
function checkLyrics(file, sec) {
  if (sec.lyrics === undefined) return 0;
  const L = sec.lyrics;
  const ctx = `section "${sec.id}" lyrics`;
  if (!L || typeof L !== 'object' || Array.isArray(L)) {
    fail(file, `${ctx}: must be an object with pd + stanzas`);
    return 0;
  }
  const pd = L.pd;
  if (!pd || typeof pd !== 'object') {
    fail(file, `${ctx}: missing its OWN pd block -- lyrics need a public-domain basis independent of the music's (different author, different term)`);
  } else {
    if (typeof pd.lyricist !== 'string' || !pd.lyricist.trim())
      fail(file, `${ctx}: pd.lyricist is required (use "Traditional" when anonymous)`);
    if (!PD_BASES.has(pd.basis))
      fail(file, `${ctx}: pd.basis must be one of ${[...PD_BASES].join(' | ')} (got ${JSON.stringify(pd.basis)})`);
    if (typeof pd.detail !== 'string' || pd.detail.trim().length < 12)
      fail(file, `${ctx}: pd.detail must be a real sentence about the WORDS' origin`);
    if (typeof pd.sourceEdition !== 'string' || pd.sourceEdition.trim().length < 8)
      fail(file, `${ctx}: pd.sourceEdition must name the printing the words were read from`);
  }
  if (!Array.isArray(L.stanzas) || L.stanzas.length === 0) {
    fail(file, `${ctx}: stanzas must be a non-empty array`);
    return 0;
  }
  if (L.stanzas.length > 8) fail(file, `${ctx}: at most 8 stanzas`);
  L.stanzas.forEach((st, si) => {
    if (!Array.isArray(st) || st.length === 0) {
      fail(file, `${ctx} stanza ${si + 1}: must be a non-empty array of {bar, text} lines`);
      return;
    }
    if (st.length > 32) fail(file, `${ctx} stanza ${si + 1}: more than 32 lines -- split the section`);
    let lastBar = -1;
    st.forEach((line, li) => {
      const lctx = `${ctx} stanza ${si + 1} line ${li + 1}`;
      if (!line || typeof line !== 'object') { fail(file, `${lctx}: must be {bar, text}`); return; }
      if (!Number.isInteger(line.bar) || line.bar < 0 || line.bar >= sec.bars)
        fail(file, `${lctx}: bar must be an int 0-${sec.bars - 1}, relative to the SECTION start`);
      else if (line.bar < lastBar) fail(file, `${lctx}: lines must be in ascending bar order`);
      else lastBar = line.bar;
      if (typeof line.text !== 'string' || !line.text.trim())
        fail(file, `${lctx}: text is required`);
      else if (line.text.length > 90)
        fail(file, `${lctx}: text is ${line.text.length} chars -- keep a line to what fits on a chart (<= 90)`);
    });
  });
  return L.stanzas.length;
}

function checkSong(file, song) {
  checkAscii(file, song);

  if (song.schemaVersion !== 1) fail(file, 'schemaVersion must be 1');
  const expectedID = basename(file, '.json');
  if (song.id !== expectedID) fail(file, `id "${song.id}" must match the filename "${expectedID}"`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(song.id || '')) fail(file, 'id must be kebab-case');

  for (const k of ['title', 'composer', 'origin', 'key']) {
    if (typeof song[k] !== 'string' || !song[k].trim()) fail(file, `${k} is required`);
  }
  if (!MODES.has(song.mode)) fail(file, `mode must be major | minor`);
  if (!METERS.has(song.meter))
    fail(file, `meter must be one of ${[...METERS].join(' | ')} (got ${JSON.stringify(song.meter)}). Never force a tune into the wrong meter -- if its real meter is unsupported, do not encode it.`);
  if (!FEELS.has(song.feel)) fail(file, 'feel must be straight | swing');
  if (!CONFIDENCE.has(song.confidence)) fail(file, 'confidence must be high | medium');
  if (!parseChord(song.key)) fail(file, `key ${JSON.stringify(song.key)} is unparseable`);
  if (typeof song.tempoBPM !== 'number' || song.tempoBPM < 40 || song.tempoBPM > 220)
    fail(file, 'tempoBPM must be 40-220');
  if (song.tempoRange !== undefined) {
    const r = song.tempoRange;
    if (!Array.isArray(r) || r.length !== 2 || !(r[0] < r[1]))
      fail(file, 'tempoRange must be [min, max] with min < max');
  }
  if (!Array.isArray(song.tags) || song.tags.length === 0) fail(file, 'tags must be a non-empty array');
  if (!Array.isArray(song.styleHints) || song.styleHints.length === 0)
    fail(file, 'styleHints must name at least one material pack that suits this song');
  if (song.instrumentAffinity !== undefined) {
    if (!Array.isArray(song.instrumentAffinity) || song.instrumentAffinity.some(a => !AFFINITY.has(a)))
      fail(file, `instrumentAffinity entries must be in ${[...AFFINITY].join(' | ')}`);
  }

  checkPD(file, song.pd);
  checkYearAgainstBasis(file, song);

  if (!Array.isArray(song.sections) || song.sections.length === 0) {
    fail(file, 'sections must be a non-empty array');
    return;
  }
  if (song.sections.length > 8) fail(file, 'at most 8 sections (split the form, do not grow one section)');

  const ids = new Set();
  const stanzaCounts = {};
  let anyMelody = false;
  for (const sec of song.sections) {
    if (!sec || typeof sec !== 'object') { fail(file, 'malformed section'); continue; }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(sec.id || '')) fail(file, `section id ${JSON.stringify(sec.id)} must be kebab-case`);
    if (ids.has(sec.id)) fail(file, `duplicate section id "${sec.id}"`);
    ids.add(sec.id);
    if (typeof sec.name !== 'string' || !sec.name.trim()) fail(file, `section "${sec.id}": name is required`);
    if (!Number.isInteger(sec.bars) || sec.bars < 1 || sec.bars > SECTION_BARS_MAX)
      fail(file, `section "${sec.id}": bars must be an int 1-${SECTION_BARS_MAX} (a 32-bar AABA is FOUR 8-bar sections)`);
    if (typeof sec.energy !== 'number' || sec.energy < 0 || sec.energy > 1)
      fail(file, `section "${sec.id}": energy must be 0-1`);
    checkChords(file, sec);
    checkMelody(file, sec, song.mode, BEATS_PER_BAR[song.meter] || 4);
    stanzaCounts[sec.id] = checkLyrics(file, sec);
    if (sec.melody) anyMelody = true;
  }
  // A CHART entry (chartOnly: true) ships changes + form with no head -- the
  // right shape for composed jazz heads whose melodies cannot be transcribed
  // reliably from recall: the changes are certain, the tune is yours to play.
  // It must be explicit, never an accident of a missing melody.
  if (!anyMelody && song.chartOnly !== true)
    fail(file, 'no melody in any section -- either add the head or declare "chartOnly": true (a deliberate changes-only chart)');
  if (anyMelody && song.chartOnly === true)
    fail(file, 'chartOnly is declared but a section carries a melody -- drop one or the other');

  if (!Array.isArray(song.form) || song.form.length === 0) { fail(file, 'form must be a non-empty array'); return; }
  if (song.form.length > FORM_MAX) fail(file, `form has ${song.form.length} entries; keep it to <= ${FORM_MAX} (a starting point, not a recording)`);
  song.form.forEach((f, i) => {
    if (!f || !ids.has(f.section)) fail(file, `form[${i}]: unknown section "${f?.section}"`);
    if (f?.repeat !== undefined && (!Number.isInteger(f.repeat) || f.repeat < 1 || f.repeat > 4))
      fail(file, `form[${i}]: repeat must be an int 1-4`);
    if (f?.energy !== undefined && (typeof f.energy !== 'number' || f.energy < 0 || f.energy > 1))
      fail(file, `form[${i}]: energy must be 0-1`);
    if (f?.stanza !== undefined) {
      const have = stanzaCounts[f.section] || 0;
      if (!Number.isInteger(f.stanza) || f.stanza < 1)
        fail(file, `form[${i}]: stanza must be a 1-based integer`);
      else if (f.stanza > have)
        fail(file, `form[${i}]: stanza ${f.stanza} but section "${f.section}" has ${have} stanza(s)`);
    }
  });
  // Two occurrences of a multi-stanza section that both sing stanza 1 is almost
  // always a forgotten `stanza` rather than an intent -- the words repeat where
  // the song moves on.
  for (const [sid, count] of Object.entries(stanzaCounts)) {
    if (count < 2) continue;
    const uses = song.form.filter(f => f.section === sid);
    if (uses.length >= 2 && new Set(uses.map(f => f.stanza || 1)).size === 1)
      warn(file, `section "${sid}" has ${count} stanzas but every form entry sings the same one -- add "stanza" to the later occurrences`);
  }
  const used = new Set(song.form.map(f => f.section));
  for (const id of ids) if (!used.has(id)) warn(file, `section "${id}" is never referenced by form`);
}

function songBars(song) {
  const byID = Object.fromEntries(song.sections.map(s => [s.id, s]));
  return song.form.reduce((n, f) => n + (byID[f.section]?.bars || 0) * (f.repeat || 1), 0);
}

/// The first sung line in FORM order (not file order) -- what someone would
/// actually hear first if they pressed play.
function firstLyricLine(song) {
  for (const f of song.form) {
    const sec = song.sections.find(s => s.id === f.section);
    const stanza = sec?.lyrics?.stanzas?.[(f.stanza || 1) - 1];
    const line = stanza?.[0]?.text;
    if (line) return line;
  }
  return '';
}

function indexEntry(song) {
  return {
    id: song.id, title: song.title, composer: song.composer, year: song.year,
    origin: song.origin, tags: song.tags, styleHints: song.styleHints,
    instrumentAffinity: song.instrumentAffinity || [],
    key: song.key, mode: song.mode, meter: song.meter,
    tempoBPM: song.tempoBPM, feel: song.feel, confidence: song.confidence,
    bars: songBars(song), sectionCount: song.sections.length,
    hasMelody: song.sections.some(s => !!s.melody),
    hasLyrics: song.sections.some(s => !!s.lyrics),
    // The opening line, so the browser row is identifiable at a glance -- half
    // this repertoire is known by its first line, not its title.
    firstLine: firstLyricLine(song),
    pdBasis: song.pd?.basis || '',
  };
}

// ---- main ----

if (!existsSync(SONGS_DIR)) {
  console.error(`FAIL: no songs directory at ${SONGS_DIR}`);
  process.exit(1);
}

const files = readdirSync(SONGS_DIR).filter(f => f.endsWith('.json')).sort();
const songs = [];
for (const f of files) {
  const path = join(SONGS_DIR, f);
  let song;
  try {
    song = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(f, `unparseable JSON: ${e.message}`);
    continue;
  }
  checkSong(f, song);
  songs.push(song);
}

// Index freshness: the catalogue is derived, so drift means a stale browser.
const indexPath = join(ROOT, 'index.json');
const built = { schemaVersion: 1, songs: songs.map(indexEntry) };
if (WRITE_INDEX) {
  writeFileSync(indexPath, JSON.stringify(built, null, 2) + '\n');
  console.log(`wrote index.json (${built.songs.length} songs)`);
} else if (!existsSync(indexPath)) {
  fail('index.json', 'missing -- run with --write-index');
} else {
  const current = JSON.parse(readFileSync(indexPath, 'utf8'));
  if (JSON.stringify(current) !== JSON.stringify(built))
    fail('index.json', 'is stale -- rerun with --write-index');
}

console.log(`songbook: ${files.length} song(s), ${failures} failure(s), ${warnings} warning(s)`);
process.exit(failures ? 1 : 0);
