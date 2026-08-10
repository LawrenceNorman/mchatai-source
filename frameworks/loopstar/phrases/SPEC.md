# LoopStar Phrase Library — Schema v1

Phrase packs give the "Make it new" generator real musical vocabulary per genre:
melody hooks, bass riffs, comping patterns, and richer progressions. They are
CONTENT (RULE #1): the Swift binary carries a generic compiler + the old
parametric generator as fallback; everything musical lives here. A genre with no
phrase files behaves exactly as before.

Design rationale, legal policy, and per-genre idiom source-books:
[`../docs/MUSICAL_IDIOM_LIBRARY.md`](../docs/MUSICAL_IDIOM_LIBRARY.md).

## Layout

```
phrases/
  SPEC.md                  # this file
  tests/validate_phrases.mjs
  {genre}/
    pack-phrases.json      # meta: registers, GM palette, default mode
    hooks.json             # melody cells/phrases  (pitch space: scale DEGREES)
    bass.json              # bass riffs            (pitch space: CHORD ROLES)
    comping.json           # chord rhythm patterns (pitch space: VOICING tokens)
    drums.json             # beats + breaks       (pitch space: DRUM ROLES)
    progressions.json      # degree progressions with per-chord qualities
```

All files are OPTIONAL per genre and independently loadable. ASCII only.
GM program numbers are **0-based** (0 = Acoustic Grand), matching
`material.json` and the engine — note the idiom source-books in
`../docs/idiom-research/` use 1-based GM numbers; subtract 1 when encoding.

## Common phrase envelope (hooks / bass / comping)

```json
{ "id": "funk.bass.root-octave-pump-01",   // {genre}.{lane}.{slug}; immutable once shipped
  "name": "Root-octave pump",
  "kind": "cell",                          // cell (1-2 bars) | phrase (2-4) | fill
  "lengthBars": 1,
  "energy": 0.7,                           // 0..1 selection tag (scene energy match)
  "role": "riff",                          // hook | riff | comp | pad | fill
  "worksOver": ["static", "progression"],  // static vamp and/or moving changes
  "swingSensitive": true,                  // false = never swing (straight genres)
  "mode": "major",                         // OPTIONAL: pin this phrase's mode
  "provenance": { "inspiration": "style of ... (original)" },  // or pdSource
  "events": [ ... ] }
```

`mode` (optional, `major` | `minor`) pins the phrase's own mode: it then plays in
the PARALLEL major/minor of the session key instead of being re-spelled into the
session's mode. **Required on any verbatim public-domain melody** -- an unpinned
major tune played in a minor session comes out with minor 3rds/6ths/7ths, i.e.
no longer the famous tune. Leave it off for ordinary idiom cells, which should
follow the session.

Revisions NEVER edit a shipped phrase in place: new id + `"supersedes": "old-id"`.
`provenance` is mandatory: `inspiration` free text for original-in-idiom
phrases, `pdSource` ("Work title, publication year, edition") for verbatim
public-domain lifts. Never transcribe an in-copyright melody/riff/bass line.

## Event fields by lane

Common: `b` = beat offset from phrase start (float, `0 <= b < lengthBars*4`,
16th grid = 0.25), `d` = duration in beats (may cross barlines), `vel` = 1-127
authored velocity (accent ~105-118, normal ~78-92, ghost ~35-55),
`art` = `stac | legato | accent | ghost | dead | grace | slide`.

**GLIDE (portamento).** `glide` = signed semitones to slide INTO this note from
(negative = scoop up from below, the 808/synth-bass signature; positive = fall
onto it), `glideBeats` = how long the slide takes (default 0.12). The LANDING
pitch is always the notated one -- a glide only shapes the approach, so harmony
is never altered by a deep slide, and a depth beyond the renderer's bend range
shortens the approach rather than landing wrong. `art: "slide"` implies
`glide: -2` when no explicit value is given, so existing slide-marked notes
glide automatically. **Monophonic lanes only** (bass/melody): pitch bend is
per-channel, so a glide on a comping voicing would smear the whole chord.

**hooks.json — scale-degree space.** `deg` 1-7 relative to the session key's
mode (in minor, `deg: 3` IS the flat 3rd — no accidental needed), `acc` -1/0/+1
for outside-mode chromatics (blue notes), `oct` octave offset (default 0),
`snap` = `chord | scale | lock` (default `scale`; the compiler snaps strong-beat
and long notes to chord tones unless `lock`).

```json
{ "b": 0.75, "d": 0.5, "deg": 7, "oct": 0, "vel": 100 }
```

**bass.json — chord-role space.** `role` in
`R | 2 | b3 | 3 | 4 | 5 | 6 | b7 | 7 | oct | app | ghost | dead`.
`oct` = octave offset. `app` is a chromatic approach: `dir` +1/-1, pitch
resolves one semitone below/above the NEXT event's realized pitch (across the
loop wrap for the final event). `ghost`/`dead` repeat the previous pitch, muted.

```json
{ "b": 3.5, "d": 0.5, "role": "app", "dir": 1, "vel": 94 }
```

**comping.json — voicing space.** `voice` in
`triad | shell | rootless | rootless9 | drop2 | power`, `inv` 0-3 (rotate
bottom note up), optional `top` (a role token: pin the top voice, e.g. `"b7"`),
`art: "dead"` = muted scratch (renders 2 damped notes of the current voicing).

```json
{ "b": 0.5, "d": 0.12, "voice": "rootless9", "inv": 1, "vel": 100, "art": "stac" }
```

**drums.json -- drum-role space.** `drum` names the VOICE, never a note number,
so one pattern plays on any kit (a jazz kit, a TR-808, brushes) without being
rewritten. Vocabulary:

