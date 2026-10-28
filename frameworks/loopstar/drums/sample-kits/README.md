# LoopStar recorded drum kits

The iPhone LoopStar offers these kits to subscribers (Creator, Pro, Admin), next to its synth kits.
Each kit is ONE file on our download bucket, `https://storage.googleapis.com/mchatai-downloads/loopstar/kits/`
(where the Mac's instruments and pack audio live): every hit back to back, 0.1 s apart, so playing the
file auditions the kit. `index.json` here lists each kit's URL, sha256 and where each hit sits; the app
fetches a kit the first time it is picked, keeps it only if the sha256 matches, and keeps it on the
device. No audio goes into git (`frameworks/loopstar/**/*.wav` is ignored on purpose). To change a kit,
edit `../sample-kits.config.json` and run
`python3 frameworks/loopstar/drums/tools/build_sample_kits.py --upload --app-fallback <the app's loopstar_sample_kits_fallback.json>`.

## Sources and licences

Every sample here is **CC0 1.0** (public domain dedication): no attribution is required, and the
credits below are a courtesy. The licences were read at source on 2026-10-23; each source file's
sha256 is pinned in the config, so a changed upstream file fails the build instead of slipping in.

| Kit | Drums | Clap | Shaker / tambourine |
|---|---|---|---|
| Big Room Rock (`rec-big-room-rock`) | Big Rusty Drums, Karoryfer Samples (close mics with the overheads) | VCSL | Virtuosity Drums percussion |
| Studio Club (`rec-studio-club`) | Virtuosity Drums, Versilian Studios & Karoryfer Samples ("mid" stereo ribbon mic) | VCSL | Virtuosity Drums percussion |
| Dusty Vintage (`rec-dusty-vintage`) | Virtuosity Drums ("Vintage" 1950s mic), pitched down 2 semitones, 12-bit / 26 kHz, low-passed | VCSL | Virtuosity Drums tambourine |
| Crunchy Knock (`rec-crunchy-knock`) | Big Rusty Drums close mics, pitched down 3 semitones, 12-bit / 26 kHz, driven | VCSL | Virtuosity Drums tambourine |

- Big Rusty Drums, Karoryfer Samples — CC0 1.0 — https://github.com/sfzinstruments/karoryfer.big-rusty-drums (LICENSE); https://shop.karoryfer.com/pages/free-big-rusty-drums
- Virtuosity Drums, Versilian Studios LLC & Karoryfer Samples (drummer Austin McMahon) — CC0 1.0 — https://github.com/sfzinstruments/virtuosity_drums (LICENSE); https://versilian-studios.com/virtuosity-drums/
- VCSL (Versilian Community Sample Library), Versilian Studios LLC — CC0 1.0 — https://github.com/sgossner/VCSL (README)

## What the build does to them

Each voice: mono, 48 kHz, 16-bit; the attack at sample 0 (1 ms kept before 5 % of the hit's peak);
the tail cut under -60 dBFS or at the voice's longest; a 10 ms fade; peak -1 dBFS. Then a punch
stage (a lookahead limiter, at most 10 dB off the attack, 12 for kick and snare) so a kit plays about
as loud as the synth kits, with each voice balanced against the kick by measured loudness
(BS.1770); the per-voice gains are in `index.json`. Kit names avoid makers' trademarks.

No sample-playback machine (LinnDrum, SP-1200, MPC and the like) is sampled here: their sounds are
someone else's recordings. The "sampler" character of the hip-hop kits is our own processing of the
CC0 hits above.
