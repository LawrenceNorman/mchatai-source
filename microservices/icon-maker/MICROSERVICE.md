---
name: Icon Maker
version: 1.0.0
description: Compose app icons (PNG + .icns + AppIcon.appiconset) from Material Icons, gradients, textures, and text overlays. Headless sibling of the macOS Icon Maker app.
author: mChatAI
category: media
tags: [icon, media, composition, png, icns, appiconset, material-icons]
python_deps: [fastapi, pydantic, "pillow>=11", numpy]
bins: [python3]
preconditions: []
draft: false
endpoints:
  - path: /compose
    method: POST
    description: Full composition returning base64 PNG per size + optional .icns / appiconset bundle
  - path: /preview
    method: POST
    description: Fast single-size (default 1024) preview PNG as base64
  - path: /info
    method: GET
    description: Capabilities — registered styles, textures, symbol sets, bundled-asset status
  - path: /symbols/material/categories
    method: GET
    description: Material Icons category list with counts
  - path: /symbols/material/search
    method: GET
    description: Substring + tag search over the Material catalog (query param q, optional limit)
  - path: /symbols/material/{icon_id}
    method: GET
    description: Single Material icon metadata
  - path: /healthz
    method: GET
    description: Liveness probe
---

# Icon Maker

Headless icon composition. Renders polished PNGs (16–2048 px) with rounded-rect
or circular backgrounds, solid/gradient fills, procedural textures, centered
Material Icons glyphs, and optional text overlays — then packages multi-size
output as `.icns` (macOS) or `AppIcon.appiconset` (iOS) when requested.

**Design principle — composition, not generation.** This service does NOT call
DALL·E or image-gen APIs. For AI-generated icon art, the Swift
`ImageGenerationService` covers that path. We own the pixel-perfect composite.

**Z-order contract** (mirrors the macOS `IconMakerService.renderFromTemplate`
byte-for-byte so the Swift app and this service produce identical icons given
identical parameters):

1. Inset the canvas
2. Build a rounded-rect alpha mask — every subsequent layer is clipped through it
3. Fill background (solid OR linear gradient)
4. Composite optional background image (clipped, with opacity)
5. Apply optional procedural texture (noise / dots / grid / stripes / crosshatch / waves)
6. Draw centered Material Icons glyph (tinted)
7. Draw optional text overlay (below glyph by default; centered if no glyph)

**SF Symbols:** not supported directly — Apple's SF Pro font is not
redistributable. When a Swift caller passes an SF name like `"flame.fill"`,
`symbols.py` resolves it to the nearest Material equivalent (`"whatshot"` in
that case) via `assets/sf_symbol_hints.json`. The macOS Icon Maker app remains
the authoritative local SF renderer for users who need true SF glyphs.

**Entry points:**
- mChatAI+ publish-flow "Make Icon" button → `POST /compose`
- AIHarness pipelines calling `icon-maker` via `MicroserviceCallSkill`
- QAFlywheel canaries (see `tests/fixtures/`)
- Future: chat-prompt input in the Swift Icon Maker app (same `/compose` endpoint)

**How to extend** — every extension is a content PR, zero Swift rebuild:
- **Add a style preset** → edit `styles.py`, add a fixture in
  `tests/fixtures/<style>.json`, bump `version` in this file
- **Add a texture** → implement in `textures.py`, add to the `BgTexture` enum
  in `main.py`, add a fixture
- **Add a symbol set** → drop OTF + catalog JSON under `assets/fonts/<set>/`,
  extend `SymbolSet` in `main.py`, add resolver in `symbols.py`
- **Map an SF Symbol to Material** → edit `assets/sf_symbol_hints.json`
