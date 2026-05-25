---
artifact:
  type: pipeline
  id: official.pipeline.marketing-outreach-pitch
  name: Marketing Outreach Pitch
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-24
  updated_at: 2026-05-24

purpose:
  summary: Draft a personalized PR / partnership / podcast-guest pitch with explicit VERIFY markers for anything the LLM can't confirm.
  problem_solved: Lawrence wants to pitch Mac newsletters, indie-dev podcasts, and journalists regularly but writing a personalized cold email takes 20-40 min per target. This pipeline takes that down to a 5-min review of pre-drafted variants with verify-before-send guards baked in.
  intended_users: mChatAI marketing operator. NOT for high-volume blast - this is a hand-finishing tool for targeted outreach.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: [builtin.llmGenerate, builtin.saveArtifact]
  consumed_by: [custom.sendgrid-email after manual verification; or your own inbox]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[0].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Marketing Outreach Pitch' --input 'MacStories | https://www.macstories.net | Hook: we just shipped a Wordle generator that makes playable games in 90 seconds'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [marketing, outreach, pr, marketing-machine]
---

## What This Does

ONE LLM call produces a structured markdown deliverable:

- **Target block** - outlet name, URL, what they cover, why they're a fit, best contact to research (VERIFY-tagged), submission method (VERIFY-tagged).
- **The hook** - one sentence, the specific reason to reach out THIS week.
- **Three pitch variants** - Cold email (150w), Warm-intro angle (150w), Follow-up (50-90w to send 7-10 days later).
- **Suggested cadence** - day 0 / day 8 / day 15 drop.
- **Personalization hooks** - 3-5 verifiable touchpoints to weave into the pitches.
- **Pre-send checklist** - the 6 things Lawrence ticks off before hitting send.

VERIFY-tagged placeholders are load-bearing. The LLM should never invent journalist names or email addresses; it surfaces what needs human research instead.

## How To Use (v1 workflow)

1. Run via AI Automation > Marketing Outreach Pitch:
   ```
   {"command":"runPipeline","pipelineName":"Marketing Outreach Pitch","input":"<target> | <URL> | Hook: <specific reason to reach out now>","requestID":"out-001"}
   ```
2. Open the resulting `.md`. Resolve every `VERIFY:` marker - look up the journalist on the outlet's About page, find their submission process on their tip line, confirm any cited coverage.
3. Pick Pitch A (cold) or B (warm) at review time. Edit for voice if needed.
4. Send from your own inbox (do NOT auto-send via custom.sendgrid-email - one-to-one outreach should not look transactional). If the outlet has a pitch form, paste through that.
5. If no reply in 7-10 days, send Pitch C verbatim. After day 15, drop.

## How to Continue Building This

- **Web-research pre-step**: append `builtin.webExtract` (or the Perplexity skill) to pull the outlet's recent posts BEFORE the LLM drafts. Today the LLM has only what's in the prompt; a pre-step that ingests their last 5 articles would let the personalization hooks be real instead of VERIFY-tagged.
- **Per-outlet style cards**: build a per-outlet research file at `mchatai-source/outreach/outlets/<slug>.md` (editorial voice, no-fly topics, past coverage of mChatAI competitors). Layer that into the prompt context per run.
- **Outreach log + cadence reminder**: write each sent pitch to a Firestore `outreach_log` collection so the day-8 follow-up reminder fires automatically.
- **Outlet/journalist-finder skill**: when given just a topic, find the right targets. Phase MM-6.1.

### Critical Entry Points

- **`steps[0].config.userPrompt`** - the whole pipeline. The VERIFY-marker rule, banned-phrases list, and 3-variant structure are all here.
- **Banned-phrase list**: cliches that scream AI-written-cold-pitch. Don't shorten.
- **VERIFY-marker rule**: load-bearing. Removing it would risk shipping pitches with fabricated journalist names - terminal-credibility damage.

### Key Concepts

- **Three variants, one pick**. Lawrence picks at review. Sending all three is pointless and looks spammy.
- **Day 15 drop**. No third follow-up. Outlets that don't respond to one polite follow-up aren't going to respond to three.
- **One-to-one, not blast**. Run this once per target. Bulk pitch sends look identical at the recipient's end and rapidly poison your domain reputation.
- **No auto-send**. Per [[project_marketing_machine_direction]] hybrid-voice contract AND [[feedback_no_invention_in_user_docs]] - outreach with even one fabricated detail destroys the relationship.

## Testing

Input: `"MacStories | https://www.macstories.net | Hook: mChatAI just shipped a Wordle clone generator that makes playable games in 90 seconds with the AIWizard"`.

Expect:
- Target block with VERIFY-tagged editor name (we don't know it without research).
- Pitch A subject under 60 chars, no exclamation marks.
- Pitch B body opens with VERIFY: mutual contact OR cleanly excuses itself.
- Pitch C body is short (50-90 words) and adds one new piece of value.
- Pre-send checklist has 6 boxes.
- Zero hype phrases. Zero invented journalist names.

## Known Limitations

- **Zero outlet knowledge unless you give it some**. The LLM has no live web access in this pipeline; it works only with what's in the source field. Hence the VERIFY scaffolding.
- **No follow-up scheduling**. Day 8 + Day 15 are operator memory items for v1. Wire to ScheduledJobExecutor or AIFeed reminders when volume warrants.
- **No CRM logging**. Sent pitches don't land in HubSpot today. Build that as a sibling skill when you do more than 5 outreach/week.
