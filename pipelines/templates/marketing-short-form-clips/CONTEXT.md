---
artifact:
  type: pipeline
  id: official.pipeline.marketing-short-form-clips
  name: Marketing Short-Form Clips
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-24
  updated_at: 2026-05-24

purpose:
  summary: Plan 3-5 short-form vertical clips (TikTok / YouTube Shorts / Instagram Reels) from a long-form video transcript or a topic.
  problem_solved: Every long-form YouTube video should produce 3-5 Shorts for the discovery surface. Lawrence does not have time to plan each clip himself; this pipeline produces a per-clip storyboard with hooks, beats, captions, end cards, and platform-tailored upload copy.
  intended_users: mChatAI marketing operator; reusable as a template for any creator doing long-to-short repurposing.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: [builtin.llmGenerate, builtin.saveArtifact]
  consumed_by: [custom.youtube-upload]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[0].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Marketing Short-Form Clips' --input '<paste a long-form transcript or a topic>'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [marketing, video, short-form, tiktok, youtube-shorts, reels, marketing-machine]
---

## What This Does

Single LLM pass that produces a markdown plan with:

- 3 to 5 clip blocks, each with: punchy title, duration (30-60s), source timestamp (if input is a transcript), hook (visual + on-screen text + voiceover), 3-5 beats with timestamps + captions, end card, and platform-tailored upload copy (TikTok / YouTube Shorts / Instagram Reels).
- A consolidated shot list grouped by 'screen recordings', 'B-roll', 'stock'.

Output is one `.md` artifact Lawrence reviews and uses as a shot list when cutting in CapCut or Final Cut.

## What This Does NOT Do (deliberately, for v1)

- **Actual video cutting.** Requires a `vertical-clipper` microservice (Phase MM-3.5) that takes the source video + the plan's timestamps and outputs MP4 files. v1 produces the plan; cutting is manual.
- **Caption burn-in.** Same microservice would burn the on-screen text from the plan into the cut.
- **Upload.** Use `custom.youtube-upload` for Shorts after cutting. TikTok / Reels upload skills are deferred (API gating per Phase MM-1 triage).

## How To Use (v1 workflow)

1. Run via AI Automation > Marketing Short-Form Clips:
   ```
   {"command":"runPipeline","pipelineName":"Marketing Short-Form Clips","input":"<long-form transcript with timestamps OR a single topic>","requestID":"sf-001"}
   ```
2. Open the plan. Pick the 1-3 clips you want to cut today (or all 5 if you have an editor lined up).
3. Cut in CapCut / Final Cut / Resolve using the plan's hooks + beats + captions as your timeline.
4. Burn captions in the editor (Open Captions style; most short-form viewers watch muted).
5. Export 9:16 vertical, 1080x1920, H.264.
6. Upload to YouTube Shorts via `custom.youtube-upload` with the plan's YouTube Shorts title. Upload to TikTok and Reels manually until those skills land.

## How to Continue Building This

- **vertical-clipper microservice**: Phase MM-3.5. ffmpeg + the plan's timestamps -> cut MP4s with hardcoded captions. Would close the auto-publish loop.
- **Auto-caption from audio**: Sibling skill that calls Whisper on the cut clips and burns captions. Today the LLM-generated captions are good but may drift from the actual audio.
- **Trend-aware hooks**: Pre-step that pulls current trending sounds/topics from TikTok and prepends them to the LLM input.
- **Per-platform pipelines**: When formats diverge enough (vertical reactions, story-mode clips, voice-only Reels), split into platform-specific pipelines.

### Critical Entry Points

- **`steps[0].config.userPrompt`** — the master prompt. The per-clip block format is load-bearing for any future microservice that parses it. The banned-phrases list and platform character limits should be respected; extend, don't shorten.

### Key Concepts

- **One LLM call, multiple clips.** Reduces token cost and keeps clip-to-clip consistency (you don't want clip 3 to repeat clip 1's hook).
- **Hook-first thinking baked into the prompt.** The "if the viewer is not held by second 3, they swipe" rule is repeated because every short-form algorithm rewards hold-rate.
- **One end card, every clip.** Repeated end card across a Shorts series builds brand recall.

## Testing

Input: a long-form transcript from a YouTube Tutorial (~15 min, with timestamps). Expect 4 clip blocks + a shot list. Inspect: each clip's hook should be visual + concrete (not "Today I'm going to show you..."). Each clip's end card should include a specific URL or recipe slug, not just 'follow for more'.

## Known Limitations

- **No video file ingestion**: The pipeline takes text. If your source is a video file, transcribe first via the existing `builtin.transcribeMedia` skill or `custom.youtube-upload` getVideo action (for YouTube videos with auto-captions).
- **Timestamp accuracy**: When fed a transcript without timestamps, the LLM hallucinates intra-clip beat times. Provide a timestamped transcript when accuracy matters.
- **Trend blindness**: No live data about what's trending on each platform; the plan is goal-of-the-creator-led, not platform-trend-led.
