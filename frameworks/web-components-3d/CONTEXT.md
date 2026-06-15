# Web Components 3D - Framework Context

Framework-level guide for the three.js Lego mini-app system. The harness pulls this into the LLM prompt for any artifact targeting `recipe.three-runner`, `recipe.three-marble`, `recipe.three-tower-defense`, or any other `recipe.three-*` recipe ID.

This is a SIBLING catalog to `frameworks/web-components` (the 2D canvas catalog). It is intentionally separate: 3D needs its own probe signals (WebGL context present, frame count greater than zero, local-importmap gate) and its own distribution rules. Do NOT mix 2D `recipe.web-components` components into a 3D build, and do NOT add 3D recipes to the 2D `_index.json`.

For the full architecture rationale, see `mchatai_macOS/docs/CATALOG_3D_TRACK_ARCHITECTURE.md` in the platform repo.

---

## 3D Intent

The 3D track exists to let AIWizard assemble real-time WebGL2 games and scenes from shared Lego modules instead of emitting one giant hand-written three.js monolith. Genre logic stays THIN. The shared modules carry the weight: the game loop, the scene rig, the camera rigs, the input layer, the effects pool, and the HUD overlay are all frozen Lego that every 3D artifact reuses.

A 3D artifact is a static, offline, self-contained bundle. It must render under `file://` inside WKWebView with no network, no CDN, and no build step. The vendored three.js bundle lives next to the game in `resources/three/` and is copied into every installed artifact at assemble time, so each Hub bundle is fully self-contained (roughly 0.7 to 1 MB versus 30 to 80 KB for a 2D bundle).

---

## The local-importmap-before-first-module-script mandate

Every 3D `index.html` MUST emit, in `<head>` and BEFORE the first module `<script>`, a LOCAL relative importmap. No exceptions. The importmap maps the bare specifier `three` to the vendored core file and maps the PREFIX `three/addons/` to the vendored addons directory. The prefix mapping is mandatory so that addon-to-addon cross-imports (for example EffectComposer pulling RenderPass) resolve locally too.

```html
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="mchatai-artifact-kind" content="three-scene">
  <!-- LOCAL importmap. MUST come before the first module script. No https:// anywhere. -->
  <script type="importmap">
  {
    "imports": {
      "three": "./resources/three/three.module.min.js",
      "three/addons/": "./resources/three/addons/"
    }
  }
  </script>
  <link rel="stylesheet" href="./game.css">
</head>
<body>
  <div id="app"></div>
  <!-- Module scripts come AFTER the importmap. -->
  <script type="module" src="./main.js"></script>
</body>
```

Game and module code then use canonical specifiers verbatim, which matches the three.js documentation and training data and lowers hallucination:

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
```

Never write a relative path to the three.js core from game code (no `import * as THREE from './resources/three/three.module.min.js'`). Always go through the bare specifier so the importmap stays the single source of truth for where three.js lives.

Do NOT add es-module-shims. Native importmaps are guaranteed on iOS 18 and 26 and macOS 15, which are the only runtimes that load these bundles.

---

## WebGL2-only rule

WebGPU is OUT. `file://` is not a secure context, so even Safari 26 silently drops WebGPU. Target WebGL2 only:

- Use `THREE.WebGLRenderer`, never `THREE.WebGPURenderer`.
- If TSL or node materials are used, they MUST compile to the GLSL/WebGL path; verify before shipping.
- GPGPU float-texture sims (flow field, boids, reaction-diffusion) need the `EXT_color_buffer_float` extension. Capability-check it and degrade gracefully if it is missing.
- Keep draw calls under roughly 100. Use InstancedMesh for repeated geometry (obstacles, asteroids, projectiles, creeps).
- Clamp device pixel ratio to a maximum of 2 on the renderer so high-DPR phones do not melt.
- Keep at most three active lights on mobile (one DirectionalLight sun plus one HemisphereLight fill is the default recipe; add a third only when the genre needs it).

---

## Offline acceptance bar

A 3D artifact is only acceptable if ALL of the following hold:

