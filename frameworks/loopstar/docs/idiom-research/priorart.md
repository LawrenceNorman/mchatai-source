# How Existing Systems Solve "Deep Per-Genre Musical Vocabulary, Recombinable at Runtime"

Research survey for the LoopStar phrase-library design. Six prior-art families, then format recommendations.

---

## 1. Arranger Keyboards — Yamaha SFF/SFF2 (closest prior art, go-deep)

**What a style IS.** A Yamaha `.sty` file is a Type-0 Standard MIDI File with extra chunks. The MIDI chunk holds all source phrases separated by section markers; the **CASM chunk** (Channel And Source parameters Management) holds per-channel retargeting rules. Sections: **Intro I–III, Main A–D, Fill In A–D (+ break fill), Ending I–III** — up to ~15 sections. Each section has up to **8 accompaniment channels**: Rhythm1, Rhythm2 (drums/perc), Bass, Chord1, Chord2 (comping, e.g. guitar + keys), Pad (sustained strings/organ), Phrase1, Phrase2 (hooks: brass stabs, arpeggios, fills of interest). Main A→D are the *same groove at escalating energy/orchestration*; fills are 1-bar transitions between them. So one "genre" = up to ~15 × 8 = **40–120 source phrases**, organized as an energy-graded family, not a flat loop pile.

**Source context declaration.** Every channel's phrase is recorded against a declared **Source Root + Source Chord type** (canonically CMaj7). At runtime the engine detects the played chord and re-targets each channel's phrase using three per-channel controls:

- **NTR (Note Transposition Rule)** — *how* to move:
  - `Root Trans`: transpose the whole phrase, preserving internal intervals (C3-E3-G3 → F3-A3-C4 on F). For melodic lines.
  - `Root Fixed`: keep notes as close as possible to the source register, re-voicing instead of shifting (C3-E3-G3 → C3-F3-A3 on F). For comping — kills the "everything jumps up a fourth" artifact.
  - `Guitar` (SFF2): maps source notes onto guitar-string/fingering positions so transposed strums stay physically-plausible voicings.
- **NTT (Note Transposition Table)** — *what happens on chord-quality change*: `Bypass`, `Melody` (re-map to nearest legal scale/chord tone), `Chord` (re-map into chord tones), `Bass` (follows slash/on-bass chords), `Melodic Minor` (maj→min: lower the 3rd a semitone; min→maj: raise it — nothing else moves), `Harmonic Minor` (lower 3rd **and** 6th); SFF2 adds 5th-variant minor tables and guitar tables `Stroke` / `Arpeggio` (4-note arpeggio voicing stays idiomatic).
- **High Key / Note Limit** — per-channel wrap point (above High Key, transpose down an octave) plus hard low/high range clamp. Keeps bass low and comping in register for any root.
- **RTR (Retrigger Rule)** — what happens to notes *held across* a chord change: `Stop`, `Pitch Shift` (bend, no new attack), `Pitch Shift to Root`, `Retrigger` (re-attack at new pitch), `Retrigger to Root`. Drums bypass all of this.

**Design lesson:** the magic triple is **(phrase, declared source-chord, per-part retarget policy)**. Bass, comp, and hook lanes need *different* retargeting policies — one global transpose rule is exactly what makes output corny. JJazzLab's open-source YamJJazz engine re-implements this for `.sty` playback and confirms the same architecture (4 complexity levels + intros/fills/endings, 8 track types).

**QC/quantity:** styles are authored by session musicians in Yamaha's Style Creator, phrase-by-phrase in the source key; keyboards ship 250–500 styles; a huge community (PSR Tutorial forums) maintains thousands more — evidence the format is human-authorable at scale.

## 2. Band-in-a-Box (.STY + RealTracks)

**MIDI styles.** All patterns for Bass/Piano/Guitar/Strings are recorded **in C over a C7 chord**. Layout per instrument: rows of **8-, 4-, 2-, 1-beat pattern slots × A/B substyle** plus endings; drums are velocity grids with fill and ending rows. BIAB is explicitly "a random pattern player, not a MIDI recorder": each bar the engine does a **weighted-random draw** (weights 1–9; 9 = always, paired with a mask) from patterns eligible for the current chord/position, then transposes the C7-relative voicing to the actual chord (C-E-G-Bb → F-A-C-Eb on F7).

