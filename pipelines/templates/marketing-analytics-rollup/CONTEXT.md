---
artifact:
  type: pipeline
  id: official.pipeline.marketing-analytics-rollup
  name: Marketing Analytics Rollup
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-24
  updated_at: 2026-05-24

purpose:
  summary: Weekly Monday-morning briefing for the solo founder. Takes whatever metrics you have, produces a one-page actionable summary - what moved, wins, losses, three actions, next-week topic seeds, honest call-out.
  problem_solved: Without a forced weekly look at numbers, the marketing machine drifts. Every Monday Lawrence pastes (or has the pipeline pull) whatever metrics are available; the briefing turns them into a decisions document.
  intended_users: mChatAI marketing operator. Later: a `marketing-analytics-aggregate` pre-pipeline that pulls from Plausible + HubSpot + YouTube programmatically.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: [builtin.llmGenerate, builtin.saveArtifact]
  consumes_from: [custom.plausible (action: aggregate), custom.hubspot (action: getContact bulk), custom.youtube-upload (action: getVideo) - all manual paste for v1]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[0].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Marketing Analytics Rollup' --input '<paste from your dashboards or bullet notes>'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [marketing, analytics, briefing, marketing-machine, weekly]
---

## What This Does

ONE LLM call takes a metrics blob and produces a structured briefing:

- **One-line summary** (the over-coffee version).
- **What moved** - 3-6 bullets, each metric + number + delta + one-sentence why.
- **Wins** - 2-4 bullets of things that worked better than expected.
- **Losses** - 2-4 bullets of things that underperformed or broke.
- **Three things to do this week** - exactly 3, each one a concrete <30min action.
- **Next week's content topic seeds** - 3-5 paste-ready candidates for the Marketing Day Orchestrator.
- **Honest call-out** - one uncomfortable observation. Or 'no strong signal yet' if the data doesn't support one.

The prompt aggressively guards against invented numbers (load-bearing - briefings have to be trustable) and against motivational-poster language ('crushing it', 'on fire', 'rockstar' all banned).

## How To Use (v1 workflow - manual paste)

1. Each Monday morning, collect metrics:
   - Plausible aggregate for last 7 days: `tunnel runSkill custom.plausible action=aggregate site_id=mchatai.com period=7d metrics=visitors,pageviews,bounce_rate,visit_duration`
   - HubSpot new contacts: spot-check the dashboard
   - YouTube last 7d views: from Studio
   - Podcast monthly listens: from Spotify for Podcasters + Apple Podcast Connect
   - GitHub stars/forks delta on mchatai-source
   - X / LinkedIn engagement: spot-check
2. Paste it all into the pipeline input (line breaks fine, no specific format required):
   ```
   {"command":"runPipeline","pipelineName":"Marketing Analytics Rollup","input":"<paste>","requestID":"rollup-001"}
   ```
3. Read the briefing. The three action items go into Lawrence's actual todo list. The topic seeds feed the next 3 Marketing Day Orchestrator runs.

## How To Use (future v2 - automated aggregation)

When the marketing machine has enough integrations live, replace step 1 with a pre-pipeline `marketing-analytics-aggregate` that uses [[project_runpipeline_composition]] to chain:

1. `custom.plausible` aggregate -> stores in data slot
2. `custom.hubspot` getContact bulk for this week's signups -> stores in data slot
3. `custom.youtube-upload` getVideo for each recent upload -> stores in data slot
4. LLM consolidator that builds the metrics blob from all the slots
5. Then composes Marketing Analytics Rollup via `builtin.runPipeline`

Phase MM-7.1 work; not needed until 3+ analytics sources are flowing.

## How to Continue Building This

- **Auto-fire to AIFeed**: per the plan, the briefing should land in the founder's AIFeed at 08:00 Monday. Wrap the pipeline run in a ScheduledJob (existing AIAutomation cron) with the input pulled from a Firestore-backed metrics-of-the-week document.
- **Auto-thread the action items**: post each of the 3 actions into Lawrence's todo applet via `builtin.todoCreate` (or whichever the live skill is).
- **Topic-seed scoring**: post-process step that scores each topic seed against the historical engagement of the originating signal (e.g., a seed derived from a Reddit win gets +10 if Reddit is currently your top channel).
- **Monthly + quarterly rollups**: same pipeline, different period - a `marketing-analytics-monthly` that takes a longer window and emits trends instead of week-over-week deltas.

### Critical Entry Points

- **`steps[0].config.userPrompt`** - all the structure + guardrails are here.
- **'Do NOT invent figures' rule**: load-bearing. Removing it would make the briefing dangerous - Lawrence might act on fabricated numbers.
- **Banned-phrase list**: cuts motivational-poster slop. Don't shorten.
- **Token budget `3000`** - enough for the under-600-word briefing plus some headroom. The prompt enforces the length cap; don't bump unless you're seeing truncation.

### Key Concepts

- **No-data-this-week handling**: the prompt instructs the LLM to skip silently or write 'no data this week' rather than padding. This is intentional - early-stage marketing means many weeks where Plausible has 50 visitors and the only honest briefing is short.
- **Exactly three actions**: not five, not ten. A solo founder can do three things in a week. The constraint is forcing function.
- **The honest call-out section**: the most valuable part. The LLM is asked to tell Lawrence something uncomfortable. If the data doesn't support it, the prompt requires a 'need more weeks of data' admission rather than fluff.

## Testing

Input (manual paste of representative data):
```
Plausible last 7d:
- 1,247 visitors (up from 980 prior week, +27%)
- 4,891 pageviews
- Top page: /build/wordle-clone, 312 visitors
- Bounce rate 64%

HubSpot:
- 23 new newsletter signups
- 0 paid conversions

YouTube (3 videos this week):
- "Build a Wordle clone": 1,108 views, 87 likes
- "Daily life organizer": 240 views
- "Recipe of the week 3": 89 views

Podcast: 47 episode 1 plays (just launched Friday).
GitHub: mchatai-source gained 18 stars.
X: 4 posts, 1 went mildly viral (840 likes).
```

Expect: under 600 words, 3 numbered actions, 3-5 topic seeds, one uncomfortable observation (likely about the 0 paid conversions despite 1,247 visitors, or the bounce rate, or the YouTube video performance distribution).

## Known Limitations

- **Manual paste in v1**. Automation is Phase MM-7.1.
- **No historical comparison without baseline**. First run will write 'no baseline yet' in every delta. Acceptable.
- **No charts**. Text-only briefing. If you want visualization, run separately.
- **LLM occasionally compresses numbers** - e.g., turning '1,247' into '~1.2k'. Verify cited numbers against the paste before acting on the 'three actions' list.
