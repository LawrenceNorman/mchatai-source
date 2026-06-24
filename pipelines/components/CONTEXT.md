# Pipeline Components — Lego Context

Framework-level guide for the mChatAI+ pipeline Lego system. The harness pulls this into the LLM prompt for any task targeting `recipe.pipeline-builder` or when a user prompt implies building a new automation pipeline.

For the full pipeline template catalog see [`../templates/`](../templates/). For the component index see [`_index.json`](_index.json).

---

## What Is a Pipeline Component?

A **pipeline component** is a reusable step pattern — a named, documented combination of one or more `builtin.*` skill calls with their proven config values. Components are the Lego bricks. Templates are finished builds made from those bricks.

When a user says "build me a pipeline that reads my email and reads it to me", the LLM should:
1. Consult `_index.json` to find the right bricks (`gmail-fetch`, `llm-summarize`, `tts-notify`)
2. Assemble them in order
3. Use config values from this file as defaults

**Never hardcode LLM prompts in Swift.** All pipeline seed data lives here and is loaded at runtime via `refreshMchataisourceCache`.

---

## Skill ID Reference

All built-in skills available as pipeline steps:

### Data / Fetch
| skillID | What it does | Key config keys |
|---|---|---|
| `builtin.loadWebFeed` | Fetch RSS/Atom feed | *(none required — uses input URL)* |
| `builtin.webExtract` | Scrape a URL to plain text | `url`, `maxChars`, `includeMetadata` |
| `builtin.webSearch` | Web search query | `query` |
| `builtin.memorySearch` | Search user knowledge base | `query`, `maxResults` |
| `builtin.todoList` | All todo projects | `includeCompleted`, `includeNotes` |
| `builtin.todoRecentSummary` | N most recent todos | `limit`, `todoSortBy`, `includeCompleted` |
| `builtin.gmail` | Read or send email | `gmailMode` (`fetch`/`send`), `query`, `maxResults`, `to`, `subject` |
| `builtin.readFile` | Read a file from disk | `path` |
| `builtin.findInFiles` | Grep across files | `directoryPath`, `searchString`, `fileExtensions`, `recursive` |
| `builtin.httpWebhook` | HTTP GET/POST | `url`, `method`, `body` |
| `builtin.github` | GitHub API | `path`, `method`, `queryParamsJSON` |
| `builtin.telegram` | Telegram poll or send | `telegramMode` (`agentPoll`/`send`), `limit`, `offsetStoreKey`, `persistOffset`, `skipStepsIfNoMessage` |
| `builtin.mcp.toolCall` | Call any MCP server tool | `serverID`, `toolName`, `arguments` (JSON string) |

### Transform / Generate
| skillID | What it does | Key config keys |
|---|---|---|
| `builtin.llmGenerate` | LLM text generation | `userPrompt`, `systemPrompt`, `llmMaxTokens`, `llmTimeout`, `llmMaxInputChars`, `llmValidationMode` |
| `builtin.llmAgentic` | LLM with tool use | `userPrompt`, `systemPrompt`, `llmMaxTokens` |
| `builtin.ttsGenerate` | Text-to-speech | *(none — uses `data.text`)* |
| `builtin.csvTable` | Parse CSV to table | *(none — uses `data.text`)* |
| `builtin.jsonTransform` | Transform JSON | `jqExpression` |
| `builtin.textChunk` | Chunk long text | `chunkSize`, `overlap` |
| `builtin.ocr` | Extract text from image | `imagePath` |
| `builtin.shell.cliExecute` | Run shell command | `command` |
| `builtin.shell.playwrightTest` | Browser automation | `script`, `url` |

### Output / Save
| skillID | What it does | Key config keys |
|---|---|---|
| `builtin.saveArtifact` | Save text artifact | `artifactName`, `artifactExtension` (`md`/`txt`/`html`) |
| `builtin.saveArtifact` | Save audio artifact | `audioArtifactName`, `saveText` (`"false"`) |
| `builtin.notify` | Desktop notification | `notifyTitle`, `notifyBody` |
| `builtin.postToFeed` | Post to user feed | `feedTitle`, `feedIcon` |
| `builtin.slack` | Send Slack message | `channel`, `message` |

