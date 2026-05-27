# Marketing YouTube Tutorial With Mux — Pipeline Context

Mux a screen recording (MP4) with narration audio (WAV) into a YouTube-ready MP4.

## End-to-end flow this pipeline is part of

```
1. Record screen via XCUITest demo flow
   → mchatai/mChatAI/mChatAIUITests/Demos/LaunchDemoFlow.swift
   → mchatai_macOS/scripts/marketing/record-simulator-demo.sh LaunchDemoFlow
   → Output:  marketing/drafts/<flow>-<stamp>/{recording.mp4, timeline.json}

2. Generate narration audio from timeline.json
   → mChatAI+ → ScriptCreator → Import Timeline JSON
   → Cast voices, generate audio
   → Output:  ~/Library/Application Support/mChatAI/Scripts/<id>/<title>_final.mp3 (or .wav)

3. Mux video + audio into final YouTube MP4   ← THIS PIPELINE
   → runPipeline 'Marketing YouTube Tutorial With Mux' with JSON input
   → Output:  the muxed MP4 path returned in the artifact log
```

## Prerequisites before running this pipeline

- `video-muxer` microservice **installed** (Diagnostics → Install → Video Muxer).
  Verify: `curl http://127.0.0.1:7711/svc/video-muxer/healthz`
- `ffmpeg` + `ffprobe` on PATH (`brew install ffmpeg`).
- An MP4 recording, a WAV/MP3 narration, and an absolute output path you want the muxed file written to.

## Input shape

The pipeline expects its input text to be a JSON object matching the `/mux` request schema:

```json
{
  "video_path": "/abs/path/to/recording.mp4",
  "audio_path": "/abs/path/to/narration.wav",
  "output_path": "/abs/path/to/final.mp4",
  "options": {
    "fade_in_ms": 250,
    "fade_out_ms": 500
  }
}
```

All `options` fields are optional. Defaults: no fade, 0dB audio gain, `shortest: true`, 192 kbps AAC.

## Output

The microservice returns:

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

This JSON is saved as an artifact (`saveArtifact` step). The actual MP4 lives at `output_path` — pipeline artifacts don't copy the binary, just record the result.

## How to run

### From the tunnel

```bash
source /Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai_macOS/scripts/tunnel_helper.sh

tunnel_send "mux-001" '{
  "command": "runPipeline",
  "pipelineName": "Marketing YouTube Tutorial With Mux",
  "input": "{\"video_path\":\"/path/to/recording.mp4\",\"audio_path\":\"/path/to/narration.wav\",\"output_path\":\"/path/to/final.mp4\"}",
  "config": {},
  "requestID": "mux-001"
}' 90
```

### From mChatAI+ Pipelines UI

1. Open Pipelines.
2. Find "Marketing YouTube Tutorial With Mux".
3. Paste the JSON object as input text.
4. Run.
5. Check the artifact log for the muxed MP4 path.

## Audio generation — what's already there, what still needs wrapping

There's already substantial reusable machinery for the audio side:

| What | Where | Already callable from a pipeline? |
|---|---|---|
| `builtin.ttsGenerate` | `Skills/BuiltIn/TTSGenerateSkill.swift` | ✅ Yes — single-voice TTS (OpenAI / Google / ElevenLabs / Apple) |
| `builtin.podcastProducer` | `Skills/BuiltIn/PodcastProducerSkill.swift` (registered in `BuiltInSkillCatalog.swift:306`) | ✅ Yes — wraps content in a podcast-writing system prompt, then hands off to `LLMGenerate` |
| `PodcastScriptToProjectConverter.buildProject()` | `ScriptCreator/PodcastScriptToProjectConverter.swift` | Public static, but not yet a Skill |
| `ScriptAudioGenerationService.generateAudio()` | `ScriptCreator/ScriptAudioGenerationService.swift` | Public async, but not yet a Skill |
| `PodcastFromReportPipeline` (the existing AIWeb → "Turn into Podcast" flow) | `AIWeb/PodcastFromReportPipeline.swift` | UI-bound — drives the AIWeb agent + audio gen with a notification toast on completion |

**Option A — single-voice narration (ships today, no new Swift):**

```
[content] → builtin.llmGenerate (narration prompt) → builtin.ttsGenerate → narration.wav → /mux
```

This works **right now**. The narration is one voice, but for a 90-second marketing clip that's often fine. Add this as a sibling pipeline `marketing-youtube-tutorial-with-tts-narration` if you want zero-touch automation today.

**Option B — multi-voice with emotional tone (2-3 hours of Swift work):**

A new `builtin.scriptAudioGenerate` Swift skill that:

1. Reads the sidecar timeline JSON path from input
2. Calls `ScriptProjectManager.importTimelineJSON(at:)` (added Phase B)
3. Drives `ScriptAudioGenerationService.generateAudio()` non-interactively (no UI sheet)
4. Returns the final audio file path

Register under `.contentJobWorker` context in `BuiltInSkillCatalog` alongside `PodcastProducerSkill`.

When the Marketing Day Orchestrator wants playable-demo videos in the daily cycle, do Option B. Until then, Option A's single-voice path is shippable.

## Extension ideas (cheap PRs, no rebuild)

- Add a `marketing.muxVideo` JS skill wrapper that takes `videoPath` / `audioPath` / `outputPath` as flat config keys (no JSON construction). 30 LOC; drop into `mchatai-source/skills/marketing-mux-video/skill.js`.
- Add a sibling pipeline `marketing-youtube-tutorial-with-mux-and-subtitles` that calls a future `/mux-with-subtitles` endpoint once subtitle burn-in lands in video-muxer.
- Add a daily-cycle variant `marketing-day-orchestrator-with-video` that chains the demo recording + audio gen + mux when both bridges exist.
