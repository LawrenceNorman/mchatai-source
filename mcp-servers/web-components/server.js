#!/usr/bin/env node
// mchatai-web-components MCP server (Phase LF.2 — 2026-05-05).
//
// Exposes two tools so Claude Code / Codex / other MCP-aware CLIs can
// tool-call into the mChatAI web-components catalog instead of having
// the harness pre-load 30-50KB of component source into every miniApp
// prompt. Companion to LF.1 (trim mode in HarnessContextAssembler) and
// LF.3 (per-backend disclosure mode).
//
// Tools:
//   list_components({filter?, recipe?, limit?})
//     → array of {id, name, category, path, exports, summary, tags, status}
//     Filter is a free-text substring (matches id, name, summary, tags).
//     Recipe is a recipe id (e.g. "recipe.chess") — returns just that
//     recipe's required + optional components.
//
//   read_component({id})
//     → {id, name, path, exports, summary, contracts, source, contextMD?}
//     Returns the full component source from `frameworks/web-components/<path>`.
//     Includes CONTEXT.md if a sibling file exists.
//
// Source root resolution:
//   1. MCHATAI_SOURCE_PATH env var (preferred — set by Configure button
//      when the user installs from the MCP Setup screen).
//   2. ~/Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/
//      Application Support/mChatAI/source-cache/mchatai-source (the
//      binary's git-pulled cache; works on any machine that's run mChatAI+).
//   3. Search upward from cwd for a directory that contains
//      `frameworks/web-components/_index.json` (developer machine running
//      this server from inside the mchatai-source repo).

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const SERVER_NAME = "mchatai-web-components";
const SERVER_VERSION = "0.1.0";

function resolveSourceRoot() {
  const fromEnv = process.env.MCHATAI_SOURCE_PATH;
  if (fromEnv && existsSync(join(fromEnv, "frameworks/web-components/_index.json"))) {
    return fromEnv;
  }

  const containerCache = join(
    homedir(),
    "Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/source-cache/mchatai-source"
  );
  if (existsSync(join(containerCache, "frameworks/web-components/_index.json"))) {
    return containerCache;
  }

  // Walk up from cwd looking for the repo root.
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "frameworks/web-components/_index.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Walk up from this script's location too (handles npx-installed paths).
  let here = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(here, "frameworks/web-components/_index.json"))) return here;
    const parent = dirname(here);
    if (parent === here) break;
    here = parent;
  }

  throw new Error(
    `Could not resolve mchatai-source root. Set MCHATAI_SOURCE_PATH env var to the repo root.`
  );
}

const SOURCE_ROOT = resolveSourceRoot();
const CATALOG_PATH = join(SOURCE_ROOT, "frameworks/web-components/_index.json");

let cachedCatalog = null;
let cachedCatalogMtime = 0;

function loadCatalog() {
  const stat = statSync(CATALOG_PATH);
  const mtime = stat.mtimeMs;
  if (cachedCatalog && cachedCatalogMtime === mtime) return cachedCatalog;
  const raw = readFileSync(CATALOG_PATH, "utf8");
  cachedCatalog = JSON.parse(raw);
  cachedCatalogMtime = mtime;
  return cachedCatalog;
}

function compactComponentEntry(component) {
  return {
    id: component.id,
    name: component.name,
    category: component.category,
    path: component.path,
    exports: component.exports || [],
    summary: component.summary || "",
    tags: component.tags || [],
    status: component.status || "ready"
  };
}

function findRecipe(catalog, recipeID) {
  const recipes = catalog.compositionRecipes || catalog.recipes || [];
  return recipes.find((r) => r && r.id === recipeID) || null;
}

function listComponents({ filter, recipe, limit }) {
  const catalog = loadCatalog();
  const components = catalog.components || [];

  if (recipe) {
    const recipeMeta = findRecipe(catalog, recipe);
    if (!recipeMeta) {
      return { error: `Recipe not found: ${recipe}`, components: [] };
    }
    const required = recipeMeta.requiredComponents || [];
    const optional = recipeMeta.optionalComponents || [];
    const ids = new Set([...required, ...optional]);
    const matching = components.filter((c) => ids.has(c.id)).map(compactComponentEntry);
    return {
      recipe: recipe,
      requiredComponents: required,
      optionalComponents: optional,
      components: matching
    };
  }

  let filtered = components;
  if (filter) {
    const needle = String(filter).toLowerCase();
    filtered = components.filter((c) => {
      const hay = [c.id, c.name, c.summary, ...(c.tags || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }

  const cap = Math.max(1, Math.min(Number(limit) || 50, 200));
  return {
    totalAvailable: filtered.length,
    returned: Math.min(filtered.length, cap),
    components: filtered.slice(0, cap).map(compactComponentEntry)
  };
}

function readComponent({ id }) {
  if (!id) {
    return { error: "Missing required parameter: id" };
  }
  const catalog = loadCatalog();
  const component = (catalog.components || []).find((c) => c.id === id);
  if (!component) {
    return { error: `Component not found: ${id}` };
  }

  const sourcePath = join(SOURCE_ROOT, "frameworks/web-components", component.path);
  if (!existsSync(sourcePath)) {
    return {
      ...compactComponentEntry(component),
      error: `Source file missing on disk: ${component.path}`,
      contracts: component.contracts || null
    };
  }

  const source = readFileSync(sourcePath, "utf8");

  // Optional sibling CONTEXT.md (per-component documentation).
  const contextPath = join(SOURCE_ROOT, "frameworks/web-components", dirname(component.path), "CONTEXT.md");
  let contextMD = null;
  if (existsSync(contextPath)) {
    contextMD = readFileSync(contextPath, "utf8");
  }

  return {
    ...compactComponentEntry(component),
    contracts: component.contracts || null,
    dependencies: component.dependencies || [],
    goodFits: component.goodFits || [],
    source,
    sourceLength: source.length,
    contextMD
  };
}

// MCP server wiring
const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_components",
      description:
        "List mChatAI web-component catalog entries (compact form: id, name, exports, path, summary, tags). Filter by free-text substring or by recipe id. Use this to discover what components exist before calling read_component.",
      inputSchema: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            description: "Free-text substring matched against id/name/summary/tags. Optional."
          },
          recipe: {
            type: "string",
            description:
              "Recipe id (e.g. 'recipe.chess'). When set, returns only the recipe's required + optional components."
          },
          limit: {
            type: "integer",
            description: "Cap on returned entries (default 50, max 200)."
          }
        },
        additionalProperties: false
      }
    },
    {
      name: "read_component",
      description:
        "Fetch the full source of a web-component by id (e.g. 'entities.chess-rules'). Returns the source code, contracts, dependencies, and an optional sibling CONTEXT.md. Use this to verify a component's API before importing — do not invent function signatures.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description:
              "The component id to fetch (e.g. 'core.game-manager', 'entities.chess-rules', 'ui.mini-header')."
          }
        },
        required: ["id"],
        additionalProperties: false
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let result;
  try {
    if (name === "list_components") {
      result = listComponents(args || {});
    } else if (name === "read_component") {
      result = readComponent(args || {});
    } else {
      result = { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    result = { error: String(err && err.message ? err.message : err) };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(
  `[${SERVER_NAME}] connected — source root: ${SOURCE_ROOT}\n`
);
