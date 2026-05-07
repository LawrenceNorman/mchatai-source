---
artifact:
  type: pipeline
  id: official.pipeline.podcast-from-text
  name: Podcast from Text
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Transforms any pasted text into a spoken podcast audio file.
  problem_solved: Users want to listen to their notes, articles, or drafts hands-free without reading.
  intended_users: mChatAI+ users who want audio versions of their written content.

architecture:
  language: json
  frameworks: [pipeline-engine, tts]
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
  entry_points: [steps[0].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Podcast from Text' with sample text input"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [podcast, audio, tts, content, writing]
---

## What This Does

Takes text input (notes, articles, bullet points) and produces a polished spoken-word podcast script, then converts it to an audio artifact using TTS. Output is a saved audio file + desktop notification.

## How to Continue Building This

- **Change the voice style**: Edit `steps[0].config.userPrompt` — adjust tone (formal/casual/energetic), target length (paragraphs), or structural requirements.
- **Add intro music cue**: Insert a `builtin.notify` step before TTS with instructions for the user to have music ready, or wire to a `builtin.shell.cliExecute` audio command.
- **Feed from RSS instead of text**: Replace step 0 with `builtin.loadWebFeed` — see `feed-to-podcast` component pattern in `../components/CONTEXT.md`.

### Critical Entry Points
- **`steps[0].config.userPrompt`** — controls script style; must end with "Return plain text only" because TTS reads markdown symbols aloud.
- **`steps[1]`** (`saveArtifact`) — saves the script as `.md`; remove this step if you only want audio output.
- **`steps[3]`** (`saveArtifact`) — saves the audio; `audioArtifactName` sets the artifact label in the UI.

### Key Concepts
- TTS reads `data.text` verbatim — markdown asterisks, hyphens, and `#` headers all get spoken aloud. The LLM prompt must explicitly forbid markdown.
- The `saveArtifact` step with `saveText: "false"` saves audio only (not a text copy).
- `data.text` flows automatically from each step to the next — no explicit wiring needed.

## Testing

```
tunnel runPipeline "Podcast from Text" --input "Today we discuss three things: AI, automation, and audio."
```
Expected: script artifact appears in right pane, audio artifact appears below it, notification fires.

## Deployment

Copy `pipeline.json` content into `automation-blueprints.json` `pipelineTemplates[]` for offline bootstrap, or ensure `refreshMchataisourceCache` has run to pick up from source.
