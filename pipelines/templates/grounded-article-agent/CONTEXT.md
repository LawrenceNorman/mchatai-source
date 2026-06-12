# Grounded Article Agent

Turns a topic into a short, **source-grounded, self-fact-checked** article. This is the content-first answer to the DocketHaven failure where research output was stale, uncited, and unverifiable.

## Flow

1. **`builtin.perplexitySearch`** (`model: sonar`, `recency: month`) — live web search that returns real titles + URLs + snippets. This is the grounding. Capability-gated: needs a Perplexity API key OR mChatAI Cloud compute tokens; with neither it fails fast with an actionable message (better than a silent ungrounded article).
2. **`builtin.llmGenerate`** (article) — writes a focused ~500-word article that cites ONLY the search results, with inline `[n]` markers and a `## Sources` section using the exact returned URLs. Length is deliberately capped so the whole article + Sources fits the self-check window (see below).
3. **`builtin.llmGenerate`** (self-check, `llmValidationMode: true`, `llmProvider: google`) — a strict fact-checking gate. It asserts: every cited claim maps to a listed source; no unsourced stat/date/figure/quote; a `## Sources` section with >= 2 real http(s) URLs; no filler; ASCII only. A **different model family** (Google) grades, to avoid a model rubber-stamping its own output.
4. **`builtin.saveArtifact`** — saves `grounded-article.md`.

## Self-check is fail-CLOSED (important)

`llmValidationMode` is the gate mechanism:
- **PASS** → the full article is restored to the pipeline text → the article is saved.
- **FAIL** → the pipeline text becomes `PIPELINE_VALIDATION_FAILED: <reason>` → that marker is what gets saved, NOT a polished-but-fabricated article.

So a failed quality check produces a visibly-failed artifact, not a plausible fake. **Do not insert any step between the self-check and `saveArtifact`** — it would overwrite the text and silently un-fail the gate.

## Known caveat (v1)

The self-check truncates its view of the article to the first 4000 chars (a fixed `llmValidationMode` limit; `llmMaxInputChars` does not override it). That is why the article is capped at ~500 words — so the body AND the `## Sources` footer both fit inside the gate's window. A longer article would have its Sources truncated away and the gate would false-fail. A future engine-level fail-closed abort + a graded (non-binary) score are tracked as follow-ups.

## Verify

- **Positive:** run with a real recent topic; the saved `.md` must be a real article with inline `[n]` markers and a `## Sources` block of real URLs — and must NOT contain `PIPELINE_VALIDATION_FAILED`.
- **Negative (the proof the gate works):** run with an un-researchable / fabrication-bait topic; the saved `.md` must contain `PIPELINE_VALIDATION_FAILED: <reason>` (the agent refused to fabricate). A gate that never fails is indistinguishable from no gate.
