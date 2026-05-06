# Web Components Lego Capability Pack

Use this pack when generating a miniApp artifact (single-file HTML game/utility) and a web-components recipe matches the user's goal. The pack injects the catalog index of available Lego components and the marker contract that QA enforces on the generated artifact.

## What the LLM gets in trim mode (default for Claude Code, post-LF.1)

A compact index of every component, NOT their full source:
- `id` — the component identifier used in the marker (`ui.mini-header`, `entities.chess-rules`, etc.).
- `summary` — one-line description of what the component does.
- `exports` — the symbol names the component exports (so imports type-check mentally).
- `path` — the relative path under `./web-components/` for module imports.
- `tags` — short keywords for filtering.

Component source lives on disk at `./web-components/<path>` and is fetched on demand:
- via the `mchatai-web-components` MCP server (`read_component(id)`) — preferred.
- via direct `Read` of the file path — works when the CLI has filesystem access to the cwd.

## What the LLM gets in inline mode (legacy / fallback for older models)

Full source of every starter component pre-loaded into the prompt. ~30-50KB extra. Used when the LLM can't reliably tool-call to fetch source on demand. Demoted to `trim` automatically once the backend's tool-call veracity score crosses the threshold in `harness/disclosure/cli-mode.json`.

## Marker contract (always enforced regardless of mode)

Generated mini-app HTML MUST include the marker block as the first child of `<body>`:

```html
<script type="application/json" id="mchatai-web-components-used">
{
  "recipe": "<recipe-id>",
  "components": ["ui.mini-header", "core.turn-based-manager", ...],
  "mode": "module-imports"
}
</script>
```

The marker enforces:
- The artifact declares which recipe it follows (`recipe.chess`, `recipe.tic-tac-toe`, etc.).
- The artifact lists the components it actually used (the gate cross-references this against the recipe's `requiredComponents`).
- The composition mode is one of `module-imports` (preferred) or `single-file-inline` (fallback).

If the marker is missing or omits required components, the harness rejects the artifact and triggers a re-generation with explicit retry instructions.

## Composition modes

**module-imports** (preferred): the publisher bundles a `./web-components/` sidecar directory with the artifact. The HTML uses `<script type="module">` to `import { … } from "./web-components/<component-path>"`. Source stays unchanged on disk.

**single-file-inline**: the artifact is a single self-contained HTML file with no sidecar. Each component's source is copied verbatim and fenced by `// ===== BEGIN mChatAI Web Component: <component-id> =====` / `// ===== END mChatAI Web Component: <component-id> =====` comments. Used for static-deploy targets that can't host the sidecar.

## Golden-assembly fallback

When the LLM emits a markerless monolith but a recipe matched the goal, the harness composes the canonical Lego artifact from the recipe's registered `goldenAssembly` (under `frameworks/web-components/examples/<game>/`) and installs that instead. The fallback is best-effort; if the recipe lacks a golden assembly entry, the artifact is rejected with a re-gen instruction.

## When to NOT use this pack

- Pure documentation requests ("explain how chess rules work") — use general LLM context, no Lego.
- Native macOS app goals — use `macos-components` instead.
- Plain text/data tools where no UI is generated.
- Goals whose recipe matcher returns no recipe with score ≥ 25 — the pack still loads but the recipe section will be empty; the LLM should treat it as "no canonical Lego applies, build from scratch but follow the marker contract anyway."
