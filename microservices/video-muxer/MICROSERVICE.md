---
name: Video Muxer
version: 0.1.0
description: Mux a screen recording (MP4) with narration audio (WAV/MP3) into a YouTube-ready MP4 via ffmpeg. The audio side of the marketing-video pipeline; the video side stays untouched.
author: mChatAI
category: media
tags: [video, audio, mux, ffmpeg, marketing, youtube]
python_deps: [fastapi, pydantic]
bins: [ffmpeg, ffprobe]
preconditions:
  - bin: ffmpeg
    fail_message: "Install ffmpeg first. On macOS: `brew install ffmpeg`."
  - bin: ffprobe
    fail_message: "Install ffprobe (ships with ffmpeg). On macOS: `brew install ffmpeg`."
draft: false
endpoints:
  - path: /mux
    method: POST
    description: Mux a video file + audio file into a single MP4. Body fields documented below.
  - path: /probe
    method: POST
    description: Return ffprobe metadata (duration, codec, audio tracks) for a media file.
  - path: /info
    method: GET
    description: Capabilities, ffmpeg version, default options.
  - path: /healthz
    method: GET
    description: Liveness probe.
---

# Video Muxer

Headless audio/video muxing for the marketing-video pipeline. Takes:

- A screen recording (MP4 from `xcrun simctl io recordVideo` or ReplayKit)
- A narration audio file (WAV from Audio Script Creator)

And outputs:

- A muxed MP4 (H.264 video copy, AAC audio re-encode, `-shortest` to align durations)

**Design principle — wrap, don't reinvent.** This service is a thin shim over `ffmpeg`. We commit to a small, opinionated surface (mux, optional fades, optional audio gain). Anything more elaborate (titles, lower-thirds, B-roll insertion) belongs in a downstream NLE workflow, not here.

## Callers (today)

| Caller | Endpoint | Trigger |
|---|---|---|
| `marketing.muxVideo` JS skill | `POST /mux` | Pipeline step in `marketing-youtube-tutorial-with-mux` |

## Callers (planned)

| Caller | Endpoint | Trigger | Phase |
|---|---|---|---|
| Phase D real-device recording script | `POST /mux` | After ReplayKit recording + audio gen finish | D |
| Hub-publish "Demo Reel" pipeline | `POST /mux` | When a community wants to bundle their app's demo + voiceover | (future) |

## Endpoints

### `POST /mux`

Request body:

```json
{
  "video_path": "/abs/path/to/recording.mp4",
  "audio_path": "/abs/path/to/narration.wav",
  "output_path": "/abs/path/to/final.mp4",
  "options": {
    "fade_in_ms": 250,
    "fade_out_ms": 500,
    "audio_gain_db": 0.0,
    "shortest": true,
    "audio_bitrate_kbps": 192
  }
}
```

All `options` fields are optional. Defaults: no fade, 0dB gain, `shortest: true`, `audio_bitrate_kbps: 192`.

Response:

```json
{
  "status": "ok",
  "output_path": "/abs/path/to/final.mp4",
  "duration_sec": 87.4,
  "video_codec": "h264",
  "audio_codec": "aac",
  "size_bytes": 8421334
}
```

### `POST /probe`

Request body: `{ "path": "/abs/path/to/media.mp4" }`

Response: ffprobe stream metadata as JSON (passthrough).

### `GET /info`

Returns ffmpeg version, default options, supported features.

## Why a microservice (not a Swift built-in)

Per [CLAUDE.md Absolute Rule #1](../../../mchatai_macOS/CLAUDE.md), every framework-specific
or tool-specific bit that *can* live outside the shipped binary *should*. Bundling
ffmpeg into mChatAI+ means an App Store review cycle for every tweak. Shipping
this microservice through `mchatai-source` means improvements land in seconds.

Per [Absolute Rule #2](../../../mchatai_macOS/CLAUDE.md), compute runs on the user's
machine via mChatAIShell. ffmpeg lives there too. Never centralize on mchatai.com.

## Future tweaks (cheap PRs that ship without a rebuild)

- LUFS-target audio normalization (`-af loudnorm=I=-16`)
- Bumper / outro cards (still images concatenated before/after)
- Multi-track ducking (background music auto-lowered under narration)
- Subtitle burn-in from the sidecar timeline's speech segments
