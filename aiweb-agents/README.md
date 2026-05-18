# AIWeb Agents

User-facing agents that operate on the page currently open in mChatAI+'s AIWeb tab.

Each agent is a directory containing a single `agent.json` file. The mChatAI+ binary reads
this directory from the source-cache at runtime — adding a new agent is a git PR, not a
Swift rebuild.

## Distinction from `agents/`

- `agents/` (sibling dir) — *platform-internal* agent prompt assets (planners, evaluators,
  component extractors) used by the AIWizard pipeline. Not visible to end users.
- `aiweb-agents/` (this dir) — *user-facing* agents that show up in the "Agents" tab of
  AIWeb. Each one takes the current page + user-provided form values and produces a result
  (single text blob, scored table, JSON, etc.).

## Directory shape

```
aiweb-agents/
  index.json                 # catalog: lists all agents with metadata
  README.md                  # this file
  <agent-id>/
    agent.json               # full agent definition (form + execution)
    CONTEXT.md               # optional: longer description for the in-app docs
```

## `index.json`

```json
{
  "schemaVersion": 1,
  "agents": [
    {
      "id": "relevance-scorer",
      "path": "aiweb-agents/relevance-scorer/agent.json",
      "title": "Score for Relevance",
      "shortDescription": "...",
      "icon": "scope",
      "tint": "blue"
    }
  ]
}
```

The Swift loader reads `index.json` for the catalog (cards in the Agents tab) and lazy-loads
each `agent.json` when the user clicks Run.

## `agent.json` schema (v1.0)

| Field | Type | Required | Purpose |
|---|---|---|---|
| `id` | string | yes | Stable identifier, matches dir name |
| `schemaVersion` | string | yes | "1.0" |
| `version` | string | yes | semver of the agent itself |
| `title` | string | yes | Card title |
| `shortDescription` | string | yes | 1-line card subtitle |
| `icon` | string | yes | SF Symbol name |
| `tint` | string | yes | One of: blue / green / purple / orange / teal / pink / red |
| `recommendedModel` | string | yes | Ollama model id (user can override via the model pill) |
| `form` | array | yes | Form schema — see below |
| `execution` | object | yes | Prompt + scope config — see below |
| `results` | object | yes | How to render results — see below |

### `form` array

Each entry describes one input field. Supported `type`s:

- `"textarea"` — multi-line string. Extra keys: `placeholder`, `minHeight`, `required`.
- `"slider"` — numeric. Extra keys: `min`, `max`, `default`, `step`, `suffix`.
- `"select"` — single choice. Extra keys: `options: [{value, label}]`, `default`.
- `"toggle"` — boolean. Extra keys: `default`.

Universal keys: `id`, `label`, `help` (optional).

### `execution` object

```json
{
  "supportsListingScan": true | false,
  "singlePage": {
    "system": "system prompt",
    "userTemplate": "user prompt with {{formFieldId}} and {{pageText}} placeholders"
  },
  "listingShortPass": {
    "system": "system prompt for the cheap pass-1 score",
    "userTemplate": "with {{title}} and {{snippet}} placeholders for the per-child scoring"
  }
}
```

Placeholders:
- `{{formFieldId}}` — replaced with the form value
- `{{pageText}}` — full extracted text of the current page (HTML innerText or PDF text+OCR)
- `{{title}}` and `{{snippet}}` — per-child values during listing scan
- `{{url}}` — current page URL

Two-pass listing scan flow (when `supportsListingScan: true` and the page looks like a listing):
1. For each detected child link, run `listingShortPass` with `{{title}}` + `{{snippet}}`
2. Filter by threshold (if the form has a `threshold` slider, use its value; otherwise show all)
3. For survivors, fetch the child page (HTML or PDF) and re-run `singlePage` with `{{pageText}}`
4. Final results sorted by score

### `results` object

```json
{
  "kind": "scored-table" | "markdown" | "json",
  "scoreKey": "score",            // for scored-table
  "primaryTextKey": "reason"      // for scored-table
}
```

- `scored-table` — agent output is JSON; renderer shows a sortable table with one row per
  evaluated item. `scoreKey` is the numeric column; `primaryTextKey` is the description.
- `markdown` — single markdown blob; renderer shows live-streaming markdown.
- `json` — raw JSON; renderer pretty-prints with copy/export.

## Adding a new agent

1. `mkdir aiweb-agents/<my-agent-id>`
2. Author `agent.json` matching the schema
3. Add an entry to `index.json`
4. PR — next `refreshMchataisourceCache` in mChatAI+ picks it up. No Swift changes.