`kick | kick2 | snare | snare2 | rim | clap | hat | hatOpen | hatPedal |`
`ride | rideBell | crash | tomLow | tomMid | tomHigh |`
`tamb | cowbell | shaker | clave | conga | congaLow | maraca`

```json
{ "b": 0.0,  "d": 0.25, "drum": "kick",  "vel": 118, "art": "accent" }
{ "b": 1.75, "d": 0.12, "drum": "snare", "vel": 34,  "art": "ghost" }
```

`art: "ghost"` is the quiet fill-in stroke that makes funk and boom-bap breathe;
`art: "flam"` adds a grace stroke just before the beat. Velocity carries the
groove -- a flat pattern is a drum machine, an accented one is a drummer.

**Drum patterns are the one lane where the CLASSIC pattern itself can be
encoded verbatim.** Rhythm archetypes, grooves and beats are unprotectable
(scenes a faire -- see `../docs/idiom-research/legal.md`), unlike melodies. So
name and encode the real thing: the one-drop, the tresillo, the Motown stomp,
the boom-bap, four-on-the-floor, the half-time shuffle. Use `provenance.inspiration`
to say which pattern it is ("the classic one-drop: rim and kick together on 3").

## progressions.json

```json
{ "id": "funk.prog.two-chord-osc", "mode": "minor",
  "degrees": [1, 4], "qualities": ["m7", "7"],
  "barsPerChord": 2, "weight": 2 }
```

`mode` = `major | minor` (which key flavor this progression serves).
`degrees` are diatonic 1-7 in that mode (natural minor: 6 = bVI, 7 = bVII), or
**borrowed-chord tokens** written as strings with an accidental: `"b2"` = bII
(the phrygian slam), `"b6"`/`"b7"` in major, `"#4"`. A borrowed degree moves the
chord ROOT; give it an explicit entry in `qualities` (it defaults to a major
triad). Example: `"degrees": [1, "b2", 1, "b2"], "qualities": ["m", "", "m", ""]`.
`qualities` (optional, same length as degrees) override the pack's default
seventh logic; allowed: `"" m 7 m7 maj7 6 m6 sus2 sus4 dim dim7 aug m7b5`.
Use `dim7` (not `dim`) for the passing diminished of jazz/blues -- a bare
diminished TRIAD loses the bb7 that gives the chord its pull.
`weight` >= 1 biases seeded selection.

## pack-phrases.json

```json
{ "schemaVersion": 1, "genre": "funk", "defaultMode": "minor",
  "bluesAllowed": true,
  "registers": { "bassLow": 26, "bassHigh": 55, "melodyLow": 55, "melodyHigh": 84 },
  "programs": { "melody": [61, 80, 66], "bass": [33, 36, 38], "comp": [28, 7, 17] },
  "rubric": { "notesPerBarMin": 4, "notesPerBarMax": 10 } }
```

`rubric` (optional) tunes the composer's hook-quality density band for this
genre -- trap breathes at 2-6 notes/bar where funk wants 4-10. The binary only
carries a wide 2-10 fallback; everything else in the rubric is genre-neutral.

## Compiler semantics (what the engine does with this)

- Phrases tile across the requested bars; the final tile's last melody note is
  cadenced to the nearest chord tone. Deterministic: same (seed, key, chords,
  energy) = same notes. Selection is seeded weighted-random among phrases with
  `|phrase.energy - scene energy| <= 0.35` (widened if none match).
- **The composer develops hooks (Phase ML.5).** Restatements are not
  photocopies: a section gets an AAAB / call-answer form where the varying
  restatement is lifted an octave, fragmented, softened, or resolved to the
  chord root. A section of 8+ bars states a SECOND, contrasting hook in its back
  half (riff-switch) instead of repeating one cell eight times. Several seeded
  candidates are scored by a mechanical hook rubric (breathing room, velocity
  life, unique peak, answered leaps, cadence, pitch economy, density band) and
  the best one is kept -- so authoring MORE hooks per genre directly improves
  output. Write cells that survive an octave lift and a fragmenting cut.
- Swing is NOT encoded in phrases: author on the straight grid; the engine
  applies the pack's swing to off-beat 8ths downstream (unless
  `swingSensitive: false`).
- **Calibrating `material.json` `swing`.** The engine delays the off-beat 8th by
  `swing * 0.25` beats, so the resulting swing RATIO is
  `0.5 + swing * 0.25` -- i.e. `swing = (ratio - 0.5) * 4`. A light 54% shuffle
  is `0.16`; 58% is `0.32`; a full 2:1 triplet (67%) is `0.67`. Values around
  `0.1` are effectively straight. Check a pack's swing against the ratio its
  idiom source-book specifies -- several packs were authored well under their
  documented ratio.
- Melody: strong-beat/long notes snap to the current chord's tones
  (direction-preserving) unless `snap: "lock"` — write defensively: put chord
  tones on strong beats yourself or expect snapping.
- Bass roles resolve against the current chord quality (b3/3 and b7/7 follow
  the chord); registers fold into the pack's `registers` window.
- Comping `voice` tokens map to the harmony guard's voicers; `inv`/`top`
  drive voice-leading.

## Authoring checklist (before opening a PR)

1. Encode from an idiom source-book grammar or a PD (<= 1930 publication)
   score — never an in-copyright recording's melody/riff/bass line.
2. `node tests/validate_phrases.mjs` must pass (schema, vocab, bounds, ids).
3. Velocity has life: accents + ghosts, not flat values.
4. Rests are content: hooks should breathe (15-40% silence).
5. Ear-check in the app is the FINAL gate (diag meters do not render audio).
