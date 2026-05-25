---
artifact:
  type: pipeline
  id: official.pipeline.marketing-day-orchestrator
  name: Marketing Day Orchestrator
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-24
  updated_at: 2026-05-24

purpose:
  summary: The daily marketing-machine cycle as a single composable pipeline. One run produces a blog post + social drafts + a newsletter, all derived from the same topic.
  problem_solved: Lawrence does not want to fire 3 pipelines manually each morning. This orchestrator runs them as one chain, with the blog post as the source of truth and social/newsletter fanned out from it.
  intended_users: mChatAI marketing operator; reusable as a pattern for any creator running a fan-out content cadence.

architecture:
  language: json
  frameworks: [pipeline-engine, pipeline-composition]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: [builtin.runPipeline]
  composes: [Marketing Blog Post, Marketing Social Posts, Marketing Newsletter]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[*].config.pipelineName]
  build_command: none
  test_command: "tunnel runPipeline 'Marketing Day Orchestrator' --input 'How to ship marketing content using mChatAI itself'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [marketing, orchestrator, daily, composition, marketing-machine]
---

## What This Does

Three sequential composition steps via `builtin.runPipeline`:

1. **Marketing Blog Post** runs first. Its output (markdown with YAML frontmatter) becomes the day's source of truth.
2. **Marketing Social Posts** runs with `preserveParentText: true` so it derives from the blog post (not from step 1's child output stack). Output: a per-platform drafts digest.
3. **Marketing Newsletter** runs with `preserveParentText: true` for the same reason. Output: a send-ready HTML email with A/B subject lines.

All three child pipelines save their outputs as separate artifacts. Lawrence reviews and dispatches each in his morning hour.

`continueOnFailure: true` on steps 2 and 3 means a single channel failure (e.g. LLM provider blip on social) doesn't abort the whole day — newsletter still gets a shot.

## How To Use

**One-shot run** (any morning):
```
{"command":"runPipeline","pipelineName":"Marketing Day Orchestrator","input":"<today's topic, e.g. 'Why local-first AI is the right default for creators'>","requestID":"day-001"}
```

**Schedule once, run daily** (the production cadence):

1. Open AI Automation tab in mChatAI+.
2. Navigate to Marketing Day Orchestrator under "Marketing Machine" category.
3. Click Schedule. Set cadence: Daily. Time: 06:00 local. Provide a topic (or use a topic-of-the-day text file the scheduler reads from).
4. Save. The `ScheduledJobExecutor` (running 24/7 inside mChatAI+) fires the orchestrator each morning. Lawrence reviews the three artifacts when he sits down with coffee.

A **JSON-declarative cron format** (`mchatai-source/schedules/*.json`) is deferred to a later phase. For v1 the schedule is UI-attached after the user instantiates the orchestrator template. See "Known Limitations" below.

## How to Continue Building This

- **Add the podcast pipeline** to the chain (Friday-only): wrap with a `builtin.condition` step that checks `runStartedAt`'s weekday and conditionally runs Marketing Podcast Episode.
- **Add YouTube + Shorts** when the recording cadence stabilises: append two more `builtin.runPipeline` steps (Marketing YouTube Tutorial + Marketing Short-Form Clips), both with `preserveParentText: true`.
- **Auto-dispatch**: append a final step that uses the MM-1 social/sendgrid skills to actually send drafts. NOT recommended for v1 (review-before-publish is the hybrid-voice contract).
- **JSON-declarative scheduling**: add a `schedule` field to `manifest.json` (e.g. `{"schedule": {"cadence": "daily", "runTimeMinutes": 360}}`) + ~100 LOC in `ScheduledJobExecutor` to read it at startup. Defer until at least two pipelines need recurring schedules.

### Critical Entry Points

- **`steps[*].config.pipelineName`** — change these to swap which child pipelines run. Names are case-sensitive.
- **`preserveParentText: "true"`** — load-bearing. Without it, step 3 would receive step 2's social drafts as input instead of the blog post. Don't remove unless you want serial chaining.
- **`continueOnFailure: "true"`** — load-bearing for fan-out resilience. Without it, a single LLM provider blip aborts the whole day's content.

### Key Concepts

- **The blog post is the source of truth.** Every other channel adapts from it. This is intentional — keeps the day's content cohesive and saves tokens (the LLM doesn't re-research per channel).
- **Composition via runPipeline** (Phase MM-4 skill) is platform-level. Any pipeline can compose any other pipeline by name. The marketing day is the first user; expect more orchestrators in other domains.
- **Child outputs are also stashed at `data["lastChildOutput"]`** so future steps could inspect them even when `preserveParentText` is on (e.g., a final summarisation step that reports "today shipped: blog X, social variants A/B/C, newsletter subject D").

## Testing

Input: `"Why creators should care about local-first AI"`.
Expect: 3 artifacts in the Pipelines Artifacts folder (Marketing Blog Post .md, Marketing Social Drafts .md, Marketing Newsletter .html). Total runtime: 4-8 minutes depending on provider. Status: completed (3/3 child pipelines).

## Known Limitations

- **Schedule is UI-attached**, not JSON-declared. v1 requires Lawrence to set up the daily cron once via the AI Automation tab. JSON-declarative scheduling is a future phase (see "How to Continue Building This").
- **No conditional weekday branching**. Today the chain runs the same 3 children every day. Wrap steps in `builtin.condition` to branch by day-of-week when you add Podcast (Fri-only) and YouTube (Wed-only).
- **One topic per day**. The orchestrator takes a single input string. A future "Topic of the day" reader (Firestore-backed or local file) could feed topics on a rotating schedule.
- **No newsletter/social dispatch**. The orchestrator produces drafts; sending is manual in Lawrence's morning hour. This is intentional per [[project_marketing_machine_direction]] hybrid-voice contract.
