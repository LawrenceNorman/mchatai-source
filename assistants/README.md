# Assistants

One directory per assistant. Adding one is a PR — no rebuild, no App Store review.

```
assistants/<id>/
  assistant.json    required — identity and configuration
  CONTEXT.md        optional — domain expertise injected into the brief
  brief.md          optional — how to shape this assistant's brief
  distill.md        optional — what counts as durable FOR this assistant
```

## assistant.json

| Key | Meaning |
|---|---|
| `id` | Must match the directory name. The directory wins if they disagree — it is what memory scopes are keyed on. |
| `displayName` | What a person calls it. |
| `blurb` | One line, shown when choosing an assistant. |
| `memoryScope` | Defaults to `id`. Name another assistant's scope to deliberately share a memory pool. |
| `cadence` | `daily` \| `weekly` \| `manual`. |
| `tools` | Verb grants — `"aiweb.getCurrentPage"`, `"ledger.*"`, or `"*"`. **`null` means unrestricted.** |
| `budgetUSDPerDay` | Advisory ceiling. `null` for none. |
| `backend` | Preferred CLI. Falls back to whatever is available. |

## Two things worth getting right

**Memory scope is isolation, not decoration.** Each assistant reads its own scope
plus `shared`. Put facts about the PERSON — their name, their city, how they like
to be written to — in `shared`, so a new assistant inherits them instead of making
the user repeat themselves. Put anything subject-specific in the assistant's own
scope; a book assistant carrying a job search's priorities is the failure this
exists to prevent.

**`tools` is a real boundary.** An assistant with no reason to touch a signed-in
browser should not be able to. Start narrow — adding a grant later is a one-line
PR, and the refusal names exactly what was missing.

## The one that already exists

`personal/` is the Personal Assistant that shipped before manifests existed. Its
`purpose` string on disk is still the legacy `personal-assistant`, and always will
be — sessions and memories are persisted with it. Every other assistant uses
`assistant:<id>`.
