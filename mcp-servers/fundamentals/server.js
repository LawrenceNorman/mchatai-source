#!/usr/bin/env node
// mchatai-fundamentals MCP server — Slices A + B + C (2026-05-12 → 2026-05-14).
//
// Exposes three tools so external CLI agents (Claude Code / Codex / Gemini
// CLI) can discover, consume, and INVOKE platform-shipped capabilities
// without out-of-band knowledge:
//
//   list_fundamentals({category?})
//     → {fundamentals: [{id, category, summary, version, size_kb,
//                        surfaces:{mcp?, promptToken?, skill?, runtime?,
//                                  nativeSwift?, wisdomResource?}}],
//        categories: [...]}
//     Optional `category` filter (e.g. "dictionaries") narrows the result.
//
//   read_dictionary({id})
//     → {id, category:"dictionaries", version, format, sizeBytes, content}
//     Returns the verbatim JS-const text for a dictionary id (e.g.
//     "english-5letter"). The Swift accessor
//     MchataiContentService.shared.dictionaryRawJS(id:) returns the same
//     bytes; this tool exists so generators that can't load a JS shell
//     (native iOS/Android, non-mini-app artifacts) get an inline path.
//
//   describe_skill({id})
//     → {id, name, category, summary, arguments:[{key,required,description,
//        example}], outputs:{...}}
//     Returns the full SkillDoc for a built-in skill tied to a fundamental
//     category (e.g. "builtin.dictionary.contains"). The autoload catalog's
//     `skill: builtin.<noun>.*` surface announces existence; this tool
//     closes the loop so an LLM that sees that announcement can actually
//     compose a pipeline step around the skill. Source-of-truth lives at
//     `skills/builtin-fundamentals-catalog.json` in mchatai-source.
//
// Schema parity: returns the same catalog shape MchataiContentService.
// renderForPromptLayer() emits to the prompt-context autoload layer, so
// LLMs see consistent vocabulary across surfaces (prompt / MCP / diag).
//
// Source root resolution mirrors the web-components MCP:
//   1. MCHATAI_SOURCE_PATH env var (preferred — set when installed from
//      the MCP Setup screen).
//   2. ~/Library/Containers/.../mChatAI/source-cache/mchatai-source
//      (the binary's git-pulled cache).
//   3. Walk up from cwd or this script's location for the repo root.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const SERVER_NAME = "mchatai-fundamentals";
const SERVER_VERSION = "0.1.0";

// Sentinel used to confirm a candidate directory is the mchatai-source
// repo root. We re-use the web-components index because every published
// repo carries it and content/ alone may not exist yet on a fresh
// scaffold.
const REPO_SENTINEL = "frameworks/web-components/_index.json";
const CONTENT_DIR_NAME = "content";

function resolveSourceRoot() {
  const fromEnv = process.env.MCHATAI_SOURCE_PATH;
  if (fromEnv && existsSync(join(fromEnv, REPO_SENTINEL))) {
    return fromEnv;
  }

  const containerCache = join(
    homedir(),
    "Library/Containers/com.sevenhillsstudio.mChatAImac/Data/Library/Application Support/mChatAI/source-cache/mchatai-source"
  );
  if (existsSync(join(containerCache, REPO_SENTINEL))) {
    return containerCache;
  }

  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, REPO_SENTINEL))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  let here = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(here, REPO_SENTINEL))) return here;
    const parent = dirname(here);
    if (parent === here) break;
    here = parent;
  }

  throw new Error(
    `Could not resolve mchatai-source root. Set MCHATAI_SOURCE_PATH env var to the repo root.`
  );
}

const SOURCE_ROOT = resolveSourceRoot();
const CONTENT_ROOT = join(SOURCE_ROOT, CONTENT_DIR_NAME);

// In-memory manifest cache keyed by mtime so a long-running server picks
// up content edits without restarting.
const manifestCache = new Map();