1. It loads and renders under `file://` in WKWebView with no network access. Pull the ethernet cable test: zero `https://` references anywhere in HTML, JS, or the importmap.
2. The render probe sees a live WebGL context and a frame count greater than zero. The render loop MUST increment `window.__threeFrameCount` once per rendered frame so the macOS `InstalledMiniAppRenderProbe` can confirm the scene is actually drawing.
3. The bundle carries `<meta name="mchatai-artifact-kind" content="three-scene">` so the probe's grid/board "looks unplayable" heuristic does not false-positive a WebGL canvas (a WebGL canvas legitimately has zero board/grid DOM children).
4. Console error count is zero after warmup.
5. `resources/three/three.module.min.js` exists on disk inside the bundle, and every addon path that appears in an `import` also exists on disk.

Do NOT trust headless Chrome: it passes while WKWebView silently fails on `file://` ESM. Do NOT accept "looked playable in Safari." Verify in a real WKWebView via the extended `InstalledMiniAppRenderProbe` and `tests/check_component_usage_3d.mjs` (local-importmap gate plus claimed-imports-present plus vendored-core-on-disk).

---

## Convergence targets (enforced via recipe requiredComponents plus marker)

Every 3D game converges on the same foundation so the probe and the check script can verify a known shape:

- Every game uses `core.three-game-loop` plus `core.three-scene-rig` plus `resources.three-core` plus `ui.three-hud-overlay`. These four are non-negotiable and appear in every recipe's required list.
- Cameras converge on the shared camera rigs (chase, follow, orbit, rise). Do not hand-roll a bespoke camera per game.
- All particles route through `effects.instanced-particle-pool` (one pooled additive Points or InstancedMesh). Do not allocate a new particle system per burst.
- All touch movement routes through `controls.virtual-joystick-3d` or `controls.tilt-input`. Genre logic reads a unified input state `{move, look, actionA, actionB}` and never branches on device type. Never ship tilt-only input; always provide a keyboard fallback.
- Only physics games pull `systems.rapier-physics-world` (the ONLY physics-engine Lego). Everything else hand-rolls motion with a fixed-timestep `update(dt)` accumulator. The marble recipe is deliberately physics-light: it hand-rolls rolling-ball motion and uses Rapier only as an optional upgrade.

---

## Lego conventions specific to 3D modules

- Every module is an ES module. The body of each module file begins with the marker comment line `// BEGIN mChatAI Web Component: <component-id>` and ends with `// END mChatAI Web Component: <component-id>`, mirroring the 2D inline-absorption convention.
- dispose-on-teardown: every module that creates a geometry, material, texture, or render target MUST free it in its `dispose()` method. The game loop calls `dispose()` on the scene rig and every system on teardown.
- Object pooling for particles and projectiles. Allocate once, reuse, never churn GC during play.
- Fixed-timestep dt-based update. The loop accumulates real time and steps the sim in fixed slices, then interpolates the render. Never advance gameplay straight off `requestAnimationFrame` deltas.
- Audio unlocks on first user gesture. AudioContext boots suspended under `file://`; always ship a tap-to-start and call `resume()` plus a one-sample silent buffer on first tap.
- ASCII only everywhere. No em-dash, en-dash, smart quotes, arrows, or any non-ASCII byte. Use plain `-` and `"`. Non-ASCII in `_index.json` silently breaks the Swift catalog decoder and drops whole recipes.

---

## Related rules

- Reuse the 2D `ui.game-over-with-rank` plus `ui.leaderboard` for sign-in CTA parity (those are theme-agnostic HTML/CSS overlays and work over a WebGL canvas).
- `u-026` - banned user-visible jargon ("Lego", "mini-app", "recipe", etc.) applies here too.
- `u-029` - restart button required on the terminal phase. The HUD overlay provides a Restart control.
- Wisdom pack `three-js-games` carries the local-importmap-only, draw-call-budget, dispose-and-pool, and audio-unlock rules. Source pack is authoritative; do not hand-edit the bundled fallback.
