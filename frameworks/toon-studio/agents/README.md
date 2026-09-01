# ToonStudio Agents

An **agent** is a named recipe that ends with a finished film. Absurd News is one. A
retold fairy tale is another. They appear in ToonStudio's **Agents** tab: pick one, give
it a line of text if it wants one, press Run, and watch the steps go by.

## Adding one is a PR

Drop a definition here, name it in `_index.json`, done — no rebuild. The binary knows how
to *run a named pipeline* and nothing about which pipelines exist, which is the whole
point: the interesting part of an agent is its prompts, and prompts are content.

```json
{
  "id": "absurd-news",
  "name": "Absurd News",
  "blurb": "One line for the card. Scannable.",
  "detail": "The longer version, shown once it is selected.",
  "icon": "megaphone",
  "pipeline": "Snark News Toon",
  "input": { "kind": "none" },
  "produces": "toon.film",
  "runMinutes": 3
}
```

`input.kind` is `"none"` (runs immediately) or `"prompt"`. A prompt agent should carry
`label`, `placeholder` and two to four `examples` — a blank box is the single biggest
reason a generative feature goes untouched, and the examples are one tap each.

`pipeline` is matched **by name** against the same catalog AI Automation and the tunnel
use, so all three run the same steps. Name one that is not installed and the card says so
instead of failing when it is pressed.

## The tab shows the pipeline

Under the Run button are the steps, numbered, read from the catalog that executes them —
including each LLM step's actual prompt. That is deliberate. A film produced by Absurd
News used to arrive in ToonStudio with no trace of where it came from: the recipe lived
in another applet, and the prompts that decide whether the output is any good were
invisible from the place you look at the output. A summary written alongside the agent
would have drifted from the steps; reading the steps themselves cannot.

## Ideas that fit the shape

Anything that gathers material, writes a script from it and films the result. A weekly
recap of a repo's commits. A children's version of a news story. A recipe read aloud by
two cooks who disagree. The machinery is identical; only the prompts differ.
