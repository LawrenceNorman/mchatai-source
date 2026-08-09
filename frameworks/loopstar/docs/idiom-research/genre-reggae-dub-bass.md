# Idiom Source-Book — Jamaican Lineage + UK Bass (Roots Reggae / Dub / Dubstep / DnB-Jungle)

**Conventions used throughout:** Beat grid = one 4/4 bar, positions 0..4 float, 16th resolution (0.25 steps). `(beat, dur)` in beats. Velocity 0..127. Swing % = position of the offbeat 16th/8th (50 = straight, 58 = light shuffle, 66 = full triplet). GM program numbers are **0-based** (16 = Drawbar Organ), matching the engine's existing "GM16 organ" convention. Drum notes are GM ch10 (36 kick, 37 side-stick, 38 snare, 39 clap, 42 closed hat, 46 open hat). Scale degrees: `1 b3 5 b7`, `^` = octave up, `v` = octave down, `x` = dead/ghost note. Lineage note for the AI DJ: these four genres are one bass-culture continuum (reggae → dub → UK soundsystem → dubstep/jungle); sub-bass discipline (mono below 100 Hz, bass = lead voice, space = a feature) transfers across all four.

---

## A. ROOTS REGGAE (72–80 BPM one-drop feel; store as 140–160 BPM double-time if engine needs, but canonical grid below assumes ~75 BPM, snare-side beats at 1.0/3.0)

### A1. Canon (study references / influences)
1. Bob Marley & The Wailers — "Natural Mystic" — the one-drop archetype; 2-chord minor seesaw; fade-in arrangement.
2. Bob Marley — "Stir It Up" — bubble organ + double-skank; I–IV–V loop; melodic bass hook.
3. Bob Marley — "No Woman No Cry" — I–V–vi–IV family exemplar; organ-led.
4. Bob Marley — "Exodus" — one-chord minor riff tune; horn riff as hook; rockers energy.
5. Bob Marley — "Get Up Stand Up" — one-chord vamp; bass IS the hook.
6. The Abyssinians — "Satta Massagana" — dread slow minor vamp; unison horn riff; devotional register.
7. Sound Dimension — "Real Rock" (riddim) — i7–IV7 dorian vamp (Fm7–Bb7); 3-note organ riff; the most versioned riddim.
8. The Heptones — "Fattie Fattie" (Full Up riddim) — Studio One bass-driven riddim culture.
9. Burning Spear — "Marcus Garvey" — horn-section hook over near-static harmony; chant vocal.
10. Culture — "Two Sevens Clash" — roots harmony w/ bVII motion; call-response vocals.
11. Junior Murvin — "Police and Thieves" — Lee Perry production; falsetto long-note hook.
12. The Congos — "Fisherman" — Perry rockers; layered percussion.
13. Toots & The Maytals — "Pressure Drop" — early-reggae bounce; gospel chord family.
14. Horace Andy — "Skylarking" — Studio One; pentatonic falsetto hook shapes.
15. Jacob Miller / Inner Circle — "Tenement Yard" — rockers + flying-cymbal hats.
16. Black Uhuru (Sly & Robbie) — "Guess Who's Coming to Dinner" — rockers/steppers drum lab.
17. Dennis Brown — "Money in My Pocket" — lovers-adjacent major-key roots.
18. Gregory Isaacs — "Night Nurse" — rub-a-dub minimalism; 2-chord minor.
19. The Melodians — "Rivers of Babylon" — hymn-derived melody over I–IV; (PD-text trap, see A9).
20. Augustus Pablo — "King Tubbys Meets Rockers Uptown" — melodica hook grammar; bridge to dub.

### A2. Harmony
- **Riff-over-static dominant.** Whole songs = one 2- or 4-bar riddim loop; no bridges. Harmonic rhythm: 1 chord/bar or 2-bar loop; changes on beat 0 only (occasionally at 2.0 in seesaws).
- Families (weights for a generator): (1) **1-chord vamp** i7 or I — 25% ("Exodus", "Get Up Stand Up"). (2) **Minor seesaw** i–bVII, i–iv, i–v — 25% ("Natural Mystic" type). (3) **Dorian vamp** i7–IV7 (1 bar each) — 15% (Real Rock; the IV7 gives raised-6 dorian color). (4) **Major loop** I–IV, I–IV–V (2+1+1 beats or 1 bar each), I–V–vi–IV — 20% ("Stir It Up", "No Woman No Cry"). (5) **Dread descent** i–bVII–bVI(–bVII) — 15% (Satta-lineage minor roots).
- Qualities: minor chords as m7; major chords plain triads or add6/add9 (organ); **V7 rare** — cadence is modal bVII→i or plagal iv→i, not V7→i. Mixolydian bVII in major tunes. No maj7 chords, no ii–V jazz cadences, no diminished passing chords.