function loadManifest(category) {
  const path = join(CONTENT_ROOT, category, "manifest.json");
  if (!existsSync(path)) return null;
  const mtime = statSync(path).mtimeMs;
  const cached = manifestCache.get(category);
  if (cached && cached.mtime === mtime) return cached.manifest;
  try {
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifestCache.set(category, { mtime, manifest });
    return manifest;
  } catch (err) {
    // Bad JSON shouldn't crash the server — surface it as missing.
    process.stderr.write(`[${SERVER_NAME}] manifest parse failed for ${category}: ${err.message}\n`);
    return null;
  }
}

function listCategories() {
  if (!existsSync(CONTENT_ROOT)) return [];
  return readdirSync(CONTENT_ROOT)
    .filter((name) => {
      const subdir = join(CONTENT_ROOT, name);
      try {
        return statSync(subdir).isDirectory() && existsSync(join(subdir, "manifest.json"));
      } catch {
        return false;
      }
    })
    .sort();
}

// Mirror Swift's MchataiContentService.mapSurfaceKeys — keeps the
// catalog shape consistent across the prompt-autoload layer, the
// diagFundamentals tunnel, and this MCP tool.
function mapSurfaces(raw, id) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "string") continue;
    switch (k) {
      case "mcp_tool":         out.mcp = v; break;
      case "prompt_token":     out.promptToken = `{{${v}:${id}}}`; break;
      case "skill_namespace":  out.skill = `builtin.${v}.*`; break;
      case "runtime_global":   out.runtime = v; break;
      case "native_swift":     out.nativeSwift = v; break;
      case "wisdom_resource":  out.wisdomResource = v; break;
      default:                 out[k] = v;
    }
  }
  return out;
}

// LLM-reachable surfaces a fundamental SHOULD wire (spec §5). When any
// are missing the catalog annotates `incomplete: [...]` so consumers don't
// silently guess. Internal surfaces (nativeSwift, wisdomResource) are NOT
// enforced — they're not consumer-reachable.
const LLM_REACHABLE_SURFACES = new Set(["mcp", "promptToken", "skill", "runtime"]);

function buildCatalog({ categoryFilter } = {}) {
  const categories = listCategories();
  const visible = categoryFilter
    ? categories.filter((c) => c === categoryFilter)
    : categories;

  const fundamentals = [];
  for (const category of visible) {
    const manifest = loadManifest(category);
    if (!manifest || !Array.isArray(manifest.fundamentals)) continue;
    for (const entry of manifest.fundamentals) {
      const surfaces = mapSurfaces(entry.surfaces, entry.id);
      const item = {
        id: entry.id,
        category,
        summary: entry.summary || "",
        version: entry.version || "0.0.0"
      };
      if (typeof entry.size_bytes === "number") {
        item.size_kb = Math.round(entry.size_bytes / 1024);
      }
      if (Object.keys(surfaces).length > 0) item.surfaces = surfaces;
      const missing = [...LLM_REACHABLE_SURFACES].filter((k) => !(k in surfaces)).sort();
      if (missing.length > 0) item.incomplete = missing;
      if (entry.deprecated === true) item.deprecated = true;
      fundamentals.push(item);
    }
  }

  return {
    fundamentals,
    categories,
    totalRegistered: fundamentals.length,
    sourceRoot: SOURCE_ROOT,
    schemaSpec: "docs/MCHATAI_FUNDAMENTALS.md §6.1"
  };
}

function listFundamentals(args) {
  const categoryFilter = typeof args?.category === "string" && args.category.length > 0
    ? args.category
    : undefined;

  if (categoryFilter && !listCategories().includes(categoryFilter)) {
    return {
      error: `Unknown category: ${categoryFilter}`,
      availableCategories: listCategories()
    };
  }

  return buildCatalog({ categoryFilter });
}

