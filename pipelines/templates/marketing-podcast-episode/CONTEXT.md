---
artifact:
  type: pipeline
  id: official.pipeline.marketing-podcast-episode
  name: Marketing Podcast Episode
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-24
  updated_at: 2026-05-24

purpose:
  summary: Generate a complete weekly Made in mChatAI podcast episode (show notes + TTS audio) from a week's worth of topics.
  problem_solved: The marketing machine needs a 15-25 min weekly episode without each one consuming an hour of founder time. This pipeline produces 90% of the episode; the founder records the intro/outro in real audio and stitches as a post-production step.
  intended_users: mChatAI marketing operator (Lawrence); reusable as a template for any solo-host podcast workflow.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: [builtin.llmGenerate, builtin.ttsGenerate, builtin.saveArtifact]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[0].config.userPrompt, steps[2].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Marketing Podcast Episode' --input 'This week: shipped 9 of 12 distribution skills + built the marketing-machine surfaces on mchatai.com'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [marketing, podcast, audio, marketing-machine, weekly]
---

## What This Does

Five sequential steps:
1. LLM generates structured show notes in markdown (cold open / this week's build / recipe of the week / community spotlight / what's shipping next / links).
2. Saves show notes as `.md` artifact.
3. LLM converts the show notes into a spoken script (no markdown, natural transitions, ASCII only, TTS-friendly).
4. TTS skill generates the audio.
5. Saves audio as a separate artifact.

Two outputs land in the Pipeline Artifacts folder: the markdown notes file and the audio file.

## How To Use (v1 workflow)

1. Run via AI Automation > Marketing Podcast Episode, or via tunnel:
   ```
   {"command":"runPipeline","pipelineName":"Marketing Podcast Episode","input":"<this week's topics in plain text or bullets>","requestID":"pod-001"}
   ```
2. Listen to the audio. If TTS pronounces something wrong, edit the show notes (rule: spell out names phonetically) and re-run.
3. Optionally record a real intro / outro yourself; stitch via Audacity or ffmpeg.
4. Upload the audio file to GCS (`gs://mchatai-podcast/episodes/<slug>.mp3`).
5. Add an entry to `mchataiweb/public/podcast-content/_index.json` with `slug`, `title`, `summary`, `publishedAt`, `episodeNumber`, `durationSeconds`, `audioURL`, `audioBytes`, `audioMimeType`.
6. Copy the show notes to `mchataiweb/public/podcast-content/episodes/<slug>.md` (the BlogPostPage-equivalent for podcasts reads this for the episode-detail page).
7. Commit + push. The `build:feeds` step regenerates `podcast.xml` (Apple-Podcasts-compatible RSS); Apple + Spotify pick up the new episode within 1-6 hours.

## How to Continue Building This

- **Multi-voice**: Today the TTS skill defaults to a single voice. Branch into multi-voice (host + guest) by chunking the script with speaker tags before the TTS step.
- **Chapter markers**: Have the script-conversion LLM emit `[CHAPTER: <name> at <approximate seconds>]` inline, then post-process during ffmpeg stitching.
- **Auto-upload to GCS**: New skill `custom.gcs-upload` (Phase MM-1 future) that takes the audio file path and a bucket + path, returns a public URL.
- **Auto-update _index.json**: New skill `custom.append-podcast-episode` that takes the new episode metadata and merges it into the mchataiweb manifest (with sha-aware concurrency for the marketing-machine multi-pipeline case).

### Critical Entry Points

- **`steps[0].config.userPrompt`** — show-notes structure. The H2 headings are load-bearing; the script-conversion step assumes this exact format.
- **`steps[2].config.userPrompt`** — script conversion. The "no markdown / no headings / no bracketed directions" rules are load-bearing for TTS quality (TTS will literally pronounce `# Section Header` as "hash section header" if you forget).
- **`steps[3].config`** — empty by design; TTS skill defaults to the configured provider. Override via the AIAutomation TTS provider picker if you want ElevenLabs vs Apple vs Google.

### Key Concepts

- **Show notes generated FIRST, then the script.** This is intentional: the notes are the editorial structure (what we say); the script is the spoken form (how we say it). If you reverse the order, the LLM tends to compress the structure away.
- **ASCII-only enforcement** in both prompts. The script step is especially sensitive — smart quotes in TTS input often cause clicks or odd pauses.
- **The TTS step's empty config** — the skill picks the configured provider from AIAutomationViewModel's ttsProvider. To force ElevenLabs vs OpenAI vs Google, change it in the AI Automation tab, not here.
- **No publish step.** Per [[project_marketing_machine_direction]] hybrid-voice constraint, the founder reviews + ships. The pipeline produces material; it does not push to RSS.

## Testing

Input: `"This week we shipped 9 distribution skills, stood up the marketing website surfaces, and started the production-pipeline phase."`
Expect: ~2000-word show notes in markdown with the 6 required sections, plus a 12-18 min audio file at the default TTS provider's sample rate. Total runtime: 3-5 minutes (mostly TTS).

## Known Limitations

- **TTS empty-audio flake** (Lyria, occasionally others — see [[gotchas_lyria_intermittent_empty_audio]]). If the audio file is suspiciously small (<5KB), re-run the pipeline; the flake is upstream.
- **No background music or bumpers.** Add via post-production. A future `custom.audio-stitch` microservice would do this in-pipeline.
- **TTS doesn't know how to pronounce some integration names** (e.g., "HubSpot" → "huhb-spote"). Spell out phonetically in the show notes when this happens.
