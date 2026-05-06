# mchatai-web-components MCP server

An MCP (Model Context Protocol) server that exposes the **mChatAI web-components catalog** as two tools: `list_components` and `read_component`. Lets MCP-aware CLIs (Claude Code, Codex, Gemini CLI) tool-call into the Lego catalog instead of pre-loading 30-50KB of component source into every miniApp prompt.

Companion to mChatAI Phase LF.1 (trim mode in the harness context layer) and LF.3 (per-backend disclosure mode).

## What it does

When Claude Code is generating a mini-app, the harness pre-loads only a compact catalog index of available components (id, summary, exports, path) — not their full source. When the LLM decides to use a component, it tool-calls into this MCP to fetch the source on demand.

## Tools

### `list_components({filter?, recipe?, limit?})`

Returns matching catalog entries in compact form:
```json
{
  "totalAvailable": 4,
  "returned": 4,
  "components": [
    {
      "id": "entities.chess-rules",
      "name": "ChessRules",
      "category": "entities",
      "path": "entities/ChessRules.js",
      "exports": ["ChessRules"],
      "summary": "Chess setup, piece movement, capture rules ...",
      "tags": ["chess", "board", "rules", "8x8"],
      "status": "ready"
    }
  ]
}
```

- `filter` — free-text substring matched against id/name/summary/tags. Optional.
- `recipe` — recipe id (e.g. `recipe.chess`). When set, returns only that recipe's required + optional components.
- `limit` — cap on entries (default 50, max 200).

### `read_component({id})`

Returns full component source plus metadata:
```json
{
  "id": "entities.chess-rules",
  "name": "ChessRules",
  "path": "entities/ChessRules.js",
  "exports": ["ChessRules"],
  "summary": "...",
  "contracts": { "helpers": [...], "scope": "..." },
  "dependencies": [],
  "goodFits": ["chess", "playable-chess"],
  "source": "// full ChessRules.js source ...",
  "sourceLength": 8273,
  "contextMD": null
}
```

If a `CONTEXT.md` lives next to the component file, it's returned as `contextMD`.

## Install

### Option A — Claude Code (preferred)

The mChatAI+ macOS app's MCP Setup screen will offer this server as a recommended install. Click **Add** to write the registration into `~/.claude/mcp.json` automatically.

The Add button registers `dist/server.mjs` — a **538KB self-contained bundle** that ships in this repo. No `npm install` needed at runtime; the bundle has every dependency inlined. The catalog template path resolves to your binary's git-pulled cache, so the bundle is always in sync with your `refreshMchataisourceCache` call.

### Option B — Manual

Add this entry to your Claude Code `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "mchatai-web-components": {
      "command": "node",
      "args": [
        "/Users/<you>/Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/source-cache/mchatai-source/mcp-servers/web-components/dist/server.mjs"
      ],
      "env": {}
    }
  }
}
```

Or set `MCHATAI_SOURCE_PATH` to your repo root and use a shorter `args` path.

Restart your Claude Code session so the MCP loads.

### Option C — npm (future)

Once published as `@mchatai/mcp-server-web-components`:

```json
{
  "mcpServers": {
    "mchatai-web-components": {
      "command": "npx",
      "args": ["-y", "@mchatai/mcp-server-web-components"]
    }
  }
}
```

## Verify

```bash
# After registering the server, restart Claude Code and run:
claude mcp call mchatai-web-components list_components --filter "audio"
# → should return AudioManager + any other audio-tagged components
```

## Source root resolution

The server resolves the mChatAI source root in this order:

1. `MCHATAI_SOURCE_PATH` env var.
2. The mChatAI+ binary's git-pulled cache at `~/Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/source-cache/mchatai-source` (works on any machine that's run mChatAI+).
3. Walking up from `cwd` looking for `frameworks/web-components/_index.json` (developer mode).

## Development

```bash
cd mchatai-source/mcp-servers/web-components
npm install
npm test           # smoke test (no MCP transport — direct module calls)
node server.js     # runs the MCP stdio server (dev, requires node_modules)
npm run build      # bundle to dist/server.mjs (538KB self-contained)
node dist/server.mjs   # runs the bundled stdio server (production, no deps)
```

After making changes to `server.js`, run `npm run build` and commit `dist/server.mjs` so the user's `refreshMchataisourceCache` picks up the new bundle.

## Files

- `server.js` — dev entry, requires `node_modules/`.
- `dist/server.mjs` — bundled production entry, ships in git, runs standalone.
- `test.js` — unit tests (catalog parse + recipe lookup + source read).
- `package.json` — declares deps for dev; `npm run build` regenerates the bundle.

## License

MIT.