Per-pattern options are the interesting part — this is their variation/authenticity machinery:
- **Chord-type masks** (pattern only fires on m7, only on maj, etc.) and bar masks (odd/even bars, bar before a part marker).
- **Voice-leading modes**: plain transpose / `smooth` (nearest-voicing) / **`riff-based`** — the phrase's internal notes are *not* retargeted, because some licks die when snapped. Critical precedent.
- **Macro notes**: reserved note numbers expand at runtime — bass macros for walking/root-5th motion, guitar macros (C6 = slow strum, D6 = fast strum, F#6 = back-strum). I.e., some vocabulary is stored as *intent*, rendered idiomatically per chord.
- Late-note volume reduction near pattern end; transpose-down limits; half-octave register masks; `embellish` flags for jazz extensions.
- **Quantity datapoint**: a shipped Light Rock style ≈ 9+8 drum patterns, 8 fills, 4 endings, similar order per pitched instrument — i.e. ~40–80 patterns/style. Add-on sets ship ~30 styles each.

**RealTracks (audio) vs MIDI:** RealTracks are multi-bar **audio phrases by 100+ named session musicians**, recorded in ~5 keys, retargeted with zplane élastique pitch/time-stretch, phrase-picked from a database to match chord context; "RealStyles" are all-audio. Trade: maximum idiomatic authenticity (the actual players), minimum editability. MIDI styles stay fully re-voicable. **Lesson: authenticity was bought by hiring players who own the idiom, then building retrieval around their phrases — not by better algorithms.** Substyles later grew to 24-part MultiStyles (verse/chorus/bridge energies).

## 3. Toontrack EZdrummer/EZkeys/EZbass + Scaler

- **EZdrummer 3**: **2,500+ *played* grooves** (real drummers; velocities + microtiming intact), organized **by song section** (intro/verse/pre-chorus/chorus/bridge/outro) with several variations *and matching fills per part*; filterable by genre, play style, drummer, tempo, feel (incl. half-time); **Tap2Find** rhythm-similarity search and drop-a-MIDI-clip matching; runtime knobs: complexity "Amount", add/remove ghost notes + intensity.
- **EZkeys 2 / EZbass**: 1,300+ keys patterns / large bass library, tagged genre + play-style + character. Core abstraction: the **Song Track holds chord blocks (WHAT); grooves are performances applied to those chords (HOW)** — "keep the chords, replace the MIDI." Phrases re-pitch/re-voice to the chord track automatically; octave, velocity, note-length, complexity are knobs. Bass grooves add idiomatic passing notes toward the *next* chord — retargeting is chord-*sequence*-aware, not just current-chord.
- **Scaler 2/3**: 200+ genre/artist chord sets + 200+ **performances/phrases** (melody, bass, arp, strum styles per genre) that are scale-degree-bound sequences, so **any phrase plays over any progression in any key**; humanization applied at render.

**Lesson:** (a) separate chord track from performance phrase; (b) tag by song-section role and energy so an arranger (or AI DJ) can assemble a song; (c) similarity search ("find me a groove like this") is a browsing killer-feature; (d) "several variations per section + matching fill" is the packaging unit users understand.

## 4. Hooktheory / TheoryTab — the relative-notation corpus

TheoryTab is tens of thousands of crowd-transcribed song sections stored **entirely in relative notation**: melody as **scale degrees (1–7 + chromatic alteration + octave) against the key**, chords as **Roman numerals with inversion figures, sevenths, applied dominants (V/V) and borrowed-mode ("b") markers**. Display in any key is a projection; the storage never changes. This purity is what enables their killer artifacts:
- **Trends tool/API**: chord n-gram probabilities from the corpus — give a progression prefix (encoded as a path of numeral tokens, e.g. `4,1`), get next-chord probabilities. "Songs with the same chords" search falls out for free.
- **Melody-note-over-chord distributions** (their books' heatmaps: P(scale degree | chord)) — quantified genre/pop melodic tendency.
- Cross-key aggregation: statistics only work *because* notation is relative.

QC is crowdsourcing + moderation. **Lesson for LoopStar:** a key-relative phrase corpus isn't just transposition-friendly — it makes the library *computable*: the AI DJ can weight choices by corpus statistics (which hooks fit a [1,6,2,5] context; which degrees are stable over a IV chord), and dedupe/similarity falls out of the representation.

## 5. Generative systems — what they got right/wrong for genre authenticity

- **Magenta MusicVAE**: 2–16-bar latent-space sampling/interpolation. Right: smooth morphing between phrases. Wrong: genre-agnostic latent blur, no idiomatic vocabulary, motif coherence collapses over longer spans — the academic version of "same-y."
- **Magenta GrooVAE** + Groove MIDI Dataset (hours of pro drummers on e-kits): the gem. It models **groove — per-note microtiming offsets + velocities — as a separable layer from the quantized score**, enabling "humanize" and *groove transfer* (apply drummer X's feel to any pattern). **Lesson: store feel as data, separable from notes.**
- **Magenta RealTime (2025)**: live prompt-mixed *audio* — impressive, but produces no browsable, recombinable phrase objects; wrong shape for a library.
- **Commercial AI MIDI (Lemonaide, Orb Producer Suite, etc.)**: genre-tuned models, 4/8-bar single-key output; consistent criticism is exactly LoopStar's disease — "leans generic, preset-ish." Orb's one good idea: chords/melody/bass/arp generators that stay mutually in-harmony project-wide.
- **Ableton Live 12 generators** (Rhythm/Seed/Shape/Stacks/Euclidean): openly pseudo-random constraint tools, genre-blind; reviewer consensus "fun, rarely usable out of the box." Third-party fixes (e.g. Drum Trigger) bolt on **weighted probability + genre rule-sets + Markov chains** to *feel* authentic — i.e., they re-import curated genre knowledge.

**Net:** every system that *sounds* like the genre embeds a curated human corpus (Yamaha's session musicians, BIAB's players, Toontrack's drummers, Hooktheory's transcriptions). Procedural/latent generation without one produces exactly the corny output LoopStar has now. Generation earns its keep as **recombination, variation, and groove-transfer over real vocabulary** — not as the vocabulary source.

## 6. Commercial MIDI pack ecosystem (Splice / Cymatics / Unison)

- **Organization**: role-first split — **chord-progression packs vs melody packs vs bassline packs vs drum MIDI** — under genre-first branding (trap, drill, melodic techno, R&B, boom bap). Splice's MIDI catalog is literally categorized this way.
- **Size norms**: a themed single-role pack is credible at **~24–50 files** (e.g. Cymatics Cobra: 24 melodies); flagship bundles 100–500 files; Unison sells 120+ packs à la carte.
- **What buyers say makes a pack good**: key + BPM in filenames, clean folder taxonomy (key/mood/energy), **varied bar lengths**, human feel (not grid-perfect; ghost notes, negative space), *current* genre phrasing ("shorter bass phrases, tighter syncopation, stronger tension notes"), and headroom to edit. Over-quantized, interchangeable files are the #1 complaint.
- **Weakness LoopStar can beat**: packs are absolute-pitch MIDI in one key — the user does the transposing and chord-fitting. A key-relative library with a harmony guard removes the whole friction category. QC in this market is reputation/demo-audio, no formal process.

---

## Cross-system summary

| System | Storage | Pitch handling | Chord retargeting | Variation mechanics | Content per style | QC |
|---|---|---|---|---|---|---|
| Yamaha SFF2 | SMF + CASM chunk | Absolute MIDI + declared source root/chord | Per-channel NTR/NTT tables, range clamps, RTR | Main A–D energy tiers, fills, intros/endings | 40–120 phrases | Session musicians, in-house |
| Band-in-a-Box | .STY pattern slots | Recorded in C over C7 | Transpose + smooth voice-leading + riff-based opt-out; macro notes | Weighted-random pools, chord/bar masks, A/B→24 substyles | ~40–80 patterns | Pro authors; named players (RealTracks) |
| Toontrack EZ | Tagged MIDI performances | Absolute, re-pitched to chord track | Chord-track-aware (incl. passing notes to next chord) | Section variations + fills, Amount knob, ghost notes | 1,300–2,500+/product | Real recorded performances |
| Hooktheory | Relative JSON corpus | **Scale degrees + Roman numerals** | N/A (projection to key) | Corpus statistics | 10⁴+ song sections | Crowdsourced + moderation |
| Magenta | Model weights (+ Groove dataset) | Learned | None explicit | Latent interpolation; groove transfer | n/a | Dataset curation |
| MIDI packs | Loose .mid files | Absolute, one key | None (user) | None (buy more packs) | 24–50/pack | Market reputation |

---

## RECOMMENDATIONS — LoopStar phrase-library format, 5 biggest lessons

**1. Adopt the Yamaha triple: phrase + declared harmonic context + per-lane retarget policy.** Every phrase JSON declares what it was written against (`"context": {"degree": 1, "quality": "min7"}`) and *how* to retarget (`"ntt": "melodic" | "chordal" | "bass" | "bypass"`, `"ntr": "shift" | "voiceNearest"`), plus `"range": {"low": 36, "high": 60}` clamps and a `"onChordChange": "hold" | "retrigger" | "snapToNearest"` rule for notes sustained across changes. Chords lanes default voiceNearest (root-fixed) so comping stops jumping registers; melody lanes shift; bass follows root. This maps cleanly onto the existing harmony guard — the guard becomes the NTT executor.

**2. Three pitch reference frames, chosen per note — degrees, chord-tones, and locked chromatics.** Encode melody/hook notes as **scale degrees** (`sd: "b3"`, octave, alteration) so contour survives any key/mode; encode comp/bass notes as **chord-relative tones** (`ct: 1|3|5|b7|9`, voicing hint) so the guard voices them correctly per chord quality; and allow per-phrase (or per-note) `"lock": true` — BIAB's riff-based mode — for signature chromatic licks that must NOT be snapped (blues rubs, 808 slides, bebop passing tones). Force-snapping everything is a second source of corniness. Handle maj↔min explicitly (Yamaha's minor tables: move only 3rds/6ths/7ths).

**3. Package phrases as energy-graded, role-tagged families, not flat loops.** Required tags: `genre`, `lane` (drums/chords/bass/melody), `role` (hook | riff | comp | fill | intro | turnaround | ending), `energy` (A–D like Yamaha Mains), `feel` (straight/swing %, halftime), `bars`, `density`, `chordMask` (qualities it works over), and GM `program` + register per role (instrumentation IS genre vocabulary — skank organ vs trap bells). The AI DJ then arranges like an arranger keyboard: pick a family, walk A→D, insert fills at section boundaries. Give each hook 2–4 intensity/ornament variants recorded together (Toontrack's "variations per song part"), and store **velocity + microtiming offsets as a separable groove layer** (GrooVAE) so one genre "feel" block humanizes all lanes.

**4. Curate from the canon by hand; use statistics only to steer recombination.** Every successful system paid humans who own the idiom; every purely generative system got called generic. Author phrases as transcribed/paraphrased canon studies (key-relative), then compute Hooktheory-style corpus stats over your own library (progression n-grams per genre, note-over-chord distributions) and feed them to the AI DJ as *selection weights* (BIAB's 1–9 weights + chord masks is the proven runtime: weighted-random among eligible phrases). Never ship an unweighted uniform pick — weighting is where taste lives.

**5. Quantity bar and QC gate.** Depth threshold per genre, from the prior art: ~4 energy levels × 4 lanes + fills/intro/ending ≈ **40–120 phrases minimum** (a Yamaha style), with **≥24 per browsable role** (commercial pack credibility floor) for hooks/melodies. QC is a *render-in-context* lint, automatable in the existing engine: every phrase must audition cleanly over **all of the genre's progressions × major and minor keys × 2–3 tempi**, with checks for range-clamp violations, unresolved locked chromatics, held-note behavior at every chord boundary, and non-grid feel (reject 100%-quantized velocity-flat files — the ecosystem's top complaint). Failures block the pack PR, same as the existing wisdom-parity tunnel pattern.

*Sketch (one phrase):*
```json
{"id":"soul.hook.risingSixth.a", "lane":"melody", "role":"hook", "energy":"B",
 "bars":2, "feel":{"swing":0.54}, "chordMask":["maj7","min7"],
 "context":{"degree":1,"quality":"maj7"}, "ntt":"melodic", "lock":false,
 "range":{"low":60,"high":84}, "program":11, "onChordChange":"snapToNearest",
 "notes":[{"beat":0.5,"dur":0.5,"sd":"5","oct":0,"vel":96,"tOff":-0.02}, {"beat":1.0,"dur":1.5,"sd":"6","oct":0,"vel":104}]}
```
This is renderable to the engine's `{bar, beat, durationBeats, midiNotes[], velocity}` events by: resolve sd/ct against session key + current chord via the harmony guard (as NTT executor), apply range clamp, apply groove layer, emit.