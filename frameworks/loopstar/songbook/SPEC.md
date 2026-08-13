# LoopStar Song Book — Schema v1

The Song Book is a **real book of public-domain music**: whole compositions —
form, changes, and the actual tune — that load into LoopStar as playable,
remixable Song Parts.

It is the tier ABOVE the phrase library. A phrase is 1-4 bars of idiom; a song
is a form. They share one pitch vocabulary on purpose, so the same compiler
plays both and a song inherits every treatment the phrase engine already knows.

```
phrase library   ->  "a bass riff in the funk grammar"        (1-4 bars, idiom)
song book        ->  "St. Louis Blues, verse + chorus, head"  (whole form)
```

Like everything under `frameworks/loopstar/`, this is CONTENT (RULE #1). The
binary carries a generic loader + arranger; every note, chord and title lives
here. Adding a song is a PR, never a rebuild.

## The division of labour (why a song remixes for free)

A song file carries only what is **intrinsic to the composition**:

| The song owns | The active STYLE owns |
|---|---|
| form (Intro/Verse/Chorus/Bridge/Outro) | the beat |
| the changes, per section | the bass line |
| the melody (the head) | the comping pattern + voicings |
| key, mode, suggested tempo, feel | kit, swing, instrument programs |

So loading "Wade in the Water" with Style = Boom-Bap gives you the real tune and
the real changes over a dusty MPC pocket; switch Style to House and the same
composition is a house record. The song never encodes a drum kit or a bass
patch, which is exactly what makes it re-treatable.

This mirrors how a real book works: here are the changes and the head — now play
it your way.

## Layout

```
songbook/
  SPEC.md                    # this file
  CANDIDATES.md              # the backlog: what to add next, and what NOT to
  index.json                 # the catalogue (browse + search reads ONLY this)
  songs/{song-id}.json       # one composition
  tests/validate_songbook.mjs
```

Before picking a song to encode, read [`CANDIDATES.md`](CANDIDATES.md) — it lists
the public-domain repertoire with the strongest modern pull, the meter and
chord-granularity limits that block whole categories, and the songs people
routinely assume are free but are not.

`index.json` is a denormalised catalogue so the browser never has to open 50
song files to draw a list. It is GENERATED from the song files —
`node tests/validate_songbook.mjs --write-index` rebuilds it, and the validator
fails if it has drifted from `songs/`.

## Public-domain policy (non-negotiable)

Every song MUST carry a `pd` block, and the validator rejects a song without
one. A song qualifies on exactly one of these bases:

- `published-pre-1930` — first published in the United States before 1930
  (as of 2026 the US line is 1931; we keep a one-year margin).
- `traditional` — anonymous / folk origin in circulation before 1900, no
  identifiable author.
- `author-died-pre-1930` — every credited composer died more than 95 years ago
  (covers the classical repertoire and clears life+70 jurisdictions too).

**Lyrics need their OWN, SEPARATE public-domain basis.** Words and music are
different works by different people with different terms — a PD melody very
often carries in-copyright words (a modern hymn text on an old tune, an English
singing translation of a PD German original, a 1960s folk-revival rewrite of a
traditional ballad). So lyrics are welcome, but only with their own `pd` block
naming the lyricist and the basis, checked independently of the music's. When
that basis cannot be established, the song ships with the tune and no words —
which is a perfectly good real-book page.

**Lyrics: transcribe, never reconstruct.** A half-remembered verse written down
confidently is worse than no verse. If only the first stanza is certain, ship
one stanza.

**Historically offensive verses are omitted, and the omission is stated.** Parts
of this repertoire — minstrel-era songs especially — carry racist dialect verses
that no modern edition prints. Encode the standard modern singable text, drop
those verses, and say so in `lyrics.notes`. Do not rewrite them into something
new: that would be inventing words and attributing them to the composition.

**Encode from a score, not from a recording.** A specific recorded performance
and a specific published *arrangement* can each be in copyright even when the
underlying composition is free. `pd.sourceEdition` names what was read.

When a song is famous through one modern recording (a folk tune everyone knows
from a 1960s cover), encode the TRADITIONAL version, not the cover's
arrangement, and say so in `pd.notes`.

## Meter: 4/4, 3/4, 6/8, 7/8 (Phase SM)

Supported meters: `"4/4"`, `"3/4"`, `"6/8"`, `"7/8"`. Playing a non-4/4 song
flips the SESSION meter (generated channels are the band; the pack's 4/4 loop
audio sits out — see `mchatai_macOS/docs/LOOPSTAR_METER_DESIGN.md`).

- **3/4**: three beats per bar, each beat a quarter. A section of N bars spans
  `[0, N*3)` melody beats.
- **6/8**: SIX beats per bar on the eighth-note pulse — a dotted quarter is
  `d: 3`, the two compound stresses fall on beats 0 and 3.
- **7/8**: seven eighth-note beats, default 2+2+3 grouping.
- Cut-time and 2/4 material still maps to 4/4 at half the written tempo; say so
  in `notes`.

**Never force a tune into the wrong meter.** If its real meter is unsupported
(9/8, 5/4), do not encode it — the validator rejects unsupported meters rather
than letting the tune be mangled.

## Chord granularity: one chord per bar

`LoopStarChordSpan` is bar-granular throughout the engine, so v1 changes move on
barlines. A `ii-V` crammed into one bar has to become one bar each, or the bar's
primary chord.

This is a real limitation and it is why the v1 corpus leans on blues,
spirituals, folk, shanties, modal and classical material — repertoire whose
changes are genuinely bar-paced — rather than bebop heads. Sub-bar changes are
the natural next phase; don't fake them by halving the song's bar count, which
would put the melody on the wrong grid.

## songs/{song-id}.json

```json
{
  "schemaVersion": 1,
  "id": "st-louis-blues",
  "title": "St. Louis Blues",
  "composer": "W. C. Handy",
  "year": 1914,
  "origin": "American blues / early jazz",
  "tags": ["blues", "jazz", "12-bar"],
  "styleHints": ["blues", "jazz", "soul"],
  "instrumentAffinity": ["piano", "guitar"],

  "pd": {
    "basis": "published-pre-1930",
    "detail": "First published 1914, Pace & Handy Music Co., New York.",
    "sourceEdition": "Handy, W.C., 'St. Louis Blues', 1914 piano/vocal score",
    "notes": "Melody and changes only; no lyrics."
  },

  "key": "G",
  "mode": "major",
  "meter": "4/4",
  "tempoBPM": 96,
  "tempoRange": [72, 132],
  "feel": "swing",
  "confidence": "high",

  "sections": [
    {
      "id": "verse",
      "name": "Verse",
      "bars": 12,
      "energy": 0.5,
      "chords": [ { "symbol": "G", "bars": 4 }, { "symbol": "C7", "bars": 2 } ],
      "melody": { "events": [ { "b": 0, "d": 1, "deg": 5, "vel": 96 } ] }
    }
  ],

  "form": [
    { "section": "verse", "label": "Verse 1" },
    { "section": "chorus", "label": "Chorus" }
  ]
}
```

### Top-level fields

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | kebab-case, immutable once shipped, matches the filename |
| `title` | yes | as commonly known |
| `composer` | yes | `"Traditional (English)"` when anonymous |
| `year` | yes | first publication (or best-known date for traditional) |
| `origin` | yes | one line of provenance shown in the browser |
| `tags` | yes | free search terms (genre words, `"12-bar"`, `"modal"`, `"aaba"`) |
| `styleHints` | yes | material-pack ids that suit it, best first — the loader offers these |
| `instrumentAffinity` | no | `piano` / `guitar` / `both`, purely a browse filter |
| `pd` | yes | see policy above |
| `key` | yes | the song's OWN key: `"G"`, `"Am"`, `"Bb"`, `"F#m"` |
| `mode` | yes | `major` or `minor` — pins the melody so transposition keeps the tune |
| `meter` | yes | `"4/4"` in v1 |
| `tempoBPM` | yes | the idiomatic tempo |
| `tempoRange` | no | `[min, max]` the tune survives, for the DJ/setlist planner |
| `feel` | yes | `straight` or `swing` |
| `confidence` | yes | `high` / `medium` — the encoder's own certainty about the melody |
| `sections` | yes | 1-8 named sections, each independently loadable |
| `form` | yes | the arrangement: an ordered list of section references |

`confidence: "medium"` still ships, but the browser badges it and the loader
prefers a `high` song when both match a search. Anything the encoder cannot
recall accurately does not get a guess written into it — it does not get
written at all.

### Sections

A section is the unit of compilation: one section = one chord spec, one melody
compile, one Song Part.

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | kebab-case, unique in the song, referenced by `form` |
| `name` | yes | display name — Intro / Verse / Chorus / Bridge / Head / Solo / Outro |
| `bars` | yes | **1-16**. The engine compiles a phrase over at most 16 bars |
| `energy` | yes | 0-1, drives the scene texture the Part gets |
| `chords` | yes | `[{symbol, bars}]`, bars summing EXACTLY to the section's `bars` |
| `melody` | no | the head for this section; omit for a solo/vamp section |
| `lyrics` | no | the words sung over this section — see below |

A 32-bar AABA form is four 8-bar sections, not one 32-bar section. That is the
right shape anyway: it lets the user drop the bridge, double the A, or solo over
one section.

**Chord symbols** must parse with `LoopStarHarmonyGuard`. Supported qualities:

```
(major)  m  7  m7  maj7  6  m6  sus2  sus4  dim  dim7  aug  m7b5
```

Roots are `A`-`G` with optional `#`/`b`. Richer symbols (`13`, `7#9`, slash
chords) are not in the vocabulary — write the closest supported quality rather
than a symbol that silently degrades. `dim7` not `dim` for the passing
diminished, same rule as the phrase library.

### melody.events — scale-degree space

Identical vocabulary to `phrases/{genre}/hooks.json`, with one difference that
matters enormously:

**`snap` defaults to `"lock"` in the song book.** A phrase hook is *material*
and wants to be snapped onto the chord of the moment. A song's head is *the
tune* — snapping it to chord tones is how a famous melody quietly stops being
that melody. The loader forces `lock` unless an event opts out with an explicit
`"snap": "chord"` (useful on a deliberately floating pickup or a solo lick).

| Field | Meaning |
|---|---|
| `b` | beat offset from the SECTION start, `0 <= b < bars * 4`, 16th grid (0.25) |
| `d` | duration in beats; may cross barlines |
| `deg` | 1-7 relative to the song's `mode` — in minor, `deg: 3` IS the flat 3rd |
| `acc` | -1 / 0 / +1 for chromatics outside the mode (blue notes, raised 7ths) |
| `oct` | octave offset, default 0 |
| `vel` | 1-127 |
| `art` | `stac` `legato` `accent` `ghost` `grace` `slide` |
| `snap` | omit (= `lock`); `"chord"` only to deliberately let a note follow |

Note that `b` is measured from the **section** start, not a 1-bar phrase start —
a 12-bar verse's last note may sit at `b: 44`.

Melody accuracy checklist, in the order errors actually happen:

1. **Pickups.** A tune that starts before beat 1 of bar 1 (very common — "When
   the Saints", "Oh! Susanna") cannot use a negative `b`. Put the pickup at the
   END of the preceding section, or start the section on the downbeat and let
   the pickup live in the `intro`. Never silently drop it.
2. **Raised 7th in minor.** `mode: "minor"` is natural minor, so the leading
   tone of a harmonic-minor tune is `deg: 7, acc: 1`. Forgetting this is the
   single most common minor-key encoding bug.
3. **Blue notes.** The b3 over a major tonic is `deg: 3, acc: -1`; the b5 is
   `deg: 5, acc: -1`. Do not "correct" them to chord tones.
4. **Rhythm carries recognition more than pitch.** Get the dotted figures and
   the ties right; a melody with the correct pitches and a flattened rhythm is
   unrecognisable.
5. **Velocity has life** — accents on phrase peaks, softer on passing notes.

### section.lyrics — the words, bar-aligned

```json
"lyrics": {
  "pd": {
    "lyricist": "Traditional",
    "basis": "traditional",
    "detail": "Anonymous English broadside text in circulation by the 1840s.",
    "sourceEdition": "Sharp, English Folk Songs from the Southern Appalachians, 1917"
  },
  "notes": "Verses 3-4 of the 1848 printing are minstrel-dialect and are omitted.",
  "stanzas": [
    [ { "bar": 0, "text": "I come from Alabama" },
      { "bar": 2, "text": "with a banjo on my knee" } ],
    [ { "bar": 0, "text": "It rained all night" },
      { "bar": 2, "text": "the day I left" } ]
  ]
}
```

`lyrics.pd` is **independent of the song's `pd`** and mandatory whenever lyrics
are present. `basis` uses the same three values, applied to the LYRICIST:
`published-pre-1930`, `traditional`, `author-died-pre-1930`.

A `stanza` is an array of `{bar, text}` lines. `bar` is 0-based **relative to
the section start** and must be less than the section's `bars` — bar-aligning
the words is what lets the Score window follow along while you play, which is
the entire reason to carry them.

Multiple stanzas are how one melody carries several verses. `form` picks which
one each occurrence sings (see `stanza` below). One stanza is fine; a chorus
usually has exactly one.

Keep `text` to a readable line — roughly what fits on one line of a chart, not a
whole verse crammed into one entry. ASCII only, like everything else.

## form

```json
"form": [
  { "section": "intro",  "label": "Intro",   "repeat": 1 },
  { "section": "verse",  "label": "Verse 1", "repeat": 2, "stanza": 1 },
  { "section": "chorus", "label": "Chorus",  "repeat": 1, "energy": 0.75 }
]
```

Each entry becomes ONE Song Part in the loaded arrangement, in order.

| Field | Required | Meaning |
|---|---|---|
| `section` | yes | a section `id` from `sections` |
| `label` | no | the Part's name; defaults to the section's `name` |
| `repeat` | no | 1-4, plays the section back to back within the one Part |
| `energy` | no | override the section's energy for this occurrence |
| `stanza` | no | 1-based, which stanza of the section's lyrics this occurrence sings (default 1; clamped to what exists) |

Referencing the same section twice is the point: "Verse 1" and "Verse 2" are
independent Parts by birth (MPC-style deep copy), so the user can change one
without touching the other.

Keep `form` to a playable length — 4 to 8 entries. The user extends it; a
32-entry form is a recording, not a starting point.

## index.json

Generated. Do not hand-edit.

```json
{ "schemaVersion": 1,
  "songs": [
    { "id": "st-louis-blues", "title": "St. Louis Blues",
      "composer": "W. C. Handy", "year": 1914,
      "tags": ["blues", "jazz", "12-bar"], "styleHints": ["blues", "jazz"],
      "instrumentAffinity": ["piano", "guitar"],
      "key": "G", "mode": "major", "meter": "4/4", "tempoBPM": 96,
      "feel": "swing", "confidence": "high",
      "bars": 24, "sectionCount": 2, "hasMelody": true,
      "pdBasis": "published-pre-1930" }
  ] }
```

## Authoring checklist

1. Confirm the PD basis FIRST and write the `pd` block before any notes.
2. 4/4 only. Confirm the meter before encoding, not after.
3. Chord bars must sum exactly to section bars — the validator checks this.
4. Encode the melody from the score; re-sing it against what you wrote.
5. `node tests/validate_songbook.mjs` must pass.
6. `node tests/validate_songbook.mjs --write-index` to refresh the catalogue.
7. ASCII only — no smart quotes, no accented characters in any field. Song
   titles and composer names get transliterated (`Faure` not `Fauré`); the Swift
   decoder has a documented non-ASCII failure mode.
8. Ear-check in the app is the FINAL gate. Diag output does not render audio.
