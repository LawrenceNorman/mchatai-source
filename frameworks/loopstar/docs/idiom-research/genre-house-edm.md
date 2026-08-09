# Idiom Source-Book: House / Techno / Trance / Big-Room EDM & Dance-Pop
Phrase-library authoring reference for LoopStar. All idioms, no transcriptions (PD exceptions flagged).

**Notation conventions (used throughout):**
- Rhythm grid: `(beat,dur)` pairs, beat 0..4 float at 16th resolution (0.25 steps), 4/4. Velocity 0-127 given as `@v`.
- Bass/comp degrees are CHORD-relative: `R,b3,3,4,5,b7,7,8`(=R+12),`8+5`, `~x`=chromatic approach into x. Melody degrees are KEY-scale-relative: `1..7,b3,b6,b7`; apostrophe = up one octave (`5'`); engine's harmony guard snaps to current chord.
- Swing % = position of 2nd 16th in each 8th pair (50=straight, 58=heavy). GM programs are 1-based; drums are GM percussion note numbers (36 kick, 38/40 snare, 39 clap, 42 CH, 46 OH, 49 crash, 51 ride, 54 tamb).

---

## A. CLASSIC CHICAGO / DEEP HOUSE + PIANO HOUSE — 118-126 BPM (Chicago 120-124, deep 118-122, piano/pop-house 120-126), swing 54-58% on 16ths

### A1. Canon (study references)
- Frankie Knuckles/Jamie Principle — Your Love (1986): 8th-note synth arp hook + 2-bar call-response bassline; progression-driven (rare for its era).
- Mr. Fingers — Can You Feel It (1986): deep sub bass riff under sustained m7/m9 pads; riff-over-vamp blueprint.
- Mr. Fingers — Mystery of Love (1985): melodic 8th-note synth-bass as lead voice.
- Marshall Jefferson — Move Your Body (1986): first "house anthem" piano; octave LH + triad RH gallop.
- Adonis — No Way Back (1986): relentless rolling 8th octave bass, minimal harmony.
- Phuture — Acid Tracks (1987): TB-303 16th acid line — slides/accents as melody substitute.
- Joe Smooth — Promised Land (1987): gospel progression + push anticipations; uplift template.
- Ce Ce Rogers — Someday (1987): gospel piano house, full I-IV-V vocabulary with passing chords.
- Sterling Void — It's All Right (1987): pad-chord anthem house.
- Ten City — That's the Way Love Is (1989): deep garage; jazz voicings, live bass feel.
- Inner City — Good Life / Big Fun (1988): pop-house; 4-chord loop + short vocal-cell hooks.
- Black Box — Ride On Time (1989): Korg M1 "Piano 8" continuous 8th-chord gallop + 909 — italo piano house blueprint (verified: M1 piano preset, 909 drums).
- FPI Project — Going Back to My Roots (1989): 2-bar piano riff-as-hook.
- Crystal Waters — Gypsy Woman (1991): M1 organ riff hook (the hook IS the comp instrument).
- Robin S — Show Me Love (StoneBridge mix, 1993): M1 organ BASS preset; sparse syncopated bass = whole groove.
- Nightcrawlers — Push the Feeling On (MK Dub, 1992/95): chopped-vocal-as-riff + organ bass; MK swing.
- CeCe Peniston — Finally (1991); Alison Limerick — Where Love Lives (1990): piano-house pop peaks.
- Kerri Chandler — Rain (1998): Charleston-rhythm Rhodes stabs, deep NJ garage swing.

