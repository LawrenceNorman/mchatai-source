# Hook Craft & Anti-Corniness Report — engineering rules for LoopStar's genre library

Scope: what makes hooks stick, why procedural output reads as corny, what the phrase-JSON format must express, and a mechanical 15-check rubric. All rules are stated against the engine event format `{bar, beat, durationBeats, midiNotes[], velocity}` + chord context.

---

## 1. Hook / earworm science → craft rules

### 1.1 Repetition schemes (the #1 lever)
- Repetition itself creates liking (mere-exposure) and shifts attention from note-to-note to gestalt level (Margulis, *On Repeat*). Lyrical/chorus repetition measurably predicts chart success (Nunes, Ordanini & Valsesia 2015, Billboard 1958–2012). Repetition is not a crutch — it IS the hook mechanism.
- **Canonical schemes** (1-bar or 2-bar cell `A`): `AAAB` ("third time pays off" — vary the last), `AABA'`, `ABAB'`, `ABAC`. Almost every classic riff/hook fits one.
- **RULE R1**: a 4-bar hook = one rhythm cell stated ≥ 2× exactly, with exactly ONE varied statement (changed ending, fill, or transposition). Never 4 distinct bars; never 4 identical bars in melody lane (drums may be 4 identical).
- **RULE R2**: variation budget per restatement: change ≤ 2 notes OR transpose whole cell to the new chord OR alter only the final 1–2 beats. Keep ≥ 70% of onsets identical between "same" cells.
- **RULE R3**: an 8-bar loop = 4-bar phrase played twice with a differing bar 8 (turnaround/fill), i.e. period form.

### 1.2 Melodic contour
- Earworm study (Jakubowski, Finkel, Stewart & Müllensiefen 2017, *Psych. of Aesthetics*, N=3000 INMI reports, 100 vs 100 matched tunes): earworms have (a) **common, generic global contours** (esp. rise-then-fall arch, nursery-rhyme shaped), (b) **faster tempo**, and (c) one or two **unusual interval events** (a bigger-than-typical leap or unusually many repeated notes). Formula: *generic contour + one signature surprise*.
- Post-skip reversal / gap-fill (Huron, *Sweet Anticipation*; cross-cultural corpus finding): after a leap (≥ 5 semitones), melodies reverse direction, usually by step. Encode as hard constraint, ≥ 70% compliance.
- Arch: single climax per phrase; peak note should occur ONCE (unique peak = memorable landmark). Best peak location: bar 3 of a 4-bar phrase (~60–75% through), then descent to stable ending.
- Interval diet: 55–75% of melodic intervals stepwise (≤ 2 semitones); repeated notes are idiomatic (esp. funk, hip-hop, reggae toasting-style melodies); leaps > 7 semitones ≤ 1 per phrase and always the "signature" moment.

