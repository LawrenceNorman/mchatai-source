---
artifact:
  type: pipeline
  id: official.pipeline.rough-notes-to-document
  name: Rough Notes to Document
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Expands messy notes or bullet points into a clean, structured markdown document.
  problem_solved: Users write rough notes during meetings or thinking sessions and need them turned into shareable documents.
  intended_users: mChatAI+ users who capture ideas quickly and need polished output.

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
  test_command: "tunnel runPipeline 'Rough Notes to Document' --input '- meeting with team\\n- discussed Q2 goals\\n- action: ship by friday'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [writing, document, notes, polish, productivity]
---

## What This Does

Single-step LLM transformation: pastes in rough notes (bullets, fragments, stream-of-consciousness) and outputs a clean markdown document with headers, full sentences, and a summary paragraph.

## How to Continue Building This

- **Add audio output**: Append `builtin.ttsGenerate` + `builtin.saveArtifact (audio)` to also produce a spoken version.
- **Change document style**: Edit the prompt for different formats — meeting minutes, project brief, email draft, etc.
- **Save to Google Docs**: Replace `builtin.saveArtifact` with `builtin.googleDocs` step to push directly to Drive.

### Critical Entry Points
- **`steps[0].config.userPrompt`** — the entire transformation is here. The "do not invent new content" instruction is load-bearing — remove it if you want the LLM to elaborate freely.

### Key Concepts
- The two-step structure (llmGenerate → saveArtifact) is the simplest possible pipeline pattern.
- No credentials required — fully offline-capable.
- `llmMaxTokens: "2400"` handles notes up to ~2000 words. Increase for longer documents.

## Testing

Paste in a block of meeting notes. Verify the output has headers, full sentences, and a top summary. Verify no facts were invented that weren't in the input.
