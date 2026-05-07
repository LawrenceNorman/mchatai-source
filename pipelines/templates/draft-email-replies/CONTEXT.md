---
artifact:
  type: pipeline
  id: official.pipeline.draft-email-replies
  name: Draft Email Replies
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Fetches unread emails, drafts AI replies, pauses for human approval, then sends.
  problem_solved: Replying to email is repetitive; AI can draft 80% of replies but humans must approve before sending.
  intended_users: Professionals with high email volume who want to stay in control while moving faster.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: true

dependencies:
  external_apis: [gmail-api]
  internal_services: [builtin.gmail, builtin.llmGenerate, builtin.saveArtifact, builtin.humanInLoop]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[0].config.query, steps[1].config.userPrompt]
  build_command: none
  test_command: "Run pipeline manually; check draft artifact appears and humanInLoop pauses execution."
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [email, gmail, drafts, human-in-the-loop, productivity]
---

## What This Does

Four-step pipeline: fetch up to 5 unread non-promotional emails → draft replies for each → save drafts as a markdown artifact → pause and wait for the user to review/edit → (future: send approved replies).

**Note:** The current template stops at the `humanInLoop` approval gate. Wiring the send step requires adding a `builtin.gmail` step with `gmailMode: "send"` after approval — see "How to Continue" below.

## How to Continue Building This

- **Add the send step**: Append a `builtin.gmail` step: `{ "gmailMode": "send", "to": "", "subject": "" }`. The send step reads reply content from `data.text` after the approval gate.
- **Narrow the query**: Change `steps[0].config.query` to target a label, sender, or keyword — e.g. `"from:boss@company.com is:unread"`.
- **Increase batch size**: Change `maxResults` from `"5"` to `"10"` — be aware larger batches mean longer LLM processing and more to review.

### Critical Entry Points
- **`steps[0].config.query`** — Gmail search query. The default excludes promotions and social. Adjust to your inbox.
- **`steps[1].config.userPrompt`** — the draft format. The `---` separator between drafts helps the send step parse individual replies.
- **`steps[3]` (`humanInLoop`)** — execution halts here until the user approves in the UI. The `prompt` field is shown to the user.

### Key Concepts
- `humanInLoop` is a hard pause — the pipeline does not proceed until the user taps Approve or Cancel in mChatAI+.
- Requires Gmail OAuth connected in AI Automation → Network → Google.
- `maxResults: "5"` keeps LLM input manageable. Gmail returns full message bodies which can be large.
