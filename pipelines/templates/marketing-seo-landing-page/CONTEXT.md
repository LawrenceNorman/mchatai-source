---
artifact:
  type: pipeline
  id: official.pipeline.marketing-seo-landing-page
  name: Marketing SEO Landing Page
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-24
  updated_at: 2026-05-24

purpose:
  summary: Generate one programmatic SEO landing page from a long-tail keyword. Produces frontmatter + JSON-LD + body in a single LLM pass.
  problem_solved: 200 unique landing pages by hand is a year of work for one person. Programmatic SEO compounds organic traffic when each page is genuinely useful, structured, and internally linked. This pipeline produces the page; Lawrence reviews + commits + the static-site rebuild surfaces it.
  intended_users: mChatAI marketing operator running batches; future SeoLandingPageBatchOrchestrator (Phase MM-5.1) that fires this many times from a keyword list.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: [builtin.llmGenerate, builtin.saveArtifact]
  consumed_by: [mchataiweb SeoLandingPage React component, scripts/build-feeds.mjs sitemap step]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[0].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Marketing SEO Landing Page' --input 'wordle clone javascript'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [marketing, seo, landing-page, programmatic, marketing-machine]
---

## What This Does

ONE LLM call takes a keyword and produces a complete markdown document:

1. **Intent classification** - the LLM picks build / automate / make / recipe.
2. **Frontmatter block** - slug, intent, title (50-60 chars), h1, metaDescription (140-160 chars), metaKeywords, og fields, canonical URL, schemaType, relatedRecipes (linked from the canonical 19-recipe set), CTA labels + URLs, FAQ (4 Q+A pairs).
3. **Page body** (under 1500 words) - Hero pitch, "What you will build", "Step by step" (5-8 imperative steps referencing real mChatAI surfaces), "Why mChatAI is a good fit", "Variations to try", FAQ render, "Try it now" CTA.

ASCII-only, no hype phrase list (`unlock`, `game-changer`, `thrilled`, etc.), no invented features/screenshots/stats. The page must read as helpful even if search engines vanish.

## How To Use (single page)

```
{"command":"runPipeline","pipelineName":"Marketing SEO Landing Page","input":"<keyword phrase, e.g. 'build a wordle clone'>","requestID":"seo-001"}
```

Output: `.md` artifact in the Pipelines Artifacts folder.

Lawrence reviews + commits to `mchataiweb/public/seo-content/{intent}/{slug}.md` + adds an entry to `mchataiweb/public/seo-content/_index.json`. `npm run build` regenerates the sitemap to include the new URL. Firebase deploy surfaces the page.

## How To Use (batch of 5-10)

Fire the pipeline once per keyword, sequentially:

```bash
KEYWORDS=(
  "build a wordle clone"
  "build a snake game"
  "automate stripe revenue dashboard"
  "automate slack channel digest"
  "daily news podcast generator"
)
for k in "${KEYWORDS[@]}"; do
  source /Users/lawrencenorman/mystuff/src/mchatai_platform/mchatai_macOS/scripts/tunnel_helper.sh
  RID="seo-$(date +%s)"
  tunnel_send "$RID" "{\"command\":\"runPipeline\",\"pipelineName\":\"Marketing SEO Landing Page\",\"input\":\"$k\",\"requestID\":\"$RID\"}" 240
done
```

The Pipelines Artifacts folder fills with N markdown files. Lawrence reviews + commits as a batch.

## How to Continue Building This

- **`SeoLandingPageBatchOrchestrator`** (Phase MM-5.1): pipeline that takes a JSON array of keywords and uses `builtin.runPipeline` (Phase MM-4) to fan out N runs of this one. Output: a manifest of all generated pages for one-shot review.
- **Auto-commit to mchataiweb**: new skill `custom.write-seo-landing-page` that takes the generated markdown + parses the intent + slug from frontmatter + commits to `mchataiweb/public/seo-content/{intent}/{slug}.md` via the GitHub API (reuse `MCHATAI_SOURCE_GITHUB_TOKEN` pattern, see `reference_mchatai_source_github_secret` memory).
- **Internal-link auto-populator**: post-process step that scans the `relatedRecipes` array against the live recipe catalog + fills `relatedPosts` from the blog manifest by tag overlap.
- **Hero image step**: append `custom.imagegen` (Phase MM-1) to render a 1200x630 hero from the title + slug; write the GCS URL back into `heroImage`.
- **Keyword expansion**: pre-step that takes a seed phrase + uses `builtin.webSearch` + LLM to expand into 10-15 long-tail variants, then fans out via `runPipeline`.

### Critical Entry Points

- **`steps[0].config.userPrompt`** - the whole pipeline. The intent classifier, frontmatter format, banned-phrase list, schemaType defaults, and the canonical 19-recipe set for `relatedRecipes` all live here.
- **`relatedRecipes` allowed values** - update this list when the official recipe catalog changes; the LLM must not invent recipe slugs that don't render on the live site.
- **Token budget `4500`** - covers ~1500-word body + frontmatter. If the LLM truncates the FAQ or CTA, bump to `5500`.

### Key Concepts

- **One LLM call per page**. Splitting frontmatter / body / FAQ into multiple calls would cost more tokens and risk drift (the body would not reflect the title classification). Single call keeps the page coherent.
- **Intent-prefixed URLs**: `mchatai.com/{intent}/{slug}` where intent is one of `build`, `automate`, `make`, `recipe`. The React route + content folder structure mirror this.
- **JSON-LD in frontmatter, not body**. The web component reads `schemaType` + the frontmatter fields and injects `<script type="application/ld+json">` into the document head at render time. Don't try to emit a `<script>` block inside the markdown body.
- **No publish step**. Per [[project_marketing_machine_direction]] hybrid-voice contract.

## Testing

Input: `"build a wordle clone in javascript"`.
Expect: markdown with frontmatter `intent: build`, `slug: build-wordle-clone-javascript` (or shorter), `schemaType: HowTo`, 4 FAQ entries, 5-8 numbered steps, hero pitch with the keyword in the first sentence, body under 1500 words.

Verify by inspection: every section H2 heading present, all FAQ questions are real long-tail searches, no banned phrases, ASCII-only.

## Known Limitations

- **Intent misclassification** for ambiguous keywords (e.g., "build a podcast" - could be `build` or `make`). Override at review time by editing the frontmatter.
- **Recipe-slug hallucination**: the LLM occasionally cites a recipe slug that doesn't exist. The prompt constrains to a 19-item allowlist; verify on each batch.
- **No backlink graph awareness**: pages don't yet cross-link to each other. After enough pages exist, build a `reciprocal-links` post-process step that fills `relatedPosts` based on shared keywords.
- **JSON-LD validity**: the frontmatter `schemaType` is a hint; the React component synthesises the full JSON-LD object from frontmatter fields. Run Google's Rich Results Test on a few pages periodically to confirm.
- **Search-engine indexing of a React SPA** is slower than SSR. If Google Search Console shows low coverage after 30 days, revisit (options: pre-render the SEO subset via Puppeteer to static HTML, or move to Astro for this subset only).
