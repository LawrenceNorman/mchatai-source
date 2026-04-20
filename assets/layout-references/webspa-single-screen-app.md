# webspa-single-screen-app — Phase DF archetype

A single-screen product UI (tool, tracker, writing surface, small dashboard). Implements **rule fs-012** specifically: product UIs lead with orientation, status, and action — not marketing.

This is the explicit opposite of `webspa-product-landing`. No hero. No narrative. No "welcome to your amazing new tool." The first screen IS the app.

## When to use this archetype

- Keywords triggering this reference: `app ui`, `tool`, `tracker`, `timer`, `notes app`, `writing tool`, `calculator`, `dashboard alternative`, `single-screen`.
- The prompt asks for something the user OPENS and USES repeatedly — not a public-facing page.
- Examples: habit tracker, focus timer, writing app, calculator, unit converter, small inventory tool, lightweight note pad.

## Three-band structure (fs-012)

- **Orientation** (`.app-header`, `data-zone="orientation"`) — top strip. Tells the user *where they are* and *what's the current context*. Keep the app name SMALL — this is not a marketing display.
- **Action** (`.primary-surface`, `data-zone="action"`) — fills the rest of the viewport. The app's reason for being. Customize `.placeholder-primary-content` with the real affordance (list, canvas, input, keypad, timer, etc.).
- **Status** (`.status-strip`, `data-zone="status"`) — bottom strip. At-a-glance metrics, maximum 3.

## Rubric compliance

| Rule | How this archetype satisfies it |
|---|---|
| fs-001 one composition | The app-shell IS one composition: three zones, clear hierarchy, no competing compositions |
| fs-003 no cards by default | Zero cards. The header is a strip, the primary surface is a focused block, the status is a strip. |
| fs-004 one job per section | Orientation / action / status — each zone has exactly one purpose |
| fs-007 copy discipline | Copy is functional (context labels, status metrics) — not marketing |
| fs-011 premium without decoration | Strip all shadows. The layout still reads as intentional via the three-zone rhythm and type scale |
| fs-012 orientation/status/action | **This archetype exists specifically to demonstrate fs-012.** It is the fs-012 reference implementation. |

## What to customize

The `.placeholder-primary-content` block is a stand-in. Replace with whatever the app actually is:

- **Habit tracker:** a list of today's habits with one-tap checkboxes. `.action-row` = "Add habit" / "View history".
- **Writing tool:** one large `<textarea>` with empty-state placeholder. `.action-row` = "Save" / "Settings".
- **Focus timer:** a giant countdown number. `.action-row` = "Start" / "Reset".
- **Unit converter:** two input fields (from/to) + dropdowns. `.action-row` = "Swap" / "Clear".
- **Calculator:** a display + keypad grid. `.action-row` is usually absent — keypad IS the actions.
- **List manager:** a list + quick-add input at top of primary-surface. `.action-row` = "Clear completed" / "Settings".

## What NOT to do

- Do NOT add a hero section with a big H1 that says "Track your habits better than ever." This is a product UI. The user opened the app because they ALREADY want to track habits.
- Do NOT stack three cards for "Today's habits", "Stats", "Tips". Make ONE primary surface.
- Do NOT use 5+ colors. This archetype is intentionally monochrome + 1 accent.
- Do NOT add motion beyond the CTA hover lift. The app should feel calm and quick, not showy.

## Customization contract

Safe to retune:
- All CSS variables in `:root` (especially `--accent`)
- `.app-name` text (but keep it SMALL — fs-h1 here is 1.0625rem intentionally)
- `.context-label` / `.context-value` contents (today's date, project name, etc.)
- `.placeholder-primary-content` → the real primary surface
- Status metrics (keep to 3, ideally 1–2)
- `.action-row` button labels and count (0 to 3)

Do NOT remove:
- `data-zone` attributes (evaluator greps)
- The three-band grid structure
- The minimum sizing on `.status-item` (prevents layout collapse)

## Accessibility

- `prefers-reduced-motion` disables transitions
- `aria-label` on the settings trigger
- Semantic elements (`<header>`, `<main>`, `<footer>`, `<time datetime=...>`)
- Sufficient contrast on muted text (`--text-muted` on `--surface` = 4.5:1+)