// Slice C — describe_skill(id) returns the SkillDoc for a built-in skill
// tied to a Fundamentals category. Source-of-truth lives at
// `skills/builtin-fundamentals-catalog.json` and mirrors the entries in
// Skills/SkillCatalog.swift on the binary side. The catalog is small
// (4 skills today, ~one per fundamentals surface that needs a skill);
// the runtime lookup is O(n) linear scan with mtime-based caching.
const SKILLS_CATALOG_PATH = join(SOURCE_ROOT, "skills", "builtin-fundamentals-catalog.json");
let cachedSkillsCatalog = null;
let cachedSkillsMtime = 0;

function loadSkillsCatalog() {
  if (!existsSync(SKILLS_CATALOG_PATH)) return null;
  const mtime = statSync(SKILLS_CATALOG_PATH).mtimeMs;
  if (cachedSkillsCatalog && cachedSkillsMtime === mtime) return cachedSkillsCatalog;
  try {
    cachedSkillsCatalog = JSON.parse(readFileSync(SKILLS_CATALOG_PATH, "utf8"));
    cachedSkillsMtime = mtime;
    return cachedSkillsCatalog;
  } catch (err) {
    process.stderr.write(`[${SERVER_NAME}] skills catalog parse failed: ${err.message}\n`);
    return null;
  }
}

function describeSkill(args) {
  const id = typeof args?.id === "string" ? args.id.trim() : "";
  if (!id) {
    return { error: "Missing required parameter: id (e.g. 'builtin.dictionary.contains')" };
  }
  const catalog = loadSkillsCatalog();
  if (!catalog || !Array.isArray(catalog.skills)) {
    return {
      error: "Skills catalog not found at skills/builtin-fundamentals-catalog.json",
      sourceRoot: SOURCE_ROOT
    };
  }
  const skill = catalog.skills.find((s) => s.id === id);
  if (!skill) {
    return {
      error: `Unknown skill id: ${id}`,
      knownIDs: catalog.skills.map((s) => s.id),
      hint: "Only Fundamentals-tied built-in skills are documented here today. For the full ~108-skill set, consult Skills/SkillCatalog.swift in the mChatAI+ binary."
    };
  }
  return skill;
}

// Slice B — read_dictionary(id) returns the JS-const text. Reads the
// FIRST file declared on the manifest entry, mirroring
// MchataiContentService.dictionaryRawJS(id:). Errors out cleanly when
// the id isn't a dictionary so callers don't accidentally read
// non-dictionary fundamentals through the wrong tool.
function readDictionary(args) {
  return readCategoryFundamental(args, "dictionaries", "english-5letter", "js");
}

// Slice D — read_color_palette(id) returns the parsed palette JSON.
// Symmetric to read_dictionary but for the color-palettes category. The
// content is JSON (not JS-const) so we parse it once here so consumers
// don't have to. Use this when generating native code or HTML that needs
// the actual hex values inlined; mini-app generators should prefer the
// runtime API window.mchatai.colorPalette(id) once it ships (currently
// `nativeSwift` + `wisdom_resource` are the wired surfaces).
function readColorPalette(args) {
  return readCategoryFundamental(args, "color-palettes", "semantic", "json");
}

