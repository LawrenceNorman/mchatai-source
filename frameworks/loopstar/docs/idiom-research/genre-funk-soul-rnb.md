# Funk / Soul / R&B–Neo-Soul — Idiom Source-Book for LoopStar Phrase Library

**Conventions used throughout:** beat grid 0..4 in 4/4, 16th = 0.25. Cells written `(beat, durBeats)`. Degrees are scale-degrees relative to session key/chord (`1`=root, `b3`, `#4`, `1'`=octave up). Swing% = duration share of the first 16th in each 8th pair (50=straight, 58=light swing, 66=full triplet). Velocity 0–127. GM program numbers are **1-based** (GM spec numbering). Suggested new bass enums beyond current set are flagged `NEW-ENUM`.

---

## GENRE A — CLASSIC FUNK (James Brown / P-Funk / The Meters)

### A1. Canon (study references)
1. James Brown — Papa's Got a Brand New Bag (1965): proto-funk; Jimmy Nolen upbeat "chank" guitar is born here.
2. James Brown — I Got You (I Feel Good) (1965): 12-bar blues form played as funk; baritone-sax riff hook.
3. James Brown — Cold Sweat (1967): widely cited as the first true funk record; one-chord D7 vamp, everything-is-a-drum arranging, "give the drummer some" break.
4. James Brown — Get Up (I Feel Like Being a) Sex Machine (1970): Bootsy Collins root/octave bass; two-chord vamp + "take it to the bridge" release.
5. James Brown — Funky Drummer (1970): Stubblefield ghost-note 16th grammar; the most-sampled break blueprint.
6. James Brown — Super Bad (1970): scream-as-hook; horn stab punctuation.
7. James Brown — The Payback (1973): minor-9 vamp, wah scratch guitar, whispered chant hook.
8. The J.B.'s — Pass the Peas (1972): horn riff as the entire melody over 2-chord vamp.
9. The Meters — Cissy Strut (1969): 2-bar C-minor-pentatonic guitar riff as melody; broken second-line drum groove (between straight and swung 16ths).
10. The Meters — Look-Ka Py Py (1969): four 1-bar interlocking cells, no "song" at all.
11. The Meters — Hey Pocky A-Way (1974): second-line displaced kick; parade beat into funk.
12. Sly & the Family Stone — Thank You (Falettinme Be Mice Elf Agin) (1969): Larry Graham thumb-slap archetype; bass IS the hook.
13. Sly & the Family Stone — Family Affair (1971): drum box + Rhodes; slow-funk template.
14. Stevie Wonder — Superstition (1972): layered clavinet 16th interlock; Eb minor-pent riff hook.
15. Tower of Power — What Is Hip? (1973): Rocco Prestia muted straight-16th pump bass.
16. Average White Band — Pick Up the Pieces (1974): sax unison riff over dorian vamp; instrumental hook form.
17. Kool & the Gang — Jungle Boogie (1973): horn-stab hook + chant.
18. Parliament — Give Up the Funk (Tear the Roof off the Sucker) (1976): chant-hook stacking; gang-vocal call-response.
19. Parliament — Flash Light (1977): Bernie Worrell multi-Minimoog keyboard bass, chromatic ascending/descending line; template for all synth-funk bass.
20. Funkadelic — One Nation Under a Groove (1978): E9 skank, choir chant hook; (Not Just) Knee Deep (1979) for the endless one-chord synth-bass vamp.

### A2. Harmony
- **Riff-over-static-harmony genre.** Harmonic rhythm: 1 chord per 4–16 bars. Chord changes are EVENTS, not wallpaper.
- Families: **(F1)** static I7/I9 vamp, Mixolydian (Cold Sweat, One Nation) — the "James Brown chord" is 7#9 or 9, voiced rootless. **(F2)** static i7/i9, Dorian (The Payback, Cissy Strut, Pick Up the Pieces). **(F3)** two-chord oscillation I7↔IV7 or i7↔IV7 (Sex Machine), 2 bars each. **(F4)** the Bridge: after 8–16 vamp bars, move to IV7 (or bVI–bVII–i walkup) for 4–8 bars, then return "on the one". **(F5)** legacy 12-bar blues at funk tempo (I Got You).
- Qualities: 9ths and 7#9 standard; 9sus4 for stab color; NO maj7 (that's soul/R&B). Blue b3 sounds against major 3 constantly (that's the #9).
- Cadences: almost none. bVII→I7 backdoor into the vamp restart is the only common cadence. Chromatic bass approach into the One (b7–7–1 or b2→1 from above) is P-Funk signature.