### A3. Comping / chord groove (all patterns repeat identically every bar — zero variation is idiomatic)
1. **Skank (drop-chop)** — guitar/piano: hits [1.0, 3.0], dur 0.2–0.3, vel 102/106 (beat 3 slightly harder), staccato, no sustain pedal. Swing n/a. Exemplar: "Natural Mystic", virtually all roots. Timing: 10–20 ms late of grid.
2. **Double-skank** — guitar: [1.0, 1.5, 3.0, 3.5], dur 0.15–0.2, vel 104/86/104/86 (echo-pair shape), swing 56%. Exemplar: "Stir It Up", rockers-era Marley.
3. **Bubble organ** — 8ths skipping beats 0 and 2.0: [0.5, 1.0, 1.5, 2.5, 3.0, 3.5], dur 0.2–0.3, vel 72/95/72/72/95/72 (accent 1.0/3.0), swing 55–62%. Low register (root C3), felt-not-heard mix. GM 16/17. Exemplar: any Wailers, "No Woman No Cry".
4. **Piano seesaw (root-chop)** — LH single root [0.0, 2.0] dur 0.5 vel 85 + RH chord [1.0, 3.0] dur 0.25 vel 100. Rocksteady inheritance. Exemplar: Toots, Studio One cuts.
5. **Rockers militant chop** — skank + anticipation: [1.0, 3.0, 3.75], dur 0.2, vel 104/104/70. Exemplar: late-70s Channel One (Sly & Robbie).
- **Voicing:** close triads, **1st inversion preferred** (3rd on top ~E4–A4); m7 = triad + b7 kept inside; never rootless jazz voicings; skank guitar = top-3-string triads C4–A4; bubble one octave lower.

### A4. Bass (bass = co-lead; fingered, palm-muted, dur 60–80% of gap, vel 100–112 nearly flat; register E1–G2; repeats its 2-bar phrase EXACTLY)
1. **Melodic riddim bass** (Family Man) — 2-bar hook. Bar1: (0, 1.0) 1, (1.5, 0.5) b3, (2.0, 0.5) 5, (2.5, 0.5) 1^, (3.5, 0.5) b7. Bar2: **rest 0–1.0** (the breath), (1.0, 0.5) 5, (2.0, 1.0) b3, (3.0, 1.0) 1. Intervals: R, b3, 5, b7, oct + 6 as passing. Exemplar: "Exodus", "Natural Mystic".
2. **Root-drop (one-drop sparse)** — (0, 1.5) 1, (2.0, 1.0) 5, (3.0, 1.0) 1; on seesaw chords use (3.5, 0.5) chromatic approach to next root. Exemplar: slow Marley ballad-roots. Maps to engine `rootDriven`.
3. **Rockers driving 8ths** (Robbie Shakespeare) — [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5] degrees 1 1 5 5 b7 b7 1^ x, dur 0.4, vel 108 w/ dead-note x vel 55. Exemplar: Black Uhuru era.
4. **Studio One 2-feel** — (0, 1.5) 1, (2.0, 1.0) 5, (3.5, 0.5) approach (semitone below next root). Exemplar: Heptones/Full Up.
5. **Skank-locked bass** (engine `skank` refinement) — hits ONLY off the skank: (0.5, 0.5) 1, (1.5, 0.5) 1, (2.5, 0.5) 5, (3.5, 0.5) b7 — use sparingly (10%), early-reggae flavor.

### A5. Melodic hook grammar
- **Scales:** minor pent + occasional 4 (dread tunes); major pent (lovers/major tunes); vocal-derived = stepwise hymn motion, range ≤ octave. Blue b3 bends approximated by grace note (b3 dur 0.1 → 3) in major tunes.
- **Rhythm cells** (1 bar): C1 anticipation `[(3.5, 1.0-tied)]` (hook starts before the bar); C2 `[(0,0.5),(1.5,0.5),(2.0,1.5)]`; C3 offbeat chain `[(0.5,0.5),(1.5,0.5),(2.5,0.5),(3.5,0.5)]`; C4 `[(0,1.5),(2.0,0.5),(2.5,0.5),(3.0,1.0)]`; C5 long-note `[(0,3.0),(3.0,1.0)]`; C6 skank-answer `[(1.25,0.25),(1.5,0.5),(3.25,0.25),(3.5,0.5)]`; C7 horn-riff `[(0,0.75),(0.75,0.75),(1.5,1.0)]` then rest; C8 pickup-pair `[(2.5,0.5),(3.0,1.0)]`.
- **Repetition:** 2-bar riff ×4 with bar-8 turnaround (last 2 beats varied); OR call(2)+response(2) between vocal-lane and horn-lane. Hooks sit C4–C5, above bubble, below nothing. Max 6 attacks/bar. Horn riffs are UNISON or parallel 3rds/6ths — never 4-part.
- **ORIGINAL example cells** (scale-degree, minor): H1 = (0,1.0)5, (1.5,0.5)b7, (2.0,1.0)1^, (3.5,0.5)b7 → next bar (0,2.0)5 [rest 2 beats] — long-note answer. H2 (horn riff) = (3.5,0.5)1, |(0,0.75)b3, (0.75,0.75)4, (1.5,1.5)5, rest — ×3, 4th time end (1.5,1.5)b7 instead. H3 (major, lovers) = (0,0.5)3, (0.5,0.5)5, (1.5,0.5)6, (2.0,2.0)5.

