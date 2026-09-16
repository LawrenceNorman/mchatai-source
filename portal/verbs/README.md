# Content-defined verbs (`portal/verbs/<applet>/<verb>.json`)

A verb here is served by `GenericVerbExecutor` with **no Swift and no rebuild**.
Adding one is a PR.

## What a manifest can and cannot do

It composes **registered capabilities** and nothing else. There is no file,
network or shell access to reach for, because those are not capabilities. That is
what makes a verb PR reviewable by reading it — check the *composition* and the
*safety class*; there is no hidden power to look for.

A genuinely new primitive is Swift. That boundary is the design, not a limitation
to work around.

## Fields

| Field | Meaning |
|---|---|
| `applet`, `verb` | How agents address it. |
| `safetyClass` | `read` < `write` < `dangerous`. Must be **≥ the highest class of every capability used** — the loader refuses a manifest that under-declares. |
| `releaseLanes` | `debug` / `developerid` / `mas`. **Omitted means debug only** — a verb that forgot to say is one nobody decided to ship. |
| `params` | `type`, `required`, `default`, `min`/`max`, `enum`, `summary`. Unknown arguments are refused with a suggestion, never dropped. |
| `steps` | Ordered. Each has an `id`; later steps read `${<id>.result.<path>}`. |
| `forEach` | Fans a step over an array; `${item.<field>}` binds the element, outputs collect under `${<id>.results}`. |
| `output` | `summary` and `result`, interpolated from the scope. |

## Bindings are data, not code

`${params.x}` and `${step.result.y}` look up a value. There are no expressions.
A binding that is exactly one reference keeps its type (an int stays an int);
anything else is interpolated into a string. Logic belongs in a capability.

## Bounds

At most 12 steps, 40 `forEach` iterations, and a 120s wall clock. A content verb
cannot run unbounded work.

## When a manifest is refused

Validation happens at LOAD, not on first use — a verb that would fail when called
is worse than one that never appears, because an agent discovers it, plans around
it, and only then finds out. Refusals are listed by `diagContentVerbs` with the
reason, so a bad PR is visible immediately rather than silently absent.
