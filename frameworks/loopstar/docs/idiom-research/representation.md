# LoopStar Phrase Library — Notation + Recombination Grammar (Design Research)

## 1. Encoding recommendation

**Use JSON event lists, but in a different pitch SPACE per lane** — this mirrors 30 years of arranger-keyboard practice (Yamaha/Korg NTR/NTT: melodic parts transpose by *root/scale*, chordal+bass parts re-voice by *chord table*):

| Lane | Space | Event pitch field |
|---|---|---|
| Melody / hooks / fills | **scale-degree** (mode-relative) | `deg` 1–7 + `acc` ±1 + `oct` |
| Bass | **chord-role** | `role`: R, 3, 5, b7, oct, app, ghost… |
| Comping | **chord-role voicings** | `voice`: shell/rootless/drop2 + `inv` |
| Drums | slot-grid (existing material packs) | unchanged — out of scope |

### Why this beats the alternatives

| Criterion | (a) degree JSON | (b) role JSON | (c) abc | (d) .mid | (e) Hooktheory-style |
|---|---|---|---|---|---|
| PR human review | ✅ one note/line | ✅ | ◐ terse, learnable | ❌ binary | ◐ (their XML) |
| git diff granularity | ✅ per-note | ✅ | ◐ per-line-of-music | ❌ | ◐ |
| LLM author-ability | ✅ schema-checkable, few-shot friendly | ✅ | ◐ syntax slips, beta spec corners | ❌ | ✅ concept, ❌ format |
| Deterministic key+chord transposition | ✅ native | ✅ native (chord-snapping is free — roles ARE chord tones) | ❌ absolute pitch, needs re-analysis | ❌ absolute pitch | ✅ |
| Expressiveness (ghosts, stac, slides, vel) | ✅ explicit fields | ✅ | ◐ weak dynamics/artic per note | ✅ but opaque | ❌ none |
| Compactness | ◐ | ✅ | ✅ | ✅ | ◐ |

- **abc**: great for folk tunes in version control, but it is absolute-pitch (key-relative only via header, never chord-relative), monophonic-biased, weak on per-note velocity/articulation, and LLMs produce "moderate" quality with syntax fragility (HNote paper). Rejected as source format; fine as a *rendered preview* the validator can emit for PR reviewers.
- **.mid**: rejected as source (undiffable, unreviewable, absolute pitch). Acceptable as a *build artifact* for audition.
- **Hooktheory relative notation** validates the *concept* (16K-song corpus proves scale-degree melody + Roman-numeral harmony is expressive enough for real pop hooks) — we adopt the idea, not their XML.
- **Impro-Visor precedent**: its "abstract melody" grammar (notes classified chord-tone/color-tone/approach) is exactly the bass/comp `role` space; it proved chord-relative atoms re-instantiate musically over new changes.

Named short keys (`b`,`d`,`deg`,`vel`,`art`), **one event per object, one object per line** → a changed ghost note is a 1-line diff; an LLM can never mix up positional tuple order.

## 2. Schema spec (v1)

File envelope (per lane, per genre):
```json
{ "schemaVersion": 1, "genre": "funk", "lane": "bass", "space": "chordRole", "phrases": [ ... ] }
```

Phrase envelope (all lanes):
```json
{
  "id": "funk.bass.pocket-pop-01",          // immutable slug; revisions get NEW id + "supersedes"
  "name": "Pocket octave-pop riff",
  "kind": "cell",                            // cell (1-2 bars) | phrase (2-4) | fill (≤1)
  "lengthBars": 1,
  "authoredOver": { "mode": "mixolydian", "progression": [1], "harmonicRhythm": 4 },
  "worksOver": ["static", "progression"],    // static-riff vamp vs moving changes
  "tags": { "energy": 0.7, "density": 6.0, "register": "low", "syncopation": 0.8,
            "mood": ["greasy"], "role": "riff", "singable": false, "swingSensitive": true },
  "gm": [33],                                // suggested GM programs (hint, not binding)
  "links": { "responseOf": null, "pairsWith": ["funk.comp.stab-01"], "fillInto": null },
  "provenance": { "inspiration": "style of late-60s syncopated funk bass (original)", "checked": "ear+validator" },
  "events": [ ... ]
}
```
Rules: `b` = beat offset from phrase start, float `0 ≤ b < lengthBars*4` (bar-crossing sustains just use `d` past the barline; the compiler emits engine `{bar, beat}`); `vel` 0–127 (engine-native); swing is NOT encoded — the engine's pack-level swing applies downstream; `art` ∈ `stac | legato | accent | ghost | slide | dead | grace`.