### A6. Instrumentation (GM 0-based)
- Bass: **33** (Fingered) — tone rolled off, dur clipped. Skank: **27** (Clean Electric) dur ≤0.25. Bubble: **16/17** (Drawbar/Percussive Organ) low register. Piano chop: **0**. Horns: **61** (Brass Section) unison, or 56+57 layered. Melodica hook: **22** (Harmonica; alt 21 Accordion). Clav accents (funky roots): **7**.
- Drums: one-drop = NO kick at 0; **36+37 together at 2.0** (kick + side-stick — side-stick, not full snare); hat 42 on 8ths vel 60–75 w/ accent on offbeats; open hat 46 at 3.5 occasionally. Rockers: add kick 0 and syncopated 2.75; flying cymbal = 46 on [0.5,1.5,2.5,3.5] closing 42 on beats. Steppers: kick [0,1,2,3] (four-on-floor) — reserve for anthemic tunes. Fills: 1-beat tom pickup into bar 1 of 8-bar phrase.

### A7. Arrangement
- 4-bar riddim loop, verse/chorus differentiated by **added layers not new chords**: verse = drums+bass+skank+bubble; chorus adds horns + backing vox; instrumental = melodica/horn takes melody over same loop. Intro: 1-bar drum fill OR first hook a-cappella-ish w/ skank. 8-bar sections. Energy ceiling is flat by EDM standards — dynamics live in density (3→6 lanes), not volume.