### Control Flow
| skillID | What it does | Key config keys |
|---|---|---|
| `builtin.condition` | Branch on value | `expression` |
| `builtin.retry` | Retry on failure | `maxAttempts`, `delaySeconds` |
| `builtin.forEachLoop` | Iterate over items | `delimiter` |
| `builtin.humanInLoop` | Pause for approval | `prompt` |

---

## Component Patterns (Lego Bricks)

These are the named reusable patterns. Each has a canonical config. Mix and match to build templates.

### `web-fetch-summarize`
```
builtin.webExtract  →  builtin.llmGenerate
```
Config defaults:
- `webExtract`: `maxChars: "60000"`, `includeMetadata: "false"`
- `llmGenerate`: `llmMaxInputChars: "8000"`, `llmMaxTokens: "1600"`, `llmTimeout: "90"`
- Prompt pattern: "Summarize the content below... Return plain markdown."

### `llm-to-speech-notify`
```
builtin.ttsGenerate  →  builtin.saveArtifact (audio)  →  builtin.notify
```
Config defaults:
- `saveArtifact`: `saveText: "false"`, `audioArtifactName: "<name> Audio"`
- `notify`: `notifyTitle: "<name>"`, `notifyBody: "Your audio is ready."`

### `llm-to-doc-save`
```
builtin.llmGenerate  →  builtin.saveArtifact (md)
```
Config defaults:
- `llmGenerate`: `llmMaxTokens: "2400"`, `llmTimeout: "90"`
- `saveArtifact`: `artifactExtension: "md"`

### `feed-to-podcast`
```
builtin.loadWebFeed  →  builtin.llmGenerate (script)  →  builtin.saveArtifact (script)  →  builtin.ttsGenerate  →  builtin.saveArtifact (audio)  →  builtin.notify
```
The canonical podcast chain. LLM prompt must output **plain text only** (no markdown) because TTS reads markdown symbols aloud.

### `gmail-digest`
```
builtin.gmail (fetch)  →  builtin.llmGenerate  →  builtin.saveArtifact  →  builtin.notify
```
Config defaults:
- `gmail`: `gmailMode: "fetch"`, `maxResults: "20"`, `query: "is:unread in:inbox"`

### `gmail-draft-approve-send`
```
builtin.gmail (fetch)  →  builtin.llmGenerate  →  builtin.humanInLoop  →  builtin.gmail (send)
```
The human-in-the-loop email reply pattern. `humanInLoop` config: `prompt: "Review the draft reply above. Edit if needed, then approve to send."`

### `telegram-kb-bot`
```
builtin.telegram (agentPoll)  →  builtin.memorySearch  →  builtin.llmGenerate  →  builtin.telegram (send)
```
Config defaults:
- `telegram poll`: `telegramMode: "agentPoll"`, `ignoreBotMessages: "true"`, `persistOffset: "true"`, `skipStepsIfNoMessage: "2"`, `limit: "20"`, `timeout: "10"`
- `telegram send`: `telegramMode: "send"`, `parseMode: "Markdown"`

### `mcp-fetch-summarize`
```
builtin.mcp.toolCall (fetch)  →  builtin.llmGenerate  →  builtin.saveArtifact  →  builtin.notify
```
Config defaults:
- `mcp.toolCall`: `serverID: "fetch"`, `toolName: "fetch"`, `arguments: "{\"url\": \"<url>\", \"max_length\": 10000}"`

### `todo-to-report`
```
builtin.todoList  →  builtin.llmGenerate  →  builtin.saveArtifact
```
Config defaults:
- `todoList`: `includeCompleted: "false"`, `includeNotes: "true"`