// Shared dispatch — readCategoryFundamental does the manifest lookup, file
// resolution, missing-file error, and outer shape. Per-category response
// shape diverges only on whether `content` is the raw JS-const text or
// parsed JSON.
function readCategoryFundamental(args, category, exampleID, kind) {
  const id = typeof args?.id === "string" ? args.id.trim() : "";
  if (!id) {
    return { error: `Missing required parameter: id (e.g. '${exampleID}')` };
  }
  const manifest = loadManifest(category);
  if (!manifest || !Array.isArray(manifest.fundamentals)) {
    return { error: `Category not found on this source root: ${category}` };
  }
  const entry = manifest.fundamentals.find((f) => f.id === id);
  if (!entry) {
    return {
      error: `Unknown ${category} id: ${id}`,
      availableIDs: manifest.fundamentals.map((f) => f.id)
    };
  }
  const primaryFile = Array.isArray(entry.files) && entry.files.length > 0
    ? entry.files[0]
    : `${id}.${kind}`;
  const filePath = join(CONTENT_ROOT, category, primaryFile);
  if (!existsSync(filePath)) {
    return {
      error: `Source file missing on disk: content/${category}/${primaryFile}`,
      id,
      version: entry.version
    };
  }
  const raw = readFileSync(filePath, "utf8");
  const result = {
    id,
    category,
    version: entry.version,
    format: entry.format || kind,
    file: primaryFile,
    sizeBytes: raw.length,
    summary: entry.summary || "",
    deprecated: entry.deprecated === true
  };
  if (kind === "json") {
    try {
      result.content = JSON.parse(raw);
    } catch (err) {
      return {
        error: `Failed to parse JSON content for ${category}/${id}: ${String(err && err.message ? err.message : err)}`,
        id
      };
    }
  } else {
    result.content = raw;
  }
  return result;
}

// MCP server wiring
const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_fundamentals",
      description:
        "List every mChatAI Fundamental (platform-level content primitive) the running session can reach. Returns id, category, summary, version, size_kb, and the surfaces wired (MCP tool / prompt token / built-in skill / runtime global / native Swift accessor). Use this before composing an artifact — fundamentals are platform-managed content (dictionaries, palettes, emoji, etc.) so consumers should reference them by id instead of inlining the same data.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description:
              "Optional category filter (e.g. 'dictionaries'). Omit to list every category."
          }
        },
        additionalProperties: false
      }
    },
    {
      name: "read_dictionary",
      description:
        "Fetch the full text of an mChatAI dictionary fundamental (e.g. 'english-5letter'). Returns the verbatim JS-const declaration plus metadata (version, format, size, deprecated flag). Use this when generating an artifact that must inline the wordlist (native iOS/Android, non-mini-app surfaces). Mini-app generators should prefer the runtime API window.mchatai.dictionary(id) — the harness auto-injects the shell at install time.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description:
              "Dictionary id (e.g. 'english-5letter', 'english-5letter-answers'). Call list_fundamentals first to discover available ids."
          }
        },
        required: ["id"],
        additionalProperties: false
      }
    },
    {
      name: "read_color_palette",
      description:
        "Fetch a parsed mChatAI color-palette fundamental (e.g. 'semantic', 'css-named'). Returns the palette JSON parsed for direct consumption: { id, version, description, colors: [{name, hex, role?, tier?}] } plus metadata. Use this when generating an artifact that must inline color tokens (native iOS/Android, CSS-only mini-apps, design-system docs). A runtime API window.mchatai.colorPalette(id) is on the roadmap for mini-app shells but not yet wired — until then, mini-apps reference palettes through wisdom guidance + this MCP tool at generation time.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description:
              "Color-palette id (e.g. 'semantic', 'css-named'). Call list_fundamentals with category='color-palettes' to discover available ids."
          }
        },
        required: ["id"],
        additionalProperties: false
      }
    },
    {
      name: "describe_skill",
      description:
        "Fetch the SkillDoc for a built-in skill tied to an mChatAI Fundamentals category. Returns argument schema, examples, and output bag keys so an LLM that saw `builtin.<noun>.*` in the fundamentals autoload catalog can compose a pipeline step around it correctly. Documented skills today: builtin.dictionary.contains/.suggest/.random and builtin.unit.convert. For non-fundamentals built-in skills, the response lists the documented IDs so the caller knows what's discoverable here.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description:
              "Skill id (e.g. 'builtin.dictionary.contains', 'builtin.unit.convert'). On unknown ids the tool returns the list of known ids in the catalog."
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
    if (name === "list_fundamentals") {
      result = listFundamentals(args || {});
    } else if (name === "read_dictionary") {
      result = readDictionary(args || {});
    } else if (name === "read_color_palette") {
      result = readColorPalette(args || {});
    } else if (name === "describe_skill") {
      result = describeSkill(args || {});
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