### A8. Corny traps
1. **Kick on beat 0** → kills the one-drop. Fix: kick ONLY at 2.0 (with side-stick 37, not snare 38).
2. **Straight machine timing** → drum-machine reggae. Fix: swing 55–62% on 8ths, skank/bubble 10–20 ms late, hat vel jitter ±8.
3. **Busy bass** → session-muso walking. Fix: ≥1 full beat of rest per 2-bar bass phrase; phrase repeats verbatim ≥4×.
4. **Jazz voicings (maj7, #11, rootless)** → hotel lounge. Fix: triads/m7, 1st inversion, add6 max.
5. **V7→i cadences** → pop-ified. Fix: bVII→i or iv→i.
6. **Full snare backbeat 38 at 1.0 & 3.0** → rock feel. Fix: side-stick 37 at 2.0 only; snare 38 reserved for fills.

### A9. Public-domain lifts
- **Jamaican mento/trad (melodies shippable):** "Linstead Market", "Sly Mongoose", "Hill and Gully Rider", "Chi Chi Bud", "Rukumbine" — trad; transcribe from trad sources, NOT from specific recordings (Harry Belafonte 1950s arrangements are copyrighted — the "Day-O" trap).
- **Hymns/Sankeys (roots singers grew up on these; melodies PD):** "What a Friend We Have in Jesus" (1868), "Shall We Gather at the River" (1864), "Nearer, My God, to Thee" (Bethany tune 1856), "Amazing Grace" (New Britain tune, 1835 shape-note), "Swing Low, Sweet Chariot" (19th-c. spiritual), "By and By", "This Train" (trad spiritual). TRAP: "How Great Thou Art" English text/arr = 1949, NOT PD. TRAP: "Rivers of Babylon" — Psalm 137/19 TEXT is PD but the Melodians' 1970 melody is copyrighted; do not lift it.
- Nyabinghi chants ("Rastaman Chant"/"Fly Away Home" lineage): trad roots, but specific Count Ossie / Wailers arrangements carry rights — re-derive from hymn sources.

---

## B. DUB (same tempo/grid as roots; dub is a MIX GRAMMAR over a riddim, so the pack = reggae content + a mute/FX automation layer)

### B1. Canon
1. Augustus Pablo / King Tubby — "King Tubbys Meets Rockers Uptown" (1976) — the genre's peak: melodica fragments, drum+bass core, snare into reverb.
2. The Upsetters — "Blackboard Jungle Dub" (1973) — earliest full dub LP era; percussion-forward.
3. Keith Hudson — "Pick a Dub" (1974) — stripped bass-led minimalism.
4. Lee "Scratch" Perry — "Super Ape" (1976) — dense texture, tape saturation, vocal ghosts.
5. King Tubby — "Dub from the Roots" (1974) — filter + spring reverb vocabulary.
6. Yabby You / King Tubby — "King Tubby's Prophesy of Dub" — dread minor dubs.
7. Scientist — "…Rids the World of the Evil Curse of the Vampires" (1981) — surgical mute choreography (Roots Radics riddims).
8. Joe Gibbs & The Professionals — "African Dub All-Mighty Ch. 3" (1978) — sound-FX (sirens, phones) as hooks.
9. Burning Spear — "Garvey's Ghost" (1976) — dub of a horn-led roots LP; horn fragments.
10. Niney the Observer — "Sledgehammer Dub" — heavyweight drum sound.
11. Prince Jammy — "Kamikazi Dub" (1979) — late-70s clean style.
12. Mikey Dread — "African Anthem" (1979) — radio-collage dub.
13. Linton Kwesi Johnson / Dennis Bovell — "LKJ in Dub" (1980) — UK dub, musical basslines.
14. Mad Professor — "Dub Me Crazy" series — UK digital-era dub.
15. Sly & Robbie — "Raiders of the Lost Dub" — 80s riddim-section dub.

### B2. Harmony
- Inherits A2 verbatim but skews darker: 60% minor 1-chord or i–bVII; harmonic info carried by **bass alone** for 4–16 bars at a stretch — the chord lane must be OPTIONAL in the generator. When chords appear they are fragments (1 stab per 2–4 bars). Never progression-driven.

### B3. Comping = the reggae patterns, gated
1. **Ghost skank** — base pattern A3.1 but only 25–40% of hits audible; each audible hit gets a delay throw: echoes at +0.75 beat intervals (dotted-8th at this grid), 3–5 repeats, vel ×0.62 per repeat. Exemplar: Tubby/Scientist mixes.
2. **Bubble drop** — bubble (A3.3) plays bars 1–2, muted bars 3–4 (delay tail fills the hole).
3. **Stab-and-throw** — ONE chord stab (0, 0.3) vel 110 at a 4-bar boundary, then silence + echo tail. Organ or piano, minor triad.
4. **Filter skank** — skank continuous but "HPF sweep" = approximate in MIDI by dropping the lower chord tones and vel −25 for 2 bars, then restoring.
- Voicing as A3; spring-reverb character noted for synthesis.

### B4. Bass (the lead voice; NEVER muted more than 2 beats; dry — no delay/reverb on bass)
1. **Rockers Uptown walk** — 2-bar: (0,1.0)1, (1.5,0.5)1, (2.0,1.0)b7v, (3.0,1.0)5v | (0,1.5)1, (2.0,0.5)b3, (2.5,0.5)4, (3.0,1.0)5. Register E1–E2.
2. **Drop-1 heavy** — (0, 2.0)1 [low], (2.5,0.5)b7v, (3.0,1.0)1 — massive dur, engine `rootDriven` at half density.
3. **Half-time slide** — (0, 3.5)1 with pitch-slide approach from b7 below (approximate: grace (0,0.12)b7v→1); one note/bar. Peak-weight dubs.
4. **Melodic fragment bass** — take A4.1 and delete bar-2 answers → question ×4.
- Vel flat 105–112. Dead notes x at 1.75/3.75 (vel 50) in 30% of bars.

### B5. Melody grammar
- Melodica/horn **fragments**: play 1 bar of a 2-bar hook, mute, let delay finish it. Scales: natural minor; Pablo's "Far East" flavor = emphasize b2 and 5 (phrygian tinge) — cells: F1 `[(0,1.5)]4, [(1.5,2.5)]b3`; F2 `[(0,0.5)1^,(0.5,0.5)b7,(1.0,2.0)5`; F3 long-tone `[(0,4.0)]1^` with delay. 2–5 notes per appearance, then ≥2 bars silence. ORIGINAL example: (0,1.0)5, (1.0,0.5)b6, (1.5,1.5)5, (3.0,1.0)b3 — once every 4 bars, delay throw on final note.
- Vocal ghosts: single word/phrase every 8 bars (sampler lane, not melody lane).

### B6. Instrumentation
- As A6, plus: melodica **22** is the signature lead; sound-FX lane (sirens/thunder — engine SFX, not GM); percussion adds (75 clave, 76 wood block, 56 cowbell one-hit throws). Snare 38 SINGLE HITS ("snare bomb") at phrase boundaries with huge reverb: (3.5, 0.25) vel 120 every 8 bars. Kit character: deep, wet, roomy.

### B7. Arrangement (this IS the genre)
- Mute-automation over 8-bar cycles: bars 1–8 full riddim → 9–16 drums+bass only → 17–24 + skank fragments → 25–28 bass alone → 29–32 rebuild all. Rule set for generator: change the mute-mask every 2–4 bars; never >3 pitched lanes simultaneously; drums+bass = the floor; one "event" per 8 bars (snare bomb, SFX, stab-and-throw).

### B8. Corny traps
1. **Un-synced delay** → mush. Fix: echo period 0.75 beat (dotted-8th) or 0.5; feedback 3–5 repeats, decay ×0.6.
2. **Everything playing at once** → it's just reggae. Fix: subtraction schedule (B7); dub = what you remove.
3. **Static mix for 16+ bars** → dead. Fix: mute-mask delta every ≤4 bars.
4. **Reverb/delay on bass** → wash. Fix: bass bone-dry; FX on snare, skank, melodica only.
5. **Wobble LFO bass** → that's dubstep. Fix: fingered/sine bass, no filter motion.
6. **New chords in the dub** → wrong. Fix: the dub never adds harmony the riddim didn't have.

### B9. Public-domain lifts — same pool as A9 (mento + hymns/spirituals); hymn long-note melodies suit melodica fragments especially ("Amazing Grace" phrase 1 over a i–bVII vamp works verbatim). Same Belafonte/Melodians arrangement traps apply.

---

## C. DUBSTEP (138–142 BPM, half-time feel: snare at 2.0 ONLY; perceived pulse ≈ 70)

### C1. Canon
1. Skream — "Midnight Request Line" (2005) — the crossover blueprint; melodic dark synth hook, sparse half-step drums.
2. Digital Mystikz (Mala) — "Anti-War Dub" (2006) — meditative sub-led DMZ sound.
3. Mala — "Changes" (2007) — melodic minimalism, vocal-pad harmony.
4. Loefah — "Mud"/"Horror Show" — halfstep: sub bass only, maximal space.
5. Coki — "Spongebob" (2006) — proto-wobble aggression from the DMZ camp.
6. Benga & Coki — "Night" (2007) — bouncing mid-range bassline hook; genre's biggest instrumental.
7. Benga — "26 Basslines" — bassline-as-melody study.
8. Horsepower Productions — "Fist of Fury" (2002) — garage-to-dubstep hinge, swung percussion.
9. Kode9 & The Spaceape — "9 Samurai" (2006) — dread atmosphere, minimal melodic cells.
10. Burial — "Archangel" (2007) — 2-step swing offshoot; pitched vocal chops as hooks.
11. Pinch — "Qawwali" (2006) — deep melodic sub line.
12. Distance — "My Demons" era — metal-tinged mid bass.
13. Rusko — "Cockney Thug" (2008) — comedic aggressive wobble era.
14. Caspa — "Where's My Money (Caspa rmx)" — wobble-hook formula.
15. Skrillex — "Scary Monsters and Nice Sprites" (2010) — US brostep pivot: mid-range "talking" bass, drop-as-chorus.
16. Excision & Datsik — "Swagga" — US heavy style reference point.
17. James Blake — "Limit to Your Love" (2010) — post-dubstep: silence + sub drop as hook.

### C2. Harmony
- **Riff-over-static, minor, slow.** 1–2 chords per 8-bar phrase. Families: (1) **i drone** — 40%. (2) **i–bVI** (4+4 bars) — 25%. (3) **i–bVI–bVII–i** (2 bars each) — 15%. (4) **Phrygian i–bII** (darkness signature; 4+4 or 3.5+0.5 bars) — 15%. (5) **i–v (minor v)** — 5%. Qualities: bare minor triads, open 5ths (no 3rd) for pads, m9 for melodic/deep style (Mala). NO major-key sections, no V7, no maj7. Tritone (b5) as melodic color, not chord. Bass riffs move by half-step neighbors (1–b2–1, 1–b7–1).

### C3. Comping / chord groove (sparse — chords are texture, not groove)
1. **Dark pad** — (0, 8.0 [2 bars]) open-5th or m9 voicing, vel 70, enters at phrase starts only. GM 89/50.
2. **Reggae-ghost stab** — single stab (2.5, 0.3) or (3.5, 0.3) vel 95, minor triad, per bar or per 2 bars — the skank DNA at 140. Exemplar: DMZ tracks, Horsepower.
3. **Snare-doubling stab** — organ/string hit (2.0, 0.5) vel 100 with the snare — dread emphasis. Exemplar: Loefah remixes.
4. **2-step shuffle chords** (garage inheritance) — (0.75, 0.25), (2.5, 0.25), (3.25, 0.25) vel 85/95/80, swing 56% — Burial/Horsepower flavor only.
- Voicing: low-mid register (A2–A3 roots), ≤3 notes, dark. Swing: 50–58% on 16ths (early swung style) or dead straight (halfstep).

### C4. Bass (two layers ALWAYS: sine sub octave 0–1 + character layer octave 1–2; sub follows character rhythm simplified)
1. **Wobble** — pitch stays on 1; render LFO as retriggered notes w/ velocity ramp: e.g. [0,0.5,1.0,1.5,2.0,2.5,3.0,3.5] dur 0.45 vel [115,90,115,90,…] = 1/8 wobble; **change the rate pattern every 1–2 bars**: bar2 = [0,0.5,0.75,1.0,1.5,2.0,3.0,3.25,3.5,3.75] (mixed 1/8+1/16). Occasional pitch dips to b7 or b2 (≤2 per 4 bars). GM 38 + synthesis hint: saw + resonant LP, LFO→cutoff. Exemplars: Coki, Rusko, Caspa.
2. **Halfstep sub** — (0, 1.5)1, (2.5, 1.0)1, (3.5, 0.5)b7 — sine, huge dur, nothing else. Exemplar: Loefah "Mud". Maps near engine `glide808` w/ slides between repeats.
3. **Reese drone** — (0, 16.0 [4 bars])1 detuned-saw sustain, moving 1→b7→b6→b7 per 4-bar cycle. Exemplar: Distance, darker DMZ.
4. **Bounce bassline** — (0,0.5)1, (0.5,0.5)1, (1.0,0.5)1^, (2.0,0.5)1, (2.5,0.5)b7, (3.0,1.0)1 vel 110 flat — mid-square tone. Exemplar: "Night".
5. **Talking mid bass (brostep)** — (0,0.5)1, (0.75,0.5)b3, (1.5,0.75)1, (2.25,0.5)b2, (3.0,1.0)1 — formant/vowel change per note (synthesis hint: FM + notch sweeps); drum-locked. Exemplar: Skrillex era.
- Articulation: slides between repeated 1s (pitch-bend ±2 st over 0.1 beat); NO walking, NO chord-tone arpeggios.

### C5. Melodic hook grammar
- Scales: natural minor 70%, phrygian 20% (b2 = dread), minor pent 10%. Hooks are SPARSE: 3–6 attacks/bar max, more often 3–5 notes per 2 bars, then space. Register: 2–3 octaves above sub (C4–C5). Long release/decay does the sustain.
- Cells: D1 `[(0,0.75),(0.75,0.75),(1.5,2.5)]`; D2 `[(0,0.5),(2.0,0.5),(2.5,1.5)]` (snare-answer); D3 `[(3.5,0.5),(0,1.0)]` cross-bar pickup; D4 `[(0,1.5),(1.5,0.5),(2.0,2.0)]`; D5 minimal `[(0,4.0)]` drone-note w/ detune; D6 `[(0,0.25),(0.5,0.25),(1.0,0.25),(1.5,2.5)]` 16th-run-into-long; D7 2-step `[(0.75,0.5),(2.5,0.5),(3.25,0.75)]`.
- Contour: narrow (≤5th), descending or oscillating around 1; end phrases on 1, b7, or 5. Repetition: 2-bar cell ×4 per 8-bar section; drop section may strip melody entirely (bass = hook). Hook length: 2 or 4 bars.
- **ORIGINAL examples** (minor): M1 = (0,0.75)1^, (0.75,0.75)b2^, (1.5,2.5)1^ | (0,0.75)1^, (0.75,0.75)b7, (1.5,2.5)5 — phrygian sigh, ×4. M2 = (0,1.0)5, (2.0,0.5)b6, (2.5,1.5)5 | rest bar — call + silence. M3 = (0,0.25)1,(0.5,0.25)b3,(1.0,0.25)4,(1.5,2.5)b5 — tritone landing, resolve to 5 in bar 2.

### C6. Instrumentation
- Sub: GM **38/39** (sine-ish). Wobble/mid: **38** + hint (LFO cutoff, resonance high). Reese: **81** layered −1 oct, detune ±15 cents. Lead: **80** (square, "Midnight Request Line" flavor) or **98** (Crystal pluck). Pads: **89**, **50**, **91** (choir = Mala flavor). Strings hit: **48**. Vocal chop: **54**.
- Drums: kick 36 tight+subby at 0 (+optional 1.75 or 2.75), snare 38+39 layered (big, ringy) at 2.0 ONLY, hats 42 sparse [1.0, 3.0] or swung 16th pairs, open 46 at 3.5, percussion one-shots (woodblock, rim) at 0.75/3.25. No busy hat rolls.

### C7. Arrangement
- 8-bar units. Intro 16 bars (pad+perc, no sub) → 8-bar build (riser, drum thinning) → **DROP bar 33**: bass+full drums (the hook = bass pattern) 16 bars → 16-bar mid-section (strip to sub or melody) → 2nd drop w/ bass-pattern variation → 8-bar outro. Energy = bass presence + drum weight, never element count. First drop bar: often silence beat 0 then bass slam at 0.5.

### C8. Corny traps
1. **Same wobble rhythm 32 bars** → ringtone dubstep. Fix: LFO rhythm pattern changes every 1–2 bars (C4.1 pattern-of-patterns).
2. **Snare at 1.0 AND 3.0** → it's 140 house/garage. Fix: snare 2.0 only, always.
3. **Busy heroic melody** → EDM-ified. Fix: ≤6 attacks/bar, minor/phrygian, end on 1/b7/5.
4. **Major supersaw chords at the drop** → festival electro, not dubstep. Fix: minor/open-5th pads, dark timbres.
5. **Mid bass without sine sub layer** → thin. Fix: always pair layers (C4 header).
6. **Swing on halfstep style** → drunk. Fix: halfstep = dead straight; swing only in 2-step/garage-flavored percussion.

### C9. Public-domain lifts (dark-minor PD melodies suit the idiom)
- "Dies Irae" plainchant (PD; the 4-note death motif is a ready-made dark hook). Grieg — "In the Hall of the Mountain King" (1875, PD; low-register riff = natural talking-bass material). Bach — Toccata & Fugue in D minor BWV 565 opening (PD). "Greensleeves" (trad). "God Rest Ye Merry, Gentlemen" (trad, minor). "Scarborough Fair" (trad melody — TRAP: Simon & Garfunkel arrangement copyrighted). "House of the Rising Sun" (trad melody — TRAP: The Animals' 1964 arrangement, incl. that arpeggio pattern's association, is copyrighted; lift the trad tune only). "Coventry Carol" (16th-c., minor w/ picardy). TRAP (general): use urtext/IMSLP sources; modern editions and any recordings carry separate rights.

---

## D. DRUM & BASS / JUNGLE (jungle 155–168, modern DnB 170–174; grid below at 172: snare backbeats at 1.0 and 3.0, full-time feel; melodic lanes often move at HALF that rate)

### D1. Canon
1. The Winstons — "Amen, Brother" (1969) — source of the Amen break (4-bar drum solo); the genre's DNA.
2. Lyn Collins — "Think (About It)" (1972) — the Think break; tighter, funkier chop source.
3. 4hero — "Mr Kirk's Nightmare" (1990) — breakbeat-hardcore-to-jungle hinge.
4. Origin Unknown — "Valley of the Shadows" (1993) — dark jungle minimalism: sine sub riff + pads.
5. Omni Trio — "Renegade Snares" (1993) — snare-rush hook; rave-piano lineage.
6. Shy FX & UK Apache — "Original Nuttah" (1994) — ragga jungle: dancehall vocal over chopped Amen, diving sub.
7. Renegade (Ray Keith) — "Terrorist" (1994) — the canonical Amen workout.
8. M-Beat ft. General Levy — "Incredible" (1994) — ragga jungle crossover.
9. Goldie — "Inner City Life" (1994) — orchestral/soul drum&bass; long-form arrangement.
10. LTJ Bukem — "Horizons"/"Music" (1993–95) — atmospheric: maj7/m9 pads, liquid ancestor.
11. Alex Reece — "Pulp Fiction" (1995) — minimal 2-step drum blueprint (no Amen), jazz bass.
12. Dillinja — "The Angels Fell" (1995) — reese bass pressure engineering.
13. DJ Zinc — "Super Sharp Shooter" (1996) — jump-up call-response bass riff.
14. Ed Rush & Optical — "Wormhole" (1998) — techstep/neurofunk: sound-design bass, minor2 menace.
15. Roni Size / Reprazent — "Brown Paper Bag" (1997) — live-bass rollers; jazz-step.
16. Adam F — "Circles" (1995) — jazzy chord-driven DnB.
17. High Contrast — "If We Ever" (2002) — liquid: sampled-soul chords, vocal hooks.
18. Calibre — "Even If" (2001) — liquid restraint; sub groove under m9 chords.
19. Pendulum — "Hold Your Colour" (2005) — modern melodic jump-up; rock-scale hooks.
20. Chase & Status — "Pieces" / Sub Focus — "X-Ray" — 2000s mainstream formulas.

### D2. Harmony
- **Split by substyle.** Jump-up/techstep/jungle: riff-over-static minor (i drone, i–bII neighbor, tritone color) — harmony ≈ dubstep C2 at higher tempo. **Liquid = genuinely progression-driven** (the only one in this cluster): families: (1) **i7–IV7 dorian 2-chord** (2 bars each); (2) **bVImaj7–bVIImaj7–i7** aeolian cadence (2+2+4); (3) **Imaj7–vi9** soul seesaw; (4) **ii7–iii7–IVmaj7(–iii7)** ascent (1 bar each); (5) **i9 static w/ bass movement**. Qualities: m9, maj7, add9 — extensions WELCOME here (jazz/soul source material), rootless voicings fine. Harmonic rhythm: 1–2 bars/chord, 4- or 8-bar loop. Jungle: often NO chords — sub riff + pad drone + vocal chops.

### D3. Comping / chord groove
1. **Liquid pad wash** — (0, 8.0)m9 voicing vel 75, chord per 2 bars; GM 89/50/48. Exemplar: Bukem, Calibre.
2. **Soul-chop stabs** — (0,0.5), (1.5,0.5), (2.0,1.0) vel 100/85/95, m9/maj7 rootless 4-note voicings C4 register, swing 54% — emulates sampled Rhodes chops. Exemplar: High Contrast, Roni Size. GM 4.
3. **Rave stab / hoover hit** — single chord hit (0,0.5) or answering (2.5,0.5) vel 115, minor triad + octave, GM 62 — jungle-era. Exemplar: Omni Trio, 4hero.
4. **Skank-at-174** (ragga jungle) — organ/guitar chop at [1.0, 3.0] dur 0.2 vel 95 — reggae DNA on the backbeats. Exemplar: "Incredible", Congo Natty output.
5. **Half-time pad pulse** — chords at (0,2.0),(2.0,2.0) vel 70/78 — neuro/techstep bed.
- Voicing: liquid = rootless m9 (b3-5-b7-9) around C4; jungle = fists (root+5+oct).

### D4. Bass
1. **Rolling reese** — 2-bar: (0, 3.5)1 | (0,1.0)b7v, (1.0,1.0)5v, (2.0,2.0)1 — detuned saw, filter opens per phrase; vel 110. Exemplar: Dillinja, Ed Rush & Optical, modern rollers.
2. **Jungle sine dive** — (0,1.0)1, (2.5,0.5)1, (3.0,1.0)5v with pitch-glide fall −12 st over first 0.5 beat at 8-bar boundaries ("Original Nuttah" dive). Engine `glide808` fits. Exemplar: Shy FX, Valley of the Shadows.
3. **Jump-up talking riff** — 1-bar call-response: (0,0.5)1, (0.75,0.25)1, (1.5,0.5)b3, (2.0,0.5)1 | answer bar swaps (1.5,0.5)b5 — square/FM mid + sub double; the riff IS the hook. Exemplar: "Super Sharp Shooter", Pendulum-era.
4. **Liquid sub groove** — follows chords: (0,1.5)R, (2.0,0.5)5, (2.5,0.5)6, (3.5,0.5)R-of-next (chromatic approach ok); sine, legato. Exemplar: Calibre.
5. **Live jazz-step** — walking-ish but syncopated: (0,0.75)R, (0.75,0.25)x, (1.5,0.5)5, (2.0,0.75)b7, (3.0,0.5)R^, (3.5,0.5)x — upright/fingered tone. Exemplar: "Brown Paper Bag".
- Register E0–E2; bass changes per 8-bar section (A-riff/B-riff), not per bar.

### D5. Melodic hook grammar (+ break-chop grammar for the drum lane)
- Scales: liquid = minor pent + 9, dorian; jungle/jump-up = minor pent, phrygian b2 accents; melodic hooks move at HALF the drum rate (feel = 86 BPM).
- Cells: J1 `[(0,0.5),(0.5,0.5),(1.0,1.0),(2.5,1.5)]`; J2 arpeggio-16ths `[(0,0.25),(0.25,0.25),(0.5,0.25),(0.75,0.25),(1.0,3.0)]` (rise-and-hold); J3 vocal-chop `[(0.5,0.5),(1.5,0.5),(2.5,0.5),(3.0,1.0)]`; J4 long-pad-hook `[(0,3.0),(3.0,1.0)]`; J5 pickup `[(3.0,0.5),(3.5,0.5)]`→`[(0,2.0)]`; J6 stab-answer `[(2.5,0.5),(3.25,0.75)]`; J7 liquid-run `[(0,0.5),(1.0,0.5),(1.5,0.5),(2.0,2.0)]`.
- Repetition: 4-bar hook ×2 per 8-bar section; call(2)+response(2) between lead and vocal-chop lanes; register C4–C6 well above reese.
- **ORIGINAL examples**: L1 (liquid, dorian) = (0,0.5)5, (0.5,0.5)6, (1.0,1.0)1^, (2.5,0.5)b7, (3.0,1.0)5 | (0,2.0)6, rest — over i7–IV7. L2 (jungle stab hook) = (0,0.5)1^, (2.5,0.5)b7, (3.25,0.75)1^ — ×4, 4th bar add (1.5,0.5)b5. L3 (jump-up bass-as-melody) = see D4.3 — write variations by swapping the answer-note among b5, b6, 4.
- **Break-chop grammar** (drums lane): label Amen 16ths 1–16; canonical re-orders per bar: full loop / [1–8, 11,12, 15,16, 13,14] (swap-tail) / [1,2, snare-roll 4×16th, 9–16] (rush) / half-time drop-out (kick+snare only). Ghost snares vel 45–65 between backbeats; main snare vel 110–120 pitched +2–4 st; swing 20–35% on 16ths (the Amen's own drag) — never 100% quantize.

### D6. Instrumentation
- Sub: GM **39**; reese: **81** two layers detuned ±20 cents, −1 oct; jump-up mid: **87** (bass+lead) or **62**; liquid keys: **4** (EP) / **0**; pads: **89/50/48**; vocal chops: **54/53**; rave stab: **62**; atmospheric bells: **98**; strings (Goldie-style): **48–49**.
- Drums: breakbeat kit — snappy pitched-up snare (38), crunchy kick (36) tight/short, hats 42 at 16ths vel 50–70, ride 51 in liquid, crash 49 at drops. 2-step skeleton when not chopping: K(0), S(1.0), K(2.5), S(3.0), ghost-S(3.75 vel 55).

### D7. Arrangement
- 8-bar phrase law: something changes every 8 bars; fill/snare-rush in bar 8 beat 3–4. Macro: 16-bar intro (pads/vocal/perc, no sub) → 8-bar build (riser + drum roll) → **DROP** 32 bars (full break + bass; A-riff 16, B-riff 16) → 16-bar breakdown (chords/vocal, drums thin) → 2nd drop (variation/double-drop) → 8-bar outro. Jungle-era alternative: near-constant drums, arrangement via bass/sample mutes (dub logic at 160).

### D8. Corny traps
1. **Four-on-floor kick** → becomes techno. Fix: kick never at 1.0/3.0 (snare beats); base = 2-step skeleton.
2. **One break looped 64× unchopped** → amateur jungle. Fix: chop-order or ghost-vel variation every 2–4 bars (D5 grammar).
3. **100% quantized break** → drum machine, not a break. Fix: 16th swing 20–35%, ghost notes vel 45–65, snare pitched up.
4. **Melody in 16ths at 172 throughout** → chipmunk chaos. Fix: melodic lanes at half-time feel; drums carry the speed.
5. **Static sustained reese 16 bars** → drone, not rolling. Fix: 2-bar movement cycle (D4.1) + filter/vel contour per bar.
6. **Snare-rush every bar** → exhausting. Fix: rushes only at 8-bar boundaries.
7. **Liquid with plain triads** → karaoke. Fix: m9/maj7 rootless voicings — this is the one substyle where extensions are mandatory.

### D9. Public-domain lifts (liquid's jazz/soul roots + orchestral DnB's classical roots)
- Pre-1931 jazz/blues (melodies PD in the US): W.C. Handy — "St. Louis Blues" (1914; minor strain fits liquid), "After You've Gone" (1918), "Careless Love" (trad), "St. James Infirmary" (trad roots — TRAP: 1920s copyright claims existed; treat the trad 8-bar minor melody as the liftable core). TRAP: "Summertime" (1935) is NOT PD — a classic false-positive.
- Classical for orchestral/atmospheric DnB (Goldie/Bukem register): Satie — Gymnopédie No. 1 (1888); Debussy — "Clair de Lune" (1905); Chopin — Prelude Op. 28 No. 4 in E minor (descending-chord bed = ready liquid progression); Bach — Cello Suite No. 1 Prelude; Vivaldi — "Winter" Largo. All PD compositions — TRAP: transcribe from urtext/IMSLP, never from a modern recording or edition (performance + edition rights).
- "Greensleeves"/"Coventry Carol" (trad minor) also work at 174 as pad hooks.

---

## Cross-genre generator notes
1. **Shared spine:** all four genres are bass-led; the chord lane is subordinate (reggae) to optional (dub/dubstep/jungle, except liquid). LoopStar's harmony guard should prefer root+5 / shell voicings in dub/dubstep/jungle, allow 9ths only in liquid DnB and organ add6/9 in reggae.
2. **The reggae→dubstep skank bridge:** a dubstep stab at (2.5) is the skank at half speed — packs can share phrase data across these genres with a tempo/feel transform.
3. **Repetition is the idiom, variation is the event:** reggae/dub = verbatim 2-bar loops, change via mutes; dubstep = 8-bar bass-pattern identity, LFO-rhythm micro-variation; DnB = 8-bar law. A generator that varies too often sounds fake in ALL four genres.
4. **Feel constants:** reggae/dub swing 55–62%; dubstep 50 (halfstep) or 54–58 (2-step flavor); DnB 16th swing 20–35% + ghost-vel texture. Skank/bubble land 10–20 ms late everywhere they appear.