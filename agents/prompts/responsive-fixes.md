# Responsive Fix Fragments

Reference document used by the auto-fixer agent. When the QA evaluator emits a `responsiveIssues[]` array with `code` fields, the harness looks up each code in this file and appends the matching fragment to the autoFix.miniApp.visual prompt under `## Fix Fragments`.

Format: one `## <code>` heading per wisdom rule, followed by 3-6 sentences explaining the fix in coder-LLM terms. Apply fragments verbatim — they encode canonical patterns from prior incidents.

If a code has no fragment in this file, the auto-fixer falls back to the issue's free-text `fix` field (treated as a generic refine instruction).

---

## mob-001

The mini-app is missing the mobile viewport meta tag, or has the wrong attribute set. Add this to `<head>` (it's idempotent — replace the existing one if present): `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">`. The `viewport-fit=cover` extends content under the iOS notch / dynamic island; `user-scalable=no` prevents accidental pinch-zoom during fast gameplay. Without this tag, mobile browsers default to a 980px desktop viewport scaled down — text microscopic, touch targets unreachable.

## mob-002

A touch target in the screenshot is below 44×44 logical pixels. Locate the offending element (the `location` field tells you where) and apply: `min-width: 44px; min-height: 44px;` along with sufficient `padding` to make the visual element comfortable inside the 44×44 hit area. For icon-only buttons where you don't want to grow the visual, use the hit-zone overlay pattern — wrap the icon in a transparent `<button>` sized 44×44 with the icon centered via flex. NEVER make a button look 28×28 with a 28×28 hit area on mobile; the visual can stay small but the hit area must be 44+.

## mob-003

The layout uses `100vh` somewhere, OR has fixed-bottom controls without `safe-area-inset-bottom` padding. Replace `100vh` with `100dvh` (dynamic viewport height). For fixed-bottom action strips, use `padding-bottom: max(12px, env(safe-area-inset-bottom));` so iOS home-indicator doesn't hide controls. If you support iOS < 16, add the `@supports not (height: 100dvh) { ... }` fallback to plain `100vh`. Search the existing CSS for `100vh` and replace each occurrence.

## mob-004

Primary action controls are positioned in the top half of the screen, putting them out of one-handed thumb reach. Move buttons (Fire, Plant, Spin, Tap-to-Jump, Submit) to the BOTTOM 25-50% of the viewport. Header/HUD (score, lives, wave counter) stays at the top — it's read-only. Concretely: use a CSS grid with rows `header` (auto height) / `playfield` (1fr) / `controls` (auto, bottom-anchored), or position the controls element with `position: fixed; bottom: 0; padding-bottom: env(safe-area-inset-bottom);`.

## mob-005

The app uses `click` event listeners or has 300ms tap-delay symptoms. Replace `addEventListener('click', ...)` with `addEventListener('pointerdown', e => { e.preventDefault(); handler(); }, { passive: false })` for game-critical buttons. Drag interactions should use the Pointer Events API uniformly: `pointerdown` to start, `pointermove` to update, `pointerup` to commit. Don't mix touch + mouse handlers — Pointer Events covers both. The `e.preventDefault()` suppresses the synthetic mousedown that fires after touchend, preventing double-trigger.

## mob-006

The screenshot shows iOS text-selection or tap-highlight artifacts — long-pressing a button shows a copy/paste menu, or a grey tap-highlight rectangle flashes on press. Add this to your global CSS (or to a `*` selector): `* { -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }`. For canvas elements that handle gestures: also add `touch-action: none;` to suppress browser scroll/zoom during gameplay.

## mob-007

The layout is landscape-oriented or fights portrait phones. Mobile mini-apps should default to PORTRAIT. Set the game container to `max-width: 480px; height: 100dvh;` and use CSS grid rows (header / playfield / controls) — never sidebar columns at mobile widths. If the game genuinely needs landscape (racing, side-shooter), add a portrait-detection overlay: `@media (orientation: portrait) { .rotate-prompt { display: block; } .game { display: none; } }` with a "Rotate your phone" message.

## mob-008

The app doesn't pause on tab-switch or save state on page-hide — battery drains in the background and progress is lost on iOS Safari kill. Add: `document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); else resumeGame(); });` and `window.addEventListener('pagehide', () => localStorage.setItem('gameState', JSON.stringify(state)));`. On load, check `localStorage.getItem('gameState')` and either auto-resume or show a "Resume" prompt. Use `pagehide` not `beforeunload` — beforeunload is unreliable on iOS Safari.

## mob-009

The app has no audio/haptic feedback on critical taps, OR audio is silent on iOS because AudioContext wasn't resumed inside a user gesture. For haptics: feature-detect with `if (navigator.vibrate) navigator.vibrate(20);` on tap (Android only; iOS ignores it silently). For audio: create a single shared `AudioContext` and ensure it's resumed inside the FIRST tap handler — `if (audioContext.state === 'suspended') audioContext.resume();` — never in your init code, iOS suspends audio until user interaction.

## mob-010

The app overflows the iPhone SE viewport (375×667) — controls fall below the fold or text clips. Test the layout in DevTools at 375×667 (not 390×844 — go for the smallest current iPhone). Use `font-size: clamp(16px, 4vw, 22px)` for fluid scaling. Card grids should adapt with `grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));`. If a screen needs more vertical room than 667px, scroll the playfield specifically (not the whole page); never let critical buttons fall below the fold.

## mob-011

Drag interactions break mid-gesture when the user's finger leaves the source element's bounds (no more `pointermove` events fire). Use `setPointerCapture` to keep the pointer locked to the source element: `card.addEventListener('pointerdown', e => { card.setPointerCapture(e.pointerId); dragStart(e); });` then `pointermove` continues to fire on the source even after the finger moves outside it. Release with `releasePointerCapture(e.pointerId)` on `pointerup`. Critical for slow drags, plant placement, swipe gestures.

## mob-012

The app loses progress on tab-switch, refresh, or orientation change. Save to `localStorage` on every meaningful state change (round start, score change, level clear, lives lost): `function saveState() { localStorage.setItem(GAME_KEY, JSON.stringify({ score, wave, lives, ... })); }`. On load, check for saved state and offer a "Resume" / "New Game" choice — don't auto-resume silently (user might want a fresh start). saveState() costs microseconds; recovers gracefully from any interruption.

## mob-013

The hit-detection is too strict for finger input — tile-tap or rhythm games require frame-perfect timing that humans can't achieve on mobile. Switch to forgiving lane-mode: when the user taps a lane, hit the LOWEST visible tile in that lane regardless of exact y position. Pattern: `const lane = Math.floor(x / r.width * LANES); const target = lowestVisibleTileInLane(lane); if (!target) gameOver('empty lane'); else hitTile(target);`. Score ACCURACY (distance from strike-zone center) but always count the tap as a hit if a tile is visible in the tapped lane.

## mob-014

The app's mechanic isn't obvious from a single screenshot — user can't tell what to do. Add a tap-to-start overlay with three lines: GOAL (one sentence: what's the win condition), HOW (one sentence: what's the input), OUTCOME (one sentence: what happens when you misalign / miss). 3 lines max. Pattern: `<div id='startOverlay' class='overlay'><h1>STACK TOWER</h1><p><b>Goal:</b> Stack as high as you can.</p><p><b>How:</b> Tap to drop the moving block.</p><p><b>Outcome:</b> Misalign and the overhang is lost.</p><button id='startBtn'>PLAY</button></div>`. Hide the overlay on first tap.

## mob-015

Direction or action buttons use TEXT LABELS instead of glyphs — "Move Left", "Punch", "Move Right" etc. Direction controls MUST use arrow glyphs (`◀ ▶ ▲ ▼` or unicode arrows or SVG triangles), NEVER text. Action buttons MAY use a short verb but PREFER icon+verb (`🥊 PUNCH`, `▶ PLAY`, `⚡ FIRE`). Pattern: `<button class='dpad-left' aria-label='Move left'>◀</button> <button class='action-punch' aria-label='Punch'>🥊</button>`. Text labels eat horizontal space and break for non-English players.

## mob-016

Mobile controls are arranged in a single horizontal row at the bottom — direction + action buttons stacked linearly, separating the directional pair with the action button between them. Refactor into TWO CLUSTERS by thumb geometry: directional/movement controls form a CLUSTER on the left (D-pad shape OR drag-pad zone covering bottom-left ~40%), action buttons form a CLUSTER on the right (bottom-right ~30%, stacked or arc-arranged). Pattern: `<div class='controls'><div class='dpad bottom-left'>...</div><div class='actions bottom-right'>...</div></div>`. For fighting/racing genres, consider TWO-ZONE TOUCH (no buttons): `canvas.addEventListener('pointerdown', e => e.clientX < window.innerWidth/2 ? startMove(e) : startAction(e));`.

---

## res-001

The CSS is desktop-first — uses `@media (max-width: ...)` to downgrade for narrow viewports. Refactor mobile-first: make the default styles target the smallest viewport (375×812), then use `@media (min-width: 768px)` to UPGRADE the layout for tablet/desktop. Pattern: `.grid { display: grid; grid-template-columns: 1fr; gap: 12px; } @media (min-width: 768px) { .grid { grid-template-columns: repeat(3, 1fr); gap: 24px; } }`. Standard breakpoints: 480px, 768px, 1024px, 1280px — pick 1-2 for any one component, not all four.

## res-002

The typography uses fixed font-sizes that step jaggedly at breakpoints. Replace with `clamp()` for fluid scaling: `h1 { font-size: clamp(28px, 6vw, 56px); }` (scales from 28px at narrow to 56px at wide, with smooth interpolation). Apply to headlines, body text, AND section padding: `body { font-size: clamp(15px, 1.6vw, 18px); } .section { padding: clamp(16px, 4vw, 48px); }`. Math: `vw` is 1% of viewport width — `6vw` at 467px = 28px (min kicks in below); `6vw` at 933px = 56px (max kicks in above).

## res-003

The layout doesn't reflow below 600px — multi-column grid doesn't collapse, sidebar stays at fixed width, horizontal scroll appears at 375px. Add the reflow rules: `body { overflow-x: hidden; }` (defensive). For sidebars: `.sidebar { /* default: collapsed/hidden */ } @media (min-width: 1024px) { .sidebar { /* visible, fixed width */ } }`. For card grids: `grid-template-columns: 1fr;` default, `@media (min-width: 600px) { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }`. Test at 375px — no horizontal scroll, all CTAs visible.

## res-004

A hover-only menu, dropdown, or tooltip is invisible to touch users. Add an explicit toggle so the affordance works on tap AND focus AND hover. Pattern: `.menu[aria-expanded='true'] .dropdown, .menu:hover .dropdown { display: block; }` plus a click handler that toggles `aria-expanded`. For tooltips: replace pure `:hover` with a tap-to-toggle button: `<button aria-describedby='tip-1' onclick='toggleTip(this)'>?</button><span id='tip-1' role='tooltip' hidden>...</span>`. NEVER ship `:hover` as the only path to content.

## res-005

A touch target shrinks below 44×44 at desktop widths, OR a button has no `min-width`/`min-height` rule. Apply `min-width: 44px; min-height: 44px;` even on icon buttons in desktop layouts. At wider viewports you can ADD padding for visual weight, but never shrink the hit area below 44 — touchscreen Surface laptops, iPad-with-keyboard, and PointerControl accessibility users all benefit from the same target sizing on every viewport.

## res-006

The layout breaks at iPad portrait (768×1024) — sidebar still visible at 240px wide while content squishes to 520px, OR multi-column layout looks cramped between 600-1024px. Test the layout at THREE viewports: 375×812, 768×1024, 1280×800. The 768px tablet width is the most commonly broken — designers test only "phone" and "desktop" and the in-between breaks. Common fix: collapse the sidebar below 1024px (not 768px), so iPad portrait gets the full content width.

## res-007

The layout uses `100vh` which is broken on mobile Safari (includes URL bar) and produces 'page sticks below the fold' on desktop. Replace with `100dvh` and prefer `min-height: 100dvh` over `height: 100dvh` so long content remains scrollable. For game canvases that MUST fill screen: `height: 100dvh; overflow: hidden;`. Add `@supports not (height: 100dvh) { /* fallback to 100vh */ }` for Safari < 16 support.

## res-008

Images and media aren't responsive — fixed-width images cause horizontal scroll on narrow screens. Add this default rule to your CSS: `img, video, iframe, svg { max-width: 100%; height: auto; }`. For art-directed images that change crop at breakpoints, use `<picture>` with `<source media>` queries. For bandwidth: use `srcset` with width descriptors so phones don't download 2400px hero images: `<img src='hero-800.jpg' srcset='hero-400.jpg 400w, hero-800.jpg 800w, hero-1600.jpg 1600w' sizes='(min-width: 768px) 50vw, 100vw' alt='...'>`.

## res-009

The layout shifts as images load (CLS — cumulative layout shift) or transitions storm during browser-resize. Reserve image space with `aspect-ratio`: `.hero-img { aspect-ratio: 16/9; width: 100%; object-fit: cover; }` so the layout doesn't jump as images load. AVOID `display: none` toggles between mobile-only and desktop-only DOM duplicates — prefer the same DOM with CSS layout changes (e.g. `flex-direction: column` mobile, `flex-direction: row` desktop). Animate breakpoint transitions sparingly — resizing the window shouldn't trigger 12 transitions.

## res-010

The Both-mode validation flagged that one viewport is broken while the other looks fine. Open the failing viewport's screenshot, locate the `location` from the issue entry, and apply the fix scoped to that viewport's media query. Mobile-scope: default styles (or `@media (max-width: 767px)`). Desktop-scope: `@media (min-width: 768px)`. After fixing, mentally check whether the fix breaks the OTHER viewport — if so, scope tighter or move the fix to a shared default with both-viewport-safe values. Both viewports must share visual identity (same colors, same brand mark, same typographic hierarchy) — responsive ≠ two different-looking apps.
