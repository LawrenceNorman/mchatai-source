# CCAA — Continuous Conscious Automation Agent

Content directory for the CCAA running in mChatAI+. The Swift side is a thin
harness that loads its prompt + reflection templates from here via
`PromptTemplateService`. Everything in this directory is hot-reloaded — edit,
`git push`, trigger `refreshMchataisourceCache` from the debug tunnel (or wait
the 30s auto-reload), and the next synthesis run picks up the change. **No app
recompile or relaunch required.**

## Layout

```
ccaa/
  README.md                 # this file
  prompts/
    ccaa.synthesis.md       # main "soul document" — feeds CCAASynthesisEngine.buildSystemPrompt()
    ccaa.reflection.md      # self-reflection prompt (runs after synthesis, ≥5 prior scenarios)
```

## Template names (how Swift loads them)

`PromptTemplateService.shared.render("ccaa.synthesis", vars: [:])` ← this file
`PromptTemplateService.shared.render("ccaa.reflection", vars: [...])` ← reflection prompt

The file's name (without `.md`) is the template name. Swift falls back to a
bundled baseline if the template isn't loaded, but the baseline is intentionally
minimal — real content lives here.

## Variables available to synthesis.md

None today. The context bundle (cross-applet signals) is passed as the user
message, not interpolated into the system prompt.

## Variables available to reflection.md

- `{{total}}` — total scenarios generated across history
- `{{actedOn}}` — how many the user acted on
- `{{dismissed}}` — how many the user dismissed
- `{{thisRunCount}}` — scenarios generated this run
- `{{recentScenariosList}}` — bulleted list of this run's scenarios

## Iteration loop (zero-recompile)

1. Edit `prompts/ccaa.synthesis.md`
2. `cd mchatai-source && git add -A && git commit -m "ccaa: tighten scenario prompt" && git push`
3. Tunnel: `{"command":"refreshMchataisourceCache"}` — forces pull + PromptTemplateService reload
4. Tunnel: `{"command":"diagCCAAObserve","force":true}` — verify output improved
5. Repeat until happy. Ship to users via next mchatai-source push (no DMG, no App Store).
