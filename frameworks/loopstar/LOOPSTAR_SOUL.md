# LoopStar's soul — the sound identity, and what never to reach for

> Read this before choosing a single instrument, writing a character, a style
> pack, a jingle, or any prompt that names a sound. It is a design baseline, not
> a suggestion, and it exists because the default is easy to get wrong in a way
> that is instantly audible.

## The one-line version

**LoopStar sounds like a modern electronic instrument: 808s, lush synth pads,
saw leads, sub bass.** Techy and edgy by default. A DJ opening it should hear
something that makes them want to build, not something that sounds like the
theme to a 1950s game show.

## Why this is written down

The General MIDI bank is right there and it is a trap. Its brass, strings,
woodwinds and "orchestral" voices are low-resolution samples from a specification
older than most of the people using this app. A GM trumpet does not sound like a
trumpet; it sounds like a cheap keyboard pretending. Every time someone reaches
for one because a brief said "news" or "cartoon", the result is corny — and
corny is not a small aesthetic miss, it is the difference between an artist using
the tool and closing it.

This has now gone wrong twice. The song-book arranger carries a comment about
"the exact corny-GM failure this tool exists to avoid", and the first cut of the
jingle characters reached for muted trumpet, xylophone, clarinet, pizzicato
strings, banjo and bagpipes anyway. Hence a file.

## Never reach for these

Not "prefer alternatives" — **do not use them** unless the user explicitly asks
for that exact sound:

- **Brass**: trumpet, trombone, tuba, french horn, brass section (GM 56-63)
- **Winds and reeds**: clarinet, oboe, flute, sax, piccolo, recorder (GM 64-79)
- **Bowed strings**: violin, viola, cello, orchestral ensembles (GM 40-51)
- **Acoustic and clean electric guitars** (GM 24-31)
- **Novelty and ethnic**: banjo, bagpipe, sitar, shamisen, kalimba, ocarina,
  whistle, steel drums (GM 104-119)
- **The GM "Standard Kit"** for drums when an 808 or a synth kit will do

If a brief seems to demand one — "a jazz trio", "a bagpipe joke" — the user has
asked, and that is the exception. The word "news" is not a request for brass.

## Reach for these instead

**The app's own synth voices (programs 1000+, `LoopStarSynthVoice`) are the
first-class palette.** They are synthesised, not sampled, so they sound like
themselves rather than like a bad copy of something acoustic:

| Voice | What it is for |
|---|---|
| `widePad` | Lush chords. Six saws in two stereo groups plus a sub. The default pad. |
| `warmPad` | A slower, softer bed when `widePad` is too much. |
| `superSaw` | Trance/EDM hypersaw — big, bright, unmistakably electronic. |
| `hyperLead` | The EDM lead: wide detuned saws with a filter envelope. |
| `sawPluck` | Short filtered pluck — trap and drill leads. |
| `crystalBell` | FM bell with a sub and a detuned twin. Lofi and trap melodies. |
| `airLead` | Pure sine-harmonic lead with delayed vibrato. Hooks that float. |
| `fmPluck` | Two-op FM bell/pluck. Bright, percussive, clean. |
| `subSine` | Deep pure sub. Bass that is felt. |
| `reese` | Detuned-saw Reese. DnB and dubstep bass. |
| `acid` | 303-style resonant sweep. |
| `wobble` | LFO-swept resonant lowpass — the growl. |
| `squareLead` | Hollow PWM square. Retro without being twee. |

**Drums: the 808 and the synth kits**, not the GM Standard Kit. A tuned sub kick
and a noise snare read as intentional; the GM kit reads as a demo.

**Where GM is still fine**: synth pads (88-95), synth leads (80-87), electric
pianos (4-5), and the tuned percussion that is genuinely electronic in feel
(vibraphone 11, marimba 12) used sparingly. When in doubt, prefer a synth voice.

## How character is made without orchestral cliché

The corny instinct is to signal a subject with a literal instrument: news means
brass, cartoons mean xylophone, mystery means strings. Do it with **production**
instead, which is what modern music actually does:

- **News / urgency** — not a fanfare. A tight sub-kick pattern, a rising saw
  stab, negative space. Authority is space and low end, not trumpets.
- **Comedy / absurd** — not a slide whistle. Pitch-bent 808s, an off-grid
  triplet, a filter opening somewhere unexpected, a sound that arrives wrong.
- **Mystery / noir** — not tremolo strings. A detuned pad, a long delay, a
  filtered sub that never quite resolves.
- **Sports / big** — not a brass section. A hard 808 kick, a wide supersaw stab,
  a riser.
- **Warm / lifestyle** — not an acoustic guitar. A soft `warmPad`, an
  electric-piano figure, gentle sub.

**Space is an instrument.** Reverb, delay and filtering carry as much identity as
the note choice, and they are cheap. A dry pluck and the same pluck in a hall are
two different characters.

### Delay is TEMPO-SYNCED. Always.

A delay set in seconds is the single clearest tell of something not made by a
producer. At 128 BPM a 0.22s delay lands on nothing — it smears the groove and
makes the whole thing sound like a preset. A delay set to a NOTE VALUE locks into
the pulse and stops being an effect at all; it becomes part of the rhythm.

Write delay as a division, never a duration:

| Division | Seconds at BPM | Use |
|---|---|---|
| `1/4` | `60 / bpm` | Wide, dubby, spacious. |
| `1/8` | `30 / bpm` | The workhorse. Doubles the pulse. |
| `1/8d` (dotted eighth) | `45 / bpm` | The one that sounds expensive. Cross-rhythm against 4/4 without fighting it. |
| `1/8t` (eighth triplet) | `20 / bpm` | Rolling, trap-adjacent. |
| `1/16` | `15 / bpm` | Slapback. Tight, close, percussive. |

Dotted eighth is the default worth reaching for on a lead. Sixteenth is the right
slapback for something that must stay close and dry.

Reverb does not need syncing, but its DECAY should respect the piece: a
two-second hall on a two-second sting is mud.

## The test

Before shipping a character, a pack or a generated piece, ask:

1. Would a producer put this in a track, or does it sound like a stock demo?
2. Is any voice here pretending to be an acoustic instrument it cannot convince
   anyone it is?
3. If a DJ heard eight seconds of this with no context, would they want to make
   something?

If the honest answer to 2 is yes, change it. The user's words for this:

> "cracking 808 kicks and snares with some lush pads and sounds that sound good
> because they are not trying to sound like a 50s game show."

## When the user overrides

All of the above is the **default**, and defaults exist to be overridden. If
someone asks for an old-timey honky-tonk organ, a bagpipe, or a string quartet,
give them exactly that and do not editorialise. The rule is about what LoopStar
reaches for on its own, not about limiting what it can be asked for.