### 1.3 Rhythmic hooks vs melodic hooks
- Many defining hooks are rhythm-first with 1–3 pitches (funk riffs, "We Will Rock You", reggae skank, trap hi-hat signatures). Rhythmic identity survives transposition and chord snapping; pitch-heavy hooks are fragile. For a generator, **rhythm cell is the hook's DNA; pitches decorate it**.
- Singability constraint: a hook rhythm uses ≤ 3 distinct duration values and ≤ 5 distinct onset positions per bar. If you can't clap it after one hearing, it's not a hook.
- Hooked on Music (Burgoyne et al., citizen-science, 12k+ players): recognition of the catchiest fragments happens in ~2.3 s — **the first 2 beats of the hook must already be distinctive** (don't start with a full bar of scale-tone noodling; start with the signature rhythm or the signature interval).

### 1.4 Syncopation & anticipation
- Witek et al. 2014 (PLOS ONE, funk drum-breaks): **inverted-U** — medium syncopation maximizes urge-to-move and pleasure; zero and maximal syncopation both fail. Actionable: per-genre syncopation band, not "more = better".
- Anticipation (hitting chord/bass/melody note an 8th before the barline, tied over) is the single cheapest "played by a human" signal. Soul/funk/reggae/house comping without anticipations reads robotic.
- **RULE S1**: groove genres need ≥ 1 offbeat onset per bar in ≥ 1 pitched lane, and ≥ 1 barline anticipation (onset at beat 3.5 or 4.5→wraps) per 2 bars in comping or bass.
- **RULE S2**: never syncopate everything — keep ≥ 1 lane anchoring beats 1 and 3 (or the backbeat) while another lane syncopates against it.

### 1.5 Call-and-response
- Antecedent/consequent pairing: bars 1–2 = call (ends unstable — non-chord-tone, higher, or short), bars 3–4 = response (same rhythm ≥ 60% similar, ends stable — chord tone, longer, usually lower). This is the strongest known 4-bar hook template (blues, gospel, funk, pop pre-choruses).
- Response variants: exact-rhythm/new-ending (most common), inverted contour, fragment of call + fill, or response in a different lane (melody asks, bass answers — funk staple).

### 1.6 Hook size & register norms
- Core cell: 1–2 bars, 3–9 notes (working-memory span). Full hook: 2–4 bars. Melodic range of a phrase: ≤ 12–14 semitones.
- Register: melody sits ABOVE the comping voicing top by ≥ 3 semitones (avoid unison mud); typical melody register C4–C6; comping voicing tops C4–A4; bass E1–G3. Peak note of melody should be the highest pitched event in the whole mix at that instant.

---

## 2. Why procedural music reads as corny → DO rules

Each failure below is what LoopStar's current generator exhibits; each DO rule is mechanically checkable.

| # | Corny failure | Why it fails perceptually | DO rule (testable) |
|---|---|---|---|
| C1 | Uniform note density, wall-to-wall notes | No breathing → no phrase boundaries → nothing to remember | Melody rest ratio 15–40% of total beats; ≥ 1 rest ≥ 1.0 beat per 4 bars; per-bar note counts vary (max−min ≥ 2) |
| C2 | Random-walk contour, no motif economy | Every bar is new information; memory never gets a foothold | ≥ 70% of melody notes belong to a repeated/transformed cell (see R1); ≤ 7 distinct pitch classes per 4 bars |
| C3 | Quantized flat velocity | Reads as MIDI demo; groove lives in accent contrast | 3-tier velocity: accent ~105–118, normal ~78–92, ghost ~35–55; lane velocity σ ≥ 8; accents aligned to genre accent map (e.g. backbeat, offbeat skank) |
| C4 | Only root-position block triads | "MIDI keyboard preset demo" sound; parallel planing between chords | Voice-lead comping: top note moves ≤ 2 semitones across ≥ 75% of chord changes (choose inversion accordingly); genre tensions (add9/6/7/9) where pack allows |
| C5 | No tension-release arc | Loop feels like wallpaper, not a statement | Unique peak note per phrase, placed 50–80% through; final melody note = chord tone with duration ≥ 1 beat; density/velocity rise into bar 3, relax in bar 4 |
| C6 | Melody rhythm floats free of the groove | Lanes sound like 4 separate generators | ≥ 50% of melody onsets coincide with drum-pattern onset grid (kick/snare/hat accents); melody built from the SAME rhythm-cell vocabulary as the pack's comping cells |
| C7 | No articulation (all notes full-length, no slides/dead notes) | Gate=100% legato synth mush; no genre fingerprint | Per-note articulation: staccato gate 0.25–0.5×, tenuto 0.9×, legato/tie, ghost, dead-note (drums/bass), slide/glide flag. Funk comping default = staccato; soul pads = legato |
| C8 | One comping pattern per genre, looped verbatim | The genre becomes a caricature of one rhythm | ≥ 6–10 comping cells per genre with anticipation/fill variants; comping varies every 2–4 bars (pattern or inversion change) |
| C9 | Harmonic rhythm always 1 chord/bar | Metronomic harmony = corny | Packs may specify 2 chords/bar, 1 chord/2 bars, or anticipated changes; at least the cadence bar should differ |
| C10 | Everything plays all the time | No arrangement contrast; hook never exposed | Loop sections drop lanes: e.g. bars 1–4 no melody (groove establishes), hook enters alone or over reduced comping. AI DJ recombination should treat lane muting as a first-class move |
| C11 | Scale-degree snapping destroys blue notes / chromatic passing tones | b3-over-major, #4 passing, b7 inflections get "corrected" into vanilla | Snap policy per note: `chordTone` / `scaleTone` / `keepChromatic` (see §3) |
| C12 | Ending avoids commitment (loop just stops mid-cell) | No cadence = no closure = amateur | Bar 4/8: bass lands root, melody lands chord tone, optional drum fill occupying ≤ 1 beat |

---

## 3. What the phrase-JSON format MUST express

Minimum schema features so real canon-derived phrases survive storage → transposition → chord-snap → render:

**Per-note fields**
- `deg` — scale degree (1–7, chromatic via `+`/`-` alterations e.g. `b3`, `#4`) OR `chordRole` (R, 3, 5, 6, 7, 9, 11, 13) — support BOTH addressing modes; chord-role notes retarget when chord changes, degree notes stay key-relative.
- `oct` — octave offset from lane's `preferredOctave`; enables octave displacement (bass octave pops, hook doubling).
- `art` — `staccato | legato | tenuto | ghost | dead | slide | accent` (slide = pitch-bend/glide into note, dead = pitched-noise mute — bass/guitar idiom).
- `gate` — duration multiplier override (0.2–1.1) when `art` isn't enough.
- `velTier` — `ghost | norm | accent` (engine maps tiers to genre velocity bands; never bake absolute velocities into phrases).
- `snap` — `chordTone | scaleTone | keepChromatic` (protects blues/pentatonic inflection from the harmony guard).
- `tieNext` — for anticipations sustained across barline/chord change.
- `beat` may be negative-relative: `anticipates: true` ⇒ onset 0.5 beat before its notated bar, voiced with the UPCOMING chord.

**Per-phrase fields**
- `harmonyMode` — `riffStatic` (transpose whole riff to chord root, preserve interval shape — funk/rock/blues riffs) vs `degreeMapped` (re-map notes to progression — pop/soul melodies). This split is essential; snapping a funk riff degree-wise ruins it.
- `role` — `hook | call | response | fill | turnaround | comp | bassline`; `pairsWith` — id link so call/response ship as a couple.
- `scaleHint` — `pentMinor | pentMajor | blues | dorian | mixolydian | natural` (constrains snap targets).
- `lengthBars`, `anchor` — which bar of a 4-bar cycle it belongs at (fills → bar 4; hooks → bars 1–2).
- `register` — `{preferredOctave, lowMidi, highMidi}`.
- `gm` — optional GM program override + articulation defaults (e.g. reggae comping = staccato + GM 27 clean guitar).

**Chord/voicing vocabulary (comping lane)**
- Voicing spec per hit: `inversion (0–3) | drop2 | rootlessA | rootlessB | shell37 | shell17`, `addTensions [9, 6, 13]`, `topNoteTarget` (degree) — plus a pack-level `voiceLeading: nearest` directive so the engine picks the inversion minimizing top-voice motion. Rootless voicings require the bass lane active (flag `requiresBass`).

**Motif development operators (engine-side, phrases declare which are legal)**
- `transposeToChord`, `invert`, `retrograde`, `augment(×2)`, `diminish(×0.5)`, `fragmentHead(n)`, `fragmentTail(n)`, `sequence(degreeOffset)`, `endingSwap(altEnding[])`, `octaveUp/Down`. Phrase field `devOps: [...]` whitelists safe transforms (a blues bend survives transposition but not inversion). The AI DJ composes by picking a hook + applying `AAAB` with one whitelisted op — this alone kills C2.

---

## 4. Quality rubric — 15 mechanical checks on rendered note data

Score each 0/1 (or scaled), weight, sum to 0–100. Genre bands live in the material pack (`rubric` block), not in the binary. All checks computable from event lists + chord timeline.

| # | Check | Pass criterion (default band; pack-overridable) |
|---|---|---|
| Q1 | **Repeated rhythm cell** | Some 1-bar (or 2-beat) melody onset pattern occurs ≥ 2× with onset-set IoU ≥ 0.8 |
| Q2 | **But not a photocopy** | Melody bars are NOT all identical: ≥ 1 bar-pair with similarity 0.5–0.95 (varied repeat exists) |
| Q3 | **Rest ratio** | Melody silence = 15–40% of loop beats; ≥ 1 contiguous rest ≥ 1.0 beat per 4 bars |
| Q4 | **Density band + variance** | Melody notes/bar within pack band (e.g. pop 3–7, funk 4–10, trap 2–6); across-bar max−min ≥ 2 |
| Q5 | **Velocity life** | Per-lane velocity σ ≥ 8; ≥ 3 distinct values; ≥ 1 ghost (< 60) and ≥ 1 accent (> 100) per 2 bars in drums/bass |
| Q6 | **Unique peak** | Highest melody pitch occurs ≤ 2× per 4 bars; peak onset in 40–85% of phrase span; not in final half-bar |
| Q7 | **Post-leap reversal** | ≥ 70% of melody leaps ≥ 5 semitones followed by direction change, next interval ≤ 4 semitones |
| Q8 | **Stepwise diet** | 45–80% of melodic intervals ≤ 2 semitones (band per genre; funk/hip-hop lower via repeated notes — count repeats as steps) |
| Q9 | **Cadential landing** | Final melody note is a chord tone with dur ≥ 1 beat; final bass note is root or 5th of final chord |
| Q10 | **Syncopation band** | Per-bar syncopation index (Longuet-Higgins–Lee or simple offbeat-weighted count) within pack band; ≥ 1 anticipation (onset x.5 before chord change, tied) per 4 bars where pack flags `anticipations: true` |
| Q11 | **Groove lock** | ≥ 50% of melody onsets fall on onset positions used by the drum pattern; melody uses ≤ 5 distinct within-bar onset positions and ≤ 3 distinct duration values per phrase |
| Q12 | **Register separation** | Melody notes ≥ 3 semitones above simultaneous comping top voice for ≥ 90% of overlap time; bass ≤ G3; no melody/comp unison > 10% of sounding time |
| Q13 | **Voice-leading** | Across chord changes, comping top-voice motion ≤ 2 semitones for ≥ 75% of changes; ≥ 1 non-root-position or tension voicing per 4 bars (where pack allows) |
| Q14 | **Pitch economy** | Melody ≤ 7 distinct pitch classes and range ≤ 14 semitones per 4 bars |
| Q15 | **Call/response shape** | Bars 1–2 vs 3–4: rhythm similarity ≥ 0.6 AND endings differ (final pitch or final onset beat), bar-4 ending more stable (chord tone, longer, or lower) than bar-2 ending |

Suggested weights: Q1/Q2/Q3/Q6/Q9 = 10 each; rest = 5 each ⇒ 100. Ship threshold ≈ 70; "hook-quality" ≈ 85. Run the rubric (a) as a generator accept/retry gate and (b) as a badge in the phrase-library browser (score canon-derived phrases too — they should score 85+; if not, the rubric bands are wrong for that genre, tune the pack).

**Implementation notes**
- All checks are pure functions over `[{bar, beat, durationBeats, midiNotes, velocity}]` per lane + chord timeline — no audio analysis, no LLM. Belongs in content-driven config (bands in `material.json`/pack `rubric` block per RULE #1) with `_fallback_only` defaults in the binary.
- Similarity metric for Q1/Q2/Q15: onset sets quantized to 16ths; IoU on onsets, optionally + pitch-contour Levenshtein for the melodic variant.
- The rubric doubles as the AI DJ's objective: recombine phrases → score → keep best-of-N. Cheap, deterministic, explains its rejections ("failed Q3: rest ratio 6%").

---

## Sources

- Jakubowski, Finkel, Stewart & Müllensiefen (2017), *Dissecting an Earworm* — Psych. of Aesthetics, Creativity & the Arts: common contours, faster tempi, unusual interval content predict INMI.
- Margulis (2013), *On Repeat: How Music Plays the Mind* — repetition, mere exposure, attentional shift to gestalt.
- Nunes, Ordanini & Valsesia (2015), *The Power of Repetition* — J. Consumer Psychology: repetition → processing fluency → chart success (Billboard 1958–2012).
- Witek, Clarke, Wallentin, Kringelbach & Vuust (2014), PLOS ONE — inverted-U between syncopation and groove/pleasure in funk drum-breaks.
- Huron (2006), *Sweet Anticipation*; Huron (2001) *Why Do Skips Precede Reversals?* — post-skip reversal / regression-to-mean contour statistics.
- Burgoyne et al. (2015+), *Hooked on Music* citizen-science experiment (Univ. of Amsterdam / MOSI) — hook recognition ~2.3 s; melodic hooks most memorable.