**Melody event** (space `degree`, mode-relative — in minor, `deg:3` *is* b3; `acc` only for outside-mode chromatics like blue #4):
```json
{ "b": 1.25, "d": 0.75, "deg": 5, "oct": 0, "acc": 0, "vel": 100, "art": "legato" }
```
**Bass event** (space `chordRole`): `role` ∈ `R | 2 | b3 | 3 | 4 | 5 | 6 | b7 | 7 | 9 | oct` (+`octOff` ±1), plus `app` (chromatic approach; `dir` ±1 resolves into the NEXT event's realized pitch) and `ghost`/`dead` (pitch = previous pitch, muted):
```json
{ "b": 3.5, "d": 0.5, "role": "app", "dir": 1, "vel": 92 }
```
**Comp event** (space `chordRole`, whole-voicing): `voice` ∈ `triad | shell | drop2 | rootless | rootless9 | power | sus | full` (maps 1:1 onto LoopStar's harmony-guard voicers), `inv` 0–3, optional `top` (pin top note to a role for voice-leading):
```json
{ "b": 0.5, "d": 0.25, "voice": "rootless9", "inv": 1, "vel": 92, "art": "stac" }
```

## 3. Example phrases

### 3a. Funk bass riff (chord-role, static dom7 vamp)
```json
{ "id": "funk.bass.pocket-pop-01", "kind": "cell", "lengthBars": 1,
  "authoredOver": { "mode": "mixolydian", "progression": [1], "harmonicRhythm": 4 },
  "worksOver": ["static"], "gm": [33],
  "tags": { "energy": 0.7, "density": 9, "register": "low", "syncopation": 0.8, "role": "riff", "swingSensitive": true },
  "events": [
    { "b": 0.0,  "d": 0.5,  "role": "R",   "vel": 115, "art": "accent" },
    { "b": 0.75, "d": 0.25, "role": "ghost", "vel": 38 },
    { "b": 1.0,  "d": 0.25, "role": "R",   "vel": 88 },
    { "b": 1.5,  "d": 0.25, "role": "oct", "vel": 108, "art": "stac" },
    { "b": 1.75, "d": 0.25, "role": "ghost", "vel": 42 },
    { "b": 2.0,  "d": 0.5,  "role": "b7",  "vel": 96 },
    { "b": 2.75, "d": 0.25, "role": "5",   "vel": 84, "art": "stac" },
    { "b": 3.25, "d": 0.25, "role": "6",   "vel": 88 },
    { "b": 3.5,  "d": 0.5,  "role": "app", "dir": 1, "vel": 94 }  // chromatic walk-up into next bar's root
  ] }
```

### 3b. Soul melody hook — call + response (scale-degree, minor)
```json
{ "id": "soul.hook.memphis-cry-01", "kind": "phrase", "lengthBars": 2,
  "authoredOver": { "mode": "minor", "progression": [1, 6, 3, 7], "harmonicRhythm": 2 },
  "worksOver": ["static", "progression"], "gm": [4, 80],
  "tags": { "energy": 0.55, "density": 3.5, "register": "mid", "syncopation": 0.45,
            "mood": ["warm", "yearning"], "role": "hook", "singable": true },
  "callResponse": { "callBars": [0], "responseBars": [1] },
  "events": [
    { "b": 0.0,  "d": 0.25, "deg": 1, "oct": 0, "vel": 88 },            // CALL: rises, ends on 4 = question
    { "b": 0.25, "d": 0.25, "deg": 3, "oct": 0, "vel": 90 },
    { "b": 0.5,  "d": 0.5,  "deg": 4, "oct": 0, "vel": 94 },
    { "b": 1.25, "d": 0.75, "deg": 5, "oct": 0, "vel": 102, "art": "accent" },  // pushed
    { "b": 2.5,  "d": 1.25, "deg": 4, "oct": 0, "vel": 92, "art": "legato" },
    { "b": 4.0,  "d": 0.25, "deg": 1, "oct": 0, "vel": 86 },            // RESPONSE: same rhythm, falls home
    { "b": 4.25, "d": 0.25, "deg": 3, "oct": 0, "vel": 88 },
    { "b": 4.5,  "d": 0.5,  "deg": 4, "oct": 0, "vel": 90 },
    { "b": 5.25, "d": 0.75, "deg": 3, "oct": 0, "vel": 96, "art": "grace" },   // b3→ blue slur
    { "b": 6.5,  "d": 1.5,  "deg": 1, "oct": 0, "vel": 90, "art": "legato" }   // answer resolves to tonic
  ] }
```

### 3c. House piano stab pattern (comping, offbeat rootless voicings)
```json
{ "id": "house.comp.offbeat-stab-01", "kind": "cell", "lengthBars": 1,
  "authoredOver": { "mode": "minor", "progression": [1], "harmonicRhythm": 4 },
  "worksOver": ["static", "progression"], "gm": [1, 17],
  "tags": { "energy": 0.8, "density": 5, "register": "mid", "syncopation": 0.9, "role": "riff", "swingSensitive": false },
  "events": [
    { "b": 0.5,  "d": 0.2, "voice": "rootless9", "inv": 1, "vel": 98,  "art": "stac" },
    { "b": 1.5,  "d": 0.2, "voice": "rootless9", "inv": 1, "vel": 92,  "art": "stac" },
    { "b": 2.5,  "d": 0.2, "voice": "rootless9", "inv": 2, "vel": 100, "art": "stac" },  // inversion lift
    { "b": 3.25, "d": 0.2, "voice": "shell",     "inv": 0, "vel": 84,  "art": "stac" },  // 16th push
    { "b": 3.5,  "d": 0.2, "voice": "rootless9", "inv": 1, "vel": 96,  "art": "stac" }
  ] }
```

### 3d. Boom-bap staccato comp (shows `top` voice-leading pin)
```json
{ "id": "boombap.comp.dusty-shell-01", "kind": "cell", "lengthBars": 2,
  "authoredOver": { "mode": "dorian", "progression": [1, 4], "harmonicRhythm": 4 },
  "worksOver": ["progression"], "gm": [2, 11],
  "tags": { "energy": 0.4, "density": 1.5, "register": "mid", "syncopation": 0.5, "mood": ["dusty"], "role": "pad" },
  "events": [
    { "b": 1.75, "d": 0.5, "voice": "shell", "inv": 0, "top": "b7", "vel": 76, "art": "stac" },
    { "b": 3.5,  "d": 1.0, "voice": "shell", "inv": 0, "top": "b7", "vel": 70 },
    { "b": 5.75, "d": 0.5, "voice": "shell", "inv": 1, "top": "9",  "vel": 78, "art": "stac" }
  ] }
```

## 4. Chord-retargeting rules (phrase authored over X, played over Y)

R1. **Role events never need retargeting** — chord-role space re-voices for free (this is the core reason bass/comp use it; = arranger NTT "chord"/"bass" tables). Only rules R7–R9 apply to them.
R2. **Melody strong-beat snap** (LoopStar already does this): any degree event on beats 1/3 OR with `d ≥ 1` snaps to the nearest chord tone of the current chord. Weak-beat short notes pass through as color/passing tones (Impro-Visor's chord-tone/color-tone split).
R3. **Direction-preserving snap**: when snapping, pick the chord tone that preserves the phrase's contour direction; tie-break to smaller interval. **Collapse guard**: if two adjacent different degrees would snap to the same pitch, push the second to the next chord tone in contour direction.
R4. **b3-vs-3 (blues rule)**: authored b3 over a major/dom chord — keep as blue note if `d < 0.5` or `art ∈ {grace, slide}` (pack flag `bluesAllowed`), else raise to 3. Never "correct" downward to 2.
R5. **Avoid-note handling**: sustained (`d ≥ 1`) natural 4 over major → resolve to 3; natural 7 over dom → b7; any sustained note one semitone above a chord tone resolves down unless marked `grace`.
R6. **Approach notes recompute, never snap**: `app` and `grace` re-derive as ±1 semitone from the NEXT event's *realized* pitch after retargeting.
R7. **Harmonic-rhythm alignment**: a progression-authored phrase carries per-beat chord context. Retarget by segment: slice events at the NEW progression's chord boundaries, re-run R2–R6 per segment. A `worksOver:["static"]` phrase over changes: treat every chord as "current" (riff-over-changes, blues style) but apply R5 per chord.
R8. **Register fold**: after key transposition, octave-fold each lane into its pack register window (bass E1–G3, comp C3–C5, melody G3–C6 by default); comp additionally re-inverts so its top note stays ≤ melody's lowest sounding note (arranger "melody clash" rule).
R9. **Voicing degrade**: if the current chord lacks a requested role (e.g., `b7` over a plain triad), the harmony guard substitutes per table: b7→6 (or omit), 9→root-double, 11→5.
R10. **Determinism**: all rules are pure functions of (phrase, key, mode, chord timeline, lane window) — same inputs, same MIDI out; no randomness in retargeting (randomness lives only in the DJ's *selection* layer, seeded).

## 5. Recombination grammar (AI DJ)

Hierarchy: **cell (1–2 bars) → phrase (call+response, 2–4 bars) → section (4/8 bars) → Song Part** (existing LoopStar arrangement layer).

```
section   := form(cells) over sectionBars
form      ∈ { AAAA(riff×4), AAAB, AABA', ABAB, AB-CR }        // CR = call/response pairing
A'        := apply(op, A)                                      // 3rd+ repeat MUST vary (variation quota)
response  := responseFrom(call) | library.links.responseOf(call)
B(AAAB)   := fill ∪ apply(fragment+octaveUp, A)
```

**Selection compatibility (tags are the type system):** match on `genre` first, then filter: |energyΔ| ≤ 0.25 across simultaneous lanes; `worksOver` must include the section's harmonic mode (static vs progression); `register` lanes must be pairwise distinct or foldable (R8); `swingSensitive` phrases only in swung packs; `links.pairsWith` is a soft prior (curated known-good combos); `mood` intersects the Part's mood.

**Operators worth implementing (all deterministic, all in degree/role space):**

| Op | Def | Use |
|---|---|---|
| `transposeToChord` | shift degrees so phrase tonic → current chord root (diatonic), then R2–R6 | riff follows changes |
| `octaveShift(±1)` | `oct` += n, then R8 | final-repeat lift |
| `finalRepeatOctaveUp` | octaveShift(+1) on last A only | classic hook payoff |
| `fragment(n)` | keep first n beats, rest-fill remainder | build tension, B-bar of AAAB |
| `augment/diminish(×2, ÷2)` | scale `b`,`d` | half-time chorus, double-time fill |
| `invert` | mirror degrees around first event's degree, then R2 | cheap A' that keeps rhythm identity |
| `responseFrom` | keep rhythm (`b`,`d`,`vel`,`art`), remap last 1–2 pitches to resolve 1/3/5; ends on tonic if call ended off-tonic | auto call/response |
| `velocityArc(shape)` | scale `vel` by ramp/swell | section dynamics without new notes |
| `restThin(p)` | drop lowest-vel non-strong-beat events | de-clutter when stacking |
| (skip `retrograde`) | rarely musical for grooves — not worth it | — |

**Anti-corny constraints (hard rules the DJ must satisfy):**
1. **Busy budget**: at most ONE lane with `density > 4 ∧ syncopation > 0.6` at a time. If melody is busy, comp must be `role:pad` or `restThin`'d.
2. **Rest inheritance / interlocking**: comp preferentially places events in melody's rests (lane-level call/response); validator computes onset-overlap ratio, DJ rejects pairings > 0.6 overlap on non-strong beats.
3. **Register separation**: ≥ 5 semitones between lane centers; comp ceiling below melody floor (R8).
4. **Variation quota**: no cell verbatim > 2×; 3rd repetition applies an operator; a section may not use > 2 distinct hooks (coherence beats variety).
5. **Question/answer cadence**: section-final melody event = chord tone 1/3/5 with `d ≥ 1`; A-cells may end open (2/4/5/b7), the closing cell must not.
6. **Don't clone the drums**: melody onset vector may not equal the drum kick/snare grid (corny "stab-along" detector).
7. **Energy arc**: Part-level target (e.g., verse 0.4 → chorus 0.8) selects tags; never jump lanes > 0.3 energy simultaneously without a fill between.

## 6. Library structure, versioning, pipeline

```
mchatai-source/loopstar/phrases/
  SPEC.md                      # schema reference, degree/role vocab, retargeting semantics (R1–R10)
  _index/phrases-index.json    # id → file, tag rollups, schemaVersion  (flat — nested breaks the Swift decoder)
  {genre}/                     # soul, trap, boombap, reggae, house, dubstep, dnb, funk…
    pack-phrases.json          # genre meta: default mode, registers, bluesAllowed, GM palette
    hooks.json                 # melody cells+phrases (degree space)
    bass.json                  # chord-role riffs
    comping.json               # voicing rhythm patterns
    progressions.json          # degree progressions + harmonic rhythm + section forms (extends today's 4)
    fills.json                 # later phase
    README.md                  # genre-specific authoring notes + calibrated tag examples
```
Per-lane files, not one blob: parallel PRs, small diffs, per-lane schema validation. ASCII-only content (Swift decoder gotcha). Existing material packs keep tempo/swing/drums; phrases are additive.

**Launch depth per genre**: 8–12 hooks, 6–8 bass, 6–8 comping, 10–15 progressions, → ~35–45 atoms. That already yields thousands of section-level combinations via the grammar; grow toward 25+ hooks/genre. Breadth of *distinct rhythmic identities* matters more than count — dedup gate: reject a candidate whose (onset-vector, interval-contour) similarity to any shipped phrase > 0.9.

**Authoring pipeline (matches Phase-plan convention):**
1. `[LLM-SOFT]` LLM proposes N=8 candidates per slot, few-shot prompted from the 3 best existing phrases of that lane+genre + SPEC.md excerpt. (JSON schema = why LLM-author-ability was a top-weighted criterion.)
2. `[DETERMINISTIC]` validator: schema, `b/d` bounds, roles/degrees in vocab, density/register/syncopation actually match declared tags (computed, not trusted), strong-beat chord-tone ratio ≥ 0.5 for hooks, dedup hash, corny lint (all-bar-ends-on-tonic, >4 stepwise quarters on beats, drum-grid clone). Emits an abc/MusicXML preview + rendered .mid for the PR.
3. `[DETERMINISTIC]` auto-render 8-bar demo in 2 keys × 2 progressions (retargeting stress test — catches phrases that only work where authored).
4. `[MULTI-SHOT]` critic scores rubric (hookiness, genre fit, singability, retarget survival) → top 2–3 survive.
5. **Human ear-check is the final gate** (LoopStar diag meters don't reflect audio — verify by ear), then PR to mchatai-source. Zero app rebuild (RULE #1: all of this is content).

**Versioning**: `schemaVersion` per file; additive schema changes only; shipped phrases are immutable — revisions get a new id + `supersedes` (AI DJ sessions store phrase ids + library commit SHA for reproducibility).

**Maintainer docs must contain**: annotated full example per lane; degree/role/voice/art vocab tables; tag rubric with calibrated audio references ("energy 0.3 sounds like X"); the R1–R10 retargeting rules with a "write defensively: chord tones on strong beats, or your phrase will be snapped" warning; validator + render commands; copyright policy (style-of only, no transcriptions of copyrighted melodies beyond short commonplace figures; provenance field required); ear-check protocol; how to add a genre (which files, index update, no Swift changes).

## Sources
- [Hooktheory TheoryTab](https://www.hooktheory.com/theorytab) and [hooktheory-data dump](https://github.com/owencm/hooktheory-data) — 16K-song corpus in scale-degree melody + Roman-numeral chord relative notation; proves the representation carries real hooks.
- [Yamaha Style CASM/NTR/NTT reference (jososoft)](http://www.jososoft.dk/yamaha/articles/style2_2.htm) and [Style Reference PDF](http://www.jososoft.dk/yamaha/articles/keyboard_and_style.pdf) — per-part transposition rules (ROOT_TRANS for melodic, ROOT_FIXED + chord/bass NTT tables, melody-clash limits): the precedent for per-lane pitch spaces and R8/R9.
- [Impro-Visor (Harvey Mudd)](https://www.cs.hmc.edu/~keller/jazz/improvisor/index.html) — probabilistic grammars over chord-relative "abstract melodies" (chord-tone/color/approach classes); precedent for R2/R6 and the cell→phrase grammar.
- [abcMIDI project](https://abcmidi.sourceforge.io/) and [HNote paper (arXiv 2509.25694)](https://arxiv.org/pdf/2509.25694) — abc's version-control friendliness vs its monophonic/expressive limits and LLM syntax fragility.
- [Deep music generation survey (arXiv 2011.06801)](https://arxiv.org/pdf/2011.06801) — representation-level comparison (event vs score vs audio) backing event-list JSON for controllable generation.