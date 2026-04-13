---
artifact:
  type: microservice
  id: official.qz-media-processing
  name: QZ Media Processing
  version: 1.0.0
  created_by: AIWizard
  created_at: 2025-04-10
  updated_at: 2026-04-12

purpose:
  summary: FFmpeg-based audio/video processing service — splices, converts, and compresses media with zero LLM token cost.
  problem_solved: Quiz/podcast workflows need to combine audio segments (TTS narration + intro music + question audio) without burning LLM compute tokens.
  intended_users: qz-workflow-orchestrator, podcast pipeline, any mChatAI service needing media manipulation

architecture:
  language: python
  frameworks: [FastAPI, Pydantic]
  platform: cloud
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: []
  storage: none (stateless — input/output via base64 in request/response body)

development:
  main_file: main.py
  config_file: manifest.json
  entry_points:
    - "POST /splice-audio — combine multiple base64 audio segments into one"
    - "POST /convert-audio — transcode between formats (mp3, wav, ogg, m4a)"
    - "POST /compress-audio — reduce file size for streaming/storage"
    - "_check_ffmpeg() — called at startup, fails fast if FFmpeg missing"
  build_command: pip install -r requirements.txt
  test_command: uvicorn main:app --reload, then POST to /health
  deploy_command: gcloud run deploy qz-media-processing --source . --region us-central1

deployment:
  platform: Cloud Run
  environment_vars: []
  health_check: GET /health returns {"status":"healthy","ffmpeg":true}

known_issues:
  - No timeout on FFmpeg subprocesses — a corrupt input file can hang the process
  - No file size validation on input — very large base64 payloads may OOM the container
  - Currently single-threaded — concurrent requests queue up; increase Cloud Run instances for throughput
tags: [audio, video, ffmpeg, media, processing, cloud-run, zero-token]
---

## What This Does
Stateless REST service wrapping FFmpeg. Accepts base64-encoded audio segments, processes them (splice/convert/compress), and returns base64-encoded output. No database, no auth, no LLM calls — pure compute. Deployed on Cloud Run.

## How to Continue Building This
Most requested: video support, waveform extraction for UI display, streaming output for large files.

### Critical Entry Points
- **`POST /splice-audio`** in `main.py` — the primary endpoint. Takes `audio_segments_base64: [string]` and `format: "mp3"`. Writes temp files, runs FFmpeg concat, returns combined base64. Add new audio operations here.
- **`_check_ffmpeg()`** at module load — returns `FFMPEG_AVAILABLE` bool. If False, all endpoints return 503. The Dockerfile installs FFmpeg; verify it's in the image if this fails.
- **`SpliceAudioInput` / `SpliceAudioOutput`** Pydantic models — define the API contract. Add new fields here first, then implement in the endpoint.

### Key Concepts
- All I/O is base64 in JSON body — no file uploads, no multipart. Keeps the API simple but means large files = large payloads (1MB audio ≈ 1.33MB base64).
- FFmpeg runs as a subprocess via `subprocess.run()` — not a Python binding. Check subprocess return code and stderr for errors.
- Stateless and idempotent — the same inputs always produce the same output. Safe to retry on failure.
- Zero token cost by design — this service exists specifically to do compute without calling any LLM.

## Testing
```bash
# Start locally
pip install -r requirements.txt
uvicorn main:app --reload --port 8080

# Health check
curl http://localhost:8080/health

# Splice test (use small base64 audio strings)
curl -X POST http://localhost:8080/splice-audio \
  -H "Content-Type: application/json" \
  -d '{"audio_segments_base64": ["<base64_audio_1>", "<base64_audio_2>"], "format": "mp3"}'
```
Verify: response contains `audio_base64` and `duration_seconds > 0`.

## Deployment
```bash
gcloud run deploy qz-media-processing \
  --source . \
  --region us-central1 \
  --memory 1Gi \
  --cpu 1 \
  --concurrency 10
```
FFmpeg is installed in the `Dockerfile` — the base image must include it or the service fails at startup.

## If You're Stuck
- **"ffmpeg not found" error?** Check Dockerfile — `RUN apt-get install -y ffmpeg` must be present. Rebuild the image.
- **Hang on large files?** Add `timeout=30` to `subprocess.run()` calls. Return 504 on timeout.
- **OOM crash on Cloud Run?** Increase `--memory` flag. A 10-minute audio file decoded from base64 needs ~200MB RAM for FFmpeg processing.
- **Corrupt output audio?** Check that temp files are written with correct extensions — FFmpeg infers codec from file extension.
