---
artifact:
  type: pipeline
  id: official.pipeline.marketing-newsletter
  name: Marketing Newsletter
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-24
  updated_at: 2026-05-24

purpose:
  summary: Generate a send-ready HTML newsletter (subject A/B + preview + body) from a blog post or weekly digest.
  problem_solved: Lawrence has 1 hour/day for marketing. Hand-writing a clean newsletter each Sunday eats half of that. This pipeline produces a ship-ready email Lawrence reviews and dispatches in 5 minutes.
  intended_users: mChatAI marketing operator; reusable for any creator running a Sunday digest.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: [builtin.llmGenerate, builtin.saveArtifact]
  consumed_by: [custom.sendgrid-email]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[0].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Marketing Newsletter' --input '<paste a blog post markdown here>'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [marketing, newsletter, email, marketing-machine, weekly]
---

## What This Does

Single LLM pass that takes a source (blog post markdown or weekly digest bullets) and produces a complete deliverable:

- A YAML-ish front matter block with `SUBJECT_A`, `SUBJECT_B`, `PREVIEW`, `FROM_NAME`, `FROM_EMAIL`, `REPLY_TO`.
- An inline-CSS HTML email body with a 600px wrapper table, 3-5 short paragraphs, one CTA link, and an unsubscribe placeholder.

ASCII only; no smart quotes; subject lines exclude banned hype words; body length 200-400 words.

## How To Use (v1 workflow)

1. Run via AI Automation > Marketing Newsletter:
   ```
   {"command":"runPipeline","pipelineName":"Marketing Newsletter","input":"<blog post markdown or week's bullets>","requestID":"nl-001"}
   ```
2. Open the resulting `.html` file. The front-matter block at the top shows you both subject options.
3. Pick A or B (or rewrite — you're the editor).
4. Dispatch via the SendGrid Email skill:
   ```
   {"command":"runSkill","skillID":"custom.sendgrid-email","config":{"from":"hello@mchatai.com","fromName":"mChatAI","to":"<list-emails-or-segment>","subject":"<your pick>","html":"<paste body HTML>","categories":"weekly,newsletter"},"requestID":"nl-send-001"}
   ```
5. For a real list send, your `to` should be a JSON array of subscriber emails (pull from the `newsletter_signups` Firestore collection that the EmailCapture widget writes to). For larger lists, future MM-3 work will wire HubSpot list IDs.

## How to Continue Building This

- **Auto-send step**: Append a `custom.sendgrid-email` step that parses the front-matter and fires the send. Today this is manual on purpose (review-before-dispatch is part of the hybrid-voice contract — see [[project_marketing_machine_direction]]).
- **HubSpot list segmentation**: Add a pre-step that calls `custom.hubspot` with `action: addToList` to put new signups on the right segment list, then post-step uses that list as the SendGrid recipient.
- **Subject-line testing**: When list size > 500, wire a real A/B by sending SUBJECT_A to half the list and SUBJECT_B to the other half. Today both variants land in the same artifact; Lawrence picks one.
- **Plaintext alternative**: Append a step that strips HTML to plaintext so the SendGrid send includes both MIME parts (better deliverability + accessibility).

### Critical Entry Points

- **`steps[0].config.userPrompt`** — the whole prompt. The front-matter format is parsed by Lawrence's eye AND by a future auto-send step; do not change field names without updating the consumers.
- **Subject-line banned-words list** — `'free', 'amazing', 'unlock', 'discover', 'must-read', 'game-changer', 'revolutionary'`. These trigger spam filters or sound like AI slop. Extend the list as needed; don't shorten it.
- **Token budget `"4000"`** — enough for ~300 words of body plus the HTML scaffolding. If you hit a "response truncated" failure, bump to `"5000"` not the body word target.

### Key Concepts

- **ASCII-only is load-bearing.** Smart quotes in HTML email render as `â€™` in some Outlook clients; em-dashes render as `?` in others. The single rule fixes both.
- **No image embeds** in the body for v1. Hosted images add deliverability + tracking weight; CTA-text-only emails outperform image-heavy ones at small list sizes.
- **One outbound link only** (the "read the full post" CTA). Multiple links trigger phishing-style heuristics and dilute attribution. The unsubscribe link is a different category and doesn't count.
- **No publish step.** The pipeline produces material; the founder dispatches. See the workflow above.

## Testing

Input: the body of the seed blog post (paste from `mchataiweb/public/blog-content/posts/welcome-to-mchatai.md`).
Expect: front-matter block (6 fields), then a complete `<!DOCTYPE html>` ... `</html>` document. Subject lines should be distinct, both under 60 chars. Body 200-400 words. ASCII only — no `'` or `'` or `—`.

## Known Limitations

- **No HubSpot integration yet.** Lawrence resolves `to` recipients manually from Firestore.
- **No personalisation tokens.** SendGrid `{{first_name}}` could be injected for warm-tone sends; v1 keeps things ASCII-flat.
- **No render preview.** Build a sibling `custom.email-preview` skill that screenshots the HTML in WKWebView so you don't have to send-to-yourself to QA.
