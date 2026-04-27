# Pipeline Builder Capability Pack

Use this pack when AI Automation is designing, repairing, validating, or running
sequential pipelines and DAG pipelines. Pipelines are executable workflows.
Capability Packs are the reusable domain substrate that gives the harness the
right tools, policies, examples, and quality bars for a class of work.

## Build Contract

- Produce pipeline artifacts that match the platform's existing `PipelineDefinition`
  and `PipelineStep` conventions. For DAG work, use the established DAG pipeline
  schema rather than inventing a parallel format.
- Use existing skill IDs from the skill catalog. Do not invent provider, API, or
  helper skill IDs unless the task explicitly includes creating the missing skill.
- Keep `data.text` flow explicit. Each step should consume either the previous
  step output, the original input through `{{INPUT}}`, or a named config value.
- Put per-step configuration on the step itself. The engine clears prior step
  config keys, so a later step must not depend on config bleed from an earlier
  step.
- Use `stepConfig` for JavaScript skills that need the whole step config map.
- Final user-facing output must be readable prose, markdown, table text, or a
  structured artifact summary. Raw JSON is acceptable only as an intermediate
  step or when the user explicitly requested raw JSON.

## Design Defaults

- Prefer a sequential pipeline when the workflow is linear, short, or easy to
  inspect.
- Prefer a DAG pipeline when independent branches can run in parallel, when a
  validation branch can fail fast, or when conditionals avoid expensive calls.
- Add a validation step for fragile outputs, generated code, external API
  payloads, or user-facing summaries that must satisfy a schema or quality bar.
- Budget at least 800 `llmMaxTokens` for validation steps on providers that spend
  thinking tokens, especially Gemini.
- Set `llmMaxInputChars` or upstream truncation when API responses can be large.
- For external APIs, constrain response size at the API layer with `per_page`,
  `maxResults`, date ranges, and `maxChars`.
- Store credentials in Keychain-backed provider skills. Never put credential
  placeholders, secrets, or tokens inside pipeline config.

## Output Discipline

When asked to return a pipeline artifact, use a fenced JSON block with only the
artifact unless the surrounding UI asks for explanatory text. When asked to
explain or review a pipeline, lead with behavioral risks, missing tests, and data
flow problems before offering polish suggestions.

Good final pipeline outputs usually include:

- A short title or digest heading.
- Human-readable findings grouped by source or priority.
- Links, dates, and identifiers preserved from source data.
- A brief "no results" path instead of empty or raw provider output.
- A validation or repair hint when required upstream data is missing.

## Testing Flywheel

1. Validate the artifact schema before saving.
2. Run the cheapest deterministic skill or branch first.
3. Run the full pipeline with a small input.
4. Inspect final output for raw JSON, empty placeholders, duplicated boilerplate,
   or missing source attribution.
5. Use DebugTestTunnel with unique `requestID` values. Treat the tunnel as a
   single-lane test harness and do not overlap pipeline runs.

## Common Failure Recipes

- **Raw JSON final answer**: add or repair an LLM transform step after API calls.
- **Missing credentials**: switch to a configured provider skill and document the
  setup requirement instead of embedding secrets.
- **Empty `{query}` placeholder**: require non-empty input or set `query` in the
  step config.
- **Oversized API response**: reduce API limits and add `maxChars` before the LLM.
- **Invalid skill ID**: use catalog lookup and replace invented IDs.
- **LLM parse failure**: lower output complexity, add validation, and preserve the
  failing output in logs for the repair turn.
