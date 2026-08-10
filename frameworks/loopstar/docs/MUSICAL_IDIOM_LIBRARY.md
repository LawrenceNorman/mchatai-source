# LoopStar Musical Idiom Library — Design + Build/Maintain Guide

> Status: SHIPPED through ML.5 (2026-08-09). ML.1 schema + validator, ML.2 Swift
> phrase compiler, ML.3/6 phrase packs for every registered style, ML.4 the
> public-domain packs (jazz / blues / classical — real pre-1931 melodies encoded
> verbatim with `pdSource`), ML.5 the COMPOSER: motif-development form
> (AAAB / call-answer), the 8-bar riff-switch, a mechanical hook rubric used as a
> best-of-N objective, and the in-app phrase browser (Style menu -> Browse
> phrases) for auditioning and installing any phrase.
>
> The engine backlog called out by the pack critics is now CLOSED: real
> portamento/glide (pitch-bend ramps; `glide` / `glideBeats`, and `art:"slide"`
> implies a scoop), and borrowed-chord degree tokens (`"b2"` = bII) so phrygian
> genres get true i-bII motion instead of an approximation.
> Remaining backlog: per-progression non-uniform harmonic rhythm, inversion
> control in `material.json` voicingStyle, drum-lane phrases.
> Produced 2026-08-08 from an 11-agent deep-research pass; the full source reports
> live in [`idiom-research/`](idiom-research/). This doc is the synthesis and the
> operating manual. It answers: how do we get LoopStar's "Make it new" from
> "4 chords and a percussive vibe" to genre-authentic hooks, comping, and bass —
> without legal risk and without app rebuilds.

---

## 1. The verdict on "take song ideas from the top 20 classics per genre"

**Right instinct, one crucial correction.** Every system that actually sounds
like the genre (Yamaha arranger styles, Band-in-a-Box, Toontrack EZkeys/EZbass,
Scaler) embeds a curated human phrase corpus; every purely procedural system
(Magenta, Ableton generators, AI MIDI startups) gets called "generic" — which is
exactly LoopStar's current disease. So yes: build the library, study the canon.
See [`idiom-research/priorart.md`](idiom-research/priorart.md).

The correction: **study the canon, don't transcribe it.** Adversarially verified
copyright research ([`legal.md`](idiom-research/legal.md) +
[`legal-verification.md`](idiom-research/legal-verification.md)) splits content
into three lanes:

| Lane | Policy | Examples |
|---|---|---|
| **COPY VERBATIM (legal, settled)** | Chord progressions (even a specific song's changes), harmonic rhythm, groove/rhythm archetypes, swing ratios, voicing techniques (rootless, drop-2, shells, inversions), bass STYLE archetypes, instrumentation, tempo, form | The i-bVII-bVI-V loop; the Nolen "chank" grid; Motown stomp; rootless 9th house stabs |
| **ORIGINAL-IN-IDIOM (never transcribe)** | Melodic hooks, riffs, ostinati, and named-song bass lines from in-copyright songs. Author FRESH cells from the genre's extracted grammar (scales, rhythm cells, contour rules) | A new minor-pent riff written with the Cissy Strut *grammar*, not its notes |
| **PUBLIC DOMAIN VERBATIM (the goldmine)** | Compositions **published <= 1930** (US, as of 2026 — bump to <= 1931 on Jan 1 2027): early jazz/blues standards, ragtime, the entire classical canon, trad folk. Real famous melodies, shipped note-for-note | Bach Cello Suite 1 ostinato, St. Louis Blues, I Got Rhythm changes+head, Dies Irae, In the Hall of the Mountain King |

Key verified legal facts (full claims list with SETTLED/LIKELY labels in the
source docs): progressions are unprotectable even combined with syncopated
harmonic rhythm (*Structured Asset Sales v. Sheeran*, 2d Cir. 2024); short
commonplace ostinati are unprotectable (*Gray v. Hudson* / Dark Horse, 9th Cir.
2022); groove/feel claims were confined after Blurred Lines (*Skidmore* en banc
2020); melody is the one element that clearly IS protected — hence the
zero-transcription rule for in-copyright hooks. Encode PD works from period
sheet music, never from a modern arrangement/edition (arrangement copyright
trap), and record `pdSource` per phrase. Marketing rule: genre words ("Motown
feel") are fine; artist names in pack titles are not (follow the Toontrack norm).
This matches and extends the posture already shipped in
`LoopStarSongResearchAgent.swift` (facts/chords yes, melody transcription never).

---

## 2. Why the current output is corny (diagnosis)

Current material packs (`frameworks/loopstar/{genre}/material.json`) are ~1.5KB
of parameters: four 4-chord diatonic progressions, ONE comping rhythm, a bass
enum (5 archetypes in the binary), and a melody density knob. Melody is built
from 9 generic rhythm cells x 5 contours in `LoopStarMaterialEngine.swift`.
There is no vocabulary — the engine is a theory student with no record
collection. The measurable failure modes (uniform density, no rests, flat
velocity, root-position blocks, no motif economy, melody rhythm floating free of
the groove) are cataloged with testable DO-rules in
[`idiom-research/hooks.md`](idiom-research/hooks.md) §2.

---

## 3. Target architecture

### 3.1 The content: a phrase library in mchatai-source (RULE #1 — zero rebuild)

```
frameworks/loopstar/phrases/
  SPEC.md                      # schema v1 reference: vocab tables, retargeting rules R1-R10
  _index/phrases-index.json    # id -> file map + tag rollups (FLAT — nested JSON breaks the Swift decoder)
  {genre}/                     # funk, soul, rnb, boombap, trap, gfunk, grime, lofi, house,
                               # techno, trance, edm, reggae, dub, dubstep, dnb, rock, pop,
                               # punk, metal, folk, jazz, blues, classical
    pack-phrases.json          # genre meta: default mode, registers, bluesAllowed, GM palette, rubric bands
    hooks.json                 # melody cells + phrases (scale-degree space)
    bass.json                  # riffs (chord-role space)
    comping.json               # voicing rhythm patterns (chord-role/voicing space)
    progressions.json          # degree progressions + harmonic rhythm + section forms (extends today's 4)
    README.md                  # genre authoring notes distilled from idiom-research/
```

Existing `material.json` files stay (tempo/swing/drums/defaults); phrase files
are additive. A genre with no phrase files falls back to today's parametric
generator — phrases are an accelerator, not a gate (RULE #3 posture).

### 3.2 Phrase encoding: three pitch spaces, one per lane

The single most load-bearing design decision, converged on independently by the
prior-art and representation lanes (it is how arranger keyboards have worked for
30 years — Yamaha NTR/NTT):

| Lane | Pitch space | Why |
|---|---|---|
| Melody / hooks | **scale degrees** (`deg` 1-7, `acc` for chromatics, `oct`) | Contour survives any key/mode; LLM-authorable; diffable |
| Bass | **chord roles** (`R, 3, 5, b7, oct, app, ghost, dead`) | Retargeting is free — roles ARE chord tones; approach notes recompute against the NEXT chord |
| Comping | **voicing tokens** (`voice: shell|rootless|rootless9|drop2|triad|power`, `inv`, optional `top` pin) | Maps 1:1 onto `LoopStarHarmonyGuard.VoicingStyle`; voice-leading = inversion choice |
| Drums | slot grid (existing material.json) | unchanged |

Per-note expressiveness (required — this is where "played by a human" lives):
`art` in `stac|legato|accent|ghost|dead|slide|grace`, velocity tiers
(accent ~105-118 / normal ~78-92 / ghost ~35-55), `tieNext` for barline
anticipations. Per-phrase: `authoredOver` (mode + progression + harmonic
rhythm), `worksOver` (`static` riff-vamp vs `progression`), tags
(`energy, density, register, syncopation, role, mood, singable, swingSensitive`),
`links` (`pairsWith`, `responseOf`, `fillInto`), `provenance`
(inspiration text, `pdSource` for verbatim PD lifts), and a per-phrase/per-note
`lock` flag (Band-in-a-Box "riff-based" mode) so signature chromatics — blue
notes, 808 slides, bebop passing tones — are NEVER snapped away by the harmony
guard. Full schema v1 with four worked examples (funk bass riff, soul
call/response hook, house rootless-9 stab pattern, boom-bap shell comp):
[`idiom-research/representation.md`](idiom-research/representation.md) §2-3.

### 3.3 The engine: a generic phrase compiler (Swift — skeleton-compatible)

New generic infrastructure (no genre strings in the binary): a compiler from
phrase JSON -> `ChordEventSpec` events, executing retargeting rules R1-R10
(representation.md §4). Highlights: strong-beat chord-tone snap (already
exists), direction-preserving snap with collapse guard, the b3-vs-3 blues rule,
avoid-note resolution, approach-note recompute, register fold with
melody-clash rule, voicing degrade table, and full determinism (same seed +
inputs = same notes; randomness lives only in phrase SELECTION).
`LoopStarHarmonyGuard` becomes the NTT executor — it already has the voicing
machinery. Selection is weighted-random among tag-eligible phrases (the
Band-in-a-Box runtime, proven since the 90s), seeded like today's SeededRNG.

### 3.4 The AI DJ: recombination grammar over library atoms

Hierarchy: cell (1-2 bars) -> phrase (call+response) -> section -> existing Song
Part layer. Forms: `AAAA(riff) | AAAB | AABA' | ABAB | call/response`; the 3rd+
repeat MUST vary (variation quota) via deterministic operators
(`transposeToChord, finalRepeatOctaveUp, fragment, augment, invert,
responseFrom, velocityArc, restThin`). Hard anti-corny constraints: busy-budget
(max ONE busy lane at a time), rest-interlock (comp plays in melody's rests),
register separation, cadence rule (section-final melody note = stable chord
tone), don't-clone-the-drums. Full grammar: representation.md §5. The rubric
(§3.5) doubles as the DJ's objective function: recombine -> score -> keep
best-of-N, with rejections that explain themselves ("failed Q3: rest ratio 6%").

### 3.5 Quality gate: the 15-check hook rubric

[`idiom-research/hooks.md`](idiom-research/hooks.md) §4 defines 15 mechanical
checks computable on note data (no audio, no LLM): repeated-but-varied rhythm
cell, rest ratio 15-40%, unique peak placed 40-85% through, post-leap reversal,
velocity life, groove lock, register separation, voice-leading, cadential
landing, call/response shape, etc. Weighted to 100; ship >= 70, "hook" badge
>= 85. Bands are CONTENT (per-genre `rubric` block in `pack-phrases.json`),
binary carries only `_fallback_only` defaults. Calibration rule: canon-derived
phrases must score 85+; if they don't, the genre's bands are wrong — fix the
pack, not the phrase.

---

## 4. The authoring pipeline (how the library gets deep without getting corny)

Per genre, per lane slot:

1. `[DETERMINISTIC]` Read the genre's idiom source-book
   (`idiom-research/genre-*.md`) — canon list, harmony families, exact comping
   grids, bass archetypes, hook grammar with original example cells, GM
   programs, corny traps, PD lifts. These are the study notes the "top 20
   classics" idea called for, already extracted.
2. `[LLM-SOFT]` LLM proposes N=8 candidates per slot, few-shot prompted with the
   3 best existing phrases of that lane+genre + SPEC.md excerpt.
   *Fallback if LLM output is weak:* hand-encode the source-book's own original
   example cells (every genre doc contains 2-3 per lane) — the library still
   ships.
3. `[DETERMINISTIC]` Validator: schema, bounds, vocab, computed-not-trusted tags
   (density/register/syncopation measured from events), strong-beat chord-tone
   ratio, dedup (reject onset+contour similarity > 0.9 vs shipped phrases),
   corny lint. Emits a rendered .mid + notation preview into the PR.
4. `[DETERMINISTIC]` Retargeting stress test: auto-render each phrase over 2
   keys x 2 progressions x major+minor. Phrases that only work where authored
   are rejected here.
5. `[MULTI-SHOT]` Critic agent scores the rubric; top 2-3 survive.
6. **Human ear-check is the FINAL gate.** LoopStar diag meters do not reflect
   audio (known gotcha) — verify by ear in the app. Then PR to mchatai-source.
   Zero app rebuild.

Launch depth per genre (prior-art floor): 8-12 hooks, 6-8 bass, 6-8 comping,
10-15 progressions (~35-45 atoms) -> thousands of section-level combinations via
the grammar. Credibility target over time: 24+ hooks/genre (commercial MIDI-pack
floor), 40-120 total phrases (a Yamaha style). Distinct rhythmic identities
matter more than raw count.

---

## 5. Implementation phases (proposed)

| Phase | Type | Scope | Verify |
|---|---|---|---|
| ML.0 | [DETERMINISTIC] | This research + design (DONE — this doc + idiom-research/) | docs present |
| ML.1 | [DETERMINISTIC] | `phrases/SPEC.md` + JSON Schema + Node validator in mchatai-source; no Swift | validator passes on 4 worked examples |
| ML.2 | [DETERMINISTIC] | Swift phrase compiler + R1-R10 retargeting in `LoopStarMaterialEngine` / `LoopStarGenrePack` (additive decode; parametric fallback when no phrases) | build + `diagLoopStar` render of a hand-authored test phrase, 2 keys |
| ML.3 | [LLM-SOFT] | Pilot pack: FUNK (new genre, richest source-book) + deepen SOUL via pipeline §4; fallback = hand-encoded source-book cells | validator + rubric >= 70 + ear-check |
| ML.4 | [DETERMINISTIC] | PD pack: `classical/` + `blues/` + `jazz/` verbatim lifts from the encode-ready degree sequences in genre-jazz-blues-classical.md §9 | pdSource present on every lifted phrase; ear-check |
| ML.5 | [LLM-SOFT] | AI DJ integration: weighted selection, grammar operators, rubric-as-objective; hook browser UI ("find me a hook") reads tags | DJ A/B: grammar-composed vs current generator, by ear |
| ML.6 | [MULTI-SHOT] | Remaining genres at launch depth, one PR per genre | per-genre rubric calibration |

---

## 6. Maintenance rules

- **Phrases are immutable once shipped**: revisions get a NEW id + `supersedes`
  (sessions may reference phrase ids; never break them).
- **Additive schema changes only**; `schemaVersion` per file.
- **Annual PD bump**: every Jan 1, the PD publication-year cutoff advances
  (<= 1931 on 2027-01-01). A yearly content PR may promote newly-PD works.
- **Provenance is mandatory**: every phrase carries `provenance.inspiration`
  (style-of text) or `provenance.pdSource` (work + publication year + edition).
  Never an in-copyright song's notes. "Sounds like the genre" = goal;
  "recognizably that song" = bug (the musicologist test).
- **ASCII-only JSON content** (Swift decoder gotcha); flat `_index` files
  (nested `_index.json` breaks the decoder).
- **Adding a genre = content only**: new `phrases/{genre}/` dir + index entry +
  `styles.json` entry (+ optionally a `material.json` for drums/tempo). No
  Swift changes. New genres should start from a genre source-book; if one
  doesn't exist yet, commission the research doc first (the 6 existing ones set
  the template: canon, harmony, comping grids, bass archetypes, hook grammar,
  GM programs, arrangement, corny traps, PD lifts).

## 7. Reading map

| Question | Doc |
|---|---|
| What's legal to copy? | [`idiom-research/legal.md`](idiom-research/legal.md), verified by [`legal-verification.md`](idiom-research/legal-verification.md) |
| What makes a hook work / the 15-check rubric | [`idiom-research/hooks.md`](idiom-research/hooks.md) |
| How arrangers/BIAB/Toontrack/Hooktheory solved this | [`idiom-research/priorart.md`](idiom-research/priorart.md) |
| Phrase schema, retargeting rules, DJ grammar | [`idiom-research/representation.md`](idiom-research/representation.md) |
| Funk / Soul / R&B idioms | [`idiom-research/genre-funk-soul-rnb.md`](idiom-research/genre-funk-soul-rnb.md) |
| Boom-bap / Trap / G-funk / Grime / Lo-fi | [`idiom-research/genre-hiphop.md`](idiom-research/genre-hiphop.md) |
| House / Techno / Trance / EDM | [`idiom-research/genre-house-edm.md`](idiom-research/genre-house-edm.md) |
| Reggae / Dub / Dubstep / DnB | [`idiom-research/genre-reggae-dub-bass.md`](idiom-research/genre-reggae-dub-bass.md) |
| Rock / Pop / Punk / Metal / Folk | [`idiom-research/genre-rock-pop.md`](idiom-research/genre-rock-pop.md) |
| Jazz / Blues / Classical + PD goldmine | [`idiom-research/genre-jazz-blues-classical.md`](idiom-research/genre-jazz-blues-classical.md) |
