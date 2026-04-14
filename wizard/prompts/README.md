# wizard/prompts/

Prompt templates loaded by **mChatAI+ `PromptTemplateService`** at runtime. Editing a file here and committing causes all mChatAI+ installations to pick up the new prompt on their next launch (via git pull of `mchatai-source`), **without requiring an App Store rebuild**.

## How it works

`PromptTemplateService.shared.render("key.name", vars: [:])` scans four directories in priority order (later overrides earlier):

1. **App bundle** `Resources/Prompts/` — frozen at ship time, last-resort defaults
2. **Source dir** `Resources/Prompts/` — dev-only, overrides bundle when running from Xcode
3. **`mchatai-source` cache** `wizard/prompts/` — **THIS DIRECTORY** — git-backed live updates
4. **Firestore hot-patch** `DynamicConfig/Prompts/` — emergency overrides per user/tier

Auto-reloads every 30 seconds (`Tunables.promptTemplatesReloadIntervalSeconds`), so edits take effect without app restart once the cache pulls.

## File formats

Both `.md` (single-template, keyed by filename) and `.json` (multi-template) are accepted.

**Multi-template JSON** (preferred for grouping related prompts):
```json
{
  "planner.default": "You are a Planner agent...\n\n{{conversationText}}",
  "planner.miniapp": "You are a Planner agent for a mini-app project..."
}
```

**Placeholder substitution:** `{{varName}}` is replaced with the value passed in `render(vars: [:])`.

## Naming convention

`<domain>.<purpose>[.<variant>]`

- `planner.default` — main planner prompt
- `evaluator.default` — main evaluator prompt
- `evaluator.reference_regression` — regression guard when iterating on reference builds
- `autoFix.macOSApp` — macOS auto-fix system prompt
- `autoFix.miniApp.logic` — mini-app logic error fix
- `qa.macOSApp` — QA reviewer system prompt

## What belongs here vs. not

**BELONGS in mchatai-source/wizard/prompts/:**
- System prompts that describe agent roles ("You are a Planner...")
- Templates with `{{variable}}` placeholders for dynamic content
- Framework-agnostic instructions for LLMs

**Does NOT belong here:**
- Framework-specific type mappings — those live in `frameworks/{platform}/{id}/CONTEXT.md`
- Wisdom rules — those live in `wisdom/packs/{id}.json`
- Version pinning — those live in the scaffold's `Package.swift` / `package.json` / `Cargo.toml`

## Self-healing extension (Phase SH)

When the Self-Healing Agent observes repeated wizard failures, it can propose updated prompt content for any file here. Low-risk changes (clarifying wording) auto-apply via the DynamicConfig hot-patch layer. Higher-risk changes (new rules, removing guardrails) get HITL approval. All changes flow back as PRs to this directory, versioned via git.

## Updating a prompt

1. Edit the relevant `.json` or `.md` file
2. Commit + push to mchatai-source
3. Users with mChatAI+ pull the cache on next launch (automatic, background)
4. PromptTemplateService reloads within 30 seconds
5. Next wizard session uses the new prompt — zero rebuild needed
