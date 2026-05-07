---
artifact:
  type: pipeline
  id: official.pipeline.blog-post-from-outline
  name: Blog Post from Outline
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Two-pass LLM pipeline that turns a topic or rough outline into a full blog post.
  problem_solved: Users know what they want to write about but struggle with structure and prose.
  intended_users: Writers, developers, and professionals who want to publish content faster.

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
  entry_points: [steps[0].config.userPrompt, steps[1].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Blog Post from Outline' --input 'Why automation matters for small teams'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [writing, blog, content, document, long-form]
---

## What This Does

Two sequential LLM passes: first builds a structured section outline from the topic, then expands the outline into full prose. Output is a complete markdown blog post saved as an artifact.

## How to Continue Building This

- **Add an SEO pass**: Insert a third `llmGenerate` step after expansion to add meta description, keywords, and slug suggestions.
- **Convert to audio**: Append `builtin.ttsGenerate` + `builtin.saveArtifact (audio)` to also produce a spoken version (remember to strip markdown first with an intermediate LLM step).
- **Adjust tone**: Edit `steps[1].config.userPrompt` — change "informative but approachable" to match your brand voice.

### Critical Entry Points
- **`steps[0].config.userPrompt`** — outline pass. Controls section count and structure style.
- **`steps[1].config.userPrompt`** — expansion pass. Controls prose style, length, and tone.
- **`steps[1].config.llmMaxTokens: "3200"`** — budget for a ~1500 word post. Increase to `"6000"` for longer pieces.

### Key Concepts
- Two-pass approach produces better results than single-pass: the outline step forces the LLM to plan before writing, reducing rambling.
- `data.text` from the outline step flows into `{{INPUT}}` of the expansion step automatically.
- `llmTimeout: "120"` is needed for the expansion pass — long-form generation can take 60-90s.

## Testing

Input: a single sentence or brief bullets. Expect: 800-1500 word post with H2 sections, hook intro, CTA conclusion.
