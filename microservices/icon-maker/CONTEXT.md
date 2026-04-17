# Icon Maker — Service Context

> Read this before adding a style preset, texture, symbol set, or endpoint. The
> service is intentionally small (~700 LOC of Python). Most extensions are
> 30–80 LOC content PRs that ship to users without an app rebuild.

## Purpose

Headless **composition** of polished app icons. Renders multi-size PNGs +
optional `.icns` / `AppIcon.appiconset` bundles from a structured request
describing background (solid/gradient/texture/image), foreground (Material
Icons glyph), and optional text overlay.

This is **not** an AI image generator. The Swift `ImageGenerationService`
covers DALL·E / gpt-image-1 / Imagen for art-style icons. Icon Maker owns the
deterministic, pixel-perfect composite path.

## Callers (today)

| Caller | Endpoint | Trigger |
|---|---|---|
| `EndProductPublishView` "Make Icon" button | `POST /compose` | User taps before publishing a generated mini-app/game/macOS app |
| `MicroserviceCallSkill` (in pipelines) | `POST /compose` | Any pipeline can call us via `service: "icon-maker", endpoint: "/compose"` |
| QAFlywheel canary `qa_iconmaker.py` | `POST /compose` per fixture | Continuous quality regression |

## Callers (planned)

| Caller | Endpoint | Trigger | Phase |
|---|---|---|---|
| Swift Icon Maker app chat-prompt input | `POST /compose` | User types a freeform icon description, response pre-populates the visual editor | v1.5 |
| iOS publish flow | `POST /compose` (via Mac relay or Cloud Run) | iOS lacks Python; calls user's Mac via mChatAIShell remote endpoint | v3 |
| `IconMaker` pipeline (LLM prompt → params → compose → validate) | `POST /compose` | First occupant of `mchatai-source/pipelines/` | v2 |

## Z-order contract

Mirrors `IconMakerService.renderFromTemplate` in the macOS Swift app
byte-for-byte so identical requests produce identical icons in either
renderer:

1. Inset the canvas (`req.inset`, default 20 in 1024-space)
2. Build a rounded-rect / circle / squircle alpha mask — **single clip source for everything below**
3. Fill background (solid OR linear gradient with `req.bg_gradient.angle`)
4. Optional background image (clipped, with `req.bg_image_opacity`)
5. Optional procedural texture (multiplied through the shape mask)
6. Centered Material Icons glyph (tinted with `req.symbol_color`, sized to `req.symbol_size`)
   - Optional drop shadow rendered first if `extras.shadow` is set
   - Optional outer glow rendered first if `extras.glow` is set
7. Optional text overlay (`req.text_overlay`)
   - Position: `below` (default if symbol present), `above`, or `center`
   - Optional rounded pill background via `bg_color` + `bg_corner_radius`
8. Optional stroke on the shape mask edge (`extras.stroke`)

All scalar dimensions in the request are **expressed in 1024-canvas units**
and scaled linearly when rendering at other sizes. This matches the Swift
app's coordinate convention.

## Multi-size rendering rule

| Target size | Strategy |
|---|---|
| ≥ 32 px | Render once at 1024, Lanczos-downsample for each target |
| < 32 px | Re-render natively at that exact size — downsampling 1024→16 blurs glyph strokes below readability |

Hard-earned iOS icon rule. Don't change it without testing 16/20px favicons
side-by-side.

## SF Symbols policy

Apple's SF Pro font is not redistributable (Apple Font License §2.B). When a
caller passes `symbol_set: "sf"` with an SF name like `"flame.fill"`:

1. `symbols.py` looks up `assets/sf_symbol_hints.json` for a Material
   equivalent (e.g. `"whatshot"`).
2. On hit → renders the Material glyph and returns
   `meta.symbol_resolved.remap_note` describing the substitution.
3. On miss → returns HTTP 422 with `code: "sf_symbols_unsupported_in_service"`
   and a hint pointing back to the macOS Icon Maker app for true SF rendering.

The macOS Swift Icon Maker app remains the authoritative SF renderer; users
who need exact SF glyphs (matching Apple's HIG, sidebar consistency, etc.)
use that. The microservice trades SF Symbol fidelity for cross-platform
deployability.

## How to extend

### Add a style preset

1. Edit `styles.py` — add a new entry to `STYLE_PRESETS`. Standard keys
   (`bg_color`, `bg_gradient`, `symbol_color`, `bg_texture`, `corner_radius`)
   override request defaults; extension keys (`glow`, `frosted`, `shadow`,
   `stroke`, `pixelate_symbol`, etc.) flow through `req.extras` and are
   consumed by the compositor's post-pass filters.
2. Add a fixture in `tests/fixtures/<style>_<symbol>.json`.
3. Bump the `version` in `MICROSERVICE.md` (semver patch).
4. PR to mchatai-source. After merge, users get the new preset on next
   `refreshMchataisourceCache` — no app rebuild.

### Add a texture

1. Implement `<name>_tile(size, seed) -> Image.Image (mode='L')` in `textures.py`.
2. Register it in the `TEXTURE_FNS` dict.
3. Extend the `BgTexture` Literal in `main.py`.
4. Add a fixture exercising the texture.
5. Bump version, PR.

### Add a symbol set

1. Drop the OTF + a JSON catalog (`{"icons":[{"n": "name", "c":[...]}, ...]}`)
   under `assets/fonts/<set>/`.
2. Extend the `SymbolSet` Literal in `main.py`.
3. Add a resolver branch in `symbols.py:resolve_symbol`.
4. Update `/info`'s `symbol_sets` field.
5. PR.

### Map an SF Symbol to Material

Edit `assets/sf_symbol_hints.json`. Both `"flame"` and `"flame.fill"` should
get entries when adding a new mapping (the resolver also strips `.fill` /
`.circle` etc. as a fallback, but explicit entries are more discoverable).

## Determinism + caching

Every render seeds its random/numpy state from
`hash(canonical_request_json)` so identical requests produce byte-identical
PNGs. This is what makes the QAFlywheel canary's perceptual-hash diff
meaningful — flakes mean a real regression, not noise.

Callers that want unpredictable textures can pass `req.seed` explicitly.

## Failure modes

| Condition | HTTP | `code` |
|---|---|---|
| Material symbol id not in catalog | 404 | `symbol_not_found` (with up-to-5 fuzzy suggestions) |
| `symbol_set: "sf"` with no Material map | 422 | `sf_symbols_unsupported_in_service` |
| `bg_image_b64` not valid base64 | 400 | `bg_image_b64_invalid` |
| `bg_image_b64` decodes but PIL can't open | 415 | `bg_image_unsupported_format` |
| `style_preset` unknown | 400 | `style_preset_unknown` (lists known presets) |
| `sizes[i]` outside [8, 2048] | 400 | `size_out_of_range` |
| `output: "workspace"` without `workspace_path` | 400 | `workspace_path_required` |
| `workspace_path` contains `..` | 403 | `workspace_path_forbidden` |

All errors return JSON with `{detail: {code, message, hint?, suggestions?}}`.
Client retry policy: 4xx terminal; 5xx retry up to 2× with backoff.

## Apple licensing note

`assets/MaterialIconsRound.otf` ships under Apache 2.0 (Google Material Icons).
We do **not** ship `SF-Pro.ttf` because Apple's Font License §2.B forbids
redistribution outside Apple operating systems. Phase v3 adds an opt-in
darwin-only path (`pyobjc` bridge to `NSImage(systemSymbolName:)`) that lets
the service render true SF glyphs when running locally on a user's Mac
without ever bundling the font.