### A2. Harmony
- Deep house is VAMP-driven: 2 chords, 2 bars each (or 1 bar each). Families: i7-iv7 (Am7-Dm7 — "two chords, infinite groove"), **dorian vamp i7-IV7** (Am7-D9 — "the Larry Heard sound", major IV7 = the warmth), i9 static 4-8 bars, i7-bVIImaj?-no; also i7-bVII9.
- Chicago anthem/piano house is PROGRESSION-driven: 4-chord 4-bar loops, 1 bar/chord. Families: i-bVI-bIII-bVII, i-bIII-v-bVII (Your Love family: Bbm-Db-Fm-Ab), i-bVII-bVI-bVII, and gospel-major: I-iii-IV-V, I-vi-ii7-V7, IV/5-I turnarounds.
- Chord quality: m7 and m9 default (5-note m9 = "the deep house chord": R-b3-5-b7-9); maj7/6/9 on bVI/bIII; dominant 9 on dorian IV; sus4→3 resolution inside one bar on stabs. Plain triads only in italo piano house.
- Cadences: bVII→i (backdoor, most common), iv7→i9 plagal; gospel: V7sus→V7→I with chromatic passing dim (I-#Io-ii7).
- Harmonic rhythm: deep = 2-8 bars/chord; piano house = 1 bar/chord, loop length 4 bars.

### A3. Comping / chord groove (all patterns 1 bar unless noted)
1. **Offbeat skank stab** — hits (0.5,.25)@96 (1.5,.25)@92 (2.5,.25)@96 (3.5,.25)@90. Staccato m7 rootless (b3-5-b7-9, around C4). Pump Up The Jam / italo lineage. Swing 56.
2. **Charleston stab** (Kerri Chandler): (0,.5)@100 (1.5,.75)@88 | bar2: (0,.5)@100 (1.5,.5)@85 (3.5,.25)@70 push. Rhodes m9 rootless, C3-C4. Swing 57.
3. **M1 piano gallop** (Ride On Time / Move Your Body): straight 8ths (0,.4)(0.5,.4)(1,.4)...(3.5,.4), vel alternating 108/88. RH triad 1st inversion above C4, LH octave root. Swing 50-52 (italo is nearly straight).
4. **Gospel push** (Promised Land): (0,.75)@100 (1,.5)@90 (2,.75)@100 (3.5,.5)@105 — the 3.5 hit is NEXT bar's chord anticipated. Full piano voicing w/ octave root.
5. **Deep pad swell** (Can You Feel It): (0,4.0)@75 whole-bar m9 pad, no retrig for 2-4 bars; slow attack ~80ms.
6. **Organ riff-comp** (Gypsy Woman): treat comp as 2-bar melodic riff of chord tones: (0,.25)R (0.75,.25)b3 (1.5,.25)R (2.5,.25)b7low (3.25,.25)5low | (0,.5)R... — organ, staccato, doubles as the hook.

### A4. Bass
1. **Rolling octaves** (Adonis/No Way Back): 8ths (0)(0.5)(1)... alternating R,8,R,8 dur .4, vel 112 on beats / 92 off. Register E1-E2. Straight-ish 52%.
2. **Call-response 2-bar** (Your Love family): bar1 (0,.5)R (1,.5)R (2,.5)R (3,.25)R (3.5,.25)R; bar2 answer (0,.5)b7 (1,.5)R (2,.5)b3 (3,.5)~R(chromatic up). Synth bass, legato-ish.
3. **M1 organ pluck** (Show Me Love): (0,.4)R@112 (0.75,.2)R@85 (1.5,.4)R@105 (2.5,.25)5@95 (3,.5)b7@100 — sparse, percussive organ-bass patch, C2. The SPACE is the hook. Swing 56.
4. **Deep sub melodic** (Mr. Fingers): (0,.75)R (0.75,.25)5 (1.5,.5)b7 (2,.75)R (3,.5)b3 (3.5,.5)~4→ next root. Sine/triangle sub E1-A1, legato, vel flat 100.
5. **Disco octave pump** (piano house): R-8 alternation but with (3.75,.25) pickup on b7 or 5 into next chord root.
6. **303 acid** (Acid Tracks): 16ths all R with accent map @[127,70,70,100]*4, slide (legato overlap .05) into accented notes, octave jump 8 on 4th 16th of beats 2,4; add b3 or b7 1x/bar max.

### A5. Melodic hook grammar
- Scales: minor pentatonic + 9 (deep); major pentatonic (gospel/piano house); blue b5 as passing 16th only. Vocal-derived: hooks imitate 1-bar sung cells, syllabic, 3-6 notes.
- Rhythm cells (one bar each, (beat,dur)): C1 (0,.5)(0.5,.5)(1,1.5)(3,.5)(3.5,.5) · C2 (0.5,.25)(1,.25)(1.5,1)(3.5,.5) push · C3 (0,.75)(0.75,.75)(1.5,1) tresillo · C4 (0,.25)(0.5,.25)(1,.5)(2,.25)(2.5,.25)(3,1) · C5 (1.5,.5)(2,.5)(2.5,1.5) late-start · C6 (0,1.5)(2,.5)(2.5,.5)(3,1) long-short-short-long · C7 rests bar (hooks breathe every 2nd/4th bar).
- Repetition: riff x3 + bar-4 variation (change last 2 notes), or 2-bar call + 2-bar response (response ends lower). Hook length 1-2 bars, loop 4.
- Contour: arch (up then settle to 5 or 1); gospel: ascending 5-6-1' pickup into downbeat. Register: 1 octave above comp top note (C5 area). Articulation: piano house = staccato; deep = legato w/ 1 slide/bar (pitch-bend 2 semi, 60ms).
- Original example cells (key-scale degrees): H1 `(0,.5)5 (0.5,.5)6 (1,1)1' (2,.5)b7 (2.5,.5)5 (3,1)4` (dorian, deep). H2 gospel: `(3,.25)5 (3.25,.25)6 (3.5,.5)1'` pickup | `(0,1.5)3' (2,.5)2' (2.5,.5)1' (3,1)5`. H3 organ-riff: `(0,.25)1 (0.75,.25)b3 (1.5,.25)1 (2.25,.25)b7, (3,.5)5,` x3 + var.

### A6. Instrumentation (GM)
- Chords: 5 (Rhodes EP1, deep), 2/3 (Bright/Electric Grand, piano house), 17/18 (Drawbar/Percussive Organ, M1-organ fake — keep dur ≤.25 for skank), 90 (Warm Pad).
- Bass: 39 (Synth Bass 1), 33 (Acoustic upright for garage), organ-bass = 18 in C2 register. Lead: 82 (saw), 54 (Voice Oohs for vocal-riff fake), 18.
- Drums: 909/707 character. Kick 36 all 4 beats @112; clap 39 + snare 40 layered on 1,3 (beats 2,4); CH 42 16ths @[70,50,85,50] swung; OH 46 on every 0.5 offbeat @95 (THE house signifier); ride 51 in deep; tamb 54 8ths in gospel.

### A7. Arrangement
- 8/16-bar blocks, DJ intro/outro (drums-only 16). Order in: kick+hats → bass (bar 17) → chords (33) → hook/vocal (49). Breakdown at ~2/3: drop kick+bass, keep pads/piano 8-16 bars, filter rebuild 8, all-in. Energy = layer count (3→6 voices), not new material. Piano house: verse/chorus pop form over constant 4-chord loop.

### A8. Corny traps
1. 4 root-position triads on pad, 1/bar = "supermarket house." Fix: rootless m9 voicings, or 2-chord vamp 2 bars each.
2. Bass plays root 8ths through chord changes with no approach notes. Fix: 3.75 pickup (~R or b7→R) every bar.
3. Straight 16th hats (50%). Fix: swing 56-58 + velocity contour [70,50,85,50].
4. OH on downbeats. Fix: OH strictly on the 0.5 offbeats.
5. Melody = 8 bars of stepwise noodling. Fix: 1-bar cell x3 + variation; rest bar 4 or 8.
6. Comp sustains full bar under a stab genre. Fix: dur ≤.25 staccato for skank/stab patterns.

### A9. Public-domain lifts (gospel/trad roots)
Verbatim-shippable melodies: **Amazing Grace** (1779/1835 tune "New Britain"), **Wade in the Water**, **Swing Low Sweet Chariot**, **This Little Light of Mine** (trad status; Harry Dixon Loes attribution unproven — melody treated trad), **When the Saints Go Marching In**, **Down by the Riverside**, **Joshua Fit the Battle of Jericho**, **Pachelbel Canon in D** (bass + progression = ready-made piano-house loop), **Ode to Joy** (Beethoven). TRAP: ship the underlying tune only — specific 20th-c. choir arrangements, added verses, and ALL sound recordings remain copyrighted.

---

## B. TECHNO (Detroit + modern) — Detroit 122-135, modern peak-time 128-140, hard/industrial 140-150 BPM, swing 50-54%

### B1. Canon
- Cybotron — Clear (1983): electro-funk syncopated bass DNA.
- Model 500 — No UFO's (1985): stark single-riff minor bass, machine funk.
- Rhythim Is Rhythim — Strings of Life (1987): syncopated piano/string stabs (opens on B-minor chord), 3-3-2 rhythm, harmony-rich outlier.
- Rhythim Is Rhythim — Nude Photo (1987): bass-arp-driven.
- Underground Resistance — Jupiter Jazz (1992): minor-9 string pads over rolling bass.
- Joey Beltram — Energy Flash (1990): looped 16th bass riff = whole track.
- Second Phase — Mentasm (1991): hoover chord as riff.
- LFO — LFO (1990): bleep; 2-note sub-bass melody.
- Plastikman — Spastik (1993): percussion-only tension; 303 minimalism blueprint.
- Robert Hood — Minimal Nation / Minus (1994): 1-bar stab loop minimalism's founding document.
- Jeff Mills — The Bells (1996): 2-bar stab riff + ride cymbal economy.
- Basic Channel — Phylyps Trak II (1994): dub techno — one delayed m9 chord as entire harmony.
- Surgeon — Atol (1996): Birmingham loop brutality.
- Ben Klock — Subzero (2007): Berghain-era rumble-kick bass.
- Adam Beyer — Your Mind (2018): modern peak-time; vocal loop + 2-note bass.
- Charlotte de Witte — Doppler (2018): modern acid-tinged peak-time.
- Amelie Lens — Higher (2017): loop techno w/ single vocal cell.
- Anyma/Tale of Us lineage (2016-): "melodic techno" — 8-bar minor pad progressions + arps (imports trance harmony at 124 BPM).

### B2. Harmony
- THE riff-over-static genre: 1 chord (or none) for 8-64 bars; tonal center from bass riff alone. Detroit stab pairs: i7→bVII (2 chords max, alternating 1 bar each or 2-bar cycle); i-bVI also. Dub techno: single i9/i11 rootless chord, never changes.
- Melodic techno (modern): natural minor 4-chord 8-bar loops borrowed from trance: i-bVI-bIII-bVII, i-v-bVI-bVII, 2 bars/chord.
- Quality: m7/m9 stabs; hoover = saw cluster (R+b3+5 detuned). No V-i cadences; motion = filter/timbre, not harmony. Sus/maj7 essentially absent outside Detroit's Strings-of-Life gospel outlier (I-IV piano with sus4 resolutions).

### B3. Comping / chord groove
1. **Detroit 3-3-2 stab** (Strings of Life/Nude Photo lineage): (0,.25)@110 (0.75,.25)@95 (1.5,.25)@105 (2,.25)@90 (2.75,.25)@100 (3.5,.25)@95 — 16th-grid tresillo x2. String/piano m7, staccato, C4.
2. **Dub techno echo chord** (Basic Channel): one hit (1.5,.3)@85 per bar (or per 2 bars), rootless m9, EP/pad; fake the dub delay: ghost repeats (2.25,.2)@55 (3,.2)@35.
3. **Offbeat hoover** (Mentasm/rave): (0.5,.4)@115 (1.5,.4)@110 (2.5,.4)@115 (3.5,.4)@110 saw-cluster chord, register C3.
4. **Snare-position stab**: (1,.5)@105 (3,.5)@100 — chord lands with clap on beats 2/4. Robert Hood economy.
5. **16th gate pad** (melodic techno): retrig chord every .25, dur .2, vel cycle [110,65,85,65]; lowpass rises over 8 bars.

### B4. Bass
1. **Energy Flash roll**: 16ths, all R, (0)@120 (0.25)@85 (0.5)@95 (0.75)@85 repeating per beat; octave jump 8 on (0.5) of beats 2 and 4. Dur .2. Register A0-A1.
2. **Electro-funk cell** (Clear/No UFO's): (0,.25)R (0.75,.25)R (1.5,.25)b7 (2.25,.25)8 (3,.25)R (3.75,.25)~b7 pickup. Analog synth bass, staccato, swing 52.
3. **Rumble drone** (Klock/Berghain): R sustained (0,4.0)@70 sine one octave below kick + ghost 16th ticks @40; motion from sidechain (emulate: vel dip 30% at each beat).
4. **Bleep 2-note** (LFO): (0,1.5)R (2,1)b7low (3,.5)R — sub sine C1, legato; that's the whole melody.
5. **Minimal stab-bass** (Hood): (0,.25)R (1.5,.25)R (2.75,.25)5 @[115,90,100], dur .2, silence elsewhere; loop verbatim 32 bars.
6. **303 acid 16ths**: as house A4.6 but straight (50%), harder accents [127,60,60,110], more octave jumps.

### B5. Melodic hook grammar
- A techno "hook" = 1-2 bar cell of 2-4 pitches looped 16-64x; variation comes from filter (emulate: velocity ramp ±25 over 8 bars), NOT new notes. Scales: minor pent, natural minor; single-pitch rhythmic riffs are fully idiomatic.
- Rhythm cells: T1 (0,.25)(0.75,.25)(1.5,.25) tresillo-half · T2 (0,.25)(0.5,.25)(1,.25)(1.5,.25)(2,.5) 5-hit run · T3 (0.5,.25)(1.5,.25)(2.5,.25)(3.5,.25) all-offbeat · T4 (0,.75)(0.75,.75)(1.5,.75)(2.25,.75)(3,1) dotted chain · T5 2-bar: bar1 (0,.25)(1,.25)(2,.25)(3,.25); bar2 (0,.25)(1,.25)(2,.25)(3.5,.5) displaced tail · T6 (0,.125)(0.25,.125)(0.5,.25)(1.5,.25)(2,.5) stutter-open.
- Contour: flat or narrow (≤ perfect 5th span). Repetition: exact loop; 1-note change allowed every 8 bars. Register: riff sits LOW (C2-C3, often IS the bass) or as blip C5-C6. Melodic techno arps: 16ths cycling R-5-8-b7 or R-b3-5-8 patterns, 2-bar cycle, 2-octave span.
- Original cells: K1 `(0,.25)1 (0.75,.25)1 (1.5,.25)b3 (2.75,.25)1 (3.5,.25)b7,` loop x16. K2 blip: `(0.5,.125)5' (1.5,.125)5' (2.5,.125)b7' (3.5,.125)5'`. K3 melodic-techno arp (2 bars, 16ths): degrees cycle `1-5-1'-b7-5-b3-5-1` then `b6-1'-b6'-5'-b3'-1'-5-b3` legato.

### B6. Instrumentation (GM)
- Stabs: 51/52 (Synth Strings), 63 (Synth Brass), 5 (EP for dub chords). Lead/blip: 81 (square), 82 (saw), 99 (FX crystal for bleeps). Bass: 39/40 (Synth Bass), 33 sine-ish. Hoover: 63 + 82 layered, detune.
- Drums: 909 hard. Kick 36 @120 all beats (LONG decay = rumble); clap 39 beats 2,4; CH 42 16ths @[60,45,75,45]; OH 46 offbeats @85; ride 51 straight 8ths @70 (Mills signature); crash 49 at 16-bar heads; rimshot 37 sparse syncopation. Modern: kick+rumble fills 70% of spectrum — keep other voices sparse.

### B7. Arrangement
- 16/32-bar DJ blocks, strictly additive/subtractive, NO drops. Track = 6-8 elements; add 1 per 16 bars, remove 1 per 16 on the way out. One breakdown at ~65% mark: kick out 8-16 bars, stab/pad continues, kick returns unannounced (no snare roll — that's EDM). Loop hypnosis: minimum 16 bars unchanged before any change.

### B8. Corny traps
1. Chord change every bar. Fix: 1 chord per 8+ bars or none; stab PAIR max.
2. Melody with >4 distinct pitches or stepwise runs. Fix: ≤4 pitches, tresillo rhythm, loop exact.
3. Flat-127 16th hats. Fix: vel contour [60,45,75,45], accent offbeat OH.
4. EDM arrangement (build-snare-roll-drop). Fix: additive blocks + silent kick re-entry.
5. Swing 57 house shuffle. Fix: 50-53% — techno is machine-straight.
6. "Epic" supersaw pads in peak-time techno. Fix: single detuned stab, dur ≤.3, delay ghosts.

### B9. Public-domain lifts
Minor-key classical fits the aesthetic: **Grieg — In the Hall of the Mountain King** (1875; accelerating 8th riff is practically a techno loop), **Bach — Toccata & Fugue in Dm** BWV 565, **Mussorgsky — Night on Bald Mountain**, **Beethoven — Moonlight Sonata mvt 1** (arps → melodic techno), **Chopin — Prelude Op.28 No.4 in Em** (chord ladder → dub techno pads), **Satie — Gymnopédie No.1** (1888, ambient breakdowns), **Dies Irae** plainchant (4-note doom cell), **Bach — Cello Suite 1 Prelude** (arp cycle). TRAP: use urtext editions; modern orchestral editions/recordings copyrighted.

---

## C. TRANCE (uplifting/supersaw + dream/progressive) — 132-142 BPM (uplifting 136-140, progressive 128-134; Children verified 136, Age of Love 133)

### C1. Canon
- Age of Love — The Age of Love (1990, Jam & Spoon mix '92): proto-trance; arp + Fm-family chords (Db-Fm-Bbm-Eb = VI-i-iv-VII in Fm, verified).
- Jam & Spoon — Stella (1992): rolling progressive hypnosis.
- Humate — Love Stimulation (1993): early anthem pads.
- Energy 52 — Café del Mar (1993/Three'N'One '97): THE dotted-8th arp riff shape.
- Robert Miles — Children (1995): dream trance; piano lead over i-VImaj7-iv-VI (Fm-Dbmaj7-Bbm-Db, verified).
- Faithless — Insomnia (1995): monotone-then-leap square lead riff.
- BT — Flaming June (1997): epic prog-trance chord suspensions.
- Chicane — Offshore (1996): balearic pad trance.
- Paul van Dyk — For an Angel (1994/98): bounce-bass anthem.
- Binary Finary — 1998 (1998): uplifting arp canon.
- ATB — 9PM (Till I Come) (1998): pitch-bent guitar-pluck lead.
- System F — Out of the Blue (1999): supersaw era ignition.
- Gouryella — Gouryella (1999): Ferry Corsten maximal uplift.
- Rank 1 — Airwave (1999): breakdown-melody-as-track.
- Veracocha — Carte Blanche (1999): pluck-arp classic.
- Darude — Sandstorm (1999): 16th single-note stutter riff (pop-crossover pole).
- Armin van Buuren — Communication (1999): rolling uplifting standard.
- Above & Beyond — Sun & Moon (2011): modern vocal-anthem form.
- Tiësto — Adagio for Strings (2005): classical-lift template (Barber NOT PD — see C9).

### C2. Harmony
- Natural minor (aeolian) is home; no blue notes, no dominant 7ths. Families: **i-VI-III-VII** (Am-F-C-G; the uplifting staple), i-VI-VII-i, i-III-VII-VI, i-iv-VI-VII, i-VI-iv-VII, dream: i-VImaj7-iv-VI (Children, verified), i-v-VI (2+1+1). VI gets maj7/maj9; i gets add9/m9; sus2 on plucks everywhere; sus4→3 resolution at 8-bar turn.
- Harmonic rhythm: 1 bar/chord (uplifting drop), 2 bars/chord (progressive/breakdown); loop = 4 or 8 bars. Strongly progression-driven — the chord loop IS the emotion; melody rides it.
- Cadence: VII→i at loop point (backdoor lift); iv→i for melancholy breaks. Modulation: optional +1 semitone at final climax (use sparingly, see traps).

### C3. Comping / chord groove
1. **Sidechain pump pad**: per beat (0.2,.8)@[65→95 ramp across the 4 hits], sustained supersaw/string chord retriggered each beat, dip after kick. Whole-bar alt: (0,4.0)@80 w/ engine vel dip 35% at each beat if supported.
2. **Trance gate 16ths**: chord retrig (0,.2)(0.25,.2)... all 16 slots, vel cycle [115,60,90,60] per beat. Classic gated-pad drop texture.
3. **Sus2 pluck offbeats**: (0.5,.2)@100 (1.5,.2)@95 (2.5,.2)@100 (3.5,.2)@95, sus2 voicing (R-2-5), C4-C5, bright pluck.
4. **Dotted-8th chord echo**: (0,.25)@110 (0.75,.25)@85 (1.5,.25)@70 fake delay-triplet; new chord each bar.
5. **Dream piano** (Children): (0,4.0)@85 whole-note piano chords, root position + LH octave; lead doubles top notes an octave up.

### C4. Bass
1. **Rolling offbeat 16ths** (THE trance bass, verified): kick on 0,1,2,3; bass fills the 3 offbeat 16ths: (0.25,.2)@85 (0.5,.2)@80 (0.75,.2)@100, repeat per beat. All R (chord root of the bar), E1-A1, staccato saw-sine. Last 16th (3.75) may play NEXT bar's root as pickup.
2. **Offbeat 8th bounce** (progressive/PvD): (0.5,.4)@105 (1.5,.4)@100 (2.5,.4)@105 (3.5,.4)@100, R only.
3. **Octave gallop**: 16ths alternating R and 8: (0.25)R (0.5)8 (0.75)R per beat, dur .2.
4. **1-5 roller**: as pattern 1 but 3rd offbeat plays 5 below (0.75)=5, rest R — adds motion without breaking the roll.
5. **Dream half-time**: (0,1.5)R (2,1)R (3,.5)5, legato sub — under piano sections only.

### C5. Melodic hook grammar
- Scale: natural minor, strictly diatonic; emotional color from landing on 6 (against VI chord) and 2/9. Hook = 8-bar "main melody" built from 2-bar cells: A A B A' or A A' B C. Range 1.5 octaves, C5-E6 over pads.
- Rhythm cells: R1 dotted-8th gallop (0,.75)(0.75,.75)(1.5,.75)(2.25,.75)(3,1) — the Café del Mar shape · R2 (0,.5)(0.5,.25)(0.75,.25)(1,1)(2.5,.5)(3,1) · R3 long-note anthem (0,3)(3,1) — one note/bar, melody from chord changes under it · R4 16th arp cycle (all 16 slots, .25 each) degrees R-5-8-5 per chord · R5 (0,.25)(0.25,.25)(0.5,.5)(1.5,.5)(2,2) stutter-then-hold (Sandstorm pole: same pitch x3-6) · R6 (0,1)(1,.5)(1.5,.5)(2,1)(3,.5)(3.5,.5) even anthem · R7 pickup cell (3,.5)(3.5,.5) leading each 2-bar phrase.
- Contour: ascend across bars 1-6, peak bar 7 (highest note of phrase, on 5' or 6'), resolve bar 8 down to 3 or 1. Repetition: whole 8-bar melody loops 2-4x in climax; breakdown states it once quiet (piano/pluck), drop restates on supersaw +1 octave.
- Articulation: portamento 40-80ms on repeated-note pairs; every phrase-final long note gets slow vibrato (emulate: none — hold). Lead always doubled at -12 and often +12 (3 octaves supersaw stack).
- Original cells: TR1 `(0,.75)3 (0.75,.75)5 (1.5,.75)6 (2.25,.75)5 (3,1)3` | `(0,.75)2 (0.75,.75)4 (1.5,.75)5 (2.25,.75)4 (3,1)2`. TR2 anthem: bar1 `(0,3)5 (3,1)6`, bar2 `(0,4)7`, bar3 `(0,3)1' (3,1)7`, bar4 `(0,4)5`. TR3 arp: 16ths `1-5-1'-2'` over i, `6,-1-6-1'` over VI (chord-snap handles rest).

### C6. Instrumentation (GM)
- Lead: 82 (Lead 2 saw) tripled at -12/0/+12 @[85,110,95] + 51 (Synth Strings) layer = supersaw fake. Pluck: 82 dur ≤.2 or 8 (Clav) for percussive arps. Pads: 89 (New Age), 90 (Warm), 92 (Choir) for breakdowns. Piano: 1 (dream trance). Bass: 39 dur .2.
- Drums: 909. Kick 36 @118 (absent in breakdowns 16-32 bars); OH 46 offbeats @90; CH 42 16ths @[55,40,70,40]; clap 39+snare 40 on 2,4; crash 49 every 8-bar head; snare-roll build: 40 8ths x8 bars → 16ths x4 → 32nds x2 → silence 1 beat → drop. Tom fills 45/47/48 at phrase turns.

### C7. Arrangement
- 32-bar phrases. Shape: intro kick+bass 32 → add gate/pluck 16 → BREAKDOWN 32-64 (kick out, pads+full melody, emotional core) → build 16 (snare roll + riser + bass re-enter at 8) → CLIMAX/drop 32 (melody on supersaw + rolling bass + full kit) → strip 16 → second breakdown (short, 16) → final climax 32 (optional +1 semitone) → outro 32. The breakdown, not the drop, is the genre's soul — melody must stand alone there.

### C8. Corny traps
1. Hook in major key. Fix: natural minor; "uplift" comes from VI-III-VII majors inside the minor loop.
2. Rolling bass follows melody pitches. Fix: bass = chord ROOT only, changes at bar lines.
3. No pump. Fix: velocity dip 30-40% at each beat on pads/bass, recover by 0.2.
4. Square 8th gate instead of 16th gallop. Fix: gate at 16ths w/ [115,60,90,60].
5. Snare roll every 4 bars. Fix: one 8-16 bar roll per build only.
6. Children-clone piano lead (i-VI-iv-VI + whole notes). Fix: swap rhythm cell (R1/R6) or progression family.
7. Semitone key-change every climax. Fix: max once, final climax only.

### C9. Public-domain lifts
Trance's classical-lift habit is proven — but its most famous lifts are NOT PD: **Barber — Adagio for Strings (1938, TRAP)**, Orff — O Fortuna (1936, TRAP). Safe verbatim: **Pachelbel — Canon in D** (progression + violin figurations), **Bach — Air on the G String**, **Vivaldi — Winter mvt 1** (16th figuration = ready-made arp), **Beethoven — Für Elise + Moonlight mvt 3** (Em arp fury), **Chopin — Nocturne Op.9 No.2** (breakdown melody), **Debussy — Clair de Lune** (1905), **Grieg — Morning Mood**, **Holst — Jupiter hymn theme** (The Planets publ. 1921), **Satie — Gymnopédie No.1**, **Albinoni "Adagio in G minor"** = TRAP (actually composed by Giazotto, 1958, copyrighted). Recordings/editions trap applies throughout.

---

## D. BIG-ROOM EDM / DANCE-POP (Daft Punk → Avicii/Calvin Harris) — 124-130 BPM (French house 120-126, electro 126-128, big room 126-130, Avicii-pop 126)

### D1. Canon
- Daft Punk — Around the World (1997): cyclic melodic bass hook; bass IS the song.
- Daft Punk — One More Time (2000): filtered disco loop + sidechain pump vocal house.
- Stardust — Music Sounds Better with You (1998): one filtered disco loop, whole track (verified blueprint; Bangalter/Braxe/Diamond).
- Modjo — Lady (2000): disco-sample 2-bar bass+guitar loop.
- Benny Benassi — Satisfaction (2002): electro saw-bass wobble as lead.
- Eric Prydz — Call on Me (2004): filter-house pop apex; 8th stab loop.
- Deadmau5 — Strobe (2009): 10-min progressive build discipline.
- Swedish House Mafia — One (2010): big-room minimal 2-note lead + snare build codified.
- Avicii — Levels (2011): i-III-VII-VI loop (C#m-E-B-A verified) + major-pent hook; melodic big-room peak.
- David Guetta/Sia — Titanium (2011): iii-vi-IV-V (verified); pop-verse→EDM-drop form.
- Calvin Harris — Feel So Close (2011): pumped root-8th bass + pentatonic riff-hook.
- Calvin Harris/Florence — Sweet Nothing (2012): IV-I-vi-V (verified).
- Swedish House Mafia — Don't You Worry Child (2012): I-V-vi-IV (verified) piano anthem.
- Zedd — Clarity (2012): pop-EDM chord-piano + supersaw chorus-drop.
- Martin Garrix — Animals (2013): big-room drop = 2-pitch stab riff over minor vamp (verified "minimal one-two-chord").
- Hardwell — Spaceman (2012): drop-lead pitch-bend language.
- Avicii — Wake Me Up (2013): folk-EDM hybrid; acoustic strum + four-on-floor.
- Alesso — Heroes (2014): anthem-pop drop refinement.

### D2. Harmony
- Diatonic 4-chord loops, 1 chord/bar, SAME loop verse+build+drop (pop economy). Families (all verified in canon): **i-III-VII-VI** (Levels), **I-V-vi-IV** (DYWC), **IV-I-vi-V** (Sweet Nothing), **iii-vi-IV-V** (Titanium), vi-IV-I-V, i-VI-III-VII. Big-room drops: strip to i or i↔VI 2-chord vamp (Animals). French house: 1-2 chord m7/m9 disco loop, riff-over-static.
- Quality: plain triads + add9/sus2 color (add9 on IV and VI); m7 only in French house; NO maj7/dom7 in big room (too jazzy). Harmonic rhythm: 1 bar/chord, 4-bar loop; French house 2-bar sample loop.
- The "3 majors in a minor loop" trick (Levels: i-III-VII-VI reads euphoric because 3 of 4 chords are major) is the genre's core emotional device.

### D3. Comping / chord groove
1. **Festival saw 8ths**: full triad+add9 saw chords every 8th (0,.45)(0.5,.45)... vel [112 beats / 96 offs], C4 register, root doubled -12. The build/drop default.
2. **Sidechain pump pad**: (0.2,.8)@95 per beat — duck-and-swell; sustained add9 chord.
3. **Big-room drop stab** (with lead in unison): (0,.25)@120 (0.75,.25)@110 (1.5,.25)@115 (2,.25)@105 (2.75,.25)@112 (3.5,.5)@118 — 3-3-2-3-3-2 16th cell.
4. **French filtered loop**: m7 chord 16ths dur .2, vel rising 70→115 across each 4-bar cycle then reset (fakes the filter sweep); swing 54.
5. **Anthem piano** (DYWC/Clarity): (0,.5)(0.5,.5)... 8ths, RH triad w/ melody note on top, LH octave root; vel 100 flat, accent 112 on chord changes.
6. **Pryda stab**: single chord hit (0,.75)@127 w/ octave-up doubling, then silence — every 2 bars, call-response vs. drums.

### D4. Bass
1. **Pumped root 8ths** (Feel So Close/Levels): (0,.4)@70 (0.5,.4)@105 per beat (low vel ON beat = duck) — R only, follows chord/bar. E1-E2.
2. **Cyclic melodic bass** (Around the World grammar): 2-bar 8th-note loop, degrees per chord: R-R-8-b7-5-b7-R-5 | R-R-8-b7-5-4-b3-R, dur .4 legato — bass as lead hook, mid register A1-A2.
3. **Electro saw wobble** (Satisfaction): (0,1)R glide→(1,1)R (2,.5)R (2.5,1.5)Rlow — legato saw, portamento 80ms, filter-motion faked by vel 115→85.
4. **Disco octave 8ths** (French/Prydz): R-8 alternating 8ths dur .35, swing 54, +ghost 16th (3.75,.25)@60.
5. **Drop sub** (big room): (0,.3)R@120 with kick, + (3.75,.25) pickup b7 or 5; nothing else — kick tail is the bass.
6. **Folk-EDM root-5** (Wake Me Up): (0,.5)R (0.5,.5)R (1,.5)5, (1.5,.5)R... country alternating feel at 124.

### D5. Melodic hook grammar
- Scale: MAJOR pentatonic of the relative major over minor loops (the Levels/Wake Me Up trick), or natural minor for darker big room. Drop hook = 2-5 distinct pitches; verse topline low (C4-A4), hook up a 4th-6th (E4-C5 sung / C5-C6 lead).
- Rhythm cells: E1 (0,.25)(0.25,.25)(0.5,.5)(1,.25)(1.25,.25)(1.5,.5)(2,1)(3,1) stutter-pair-hold · E2 (0,.5)(0.5,.25)(0.75,.25)(1,.5)(1.5,.5)(2,1.5)(3.5,.5) push-tail · E3 same-note x4: (0,.25)(0.5,.25)(1,.25)(1.5,.25) then leap +4th (2,2) · E4 offbeat chain (0.5,.5)(1.5,.5)(2.5,.5)(3.5,.5) · E5 (0,.75)(0.75,.75)(1.5,.5)(2,2) tresillo-hold · E6 pickup (3,.33)(3.33,.33)(3.66,.34) triplet run-in · E7 2-bar call-response: bar1 cell E1, bar2 = E1 rhythm, pitches end LOWER (response).
- Repetition: 2-bar cell x2 = 4-bar phrase; phrase x2 w/ bar-8 variation = hook. Drop repeats hook 4x w/ layer adds. Anticipation pushes at 3.5/3.75 constantly (pop signature). Articulation: pitch-bend FALL (-12 over .5 beat) on drop-lead phrase ends (big-room signature); portamento on repeated notes.
- Original cells (relative-major-pent degrees over minor loop): P1 `(0,.25)5 (0.5,.25)5 (1,.25)6 (1.5,.25)5 (2,1.5)3 (3.5,.5)2` · P2 drop 2-pitch: `(0,.25)1 (0.75,.25)1 (1.5,.25)b3' (2,.25)1 (2.75,.25)1 (3.5,.5)b3'` (minor, Animals-grammar) · P3 anthem: `(3,.5)1 (3.5,.5)2` pickup | `(0,1)3 (1,.5)2 (1.5,.5)3 (2,1.5)5 (3.5,.5)3`.

### D6. Instrumentation (GM)
- Lead: 82 (saw, layered -12/0/+12) for drops; 81 (square) electro; 1 (piano) anthem verses; 25/26 (steel/jazz guitar) folk-EDM strums; 54 (Voice Oohs) chopped-vocal fake. Chords: 82 short for stabs, 51 strings layer, 90 pad. Bass: 39 (Synth Bass 1), 40 (Synth Bass 2 for electro wobble), 34 (Fingered) folk-EDM.
- Drums: big-room 909-derived. Kick 36 @125 long-tail; clap 39 + snare 40 on 2,4; OH 46 offbeats @95; CH 42 16ths @[65,45,80,45]; crash 49 at every 8-bar head + drop bar 1; build: snare 40 on 4ths (bars 1-4 of build) → 8ths (5-6) → 16ths (7) → 32nd roll (8) + white-noise riser fake (use OH 46 16ths crescendo 40→110); 1-beat silence before drop.

### D7. Arrangement
- Pop-EDM hybrid (Titanium form): intro 8 → verse 16 (piano/pluck + topline, half drums) → pre-chorus 8 (build: snare accel per D6) → DROP 16 = instrumental chorus (hook on saw + full kit + pump bass) → break 8 → verse 2 (8, add percussion) → pre 8 → drop 2 x2 (32, add counter-octave layer) → bridge/strip 8 → final drop 16 → outro 8. Festival edit: pad 32-bar drum shells both ends. Rule: the DROP carries the chord loop + a SIMPLER version of the chorus melody (2-5 pitches), never the full topline.

### D8. Corny traps
1. Drop lead = full vocal topline on saw. Fix: reduce chorus to 2-5-pitch rhythmic cell (E3/P2), keep its rhythm.
2. No sidechain feel. Fix: on-beat vel 60-70% of offbeat for bass/pads everywhere the kick plays.
3. Chords change every 2 beats. Fix: 1 bar minimum, identical 4-bar loop all sections.
4. Minor scalewise hook = accidental trance. Fix: major pentatonic of relative major, repeated-note cells, 3.5 pushes.
5. Build without arithmetic. Fix: snare 4ths→8ths→16ths→32nds over exactly 8 bars + 1-beat gap.
6. 9 simultaneous melody layers for "bigness." Fix: 1 lead doubled -12/+12 + 1 counter only; loudness ≠ layers.
7. French house w/ clean unfiltered loop. Fix: 4-bar vel ramp 70→115 (fake filter) + swing 54.

### D9. Public-domain lifts
- **Gershwin — Rhapsody in Blue** (1924; US PD since 2020): clarinet gliss + main themes = pop-EDM gold. **Grieg — In the Hall of the Mountain King** (proven in hard-dance covers). **Foster — Oh! Susanna / Camptown Races** (folk-EDM banjo-drop bait). **Trad: Cotton-Eye Joe** (Rednex proved the model, 1994 — their ARRANGEMENT/recording copyrighted, tune trad). **House of the Rising Sun** (trad; The Animals' 1964 arrangement = TRAP). **Man of Constant Sorrow** (trad; Soggy Bottom/1913 Burnett versions — arrangement TRAP). **Danny Boy/Londonderry Air** (tune trad; 1913 Weatherly lyrics now PD). **Swing Low, Sweet Chariot**, **When the Saints** (gospel-drop candidates). **Für Elise** (electro-bounce covers exist). Universal trap: pre-1931 COMPOSITION is safe; any post-1931 arrangement, added lyrics, or any sound recording is not.

---

## Cross-genre implementation notes for the pack author
1. Store comping/bass grids exactly as given: `{hits:[{beat,dur,degree,vel}], swing, register, gmProgram, articulation:"staccato|legato", loopBars}` — all four genres fit this shape.
2. Degree vocab needed beyond current engine: chord-relative `b7`, `8` (octave), `~x` chromatic approach, and NEXT-bar-root pickup flag (used by house A4.5, trance C4.1, EDM D4.5).
3. Velocity patterns are load-bearing (sidechain fake, filter fake, swing feel) — packs must carry per-hit vel, not a single lane velocity.
4. Repetition schemes (x3+var, call-response 2+2, exact-loop-16) belong in pack metadata so the AI DJ recombines legally-idiomatic phrases instead of re-rolling every bar.
5. Genre swing constants: house 56, techno 51, trance 50, French house 54, big room 50.