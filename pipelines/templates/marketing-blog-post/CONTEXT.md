---
artifact:
  type: pipeline
  id: official.pipeline.marketing-blog-post
  name: Marketing Blog Post
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-24
  updated_at: 2026-05-24

purpose:
  summary: Three-pass LLM pipeline that turns a topic into a publish-ready blog post with YAML frontmatter for mchatai.com/blog.
  problem_solved: The marketing machine needs a steady cadence of blog posts (3-4/week) without consuming the founder's hour each time. This pipeline does the bulk writing; the founder reviews and ships in their morning window.
  intended_users: mChatAI marketing operator (Lawrence); reusable by any creator who wants outline-draft-polish workflow.

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
  entry_points: [steps[0].config.userPrompt, steps[1].config.userPrompt, steps[2].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Marketing Blog Post' --input 'How we ship marketing content using mChatAI itself'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [marketing, blog, writing, content, long-form, marketing-machine]
---

## What This Does

Pass 1 outlines (4-6 H2 sections, hook + CTA bookends).
Pass 2 expands the outline into 1500-3000 words of prose with the mChatAI voice (direct, helpful, no hype, ASCII-only).
Pass 3 polishes the post and prepends YAML frontmatter (slug, title, summary, author, date, tags, series, reading-minutes) so it drops straight into `mchataiweb/public/blog-content/posts/<slug>.md`.

## How To Use (v1 workflow)

1. Run the pipeline via AI Automation > Marketing Blog Post, or via tunnel:
   ```
   {"command":"runPipeline","pipelineName":"Marketing Blog Post","input":"<your topic or research bullets>","requestID":"blog-001"}
   ```
2. Review the resulting markdown file in the Pipeline Artifacts folder.
3. Copy it to `mchataiweb/public/blog-content/posts/<slug>.md`.
4. Add a matching entry to `mchataiweb/public/blog-content/_index.json` (slug, title, summary, author, publishedAt, tags, series, readingMinutes).
5. Commit + push. The `build:feeds` step regenerates `rss.xml` + `sitemap.xml` on next deploy.

A future v2 will auto-commit to the repo via the GitHub API (see `reference_mchatai_source_github_secret` memory for the existing token pattern).

## How to Continue Building This

- **Add a research pre-step**: Insert `builtin.webExtract` or `builtin.urlFetch` at step 0 to ingest a source URL before outlining (turn "research a topic" into "summarize this article").
- **Hero image**: Append a `custom.imagegen` step (from MM-1) after polish to generate a 16:9 hero. Capture the URL into the frontmatter as `heroImage`.
- **Tone variants**: Branch the pipeline by series. The "Behind the Magic" series wants longer, more technical prose; "Recipe of the Week" wants a step-by-step scaffold. Today this is controlled via the polish prompt — split into per-series pipelines when prompts diverge enough.
- **Auto-publish step**: Build a `custom.publish-to-blog-repo` skill that does `git add + commit + push` to mchataiweb. Requires a GitHub PAT in Keychain and care about merge conflicts on the index.

### Critical Entry Points

- **`steps[0].config.userPrompt`** — outline pass. Controls section count, hook style.
- **`steps[1].config.userPrompt`** — expansion. Controls voice, length, formatting rules. **Where the "no smart quotes, no em-dashes" guard lives** — keep it; see [[gotchas_swift_decoder_non_ascii_strings]].
- **`steps[2].config.userPrompt`** — polish + frontmatter. The frontmatter format is load-bearing for the blog rendering; do not edit field names without also updating `mchataiweb/public/blog-content/_index.json` schema.
- **`steps[1].config.llmMaxTokens: "4000"`** — budget for a ~2000-word post. Bump to `"6000"` for the long-form "Behind the Magic" series.

### Key Concepts

- **ASCII-only output** is enforced in the polish prompt to prevent the Swift catalog decoder from rejecting downstream artifacts (see [[gotchas_swift_decoder_non_ascii_strings]]) and to keep the markdown render predictable.
- **Series tag** in the frontmatter routes the post into the right blog stream on mchataiweb/blog. Allowed values are listed in the polish prompt; expand them by also updating the BlogPage filter logic.
- The post is **not** auto-published. The pipeline produces an artifact; the founder ships it in their morning hour. This is intentional — see [[project_marketing_machine_direction]] hybrid-voice constraint.

## Testing

Input: `"Why local-first AI is the right default for creators"`.
Expect: ~2000-word markdown with valid YAML frontmatter, 4-5 H2 sections, ASCII-only, ending with a concrete next-action CTA. Pipeline runs in 60-120s on Claude Sonnet or Gemini Pro.
