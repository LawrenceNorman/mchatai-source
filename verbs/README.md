# Verbs — the steps an on-device agent can take

Phase AV.0 (2026-11-09). Design: `mchatai_macOS/docs/IOS_AGENT_SKILLS_PLAN.md`; the Mac's
content verb engine it mirrors: `mchatai_macOS/docs/CONTENT_VERB_ENGINE.md`.

```
verbs/
  ios/_nouns.json          the typed things verbs pass around (Text, Document, WebPage, Paper, Episode, Transcript, Source, File)
  ios/_capabilities.json   the Swift atoms the iOS app implements; content can only compose these
  ios/<id>.json            one verb per file: a planner-facing record bound to one capability, or a recipe of `steps`
  validate_verbs.py        the gate; `--compiled` also checks the copy the chat fetches
  build_index.py           compiles the verbs into personas/_verbs.json and personas/_index.json (bumps the version)
  _tests/                  python3 -m unittest discover -s verbs/_tests
```

A verb record:

| field | meaning |
|---|---|
| `id` | the tool name the planner calls; letters, digits, `_`; stable once a pack names it |
| `title`, `summary` | what a person reads in "What can I ask?" and on a step line |
| `whenToUse` | the planner's hint; falls back to `summary` |
| `arguments[]` | `{name, type: string|int|bool, description, required?, noun?}`; `noun` says the string refers to a typed thing (a Document's id or title) |
| `reason` | default true: the engine adds a `reason` argument the model fills ("why this step, for the person watching"); shown on the step line; never declare it yourself |
| `inputs[]`, `outputs[]` | nouns consumed and produced; what lets "Run this step" offer the right input and a chain be checked before it runs |
| `capability` | the one atom this verb binds, from `_capabilities.json` |
| `steps[]` | instead of `capability`: `{id, capability, with: {arg: "${args.x}" or "${step.result.field}"}}`; data-only bindings, no expressions; ≤12 steps |
| `output` | for a recipe: `{summary, open}` templates |
| `safetyClass` | `read` < `write` < `dangerous`; at least the highest class of the capabilities used |
| `network` | true when any capability used reaches the internet (a globe in the UI) |
| `routeWords`, `routeOnAddress` | when the router may add this verb to a pack with `catalogVerbs`: whole words a sentence must contain, or a web address in it. Keep them distinctive: a word every verb shares makes the planner's list longer and worse |
| `example` | a sentence a person can say; "Try:" in the browser |
| `releaseLanes` | `debug`, `developerID`, `mas`; absent = debug only |
| `appIntent` | may Shortcuts and Siri run it alone (never for `dangerous`) |
| `aliases` | `{oldArgumentName: argument}` so a renamed argument keeps working |
| `recipe` | true for a fixed chain the chat runs with no planner |

Rules: a new **composition** of existing capabilities is a PR here (zero rebuild); new native power
is a Swift capability first (`Shared/OnDeviceAgent/AgentCapabilityRegistry.swift`), then listed in
`_capabilities.json`; the iOS drift test fails when the two disagree. A pack names at most six verbs
(small planners degrade past that); the catalog can hold hundreds.

After editing: `python3 verbs/build_index.py && python3 verbs/validate_verbs.py --compiled &&
python3 personas/validate_personas.py personas/_index.json`.
