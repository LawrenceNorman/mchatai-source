---
artifact:
  type: pipeline
  id: official.pipeline.article-audio-summary
  name: Article Audio Summary
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Fetches a URL, summarizes the article, and converts the summary to spoken audio.
  problem_solved: Users want to listen to long articles without reading them.
  intended_users: mChatAI+ users who consume articles while commuting or working.

architecture:
  language: json
  frameworks: [pipeline-engine, tts]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: [any-public-url]
  internal_services: [builtin.webExtract, builtin.llmGenerate, builtin.ttsGenerate, builtin.saveArtifact]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[1].config.userPrompt, steps[0].config.maxChars]
  build_command: none
  test_command: "tunnel runPipeline 'Article Audio Summary' --input 'https://example.com/article'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [audio, tts, web, summarize, reading]
---

## What This Does

Fetches a public URL (article, blog post, news story), summarizes the content into a concise spoken-word script, then converts it to an audio artifact. The user gets a notification when the audio is ready.

## How to Continue Building This

- **Save a text transcript too**: Add a `builtin.saveArtifact` step after `llmGenerate` with `artifactExtension: "md"` before the TTS step.
- **Add a notification**: Add `builtin.notify` after `saveArtifact` with a title and body.
- **Chain multiple articles**: Add a `builtin.forEachLoop` step before `webExtract` to process a list of URLs.

### Critical Entry Points
- **`steps[0].config.maxChars`** — controls how much of the page is passed to the LLM. `60000` covers most articles; reduce for faster runs on long pages.
- **`steps[1].config.userPrompt`** — controls summary length and style. Must end "plain text only" for TTS.
- **`steps[1].config.llmMaxInputChars`** — `8000` prevents token overflow on large scraped pages. Increase if article is being cut off.

### Key Concepts
- `webExtract` outputs plain text stripped of HTML. The `maxChars` cap prevents token overflow.
- `llmMaxInputChars` is a secondary safety cap applied at the LLM step, independent of `maxChars`.
- This pipeline has no `notify` step — add one if you want a desktop alert when audio is ready.

## Testing

```
tunnel runPipeline "Article Audio Summary" --input "https://news.ycombinator.com/"
```
Expect: audio artifact saved, no notification (add notify step to get one).
