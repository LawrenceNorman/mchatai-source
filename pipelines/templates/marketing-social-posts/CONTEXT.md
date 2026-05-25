---
artifact:
  type: pipeline
  id: official.pipeline.marketing-social-posts
  name: Marketing Social Posts
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-24
  updated_at: 2026-05-24

purpose:
  summary: Turn a blog post or topic into platform-tailored social drafts for X, LinkedIn, Bluesky, Reddit, and HackerNews.
  problem_solved: Five platforms, five formats, five cultures, five sets of unwritten rules. Lawrence has 1 hour/day. This pipeline produces all the drafts in one LLM call; he edits and dispatches.
  intended_users: mChatAI marketing operator; reusable for any creator running multi-platform organic.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: [builtin.llmGenerate, builtin.saveArtifact]
  consumed_by: [custom.xpost, custom.linkedinpost, custom.bluesky-post, custom.reddit-submit]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[0].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Marketing Social Posts' --input 'New post on the blog: how we shipped 9 distribution skills in three days using mChatAI to write the skills'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [marketing, social, x, linkedin, bluesky, reddit, hackernews, marketing-machine]
---

## What This Does

ONE LLM pass produces a markdown digest with five sections, each containing a platform-tailored draft:

- **X / Twitter Thread** — 5-8 numbered tweets, character-limit-aware, no thread-bro tropes.
- **LinkedIn Post** — single 800-1500 char post, concrete-observation hook, 3-5 lowercase hashtags.
- **Bluesky Thread** — 3-5 short posts, slightly more technical voice (dev-skewed audience).
- **Reddit Submission** — title + body, subreddit-agnostic (Lawrence picks at dispatch time), explicit disclosure rule.
- **Hacker News Submission** — `Show HN:` title + first-comment body, plain text (HN strips markdown), one honest limitation included.

Saves all as a single `.md` artifact for Lawrence to review and dispatch via the MM-1 social skills.

## How To Use (v1 workflow)

1. Run via AI Automation > Marketing Social Posts:
   ```
   {"command":"runPipeline","pipelineName":"Marketing Social Posts","input":"<blog post markdown OR a short brief>","requestID":"soc-001"}
   ```
2. Open the resulting `.md` digest. Each platform section is independent.
3. Edit each variant in place if you want to change angle, voice, or specifics. Don't trust the LLM to know which subreddit fits — pick that yourself.
4. Dispatch one at a time:

   **X:**
   ```
   {"command":"runSkill","skillID":"custom.xpost","config":{"thread":"[\"tweet 1...\",\"tweet 2...\"]"},"requestID":"x-001"}
   ```

   **LinkedIn:**
   ```
   {"command":"runSkill","skillID":"custom.linkedinpost","config":{"text":"<post body>"},"requestID":"li-001"}
   ```

   **Bluesky:**
   ```
   {"command":"runSkill","skillID":"custom.bluesky-post","config":{"thread":"[\"post 1\",\"post 2\"]"},"requestID":"bsky-001"}
   ```

   **Reddit:**
   ```
   {"command":"runSkill","skillID":"custom.reddit-submit","config":{"subreddit":"SideProject","title":"<title>","text":"<body>"},"requestID":"r-001"}
   ```

   **Hacker News:** dispatch manually via the web UI (the existing skill doesn't reach HN — fragile API).

5. Per [[feedback_dont_punt_relaunch_retest]] sibling principle: don't dispatch raw AI output. Edit each variant in the morning hour. The drafts get you 80% of the way; the last 20% is voice.

## How to Continue Building This

- **Per-platform sub-pipelines**: When one platform's tone diverges enough, fork the relevant section out into its own pipeline (e.g., `marketing-x-thread`). Keeps prompts focused.
- **Auto-dispatch (NOT recommended for v1)**: Could append five conditional dispatch steps using the MM-1 social skills. Skipped intentionally — see [[project_marketing_machine_direction]] hybrid-voice constraint.
- **Engagement-aware re-draft**: After dispatch, pull engagement stats via the Plausible skill + per-platform analytics; feed back to LLM to re-tune voice. Phase MM-7 territory.

### Critical Entry Points

- **`steps[0].config.userPrompt`** — load-bearing for ALL platform-specific format rules. The character limits, banned phrases, formatting conventions are all here. Edit with care.
- **Banned-phrase list**: `'I'm excited to announce'`, `'thrilled'`, `'unlocks'`, `'game-changer'`, `'revolutionary'`, `'we're proud to'`, `'in today's world'`. Extend; don't shorten.
- **Token budget `"3500"`** — enough for all five variants. If a variant gets truncated, bump to `"5000"`.

### Key Concepts

- **ASCII-only** is repeated in the prompt because each platform has different smart-quote handling. X auto-corrects, LinkedIn renders correctly, Reddit shows the raw `'` character.
- **Platform character limits**:
  - X: 280 (use 270 for safety; URLs auto-shorten but emoji can blow it)
  - Bluesky: 300 graphemes (use 290; the count is graphemes not bytes, so emoji count as 1 char visually but graphemes-wise vary)
  - LinkedIn: 3000 (use 1500 for engagement — long posts get truncated with a "see more")
  - Reddit title: 300 (use 280)
- **Reddit disclosure rule**: if the post is about mChatAI itself, disclose. Reddit communities will downvote silently otherwise. The prompt mandates this in one sentence if relevant.
- **HN convention**: title is `Show HN:`-prefixed, body goes in the FIRST COMMENT (not the post body field). The prompt enforces this; respect it.

## Testing

Input: `"This week we shipped 9 of 12 marketing distribution skills in mchatai-source, with auto-discovery so they hot-deploy without a rebuild. Skills cover X, LinkedIn, Bluesky, Reddit, SendGrid, HubSpot, YouTube, Plausible, ImageGen."`
Expect: digest with 5 sections, each respecting its platform's format. X thread should have 5-8 tweets. Reddit body should not feel like marketing. HN title should be neutral and concrete.

## Known Limitations

- **No per-platform A/B**: All five variants are from one LLM call with one temperature. Re-run for alternates.
- **No image attachments**: Each social skill (MM-1) supports media IDs / URLs, but this pipeline doesn't generate them. Pair with the ImageGen pipeline for hero images per variant.
- **No scheduling**: Pipeline writes drafts; dispatch is manual. Buffer/Hypefury replacement is a future MM-3 pipeline that wraps the social skills + ScheduledJobExecutor.
