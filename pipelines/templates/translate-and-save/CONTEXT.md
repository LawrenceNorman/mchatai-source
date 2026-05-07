---
artifact:
  type: pipeline
  id: official.pipeline.translate-and-save
  name: Translate & Save Both Versions
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Translates pasted text to a target language and saves the result as an artifact.
  problem_solved: Quick document translation with a saved output, no copy-paste into external tools.
  intended_users: Anyone who needs translated versions of documents, emails, or notes.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: [builtin.llmGenerate, builtin.saveArtifact]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[0].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Translate & Save Both Versions' --input 'Hello, how are you today? [translate to French]'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [writing, translate, language, document, international]
---

## What This Does

Single-pass translation: paste text (optionally specifying the target language inline), get the translated version saved as a markdown artifact. Defaults to Spanish if no language is specified.

## How to Continue Building This

- **Specify language in pipeline**: Add a `systemPrompt` config key with `"Always translate to Japanese."` to hardcode the target language for a dedicated pipeline variant.
- **Save original too**: Add a `builtin.saveArtifact` step before `llmGenerate` to save the source text, then rename the second artifact `"Translation"`.
- **Multi-language output**: Edit the prompt to output all three languages (original, Spanish, French) in clearly labeled sections.
- **Audio version**: Append TTS chain to produce a spoken translation.

### Critical Entry Points
- **`steps[0].config.userPrompt`** — the "translate to Spanish if unspecified" default is here. Change it or remove it.
- **`steps[0].config.llmMaxTokens: "3200"`** — translation output is roughly the same length as input. For very long documents (>2000 words) increase to `"6000"`.

### Key Concepts
- The "Return ONLY the translated text" instruction prevents the LLM from adding explanatory text before or after the translation.
- Markdown formatting is preserved — translated documents retain headers, bullets, bold, etc.