### `shell-summarize`
```
builtin.shell.cliExecute  →  builtin.llmGenerate  →  builtin.notify
```
Config defaults:
- `llmGenerate`: `llmMaxInputChars: "4000"`, prompt: "Summarize the command output below..."

### Deep Research Lego

Use these components when the user asks for deep research, DRACO-style evaluation, legal/finance/medical research, product comparison, academic literature review, or needle-in-haystack source tracing.

Recommended chain for rigorous web research:
```
primary-source-finder -> source-credibility-ranker -> date-sensitive-source-checker -> duplicate-source-collapse -> source-quote-extractor -> claim-ledger -> citation-claim-verifier -> rubric-expectation-checklist -> objectivity-limitations-pass
```

Config defaults:
- Use `builtin.webSearch` with multiple query variants for `primary-source-finder` and `date-sensitive-source-checker`.
- Use `builtin.webExtract` with `maxChars: "60000"` and `includeMetadata: "true"` for source-reading steps.
- Use `builtin.llmGenerate` with `llmMaxTokens: "3200"` to produce source tables, claim ledgers, and verification reports.
- Any final answer prompt must require: direct answer, evidence and analysis, caveats or uncertainty, and sources.

Prompt rules:
- Do not cite search snippets or unopened pages.
- Prefer primary sources for law, finance, medicine, academic claims, product specs, prices, and current capabilities.
- Every material claim needs a supporting source URL or must be labeled as inference/uncertain.
- Date-sensitive claims need filing, release, effective, access, price, trial, or guideline dates as applicable.
- For legal, medical, and financial topics, provide informational analysis only and avoid advice.

---

## Critical Rules for Pipeline LLM Prompts

1. **Plain text when feeding TTS.** Any `llmGenerate` step whose output goes into `ttsGenerate` MUST end its prompt with: `"Return plain text only — no markdown headings, bullets, asterisks, or code fences."`

2. **`{{INPUT}}` is the data bus.** Use `{{INPUT}}` in `userPrompt` to reference the previous step's output. Do not invent other placeholder names.

3. **All config values are strings.** Even booleans (`"true"`) and numbers (`"2400"`) must be quoted strings in the JSON.

4. **UUIDs must be hex-only.** Characters 0-9 and A-F only. Never use letters like G, H, M, N, P, S, T, U, W as mnemonics — they are not valid hex and crash the app on launch.

5. **llmMaxTokens budget.** Minimum `"800"` for validation steps (Gemini thinking tokens). Use `"1200"`–`"2400"` for summaries, `"3200"` for long-form generation. Never exceed `"32000"`.

6. **llmValidationMode.** Use sparingly — only for pipeline guard steps. Set `llmMaxInputChars: "4000"` alongside it. Output must be exactly `"VALID"` or `"PIPELINE_VALIDATION_FAILED: <reason>"`.

7. **No raw JSON output to user.** Any `llmGenerate` step that feeds `saveArtifact` or `notify` must produce human-readable text. Tell the LLM explicitly.

8. **stepConfig bleed.** PipelineEngine clears the previous step's config keys before each step. Don't rely on keys from a previous step being available — set them explicitly per step.

---

## Template Assembly Guide

When building a new pipeline from a user prompt:

1. **Identify the source** — what data does the pipeline need? (web, email, todos, file, user input)
2. **Identify the transform** — what should happen to it? (summarize, translate, generate, reformat)
3. **Identify the output** — where does it go? (audio, document, notification, message, feed)
4. **Pick the matching component patterns** from the list above
5. **Chain them** — the `data.text` output of each step is the `{{INPUT}}` of the next
6. **Write prompts** — be specific about output format; add "plain text only" if feeding TTS
7. **Generate all UUIDs via `uuidgen`** — never hand-type them

**Multi-source pipelines** (e.g. "todos + news"): use two sequential fetch steps, then a single `llmGenerate` that merges both inputs in its prompt (pass the first output inline in the prompt template, use `{{INPUT}}` for the second).
