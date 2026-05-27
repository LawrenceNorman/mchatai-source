# Video Muxer — Service Context

> Read this before adding endpoints, options, or post-processing steps. The service is intentionally a thin shim over `ffmpeg` (~200 LOC of Python). Most extensions are 20-50 LOC PRs that ship without an app rebuild.

## Purpose

Mux a screen recording (MP4) with narration audio (WAV/MP3) into a YouTube-ready MP4. This is the "audio side" of the marketing-video pipeline:

```
XCUITest demo flow
    ↓
[simctl recordVideo]  →  recording.mp4
        ↓
[ScriptCreator]  ←  sidecar timeline JSON
        ↓                                  
narration.wav  →  [video-muxer /mux]  →  final.mp4 (YouTube-ready)
recording.mp4 ──/
```

This service does **not** generate scripts, drive UI, record screens, or compose timelines. It muxes A + V into an output container.

## Callers (today)

| Caller | Endpoint | Trigger |
|---|---|---|
| `marketing.muxVideo` JS skill | `POST /mux` | Pipeline step in `marketing-youtube-tutorial-with-mux` |

## Callers (planned)

| Caller | Endpoint | Trigger | Phase |
|---|---|---|---|
| Phase D real-device recording flow | `POST /mux` | After ReplayKit recording + audio gen complete | D |
| Hub-publish "Demo Reel" pipeline | `POST /mux` | A community user bundles their app's demo + voiceover | (future) |
| Podcast → video flow | `POST /mux` | A podcast WAV gets paired with a still-image MP4 | (future) |

## Why this is a microservice (not a Swift built-in)

Two rules from `CLAUDE.md`:

1. **Absolute Rule #1** — shipped binaries are skeletons. Bundling ffmpeg means an App Store cycle for every tweak. Microservice means git-PR-then-zero-rebuild.
2. **Absolute Rule #2** — user compute runs on user machines via mChatAIShell. ffmpeg lives there. Never centralize on mchatai.com.

If you find yourself wanting to add a "ship this as a builtin Swift skill" path, stop and re-read Absolute Rule #2.

## Extension catalog (cheap follow-up PRs)

Each of these is a small, low-risk extension that ships to users by merging a PR — no rebuild. Listed in rough priority order:

1. **LUFS audio normalization** — add `loudnorm_target_lufs` option, append `-af loudnorm=I=<n>:LRA=11:TP=-1` to the filter chain. ~20 LOC.
2. **Bumper / outro** — add `bumper_path` + `outro_path` options, concat with `-f concat`. ~50 LOC.
3. **Audio ducking under bed music** — add `background_music_path` + `duck_db` options, use `sidechaincompress`. ~40 LOC.
4. **Subtitle burn-in** — accept the sidecar timeline JSON directly, generate an SRT, burn via `-vf subtitles=`. ~80 LOC.
5. **Vertical reframe for Shorts/TikTok** — add `aspect_ratio` option, pad/crop with `-vf scale=...,pad=...`. ~30 LOC.

Each extension should be **opt-in via a request option**, default OFF, so existing callers don't change behavior.

## Failure modes worth knowing

- **ffmpeg not on PATH** — returns HTTP 503 with install hint. The MICROSERVICE.md `preconditions` block should also surface this at install time.
- **Audio duration < video duration with `shortest: true`** — the output is silent after the audio ends. Intentional; if you want to extend, leave it false and add an outro card.
- **Video codec is not h264** — `-c:v copy` will still pass through fine (e.g., HEVC). YouTube accepts both. If you need re-encoding, that's a future option, not the default.
- **Output path not writable** — HTTP 500 with the ffmpeg stderr surfaced (truncated to 1000 chars). Don't paper over this with a silent fallback.

## Testing the service locally

```bash
# 1. Install ffmpeg if needed
brew install ffmpeg

# 2. Start mChatAIShell (which mounts this microservice)
# … then …

# 3. Call /mux directly
curl -X POST http://127.0.0.1:7711/svc/video-muxer/mux \
  -H 'Content-Type: application/json' \
  -d '{
    "video_path": "/tmp/recording.mp4",
    "audio_path": "/tmp/narration.wav",
    "output_path": "/tmp/final.mp4",
    "options": { "fade_in_ms": 250, "fade_out_ms": 500 }
  }'

# 4. /info to inspect ffmpeg version + defaults
curl http://127.0.0.1:7711/svc/video-muxer/info
```
