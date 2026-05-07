---
artifact:
  type: pipeline
  id: official.pipeline.mcp-web-research
  name: MCP Web Research
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-06
  updated_at: 2026-05-06

purpose:
  summary: Fetches a URL via the MCP fetch server and summarizes the content as a research brief.
  problem_solved: Demonstrates the MCP fetch pattern — the canonical starting point for MCP-driven pipelines.
  intended_users: Power users with MCP servers connected who want a working reference pipeline.

architecture:
  language: json
  frameworks: [pipeline-engine, mcp]
  platform: mchatai-plus
  has_ui: false
  requires_auth: true

dependencies:
  external_apis: [mcp-fetch-server, any-public-url]
  internal_services: [builtin.mcp.toolCall, builtin.llmGenerate, builtin.saveArtifact, builtin.notify]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[0].config.arguments, steps[0].config.serverID, steps[0].config.toolName]
  build_command: none
  test_command: "Ensure fetch MCP server is registered and connected. Run pipeline. Verify artifact saved."
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [mcp, web, research, fetch, power-user]
---

## What This Does

Uses the MCP `fetch` server to retrieve a URL (bypassing the built-in webExtract for cases where MCP provides richer access), passes the content to an LLM for structured summarization, saves the brief, and notifies. This is the reference implementation for the `mcp.toolCall → llmGenerate` pattern shown in the Pipelines view screenshot.

## How to Continue Building This

- **Change the URL**: Edit `steps[0].config.arguments` JSON string — update the `url` value.
- **Use a different MCP server**: Change `serverID` and `toolName` to any registered MCP server tool. The `arguments` JSON must match that tool's parameter schema.
- **Chain multiple MCP calls**: Add a second `mcp.toolCall` step with a different tool before the `llmGenerate` step to enrich the research context.
- **Obsidian variant**: Change `serverID` to your Obsidian MCP server, `toolName` to `search`, and update `arguments` to search your vault.

### Critical Entry Points
- **`steps[0].config.arguments`** — JSON string of tool arguments. Must be valid JSON matching the MCP tool's schema. The `fetch` tool takes `url` (required) and `max_length` (optional, default 5000 chars).
- **`steps[0].config.serverID`** — must match a server registered in AI Automation → Network → MCP Workspace.
- **`steps[0].config.toolName`** — the specific tool on that server. Use `builtin.mcp.discoverTools` to list available tools.

### Key Concepts
- MCP calls are proxied through mChatAIShell (HTTP to port 8765 with bearer token auth). The shell must be running.
- `mcp.toolCall` output lands in `data.text` as the tool's response text. For tools that return JSON, the full JSON string is in `data.text` — add a `jsonTransform` step to extract specific fields if needed.
- Register MCP servers via AI Automation → Network → MCP Workspace tab → "Discover Tools" to refresh the catalog.
