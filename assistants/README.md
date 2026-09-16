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

## Optional prompt files

`CONTEXT.md` is injected into every brief — the cheapest place to put expertise.
It informs HOW the assistant works; it cannot change what it is permitted to do.
It is appended *after* the standing rules so a domain file cannot quietly rewrite
the approval boundary.

`distill.md` overrides what counts as durable for this assistant. What is worth
keeping genuinely differs — a LitRPG assistant should retain a character's
established eye colour, which in a job search would be noise. Omit the file to
use the shared judgement; an EMPTY file falls back rather than distilling
nothing, because an assistant that silently stopped remembering would be very
hard to notice.

## Asking another assistant

`assistant.ask {assistantID, question}` relays one question. Three limits, none
optional: **one hop** (an assistant you ask cannot ask another on your behalf —
otherwise it is an unbounded spend loop), **the callee's daily budget**, and the
answer comes back **fenced as data**. That last one matters most: a browsing
assistant reads arbitrary pages, so relaying its output unfenced into a context
that can call other assistants would give any page the user visits a path into a
privileged context. A relayed answer can never authorise an action.