### A3. Comping / chord groove (guitar, clav, keys)
1. **Nolen chank** (Papa's Bag, Sex Machine): hits 0.5,1.5,2.5,3.5 dur 0.10–0.15 vel 95–105; ghost dead-note scratches on remaining 16ths vel 28–42. Swing 50–54. Voicing: top-4-note rootless 9th, register C4–C6. Staccato is non-negotiable.
2. **16th scratch + accent stab** (Give It Up, The Payback wah): continuous 16th mutes vel 25–40; voiced hits at 0 (dur 0.25 vel 118) and 2.5 (dur 0.2 vel 108). Swing 54–58.
3. **The One stab** (Flash Light, Jungle Boogie horns): single hit at 0, dur 0.25–0.5, vel 120, then SILENCE to 2.5 or full bar. Horn/keys 9th chord. Use every 2 or 4 bars, not every bar.
4. **Riff-comp** (Cissy Strut, Look-Ka Py Py): no chords at all — a 2-bar single-note/dyad minor-pent riff occupies the comp slot. Grammar: bar1 = 5–7 hits front-weighted (e.g. 0,0.5,0.75,1.5,2.0,2.75,3.5), bar2 = 3-hit answer (0,0.5,1.0) + space. Vel 100 flat with dur 0.15.
5. **Clav interlock** (Superstition): two parts. A: 0,0.75,1.5,1.75,2.5,3.25; B fills complementary 16ths; durs 0.12; vel alternating 100/72; swing 55–58. GM 8.
6. **E9 skank** (One Nation): 0 (dur 0.75 vel 102), 1.5 (0.15, 95), 2.5 (0.15, 95), 3.5 (0.15, 88).

### A4. Bass archetypes
1. **Root-octave pump** (Bootsy, Sex Machine) `NEW-ENUM rootOctave16`: 0(1,0.5,v118) 1.5(1,0.25) 1.75(1',0.25) 2.5(1,0.25) 3.0(b7,0.25) 3.5(1,0.5). Register E1–E2, fingered, 1–2 dead notes/bar vel 35.
2. **One-anchor sparse** (Cold Sweat era): 0(1,0.75,v122) 2.5(5,0.25,v92) 3.5(b7,0.25,v88 — approach into next One). Space IS the line.
3. **Thumb slap** (Larry Graham, Thank You) `NEW-ENUM slapPop`: thumb 1 at 0 and 2.0 vel 122; pop 1' (or 10th) at 1.5 and 3.5 vel 116; dead-note 16ths at 0.75,1.25,2.75,3.25 vel 32.
4. **Minimoog chromatic glide** (Flash Light, Knee Deep — maps to existing glide808): mostly 8ths, legato, portamento 60–120 ms; interval content 1,5,b7 plus chromatic 3-note approach runs (6–b7–7–1 ascending, b3–2–b2–1 descending) landing on the One. Register C1–C2.
5. **Muted 16th pump** (Rocco, What Is Hip?): all 16 sixteenths, dur 0.18, vel 88–100 (accent 0 and 2.0 at 108), pitch = 1 with b7 on 3.75 and 5 on 1.75 once per 2 bars. Busy but LOW energy variance.
6. **Second-line strut** (George Porter Jr., Cissy Strut): 0(1,0.5) 0.75(5,0.25) 1.5(1,0.5) 2.75(b7,0.25) 3.25(1,0.5); play 10–20 ms behind the drums; swing 55.

### A5. Melodic hook grammar
- Hooks are **riffs and chants, not tunes**. Scale: minor pentatonic + b5 blue note over Dorian vamps; major pent + b3 grace over Mixolydian. Ambitus ≤ P5–m7. Length 1–2 bars, repeated 4–8×, variation only on the 4th repeat (turnaround). Call-response: 1-bar instrument call + 1-bar chant/horn answer.
- Register: riff 1–2 octaves above bass (G3–C5); horn unison lines; chant hooks sit below sung register.
- Rhythm cells (1 bar each): **FC1** front-load+answer [(0,.25),(0.5,.25),(0.75,.5),(2.0,.25),(2.5,.75)] · **FC2** anticipation pair [(0,.75),(1.5,.25),(1.75,.25),(2.5,1.0)] · **FC3** offbeat chain [(0.75,.25),(1.25,.25),(1.75,.25),(2.25,.25),(3.0,.5)] · **FC4** sparse push [(0,.5),(2.5,.5),(3.5,.5 tie→next bar)] · **FC5** double-time burst [(0,.25),(0.25,.25),(0.5,.25),(1.0,.5),(2.0,.25),(2.25,.25),(2.5,.5)] · **FC6** off-the-One start [(1.5,.25),(1.75,.25),(2.0,.5),(3.5,.5)] (use after a One stab) · **FC7** horn shake [(0,.125),(0.125,.125),(0.25,.25),(2.0,.125),(2.125,.125),(2.25,.25)] · **FC8** scream/hold [(0,3.5),(3.5,.5)].
- Contour: descend from 4/5 to 1 (blues fall); end on 1 or b7. Articulation: horn fall = pitch-bend down 2–3 semitones over final 0.2 beats; scoop = start −1 semitone, resolve in 40 ms; guitar slide ≈ grace 16th a half-step below target, vel −20.
- **Original example cells** (minor pent, Dorian vamp): **H1** b3'(0,.25) 1'(0.5,.25) b7(0.75,.5) 5(2.0,.25) 1(2.5,.75). **H2** call/response 2 bars: bar1 1(0,.25) 1(0.25,.25) b3(0.5,.5) 4(1.5,.25) #4(1.75,.25) 5(2.0,1.0); bar2 5(1.5,.25) 4(1.75,.25) b3(2.0,.5) 1(2.5,1.0). **H3** (Mixolydian horn hook) 1'(0,.75) b7(1.5,.25) 5(1.75,.25) 6(2.0,.5) 1'(3.5,.5 tie).

### A6. Instrumentation (GM, 1-based)
- Comp: 29 Muted El. Guitar (chank/scratch), 28 Clean El. Guitar (riffs), 8 Clavi (Superstition grid), 18 Percussive Organ (stabs). Lead/hook: 62 Brass Section (unison riffs), 67 Tenor Sax, 57 Trumpet; 81 Square Lead for P-Funk synth hooks.
- Bass: 34 Fingered, 37 Slap Bass 1, 39 Synth Bass 1 (Moog glide).
- Drums: dry tight kit; snare ghosts vel 25–45 filling 16ths; hat 16ths w/ accent scheme 108/70/85/70; open-hat splash at 3.75 into section tops; second-line = kick displaced to 0, 1.75, 2.5.

### A7. Arrangement
- 8/16-bar vamp sections; the ONLY harmonic event is the Bridge (4–8 bars) then back. Breakdown to drums+bass (4–8 bars) mid-song; 1–2 bar drum-only break ("give the drummer some"). Horns tacet in verse 1, enter at bar 9. Full-band accent on the One every 4 bars. Energy = layer count, not chord motion.

### A8. Corny traps
1. Chords changing every 1–2 bars → funk dies. Fix: 1 chord ≥8 bars; color from stabs/riff only.
2. No ghost notes anywhere → drum-machine stiffness. Fix: 16th ghosts vel 25–45 on snare + dead-note scratches in comp/bass.
3. Flat velocity → MIDI-demo corny. Fix: accent map One=118–124, upbeats 92–104, ghosts 25–45.
4. Sustained pad comping → wrong genre. Fix: all comp durs ≤0.25 (except deliberate One stabs).
5. Plain triads → use rootless 9th/7#9 4-note voicings.
6. Wrong swing: full shuffle (66) or dead straight everywhere. Fix: 16th swing 54–58; Meters feel = 55 ± human jitter ±10 ms.

### A9. Public-domain lifts
Funk canon itself (post-1965) is protected — lift from its New Orleans/blues roots: 1. **When the Saints Go Marching In** (trad; melody PD — avoid specific 20th-c. arrangements). 2. **Oh, Didn't He Ramble** (1902, Handy/Cole–Johnson): second-line standard. 3. **St. Louis Blues** (W.C. Handy, 1914): the habanera bass vamp + blues melody, fully liftable. 4. **Tiger Rag** (pub. 1917). 5. **Hesitation Blues** (pub. 1915). 6. **Careless Love** (trad.; Handy's "Loveless Love" 1921). Trap: "Iko Iko"/"Hey Pocky A-Way" FEEL trad but are protected compositions (litigated) — write original second-line cells instead.

---

## GENRE B — MOTOWN / STAX SOUL (deepen existing soul pack)

### B1. Canon
1. The Temptations — My Girl (1965): the major-pent climbing intro riff archetype (bass+guitar unison); I↔IV verse vamp.
2. Smokey Robinson & the Miracles — The Tracks of My Tears (1965): I–IV–V with arpeggiated guitar intro; doo-wop→soul bridge.
3. Four Tops — I Can't Help Myself (1965): tambourine-stacked backbeat; secondary-dominant chains.
4. Four Tops — Reach Out I'll Be There (1966): minor-verse→major-chorus contrast; gallop rhythm.
5. The Supremes — You Can't Hurry Love (1966): the "Motown stomp" — snare on ALL four beats + tambourine 8ths; Jamerson syncopation on top.
6. The Supremes — Where Did Our Love Go (1964): stomp + handclap stack, 2-chord economy.
7. Martha & the Vandellas — Dancing in the Street (1964): one-chord verse vamp + horn stabs (proto-funk inside Motown).
8. Stevie Wonder — Uptight (Everything's Alright) (1966): 3-chord stomp at max energy.
9. Jackson 5 — I Want You Back (1969): cyclical I–V/vi–vi–IV–I climb; scalar bass runs as hook glue.
10. Marvin Gaye — I Heard It Through the Grapevine (1968): minor i vamp w/ bVII; Wurlitzer riff hook; half-time menace.
11. Marvin Gaye — What's Going On (1971): Imaj7–vi7 jazz-soul; THE Jamerson line (chromatic passing tones, open strings, one-finger 16th syncopation).
12. Booker T. & the M.G.'s — Green Onions (1962): 12-bar minor riff (i–IV–V), organ riff-as-melody.
13. Wilson Pickett — In the Midnight Hour (1965): delayed backbeat (whole band leans late), I↔IV gospel vamp.
14. Sam & Dave — Soul Man (1967): Cropper slide-guitar fills, unison climb hook, horn riff.
15. Eddie Floyd — Knock on Wood (1966): ascending diatonic climb as section pivot.
16. Otis Redding — Try a Little Tenderness (1966): 12/8 ballad → double-time build; dynamic-arc arrangement model.
17. Otis Redding — (Sittin' On) The Dock of the Bay (1968): I–III7–IV major-mediant color.
18. Percy Sledge — When a Man Loves a Woman (1966): 12/8 descending-bass ballad (I–V/7–vi–I/5–IV).
19. Aretha Franklin — Respect (1967): one-chord verse stabs; stop-time; gospel call-response backing vox.
20. Aretha Franklin — I Never Loved a Man (1967): 6/8 gospel chording, Muscle Shoals Wurlitzer.

### B2. Harmony
- **Progression-driven.** Harmonic rhythm: 1–2 chords/bar; vamps (I↔IV) move every 1–2 bars.
- Families: **(S1)** I–vi–IV–V and I–vi–ii–V (doo-wop inheritance, 2 beats–1 bar each). **(S2)** gospel I↔IV oscillation (My Girl verse, Midnight Hour) incl. IV/1 (plagal over tonic pedal). **(S3)** I–iii–IV–V diatonic climb; unison 1-2-3-5 or 1-3-5-6 scalar climbs into new sections (Knock on Wood, Soul Man). **(S4)** major-mediant color: I–III7–IV (Dock of the Bay); V/ii, V/IV secondary dominants everywhere (I Can't Help Myself). **(S5)** minor: i–bVII–i vamp (Grapevine); i–bVI–bVII climb for drama. **(S6)** jazz-soul: Imaj7–vi7 w/ ii7–V7 turnarounds (What's Going On, My Cherie Amour). **(S7)** 12/8 ballad descent: I–V6–vi–I/5–IV(–iv) w/ stepwise bass.
- Qualities: bright root-position triads + add6/add9 on I; dom7 on V + secondaries; maj7 only in the jazz-soul wing. Line cliché I–I7–IV–iv–I. Cadences: gospel plagal IV→I and IV/5→I as often as V→I; deceptive V→vi for bridge lift; final-chorus modulation up 1 semitone (Motown signature).

### B3. Comping / chord groove
1. **Motown stomp** (You Can't Hurry Love): piano+guitar quarter-note chops 0,1,2,3 dur 0.2 vel 100; tambourine all 8ths vel 90; snare on all four quarters. Swing 50 (STRAIGHT).
2. **Backbeat chop** (Cropper; Midnight Hour, Soul Man): single stab at 1.0 and 3.0, dur 0.15–0.25, vel 106. Midnight-Hour variant: delay both to 1.06/3.06 (≈25 ms late at 112 BPM). Register: guitar top-3-string triads D4–G5.
3. **Pent-climb riff comp** (My Girl archetype): 1-bar unison arpeggio, 8ths: 1(0) 2(0.5) 3(1.0) 5(1.5) 6(2.0) 1'(2.5), dur 0.4 each, vel 96 — grammar, not transcription: major-pent stepwise climb R→octave, launched from I, answered by silence bar 2.
4. **Gospel 12/8 roll** (Tenderness, When a Man): triplet 8ths — hits every 0.333, arpeggiated triads low→high, vel arc 68→95 peaking at beat 2.0, reset each bar. Piano or organ.
5. **Anticipation push**: chorus chords hit at 3.5 tied over the barline (vel 112), band accents together — Motown chorus lift.
6. **Organ glue** (Green Onions, Respect): sustained drawbar chord dur 4.0 vel 58 underneath + short answer stab at 2.5 (dur 0.5 vel 96) in the vocal gaps. GM 17.

### B4. Bass archetypes
1. **Jamerson syncopated walk** (What's Going On, I Was Made to Love Her) `NEW-ENUM jamersonWalk`: 6–10 notes/bar; R on the One (v115); 8th/16th syncopation; chromatic approach into every chord change (target−1 at 3.75, dur 0.25); passing 5,6,b7, occasional 10th; dead notes vel 40; register E1–G2. Feel: 16ths swing 52–54.
2. **Two-beat root-five** (ballads, early Motown — existing rootfifth): 1(0,1.0,v105) 5(2.0,1.0,v95) + chromatic 16th at 3.75 into next root.
3. **Pent riff unison** (My Girl, Green Onions): bass doubles the comp riff exactly, 8ths, major/minor pent, 1-bar loop ×4.
4. **Duck Dunn 8th pump** (Midnight Hour, Soul Man): straight 8ths on R vel 95–105, walkup 1–3–5–6 on beats 2.0–3.5 into each chord change; crescendo 90→115 through the walkup.
5. **12/8 gospel anchor**: R(0,1.5) 5(1.5,0.5) R(2.0,1.5) 3-or-6(3.5,0.5 walk); triplet feel, vel 100/85.
6. **Stomp lock**: quarters on R with the snare (0,1,2,3, dur 0.9, vel 102), 6→b7 pickup 16ths at 3.5–3.75 once per 4 bars.

### B5. Melodic hook grammar
- **Sung-hook-first genre**; call-response with backing vox is structural (lead 2-bar call, group 1-bar answer of ≤4 notes on the title lyric). Hook length 2 bars; schemes AAB (2+2+4) or antecedent/consequent 2+2. Scale: major pentatonic + b3→3 grace slide (blue); natural minor for minor keys; gospel melisma = 3–4-note pent run on one syllable (16ths).
- Contour: arch (leap up 4th/5th, stepwise descent); phrase ends on 3 or 5 more often than 1; final cadence lands 1. Register C4–C5 above the comp.
- Rhythm cells: **SC1** declarative [(0,.5),(0.5,.5),(1.0,1.0),(2.0,2.0)] · **SC2** pickup-and [(0.5,.5),(1.0,.5),(1.5,.5),(2.0,1.5)] · **SC3** dotted lilt [(0,.75),(0.75,.25),(1.0,.5),(1.5,.5),(2.0,1.0)] · **SC4** long-note start [(0,1.5),(1.5,.5),(2.0,1.0),(3.0,1.0)] · **SC5** triplet pickup (12/8) [(0,.33),(0.33,.33),(0.67,.33),(1.0,1.0)] · **SC6** bar-2 answer [(2.0,.5),(2.5,.5),(3.0,.5),(3.5,.5)] · **SC7** melisma burst [(0,.25),(0.25,.25),(0.5,.5),(1.0,.5),(1.5,2.5)] · **SC8** stomp chant [(0,.5),(1.0,.5),(2.0,.5),(3.0,1.0)].
- Articulation: grace note from b3 60 ms before beat (vel −25); end-of-phrase fall −2 semitones over 0.15 beats on ad-libs only.
- **Original examples** (major key): **M1** (SC3): 3(0,.75) 5(0.75,.25) 6(1.0,.5) 5(1.5,.5) 3(2.0,1.0) — arch, ends on 3. **M2** call+answer: bar1 5(0.5,.5) 6(1.0,.5) 1'(1.5,.5) 6(2.0,1.5); bar2 answer 3(2.0,.5) 2(2.5,.5) 1(3.0,1.0). **M3** minor (Grapevine-flavor, natural minor): 1'(0,.75) b7(0.75,.25) 5(1.0,.5) b6(1.5,.25) 5(1.75,.75) 1(2.5,1.5).

### B6. Instrumentation (GM)
- 1 Acoustic Grand (stomp chops), 5 EP1/Rhodes or Wurli (Grapevine, Muscle Shoals), 17 Drawbar Organ, 12 Vibraphone (Motown sparkle, doubling chorus chords vel 70), 49 String Ensemble (enter chorus 2, whole notes), 62 Brass Section (Stax stabs), 67 Tenor Sax + 58 Trombone unison, 28 Clean El. Guitar. Bass: 34 Fingered (P-bass w/ flatwounds + foam mute → set short decay/dur ≤0.9 of written). Baritone sax doubling bass line 1 octave up = Stax weight (GM 68 down an octave).
- Drums: snare+tambourine+handclap STACKED on backbeats (or all 4 beats for stomp); tambourine GM note 54; claps 39; minimal hat; no 16th ghosts (that's funk).

### B7. Arrangement
- Intro = hook riff 2–4 bars → verse 8–16 → chorus 8 → verse → chorus → bridge 8 ("middle 8", often to vi or IV) → stop-time 1 bar → final choruses w/ +1 semitone modulation. Strings/vibes tacet until chorus 2. Ballads: 12/8, build via drum entrance at verse 2 and horn pads at chorus. Energy = arrangement density + key lift, never tempo change (except Tenderness double-time coda).

### B8. Corny traps
1. Swung trap-style hats in Motown → wrong century. Fix: straight 8ths, swing ≤52, tambourine carries subdivision.
2. Backbeat = lone snare → thin. Fix: stack snare+tamb+clap, ±5 ms spread.
3. Bass = roots on downbeats → polka. Fix: Jamerson enum (chromatic approaches + 16th syncopation) or Dunn 8ths w/ walkups.
4. Jazz rootless voicings in 1965 context → anachronism. Fix: root-position triads/add6; save rootless for genre C.
5. Hook with no gang answer → not soul. Fix: bar-2 gap + ≤4-note group answer cell (SC6).
6. Only V→I cadences → churchless. Fix: plagal IV→I and IV/5→I at phrase ends; deceptive vi at bridge.

### B9. Public-domain lifts (goldmine — gospel/spiritual roots)
Melodies liftable verbatim (trad/pre-1931; avoid named modern arrangements): 1. **Wade in the Water** (pub. 1901). 2. **Swing Low, Sweet Chariot**. 3. **Nobody Knows the Trouble I've Seen**. 4. **Sometimes I Feel Like a Motherless Child**. 5. **Down by the Riverside** (pub. 1918). 6. **Just a Closer Walk with Thee** (trad). 7. **Amazing Grace** ("New Britain" melody, 1835). 8. **When the Saints Go Marching In**. 9. **St. Louis Blues** (1914). 10. **Georgia on My Mind** (1930 — entered US PD Jan 1 2026; composition only). Traps: "This Little Light of Mine" (Loes, ~1920s) has murky status — verify before shipping; Ray Charles's 1960 "Georgia" ARRANGEMENT is protected (lift Carmichael's melody, re-voice yourself); modern hymnal arrangements are copyrighted.

---

## GENRE C — 70s–90s R&B → NEO-SOUL (D'Angelo, Erykah Badu)

### C1. Canon
1. Stevie Wonder — As (1976): extended ii–V chains + pedal-point chorus; the harmonic source-code of neo-soul.
2. Earth, Wind & Fire — September (1978): maj7 planing, kalimba hook, 4-on-floor boogie.
3. Michael Jackson — Rock with You (1979): ii7–V–Imaj7 disco-R&B slickness; 16th guitar skank-lite.
4. Luther Vandross — Never Too Much (1981): octave-pop synth-era bass (Marcus Miller).
5. Marvin Gaye — Sexual Healing (1982): TR-808 + descending diatonic loop; drum-machine R&B born.
6. The S.O.S. Band — Just Be Good to Me (1983): Jam & Lewis synth-stab minimalism.
7. Guy — Groove Me (1988): Teddy Riley new jack swing — swung machine 16ths + gospel chords.
8. Bell Biv DeVoe — Poison (1990): NJS stab grid, chant hook.
9. Mary J. Blige — Real Love (1992): hip-hop soul — looped break + sung hook, zero variation loop aesthetic.
10. Jodeci — Freek'n You (1995): church chords over boom-bap.
11. TLC — Creep (1994): muted-trumpet loop hook; 2-chord vamp.
12. D'Angelo — Brown Sugar (1995): jazz voicings + hip-hop pocket.
13. Maxwell — Ascension (Don't Ever Wonder) (1996): one 2-chord loop entire song, arrangement-as-form.
14. Aaliyah — One in a Million (1996): Timbaland stutter programming, sparse sub bass, whisper hook.
15. Erykah Badu — On & On (1997): boom-bap + rootless Rhodes, laconic 3–5-note hook cells.
16. Lauryn Hill — Ex-Factor (1998): looped soul sample harmony, AAB hook.
17. D'Angelo — Untitled (How Does It Feel) (2000): the "drunk" behind-the-beat feel (Voodoo/Soulquarians w/ J Dilla influence; Questlove: "sloppy as hell... in the pocket"; Saadiq's "rubber band" feel); Pino Palladino bass laying 20–50 ms back.
18. Erykah Badu — Didn't Cha Know (2000, Dilla): chromatic 2-chord slide vamp; bass melody as hook.

### C2. Harmony
- **Chord-QUALITY-driven; loop-form.** Every chord ≥4 voices: maj7/9, m7/9/11, m6/9, 13sus4. Plain triads and plain V7 are genre errors (13sus or bVII9 substitute for V7).
- Families: **(R1)** ii7–V7–Imaj7 and iii7–vi7–ii7–V7 cycles (70s wing; 2 chords/bar). **(R2)** two-chord lush oscillation Imaj9↔iii7 or Imaj9↔IVmaj7 (1–2 bars each, looped ALL song) — neo-soul default. **(R3)** i9↔IV9 dorian vamp (funk inheritance w/ extensions). **(R4)** parallel planing: same shape slid whole/half step (bVImaj7–bVIImaj7–Imaj7; or m9 shapes a half step apart — Didn't Cha Know). **(R5)** gospel chain: I–V/vi–vi–V/ii–ii–V w/ tritone subs; approach ANY chord from a half-step above w/ same quality. **(R6)** backdoor cadence bVII9→Imaj7; plagal iv7→Imaj7; bIImaj7→Imaj7 slide.
- Harmonic rhythm: neo-soul 1 chord per 1–2 bars, 2–4-chord loop repeating 8–64×; 70s/80s wing 2/bar w/ real cadences. NJS: 4-chord gospel loop, 1/bar.

### C3. Comping / chord groove
1. **Rhodes float** (On & On, Untitled): dur 2.0–4.0, vel 55–75, rootless voicings (3-5-7-9 or 7-9-3-13), notes rolled low→high 20–40 ms apart, onset +15–30 ms BEHIND the grid. GM 5.
2. **Gospel chop-anticipation** (Jodeci, NJS ballads): 0(dur .75) 1.5(.25) 2.0(.75) 3.5(.5 tied, carries NEXT chord early); vel 88–100.
3. **NJS stab grid** (Poison, Groove Me): 0, 1.75, 2.5 dur 0.2 vel 110, synth-brass or DX-EP; hat swing 58–62.
4. **Disco skank-lite** (Rock with You): guitar 16ths at 0.5,0.75,1.5,2.5,2.75,3.5 dur 0.12 vel 88; swing 52–55.
5. **Drop-2 hymn** (Lauryn): block drop-2 voicings on quarters 0,1,2,3 dur 1.0 vel 80, passing dim7 between diatonic steps.
6. **Two-chord shimmer**: chord A bar 1, chord B bar 2; ornamental double-stop 16th fill at 3.25–3.75 vel 62 every other bar.

### C4. Bass archetypes
1. **808 sub glide** (Sexual Healing → One in a Million — existing glide808): R(0,2.0) then octave or 5th glide at 3.5, portamento 100–200 ms; ≤4 notes/bar; register C1–C2.
2. **Octave boogie pop** (Never Too Much, Rock with You) `NEW-ENUM octaveBoogie`: 1(0,.25) 1'(0.5,.25) 1(1.0,.25) 1'(1.5,.25) 1(2.0,.25) b7(3.5,.25) turn; vel 105 thumb / 100 octave; swing 52.
3. **Neo-soul cushion** (Pino, Voodoo) `NEW-ENUM neoCushion`: 1(0,1.5,v100) 5(2.5,.5,v85) chrom-approach(3.75,.25,v80); EVERYTHING +20–40 ms behind grid; muted fat tone (dur ×0.8).
4. **Hip-hop soul loop** (Real Love): fixed 1-bar cell repeated with ZERO variation (sample aesthetic): 1(0,.5) b7(1.75,.25) 1(2.0,.5) 5(3.25,.25) 1(3.5,.5).
5. **Gospel run fill**: between phrases, 16th pent run 3.0→4.0 (5–b7–1–2) landing next root, vel 92–110, once per 4 bars max.
6. **Bass-as-hook** (Didn't Cha Know): melodic 2-bar loop using 1, 5, 6, b7, 9 — the bass line IS the melody; keep melody lane sparse above it.

### C5. Melodic hook grammar
- Scales: major/minor pent + chord color tones — **land on 9, 6/13, or 3, not the root** (the #1 neo-soul marker). Melisma = 16th pent runs, max 1 per 2 bars. NJS hooks = chanted cells; neo-soul hooks = laconic 3–5 note motifs + space, sung behind the beat (+20–40 ms); 90s R&B = riff ×3 + varied 4th (turnaround).
- Contour: descending "sigh" from 9 or 5 toward 3; approach targets from a step ABOVE; call-response between lead and ad-lib octave above.
- Rhythm cells: **NC1** laconic [(0,.5),(0.75,.25),(1.0,1.0)] then silence · **NC2** Dilla displacement [(0.25,.25),(0.75,.25),(1.25,.25),(2.0,1.5)] with all onsets −0.05..−0.1 beat (drunk feel) · **NC3** melisma-into-hold [(0,.25),(0.25,.25),(0.5,.25),(0.75,.25),(1.0,.5),(2.5,1.0)] · **NC4** anticipated phrase-2 [(0,1.0),(1.75,.25),(2.0,.75),(3.5,.5)] · **NC5** NJS chant upbeats [(0.5,.25),(1.5,.25),(2.5,.25),(3.5,.25)] · **NC6** 90s swag dotted [(0,.75),(1.0,.75),(2.0,.75),(3.0,1.0)] · **NC7** 2-bar long-note hook [(0,3.0)] + bar-2 answer run [(0.5,.25),(0.75,.25),(1.0,.5),(2.0,1.5)].
- Articulation: grace slide from −1 or −3 semitones, 30–60 ms; phrase-end fall −2 st over 0.15 beats; breathy doubling = same line vel −30 on 54 Voice Oohs.
- **Original examples**: **N1** over Imaj9 (NC1): 5(0,.5) 3(0.75,.25) 2(1.0,1.0) — ends on the 9. **N2** over i9↔IV9 vamp, 2 bars: bar1 b3(0,.5) 4(0.75,.25) 5(1.0,.75) 4(2.0,.5) b3(2.5,1.0); bar2 (over IV9) 2(1.0,.5) 1(1.5,.5) 6(2.0,1.5) — lands on 13 of IV. **N3** NJS chant (NC5): 1(0.5,.25) 1(1.5,.25) b3(2.5,.25) 4(3.5,.25).

### C6. Instrumentation (GM)
- 5 EP1 Rhodes (neo-soul core), 6 EP2/DX (80s–NJS), 8 Clavi (70s wing), 17 Organ (gospel pads vel 55), 63 Synth Brass (NJS stabs), 90 Warm Pad (behind everything vel 45), 54 Voice Oohs (BGV pads), 60 Muted Trumpet (Creep-style loop hooks), 67 Tenor Sax. Bass: 39/40 Synth Bass (808 sub: filter closed, no velocity layers), 34 Fingered (neo-cushion: dur ×0.8, vel ≤105), 37 Slap (early-80s only).
- Drums: 90s = boom-bap kick v120 + fat snare v110, hats swung 56–62; neo-soul = tight kit, cross-stick GM 37 instead of snare, NO crash washes; Timbaland = kick stutters (0, 0.375 double) + silence gaps; NJS = machine 16th hats w/ accent every 3rd 16th once per bar.

### C7. Arrangement
- 4-bar loop is the atom. Verse = loop ×4, pre 4 bars, chorus 8. Neo-soul: ONE 2–4-chord loop for the whole song; form = layer choreography (bars 1–8 keys+bass; +9 hat; +17 hook; drop everything but bass+vox for 4 bars mid-song; final section adds ad-libs octave up). Timbaland: mute the beat on bar 4 of every 4-bar cell (beat 3.0→4.0 silence). NJS: 2-bar drum intro, hits on 3.75 pushes.

### C8. Corny traps
1. On-grid quantization in neo-soul → sterile. Fix numbers: snare +15–30 ms late, bass +20–40 ms, keys +10–25 ms, hat straight; OR global NC2 displacement −0.05..−0.1 beat on melody only.
2. Hook lands on root every phrase → nursery rhyme. Fix: end on 9, 3, or 13.
3. Plain triads / plain V7 → demo-song corny. Fix: every chord ≥4 notes; V7→13sus4 or bVII9.
4. Melisma everywhere → talent-show. Fix: ≤1 run per 2 bars, only at phrase ends.
5. Straight machine hats in NJS → drum-machine preset. Fix: 16th swing 58–62 + accent scheme.
6. Chord changing every bar in a neo-soul loop → restless. Fix: 2 chords per 4–8 bars; color via bass fills and Rhodes rolls instead.

### C9. Public-domain lifts (jazz-standard roots, through 1930)
Compositions now PD in the US (recordings are NOT — re-render, never sample): 1. **Georgia on My Mind** (1930). 2. **I Got Rhythm** (1930 — rhythm-changes progression AND melody). 3. **Body and Soul** (1930). 4. **On the Sunny Side of the Street** (1930). 5. **Exactly Like You** (1930). 6. **Ain't Misbehavin'** (1929). 7. **After You've Gone** (1918). 8. **St. James Infirmary** (trad melody; the 1929 "Joe Primrose" credit is a claim on an arrangement — ship the trad strain, flag for review). 9. **Careless Love** (trad). 10. **Motherless Child** (spiritual, for the Badu-adjacent mood). Traps: "Summertime" is 1935 — NOT PD yet; famous recorded arrangements (Ray Charles 1960, Billie Holiday phrasing) remain protected — lift the published-sheet melody only, re-voice in-house.

---

## Cross-cluster engine notes (cheap wins)
- New bass enums needed: `rootOctave16`, `slapPop`, `jamersonWalk`, `octaveBoogie`, `neoCushion`; existing `glide808`, `rootfifth`, `skank`, `walking` cover the rest.
- Pack schema needs per-pattern **velocity maps** (accent/upbeat/ghost triplets like 120/95/35) and a **micro-offset field** (ms, per-lane) — the single biggest de-corny lever across all three genres.
- Comping needs **multiple patterns per pack** (staccato stab vs pad is a genre axis) and a per-pattern `durBeats` ≤0.25 option — one sustained-only rhythm is why current output reads corny in funk.

**Verification sources:** [Cold Sweat — Wikipedia](https://en.wikipedia.org/wiki/Cold_Sweat) · [Flash Light — Wikipedia](https://en.wikipedia.org/wiki/Flash_Light_(song)) · [Attack Magazine: Remaking Flash Light](https://www.attackmagazine.com/technique/synth-secrets/how-to-remake-flash-light-by-parliament/) · [Britannica: Jamerson style](https://www.britannica.com/question/What-was-James-Jamersons-signature-bass-style) · [Guitar World: Motown master Jamerson](https://www.guitarworld.com/features/the-sound-and-style-of-motown-master-james-jamerson) · [Slate: Questlove & D'Angelo on Voodoo](https://www.slate.com/articles/arts/music_box/2013/02/behind_the_scenes_with_questlove_and_d_angelo_on_voodoo.html) · [Voodoo — Wikipedia](https://en.wikipedia.org/wiki/Voodoo_(D%27Angelo_album)) · [Cissy Strut — Wikipedia](https://en.wikipedia.org/wiki/Cissy_Strut) · [Public Domain Day 2026 (1930 works incl. Georgia on My Mind, I Got Rhythm)](https://copyrightlately.com/public-domain-2026/) · [CBS: 2026 public domain](https://www.cbsnews.com/news/new-public-domain-works-2026/)