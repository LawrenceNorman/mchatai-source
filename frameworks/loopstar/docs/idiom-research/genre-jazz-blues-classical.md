# Idiom Source-Book: Jazz / 12-Bar Blues / Classical-as-Loops
Conventions: beat positions 0..4 (16th=0.25), `(beat,dur)` in beats, vel 0..127, swing 2:1 = shift 8th off-beats x.5→x.67. Degrees are scale degrees vs session key (b3=blue/minor 3rd, #7=leading tone); `'`=octave up. GM programs 1-indexed. GM drum keys: 35/36 kick, 38 snare, 37 side-stick, 42 closed HH, 44 pedal HH, 51 ride, 53 ride bell.
US PD status as of 2026: **compositions published ≤1930 are PD**; sound recordings ≤1925 are PD. Encode from the composition (sheet), never from a post-1925 recording's arrangement.

## GENRE 1: JAZZ (swing / bebop / modal)

### 1. Canon (study references)
- Count Basie — One O'Clock Jump: riff-head-over-blues; Freddie Green 4-to-bar guitar comp; Walter Page walking bass
- Duke Ellington — Take the "A" Train: swing riff head w/ #11 chord (D7b5 bar 3-4); Charleston-rhythm backgrounds
- Miles Davis — So What: modal AABA (16 Dm7 / 8 Ebm7 / 8 Dm7); bass plays the hook; quartal piano answer chords
- Charlie Parker — Now's the Time: bebop blues head = 1-bar riff grammar over 12-bar; blue-note enclosures
- Charlie Parker — Confirmation: chained ii-V cells; enclosure targeting on beats 0/2
- Dizzy Gillespie — A Night in Tunisia: 2-bar bass ostinato over bII7→i; Latin-A/swing-B contrast
- Thelonious Monk — Straight, No Chaser: chromatic-approach head, displaced riff (same cell re-entered at shifting beats)
- Thelonious Monk (comping anywhere): 1-stab-per-bar cluster punches, whole-tone/b9 color
- John Coltrane — Giant Steps: 2 chords/bar major-3rd cycle — the fast-harmonic-rhythm extreme
- Bill Evans — Waltz for Debby: rootless A/B voicings, legato pad comping (3/4 — study voicings, not grid)
- Miles Davis Quintet w/ Red Garland — e.g. Oleo: the &-of-2 / 4 anticipation comp archetype
- Herbie Hancock — Cantaloupe Island: 16-bar modal riff comp (Fm7–Db7–Dm7), riff-over-static tier
- Horace Silver — Song for My Father: tresillo bass ostinato (R–5–b7 shape), AAB head
- Ahmad Jamal — Poinciana: 2-chord vamp, space-as-comping
- Jelly Roll Morton — Black Bottom Stomp (1925, PD comp): early-jazz stop-time, 2-feel bass
- Louis Armstrong — West End Blues (comp 1928 PD): rubato intro → 12/8 slow-blues jazz crossover
- Wes Montgomery — any: octave-doubled melody articulation (encode: add note +12, vel -10)
- Oscar Peterson — Night Train: blues-riff head w/ shell comping

### 2. Harmony
- Core engine: **ii7–V7–Imaj7** (1 bar each, or 2 beats each when fast); minor: **iiø7–V7b9–i(m6/9)**
- Rhythm changes A (I Got Rhythm, 1930, PD): I–vi7–ii7–V7 ×2, I–I7–IV–#IVdim7, I–V7–I; B: III7–VI7–II7–V7 (2 bars each)
- Jazz blues (12-bar): I7 | IV7 | I7 | I7 | IV7 | #IVdim7 | I7 | VI7alt | ii7 | V7 | I7–VI7 | ii7–V7
- Turnarounds: I–VI7–ii7–V7; iii7–VI7–ii7–V7; tritone subs anywhere (bII7 for V7 → chromatic bass ii–bII–I); backdoor iv7–bVII7–Imaj7
- Modal tier: dorian vamps, 8–16 bars per chord (So What), i7↔bII shifts; sus4 chords belong here, not in bebop
- Extensions are default, not optional: dominants carry 9/13 (alt: b9 #9 b13 on V-of-minor); tonics maj7(9); ii = m7(9,11)
- Harmonic rhythm: standards 1–2 chords/bar; bebop up to 2/bar; modal 8+ bars/chord. Progression-driven except modal subgenre
- Cadence tell: ii–V–I with guide-tone motion (3 of ii → b7 of V → 3 of I, stepwise semitones)

### 3. Comping grids
- **Freddie Green four** — hits 0,1,2,3; dur 0.3; vel 76,84,76,86; no swing (quarters); 3-note shells R-3-6/R-3-b7, register C3–C4; ex: Basie
- **Charleston** — hits (0,0.66)(1.5,0.5); vel 92,80; swing 2:1; shell or full voicing; ex: A Train backgrounds, countless heads
- **Red Garland anticipation** — hits (1.5,0.4)(3.0,0.3), variant (1.5,0.4)(3.5,0.4) pushing next bar; vel 85,78; swing 2:1; rootless 4-note (3-5-7-9), C4–C5; ex: Miles 1st quintet
- **Monk punch** — 1 stab/bar, position drawn from {0,1.5,2.5,3.0} changing each bar; dur 0.2; vel 105; cluster w/ b9 or whole-tone pair; ex: Straight No Chaser
- **Evans pad** — hits (0,2.0)(2,2.0) or (0,4.0); vel 62; legato rootless A-form (3-5-7-9) / B-form (7-9-3-5); ballads ≤90 BPM
- **Quartal answer (So What)** — hits (2.5,0.33)(3.0,0.5); vel 85,80; voicing = 3 stacked 4ths + maj3 on top (e.g. E-A-D-G-B); modal only
- Swing calibration: 2.4:1 below 100 BPM, 2:1 at 120–180, 1.6:1 above 220. Avg comp density ≤2.5 hits/bar outside Freddie Green

### 4. Bass archetypes
- **Walking quarter** — hits 0,1,2,3; dur 0.95 legato; vel 80±6 (beat 2 slightly up). Construction: beat0 = root of bar's chord; beats1–2 = chord tones (3,5) or scale steps toward target; beat3 = approach to next bar's root: chromatic ±1 semitone (55%), dominant approach (5 above, 25%), scale step (20%). Octave leap 1 bar in 4; ghost triplet skip (2.66,0.15,vel 40) 1 bar in 4. Register E1–G3. Ex: Paul Chambers on So What, Ray Brown
- **Two-feel** — hits (0,1.8)(2,1.8); notes R,5 (occasionally R,3 or R,6 walkdown); vel 78; head choruses, verses
- **Tunisia/vamp ostinato** — 2-bar: bar1 (0,0.5,R)(1.5,0.5,b7)(2.5,0.5,R)(3.5,0.5,5); repeats exact; vel 85; over pedal or bII7→i vamp
- **Tresillo (Silver/Cantaloupe)** — hits (0,1.0,R)(1.5,1.0,5)(3,1.0,b7 or R); vel 90,82,86; straight 8ths (Latin), no swing
- **Bebop half-time pedal** — bridge device: (0,4.0,5-of-key) held 4–8 bars under moving chords, release into walking
- Articulation: fingered upright (GM 33); dead notes = dur 0.1 vel 35; NO slides — approach chromatically instead

### 5. Melodic hook grammar
- Scales: chord-tone arpeggios + bebop scales (major bebop adds b6 passing; dominant bebop adds maj7 passing between b7–R); blues scale on blues heads; dorian on modal
- **Enclosure rule (bebop core)**: place chord tone (3,5,7,9) on beat 0 or 2; precede with upper diatonic neighbor then lower chromatic (2 notes), or double-chromatic-below (2 notes), or 4-note cell (up-step, down-3, chromatic up). Downbeats = chord tones, upbeats = approaches
- Rhythm cells (1 bar, swing 2:1 unless noted):
  j1 (0,.5)(0.5,.5)(1,.5)(1.5,.5)(2,.5)(2.5,.5)(3,.5)(3.5,.5) — 8th stream; accent off-beats +10 vel
  j2 (0.5,.5)(1.5,.5)(2.5,.5)(3.5,.5) — all-offbeat stabs (Monk)
  j3 (0,1.5)(1.5,.5)(2,2) — Charleston + resolve
  j4 (0,.5)(1,.5)(1.5,.5)(2.5,1.5) — riff w/ pushed ending
  j5 (0,.33)(0.33,.33)(0.66,.33)(1,2) — triplet pickup → held target
  j6 (2,.5)(2.5,.5)(3,.5)(3.5,.5) — half-bar pickup calling into next bar
  j7 (0,.5)(0.5,.5)(1,1)(2.5,.5)(3,1) — talk-pause-answer
  j8 (3.5,.5) alone — anticipation stab after a rest bar
- Contour: arch (rise to apex at bar 2–3 of phrase, resolve down by step); phrases END on 3, 9, or 13 — never root-on-downbeat in bebop; blues heads may end R/b3
- Repetition: AABA 8+8+8+8; riff ×3 + varied 4th (Basie); call 2 bars + response 2 bars; hooks 2–4 bars
- Register: lead C4–C6, ≥1 octave above comp top. Bends: approximate with chromatic grace (dur 0.1) into target
- ORIGINAL example cells (degree,beat,dur):
  JH1 modal riff (dorian): (0,.5,1)(0.5,.5,b3)(1,.5,4)(1.5,1,5)(2.5,.5,4)(3,1,b3) — play ×3, bar 4: (0,.5,4)(0.5,.5,b3)(1,2,1)
  JH2 ii–V enclosure (over ii7–V7–I): bar1 (0,.5,4)(0.5,.5,5)(1,.5,6)(1.5,.5,b7)(2,.5,6)(2.5,.5,4)(3,.5,3)(3.5,.5,#2) → bar2 (0,2,3) — chromatic below into the 3rd of I
  JH3 riff-head (blues scale): (0,.33,5)(0.33,.33,b5)(0.66,.33,4)(1,.5,b3)(1.5,1,1)(3,.5,b7below)(3.5,.5,1)

### 6. Instrumentation (GM)
- Lead: 57 Trumpet, 66 Alto Sax, 67 Tenor Sax, 12 Vibraphone, 60 Muted Trumpet (ballads); Wes-style: double +12 at vel−10 on 27
- Chords: 1 Acoustic Grand (dur ≤0.4 for stabs), 27 Jazz Electric Gtr (Freddie Green: dur 0.3, vel flat), 12 Vibes (modal pads)
- Bass: 33 Acoustic Bass only. Drums: ride-driven — ride 51 pattern (0,1,1.67,2,3,3.67 swung "spang-a-lang"), pedal HH 44 at 1,3 (i.e. beats 2&4), side-stick 37 sparse, kick feathered vel 30 on 0,2; NO loud backbeat snare; brushes ≈ snare vel 25–45 continuous 8ths

### 7. Arrangement
- Form IS the loop: 12-bar or 32-bar AABA, repeated; head–solos–head. Intro: 4–8-bar piano/bass vamp on ii–V or i pedal
- Energy: comp density (pad → Charleston → Garland), ride vs hats, walking vs 2-feel. B-section: lift melody register +4th, thicken voicings
- Trading 4s: melody 4 bars ↔ drums 4 bars. Ending: turnaround ×3 tag, final Imaj9 hit

### 8. Corny traps
1. Straight 8ths at swing tempo → all melodic/comp 8th off-beats to 2:1 (x.5→x.67); bass quarters stay straight
2. Root-position block chords every downbeat → rootless 3-7-9(-5) voicings, off-beat placement, ≤2.5 hits/bar
3. Random walking bass → enforce beat-3 approach rule (chromatic/dominant into next root); no repeated-note quarters
4. Every phrase starts beat 0 on root → start on 0.5/1.5 or pickup (j6); target 3rds/7ths on strong beats
5. Backbeat snare vel 100 → ride carries time; snare = ghost comping vel 30–50 at irregular off-beats
6. Uniform velocity 8th lines → off-beats +10, apex note +15, enclosure notes −10

### 9. PD lifts (compositions ≤1930)
Verbatim-encodable heads/changes: Tiger Rag (1917), After You've Gone (1918), Avalon (1920), Limehouse Blues (1922), The Charleston (1923 — the rhythm's namesake), Sweet Georgia Brown (1925), Bye Bye Blackbird (1926), Basin Street Blues (1928), Ain't Misbehavin' (1929), Honeysuckle Rose (1929), What Is This Thing Called Love (1929), plus new-2026: **I Got Rhythm, Georgia on My Mind, Mood Indigo, Body and Soul, On the Sunny Side of the Street** (all 1930). St. James Infirmary = trad (safe as folk melody).
TRAP: famous solos/arrangements are separately copyrighted (Hawkins' 1939 Body and Soul solo, big-band charts) — encode only the published lead-sheet melody+changes or your own realization; recordings after 1925 not PD.

## GENRE 2: 12-BAR BLUES (shuffle / Chicago / Delta-electric)

### 1. Canon
- Robert Johnson — Sweet Home Chicago: THE shuffle comp + turnaround archetype (comp PD ~2032, idiom free now)
- Robert Johnson — Cross Road Blues: stop-time + slide phrasing
- Muddy Waters — Hoochie Coochie Man: stop-time riff (1-bar riff, band stabs, 2-bar vocal answer)
- Muddy Waters — Mannish Boy: one-chord riff blues, riff-over-static
- Howlin' Wolf — Smokestack Lightning: hypnotic one-chord E riff; band = riff unison
- Howlin' Wolf — Spoonful: one-chord riff, minor-pent hook as entire form
- B.B. King — The Thrill Is Gone: minor blues (i–iv–bVI–V), string pads over 12/8
- B.B. King — Sweet Little Angel: call(vocal)/response(guitar fill) grammar; b3→3 bends
- T-Bone Walker — Call It Stormy Monday: 9th-chord comping, jazz-blues chord passing (I7–ii7–iii7–biii°)
- Albert King — Born Under a Bad Sign: bass+guitar unison riff loop under vocals
- Freddie King — Hide Away: instrumental shuffle, R-3-5-6 boogie bass, section-per-chorus arrangement
- Elmore James — Dust My Broom: full-bar triplet slide riff on b3–R
- Jimmy Reed — Bright Lights, Big City: lazy 5-6-b7 walkup shuffle, laid-back vocal placement
- John Lee Hooker — Boogie Chillen': one-chord boogie, open-string drone + stomp
- Stevie Ray Vaughan — Pride and Joy: Texas shuffle, raked dead-note strums between dyads
- Bessie Smith — Backwater Blues (1927, PD): slow 12/8 piano blues
- Leroy Carr — How Long, How Long Blues (1928, PD): 8-bar blues archetype
- Pinetop Smith — Pinetop's Boogie Woogie (1928, PD): boogie-woogie left hand, spoken stop-time

### 2. Harmony
- 12-bar: I7|I7|I7|I7|IV7|IV7|I7|I7|V7|IV7|I7|V7. Quick-change: bar2=IV7. Harmonic rhythm 1 chord/bar (bars 11–12 may split 2 beats each: I7–IV7|I7–V7)
- ALL chords dominant quality (I7, never Imaj7); comping color = 9ths (T-Bone) and 13ths; V7#9 for the final push
- 8-bar blues: I|V7|IV|IV|I|V7|I–IV|I–V7 (How Long, Key to the Highway)
- Minor blues: i7×4|iv7×2|i7×2|bVI7–V7|i7–V7 (Thrill Is Gone). One-chord tier: riff IS the harmony (Smokestack, Boogie Chillen')
- Turnaround (bars 11–12): descending line-cliché over I: b7→6→b6→5 in triplets, land V7 beat 3 of bar 12; or walkup R–2–b3–3→IV
- Blue-note doctrine: melody b3/b5/b7 over major-3rd comp — the clash is the idiom, never "correct" it. Mixolydian + blues scale hybrid
- Progression-driven (12/8-bar tiers) AND riff-over-static (one-chord tier) both first-class

### 3. Comping grids
- **Shuffle 5-6 boogie** — 8 swung 8ths (0,.4)(0.5,.4)(1,.4)(1.5,.4)(2,.4)(2.5,.4)(3,.4)(3.5,.4); on-beats dyad R+5 vel 90, off-beats R+6 vel 74; swing 2.2:1; low register (R at E2–A2); ex: Sweet Home Chicago, Pride and Joy
- **Jimmy Reed walkup** — same grid; dyads per beat-pair: R5 R6 R b7 R6; behind-beat feel (+0.04 all onsets); vel 80 flat; ex: Bright Lights
- **9th-chord stab (T-Bone/West Side)** — hits (1.5,0.25)(2.5,0.25) or Charleston (0,0.5)(1.5,0.3); rootless 3-b7-9 voicing, C4 register; vel 96; ex: Stormy Monday
- **12/8 slow-blues roll** — 12 hits at 0.333 spacing, dur 0.3; arpeggiate chord bottom→top; vel arc 55→75→55 per beat; ex: Thrill Is Gone rhythm parts, Backwater Blues
- **Stop-time** — (0,0.5) full-band stab vel 115, rest of bar silent (riff/vocal answers); run 4 bars then release to shuffle; ex: Hoochie Coochie Man, Pinetop's spoken sections
- **Organ pad** — (0,4.0) vel 58, GM 17/18, add b7+9; swells not stabs; behind B.B.-style leads

### 4. Bass archetypes
- **Boogie R-3-5-6** — 2-bar loop of swung 8ths: degrees R,3,5,6,b7,6,5,3 (one per 8th, up then down); dur 0.45; vel 88 on-beat/76 off; register E1–A2; ex: Hide Away, Pinetop's LH
- **Shuffle root pump** — swung 8ths all-R w/ octave pop: (0,R)(0.5,R)(1,R)(1.5,R')… vel 86/70; dead-note ghost (x.75,0.1,vel 35) 1–2 per bar; ex: Pride and Joy
- **Riff unison** — bass doubles the signature riff exactly, −1 or −2 octaves; ex: Born Under a Bad Sign, Smokestack Lightning; rule: riff sits E1–E2, dur ×1.2 vs guitar
- **Two-feel country blues** — (0,1.8,R)(2,1.8,5); vel 75; acoustic-era feel; ex: How Long
- **Jump walk** — quarters 0,1,2,3 arpeggio-heavy path R-3-5-6 / 6-5-3-R with chromatic b7→6 on IV-return bars; vel 82; ex: jump blues, T-Bone
- Articulation: GM 34 fingered; upright 33 for pre-1950 feel; slides ≈ chromatic grace dur 0.08 into target

### 5. Melodic hook grammar
- Scales: minor pentatonic + b5 (blues scale) over everything; major pent (R,2,3,5,6) for "sweet" answers; the B.B. hybrid = R,2,b3,3,5,6,b7. Bends: encode b3(dur 0.1 grace)→3, 4→b5, b7→R'
- Call-response is structural: 2-bar call (bars 1–2, over I), SAME degrees restated (bars 5–6, over IV — do not re-spell), 2-bar B answer (bars 9–10, over V–IV) descending to R. AAB = the lyric and the melody scheme
- Riff ×4 rule (riff tier): 1-bar riff exact ×4 over I; either transpose shape exactly to IV root (parallel, keep b3) or hold pitch and let it clash; bars 11–12 distinct turnaround lick
- Rhythm cells (swing 2.2:1; triplet grid 0.33 legal):
  bl1 (2.66,.33)(3,.33)(3.33,.33)(3.66,.33) — triplet pickup into next downbeat
  bl2 (0,.5)(0.5,.5)(1,1.5)(3,1) — riff w/ long blue note
  bl3 (0,.33)(0.33,.33)(0.66,.33)(1,1.5) — triplet burst → land
  bl4 (0,1)(1.5,.5)(2,1.5) — statement, breath, answer
  bl5 (0.5,.5)(1,.5)(1.5,.5)(2,2) — behind-the-beat entry (never start beat 0)
  bl6 (1,.5)(1.5,.5)(2,.5)(2.5,1.5) — stop-time answer cell
  bl7 (0,.66)(0.66,.33)(1,.66)(1.66,.33)(2,2) — Dust-My-Broom triplet hammer
- Contour: start on 5, b7 or R' and FALL; 80% of phrases end R or b3; leaps up ≥4th allowed only at phrase start
- Register: lead C4–C6 (guitar), hooks G3–G5 (vocal range); hook length 1-bar riff or 2-bar call
- ORIGINAL cells (degree,beat,dur):
  BH1 boogie riff: (0,.5,R)(0.5,.5,b3)(1,.5,4)(1.5,.5,b5)(2,.5,4)(2.5,.5,b3)(3,1,R)
  BH2 sweet answer (B.B. grammar): (1.5,.33,5)(2,.66,6)(2.66,.33,R')(3,.66,6)(3.66,.33,5) → next bar (0,2,R)
  BH3 one-chord hypno-riff: (0,.5,R)(1,.5,b3-grace→3? no: b3)(1.5,.5,4)(2,1.5,R)(3.5,.5,b7below) — loop ×8, never vary

### 6. Instrumentation (GM)
- Lead: 30 Overdriven Gtr (electric), 28 Clean Electric (B.B. — dur legato, vel dynamic), 23 Harmonica (2nd-position wail: bends everywhere), 26 Steel-string (Delta)
- Comp: 28/27 guitar dyads, 1 Piano (boogie), 17 Drawbar Organ pads. Bass: 34 Fingered (33 upright pre-1950)
- Drums: shuffle = ride 51 or HH 42 swung 8ths, snare 38 backbeat 1,3(=beats 2&4) vel 100, kick 0,2 (four-on-floor 0,1,2,3 for boogie); 12/8 slow: ride triplets 0.33 grid, cross-stick 37 backbeat; tempo 60–130 (slow blues 55–70, shuffle 95–130)

### 7. Arrangement
- Loop = one 12-bar chorus. Intro: last 4 bars of form (from V7, bar 9) or turnaround ×2. Energy per chorus, not per bar
- Contrast tools: stop-time chorus; comp drops to pad behind vocal "verse", full shuffle behind solo; harmonica/guitar swap response role
- Ending: bar 12 hold V7#9 1 bar → I9 stab; or slow-drag final 2 beats (rit ≈ dur ×1.5)

### 8. Corny traps
1. Straight 8ths → swing ≥2:1; if the engine can't swing, use explicit triplet grid (0.33) placement
2. Natural 3/7 melodies (major scale) → blues scale only; add b3→3 grace bends; never end a phrase on maj7
3. Quantized perfection → melody onsets +0.03–0.08 behind grid; add dead-note ghosts vel 30–40 between comp dyads
4. Imaj7/IVmaj7 qualities → every chord dominant 7 or 9; harmony guard must not "correct" melody b3 vs comp 3
5. Skipping the turnaround (I in bars 11–12) → always V7 by bar 12 beat 0 (or beat 2 after I)
6. Diatonic riff transposition to IV → transpose the exact shape parallel (keep b3/b5), or hold it static and clash

### 9. PD lifts (compositions ≤1930)
The Memphis Blues (1912), St. Louis Blues (1914 — the habanera-section trick too), Beale Street Blues (1917), Crazy Blues (1920), Downhearted Blues (1922), 'Tain't Nobody's Biz-ness If I Do (1922), See See Rider (1924), Careless Love (trad, pub ≤1921), Backwater Blues (1927), How Long How Long Blues (1928), Pinetop's Boogie Woogie (1928 — the boogie LH figure itself), Nobody Knows You When You're Down and Out (1923), Sittin' on Top of the World (1930, new 2026). TRAP: Robert Johnson comps are 1936–37 (PD ~2032) — study the idiom, don't lift; post-1925 recordings (incl. all electric Chicago) not PD; lift from sheet/melody only.

## GENRE 3: CLASSICAL-AS-LOOPS (baroque ostinati + romantic themes; the verbatim-legal cluster)

### 1. Canon (all composition-PD; see §9 for encode-ready motifs)
- Bach — Toccata & Fugue in D minor BWV 565: the mordent+descent opening — instant recognition hook
- Bach — Cello Suite 1 Prelude: 1-bar arpeggio ostinato that follows changes — the original broken-chord loop
- Bach — Badinerie (Orch. Suite 2): bouncing minor-arpeggio lead, staccato 16th grammar
- Bach — Air on the G String: walking-octave bass under long-note melody (the lo-fi classic)
- Pachelbel — Canon in D: the 8-chord loop I–V–vi–iii–IV–I–IV–V + ground bass; ancestor of every pop loop
- Vivaldi — Four Seasons, Winter I: repeated-16th chord chug = string "trap hi-hat" energy
- Vivaldi — Summer III (Presto): descending-run storm riff, unison strings
- Beethoven — Symphony 5, I: SSSL rhythm cell (rest-8-8-8-half) — rhythm-as-hook proof
- Beethoven — Für Elise: 5–#4 oscillation hook over i; broken-chord LH
- Beethoven — Moonlight I: triplet arpeggio ostinato (5-1-b3) under slow top line
- Beethoven — Symphony 7, II: dactyl ostinato (♩♪♪♩♩) on one pitch — loopable grief-march
- Grieg — In the Hall of the Mountain King: ascending minor riff, tempo/energy ramp = built-in arrangement
- Grieg — Morning Mood: major-pent pastoral hook (flag: 6/8)
- Mozart — Rondo alla Turca: turn-figure 16th cells in Am; alberti LH
- Mozart — Symphony 40, I: b6–5–5 sigh cell ×3 + leap — repetition grammar exemplar
- Dvořák — Symphony 9 Largo ("Goin' Home"): major-pent long-note hook
- Bizet — Carmen Habanera: habanera bass ostinato + chromatic descending melody
- Chopin — Prelude Op.28 No.4 in Em: chromatic pulsing-chord comp under 2-note melody (lo-fi goldmine)
- Satie — Gymnopédie No.1: maj7 pad language (flag: 3/4)
- Ravel — Boléro (PD US 2025): additive-layer arrangement model + snare ostinato (flag: 3/4)
- Dies Irae (chant, trad): the doom motif — b3-2-b3-1-2-b7-1-1

### 2. Harmony
- Baroque loop engines: ground bass/chaconne (lament tetrachord R–b7–b6–5 under i–v6–iv6–V); Pachelbel 1-5-6-3-4-1-4-5 (1 chord per 2 beats or per bar); circle-of-fifths sequence i–iv–bVII–bIII–bVI–iiø–V–i (1 per 2 beats)
- Romantic color: chromatic mediants (i–bVI, I–bIII), Neapolitan bII6→V→i, deceptive V→bVI; picardy final I
- **Harmonic-minor tell**: V is MAJOR/dom7 in minor keys (raised 7). Melody: natural minor descending, raise 7 (and often 6) into cadences. This one rule separates "classical" from modal/blues output
- Harmonic rhythm: baroque 1–2 chords/bar (per-beat in sequences); romantic 1 chord per 1–2 bars; ostinato tier = 1–2 chords total (Boléro: I↔V)
- Cadence grammar: 4-bar antecedent ends V (half cadence), 4-bar consequent ends i/I (authentic). Suspensions 4→3 and 7→8 at cadences
- Both modes: progression-driven (chorale/romantic) and riff-over-static (ostinato/pedal tier) are first-class

### 3. Comping grids (straight, swing=0 always)
- **Alberti bass** — 8ths (0,.45)×8 pattern R-5-3-5 repeating per beat-pair; vel 64 flat; C3–C4; ex: Mozart sonatas, alla Turca LH
- **Vivaldi chug** — 16ths (0,.2)×16, full chord repeated; vel 72 w/ +12 accent on 0 and 2; strings 49 + optional piano double; ex: Winter
- **Moonlight triplets** — 12 hits at 0.333, dur 0.4, arpeggio loop 5-1-b3 rising; vel 52; pedal-sustain feel (dur may overlap); ex: Moonlight I
- **Habanera comp** — (0,1.5)(1.5,0.5)(2,1)(3,1); bass note on 0, chords on 2,3; vel 84,70,74,70; ex: Carmen
- **Chopin pulse** — repeated 8th chords (0,.45)×8, vel 48, voice-leading moves ONE inner note chromatically per bar; ex: Prelude e-minor
- **Romantic pad** — (0,4.0) or (0,2)(2,2), strings 49, vel 58 w/ crescendo ramp +15 across bar; suspensions resolve on beat 2

### 4. Bass archetypes
- **Ground/lament bass** — 1 note per bar (or half-bar), dur full legato, degrees R,b7,b6,5 loop (lament) or Pachelbel 1,5,6,3,4,1,4,5; vel 76; cello 43 C2–C3
- **Walking-octave 8ths (Air on G)** — 8ths alternating octaves of the chord root w/ scalar connectors at bar ends; dur 0.5 detached; vel 72; ex: Air on the G String
- **Octave pump** — staccato quarters or 8ths on R, alternate octaves, dur 0.3, vel 82; ex: Mountain King, Beethoven scherzi
- **Pedal point** — (0,4.0,5-of-key) held 2–8 bars under changing chords → cadence; the baroque tension device
- **Habanera bass** — (0,0.75,R)(0.75,0.25,5)(1,0.5,5)(1.5,0.5,R) per half-bar ×2; vel 88,70,74,78
- **Arpeggio-ostinato-as-bass** — run Cello Suite pattern (§9.2) in C2–C3 as the entire accompaniment

### 5. Melodic hook grammar
- Scales: harmonic minor (raise 7 at cadence), natural minor for riffs, major + major-pent for pastoral; chromatic passing tones (romantic); NO blue notes
- **Sequence rule (the baroque move)**: state a 1-bar cell, repeat at −1 step, repeat at −2 steps, cadence bar. Instant authentic development
- Rhythm cells (straight):
  c1 (0.5,.5)(1,.5)(1.5,.5)(2,2) — SSSL (Beethoven 5 shape)
  c2 (0,.25)(0.25,.25)(0.5,.25)(0.75,.25)(1,1) — 16th turn → land (alla Turca)
  c3 (0,1)(1,.5)(1.5,.5)(2,1)(3,1) — dactyl ostinato (Beethoven 7)
  c4 (0,.5)×8 even 8ths — running riff (Mountain King)
  c5 (0,1.5)(1.5,.5)(2,2) — appoggiatura sigh (long dissonance → resolve DOWN by step)
  c6 (0,.75)(0.75,.25)(1,.75)(1.75,.25)(2,1)(3,1) — dotted march
  c7 16ths ×16 arpeggio loop R-3-5-8-5-3-5-3 — moto perpetuo
  c8 (0,.125)(0.125,.125)(0.25,.5) prefix — mordent ornament cell (attach to any long note)
- Contour: stepwise 70%; leap of 4th/6th UP then steps down (gap-fill law); apex once per phrase, ~75% through
- Repetition: exact ostinato ×8 (1–2 bar); antecedent/consequent 4+4; cell ×3 descending sequence + cadence. Hooks: 1-bar ostinato or 4-bar theme
- Register: lead C5–C7 (violin/flute), keep ≥2 octaves above bass; inner pad fills C4–C5
- ORIGINAL cells (degree,beat,dur):
  CH1 baroque riff (minor): (0,.5,1)(0.5,.5,2)(1,.5,b3)(1.5,.5,4)(2,.5,5)(2.5,.5,4)(3,.5,b3)(3.5,.5,2) — sequence at −1 next bar
  CH2 sigh over i→V: (0,1.5,b6)(1.5,.5,5)(2,2,5) then (0,1.5,4)(1.5,.5,#7... no: resolve 4→3) — appoggiatura pairs
  CH3 moto-perpetuo (over i): 16ths (0,.25,1)(0.25,.25,b3)(0.5,.25,5)(0.75,.25,8)(1,.25,5)(1.25,.25,b3)... loop; raise 7 in the cadence bar

### 6. Instrumentation (GM)
- Lead: 41 Violin, 74 Flute, 69 Oboe (pastoral), 61 French Horn (romantic), 7 Harpsichord or 20 Church Organ (baroque)
- Chords: 49 String Ensemble, 1 Piano, 7 Harpsichord, 20 Organ; Bass: 43 Cello, 44 Contrabass, 48 Timpani for accents (roots only, vel 100)
- Articulation physics: harpsichord = velocity FLAT 80 (it has no dynamics); baroque strings = detached dur 0.2–0.3; romantic strings = legato dur ×1.05 overlap + vel arcs; piano needs phrase-shaped velocity (see traps)
- Hybrid-beat note: grid-locked ostinati (chug, alberti, moto-perpetuo) sit perfectly over boom-bap 85–95 or four-on-floor 120–126; the ostinato IS the hi-hat energy

### 7. Arrangement
- **Boléro model = the AI-DJ blueprint**: identical loop each repeat, ADD one layer per 8–16 bars (melody → +pad → +bass octave → +percussion → +brass double); never vary the loop, only the stack
- Terrace dynamics (baroque): sudden vel ±20 between sections, no gradual ramps; romantic: 4-bar crescendo into downbeat
- Structure: theme ×2 → sequence/development 4 bars → cadence 2 bars → loop. Drop = strip to bass ostinato + one voice
- Mountain King model: same riff, tempo +4 BPM and vel +8 per repeat

### 8. Corny traps
1. GM strings on fast 16ths = organ mush → dur 0.15–0.25 staccato + double w/ piano or pizzicato 46
2. Swing applied to baroque lines → keep dead straight; swing only as a deliberate jazz-bach hybrid mode
3. Velocity-flat piano → phrase arc: start 60, apex 90 at contour peak, cadence 55 (EXCEPT harpsichord: flat 80)
4. b7 on V chords in minor (modal cadence) → raise 7: V must carry the leading tone; melody raises 7 (and 6) ascending into cadence
5. Jazz-reharmonizing famous motifs by default → diatonic triads first; recognition IS the hook; offer reharm as a variant only
6. Meter cramming: Gymnopédie/Boléro/waltzes 3/4, Morning Mood 6/8, Greensleeves 6/8 → re-cell honestly (3/4→ dur×4/3 map or 12/8 feel) or skip; never force 4 beats

### 9. PD lifts — verbatim melodies, encode-ready (degree sequences vs tonic; all compositions PD)
1. Bach Toccata Dm: [5,(4-5 mordent), rest, 4,b3,2,1,#7,1(low, hold)] — free rhythm intro; loop the descending run as 16ths at 70 BPM
2. Bach Cello Suite 1 Prelude: 16th ostinato [1,5,3,2,3,5,3,5] ×2 per bar; re-voice to each chord (R,5,3rd stay chord-relative); 60–90 BPM
3. Bach Badinerie: opening cell [8,5,b3,1] as (0,.5)(0.5,.25)(0.75,.25)(1,.5) + running 16ths; staccato; 110–120 BPM
4. Pachelbel Canon: bass [1,5,6,3,4,1,4,5] 1 per half-bar; stack the famous violin variations as separate intensity layers
5. Beethoven 5: [(0.5,.5,5)(1,.5,5)(1.5,.5,5)(2,2,b3)] then [(0.5,.5,4)(1,.5,4)(1.5,.5,4)(2,2,2)] — works at 90 BPM over halftime beat
6. Für Elise: 16ths [5,#4,5,#4,5,2,4,b3,1] landing 1 on downbeat; broken-chord answer [1,3,5] LH
7. Mountain King: even 8ths bar1 [1,2,b3,4,5,b3,5], bar2 [b6,4,b6], bar3 [5,b3,5] — loop w/ tempo ramp
8. Dies Irae: [b3,2,b3,1,2,b7,1,1] long equal notes — instant doom over any dark beat
9. Mozart 40: [b6,5,5]×3 + [b3'] — 8th-8th-quarter cells; 100 BPM
10. Rondo alla Turca: 16ths [2,1,#7,1] → (1,.5,b3) — chain at rising steps; alberti LH
11. Dvořák Largo: [3,5,5],[3,2,1],[2,3,5,3,2] long tones, major pent — lo-fi ready at 65 BPM
12. Carmen Habanera: melody chromatic descent [8,7,b7,6,b6,5] over habanera bass (§4.5)
13. Moonlight ostinato: triplets [5,1,b3] loop, i–bVI–bII6–V harmonies under
14. Vivaldi Winter chug: rhythm-only lift — 16th repeated-chord + trill stabs; pair w/ any minor loop
15. Ode to Joy (Beethoven 9): [3,3,4,5,5,4,3,2,1,1,2,3,3,2,2(hold)] quarters — the simplest whole-tune lift
16. Boléro: lift the 2-bar snare ostinato + first melody cell only (3/4 flag; full melody is 16 bars — too long for a loop cell)
TRAPS: modern engraved EDITIONS carry edition copyright — encode from the notes (degrees), not by copying a modern urtext layout; famous orchestral RECORDINGS are not PD; Carmina Burana (1936), Rhapsody in Blue orchestrations, and Holst's Planets in some arrangements are NOT safe — stick to the list above. Greensleeves/folk trad = safe melody, but named 20th-c. arrangements (Vaughan Williams 1934) are not.

## Cross-genre encoding notes for the pack author
- Swing is per-genre global: jazz/blues packs need engine swing 2:1–2.4:1 or explicit 0.33-grid triplets; classical always 0
- The harmony guard must allow b3/b5/b7 melody over dominant comp (blues/jazz) and must NOT flatten raised-7 on V in minor (classical)
- Phrase JSON should carry: degrees (chord-relative for arps, key-relative for hooks), grid, vel per note, articulation tag (staccato|legato|grace|dead), swingHint, meterFlag (3/4|6/8|12/8), and provenance field: `original | idiom-derived | pd-verbatim (work, year)`
- PD line as of 2026: compositions ≤1930; recordings ≤1925; recheck annually (1931 comps unlock 2027)