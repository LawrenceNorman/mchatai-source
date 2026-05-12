# mchatai-fundamentals MCP server

> Slice A of `docs/MCHATAI_FUNDAMENTALS.md` §6.2 — discovery surface for
> external CLI agents (Claude Code, Codex, Gemini CLI).

## What this exposes

One tool today:

- **`list_fundamentals({category?})`** — returns the catalog of every
  registered platform primitive (dictionaries today; palettes, emoji,
  geo, etc. as future slices ship). Output shape matches the
  `mchatai-fundamentals` prompt-context autoload layer and the
  `diagFundamentals` tunnel command so vocabulary stays consistent
  across surfaces.

Slice B will add `read_dictionary({id})`; the catalog already advertises
that surface intent, but the tool is not yet registered — see
`server.js` for the placeholder.

## Source root resolution

Mirrors the `mchatai-web-components` MCP server:

1. `MCHATAI_SOURCE_PATH` env var (preferred — set by the MCP Setup card
   in mChatAI+ when the user installs the server).
2. The binary's local cache at
   `~/Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/source-cache/mchatai-source/`.
3. Walk upward from `cwd` (and from `__dirname`) looking for the
   `frameworks/web-components/_index.json` sentinel.

If none resolve, the server fails to start with an actionable error.

## Local smoke test

```bash
cd mchatai-source/mcp-servers/fundamentals
npm install
npm test
```

The test bypasses the MCP transport and exercises the tool helpers
directly so it works without an MCP host.

## Running as an MCP server

```bash
MCHATAI_SOURCE_PATH=/abs/path/to/mchatai-source node server.js
```

Hosts (Claude Code, Codex, etc.) launch the binary via stdio and
register `list_fundamentals` automatically.
