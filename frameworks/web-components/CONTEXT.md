# Web Components — Framework Context

Framework-level guide for the Lego web-components mini-app system. The harness pulls this into the LLM prompt for any artifact targeting `recipe.web-components` or any of its 19+ recipe IDs.

For component absorption process (how new components enter the catalog), see [`docs/COMPONENT_ABSORPTION.md`](docs/COMPONENT_ABSORPTION.md).

---

## Swatch Token Vocabulary  *(Phase TOK, 2026-05-05)*

Themable values flow through CSS custom properties on `:root`, all prefixed `--mchat-`. Source of truth: [`resources/Swatches.js`](resources/Swatches.js). Three swatches ship today (`retro-neon`, `vector-noir`, `sunset-arcade`); each defines the same 25-token vocabulary with palette-specific colors.

### Canonical names

| Category | Tokens | Notes |
|---|---|---|
| **Color** (flat) | `--mchat-background`, `--mchat-surface`, `--mchat-text`, `--mchat-accent`, `--mchat-accentWarm`, `--mchat-stroke`, `--mchat-shadow` | `--mchat-text` is the text color; do not confuse with `--mchat-type-*` (font sizes). |
| **Radius** | `--mchat-radius-{sm,md,lg,pill}` | sm=6px, md=12px, lg=20px, pill=999px |
| **Space** | `--mchat-space-{1,2,3,4,5,6}` | 4/8/12/16/24/32 px |
| **Type** | `--mchat-type-{xs,sm,md,lg,xl}` | Fluid via `clamp()` — responsive without media queries |
| **Font** | `--mchat-font-{ui,display,mono}` | Family stacks: ui=system-ui, display=Avenir Next, mono=SF Mono |

### How to use

```css
:root {
  /* mchat-swatch-defaults — synchronous FOUC fallback. Mirror the
     buildSwatchDefaultsCSS('<swatch-id>') output verbatim. */
  --mchat-background: #020617;
  --mchat-accent: #22d3ee;
  --mchat-radius-md: 12px;
  --mchat-space-3: 12px;
  --mchat-font-display: 'Avenir Next', 'Trebuchet MS', sans-serif;
  /* …all 25 canonical tokens; copy from Swatches.js retro-neon (or chosen swatch) */
}

.card {
  padding: var(--mchat-space-3);
  border-radius: var(--mchat-radius-md);
  background: var(--mchat-surface);
  color: var(--mchat-text);
  font-family: var(--mchat-font-display);
}

.cta-button {
  /* Two-tone gradient using both accents — re-skins beautifully across swatches */
  background: linear-gradient(135deg, var(--mchat-accent), var(--mchat-accentWarm));
}
```

```js
// Apply swatch programmatically (e.g. on app init).
import { applySwatchVariables, getSwatchByID } from "../../resources/Swatches.js";
applySwatchVariables(document.documentElement, getSwatchByID("sunset-arcade"));
```

```js
// Read active palette from canvas paint code.
import { getCurrentSwatchPalette } from "../../resources/Swatches.js";
const palette = getCurrentSwatchPalette(); // { background, surface, text, accent, ..., radius:{...}, space:{...} }
ctx.strokeStyle = palette.stroke;
```

---

## FOUC Architecture — Why the `:root` block is mandatory

CSS paints synchronously when `<link rel="stylesheet">` resolves. JS modules execute *after* first paint. Without a `:root { --mchat-* }` block in your CSS, `var(--mchat-text)` etc. resolve to nothing for the first frame and the page renders **white** until `applySwatchVariables` runs.

**Three-layer architecture:**

1. **CSS `:root` block** at top of stylesheet → synchronous defaults, copy-pasted from `buildSwatchDefaultsCSS('<swatch-id>')`. Use the swatch the JS will apply (e.g. `sunset-arcade` if `applySwatchVariables(...sunset-arcade)`), so the default-frame and post-JS-frame match pixel-for-pixel.
2. **`Swatches.js`** = source of truth. Single export `buildSwatchDefaultsCSS(id)` produces the exact `:root` string examples mirror.
3. **`applySwatchVariables(documentElement, swatch)`** runs after JS init — sets vars as inline style on `documentElement`. Inline-style specificity beats stylesheet `:root`, so the runtime swatch wins.

**Anti-patterns the marker check (`tests/check_component_usage.mjs`) catches:**

- Inventing per-app namespaces (`--mm-bg`, `--cw-accent`, `--piano-warm`) → reported as `rogueRootVars`. Won't re-skin when the user picks a different swatch.
- Deleting the `:root` block "because Swatches.js sets the vars from JS" → causes FOUC; failed approach has been tried and reverted.

See wisdom rule **u-030** in `wisdom/packs/universal.json` for the canonical statement of this rule + concrete examples.

---

## Domain-art exception (what stays hardcoded)

Game-specific colors are **art**, not theme. Keep these hardcoded:

- **Board cell colors** — chess cream `#f8e7c8` + saddle `#7a4b2d`, candy-match tile gradients per kind, minesweeper count colors per number.
- **Piece colors** — chess piece text white/black, checkers piece red/black gradients.
- **Sprite domain colors** — dragon green, zombie green-with-rotting-patches, gold treasure, etc. (see [`resources/VectorSprites.js`](resources/VectorSprites.js) and [`resources/SpriteRig.js`](resources/SpriteRig.js)). These don't follow the swatch by design — a dragon should look like a dragon across all themes.
- **Atmospheric backdrop tints** — radial-gradient endpoints in body `background` are often unique per game (jungle vs ocean vs desert atmosphere).

The TOK.4 marker check only flags `:root`-scope rogue vars; it does NOT flag hardcoded hex inside selectors, so domain art stays as-is.

---

## Related rules

- `u-026` — banned user-visible jargon ("Lego", "mini-app", "recipe", etc.)
- `u-029` — restart button required on terminal phase ([`ui/RestartOverlay.js`](ui/RestartOverlay.js))
- **`u-030`** — canonical `--mchat-*` token vocabulary (this section)
- `u-031` — fetch component source on demand, do not invent APIs
