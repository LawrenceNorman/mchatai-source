# webspa-product-landing — Phase DF archetype

A SaaS-style product landing page. Implements every applicable rule from the `frontend-skill` wisdom pack.

## When to use this archetype

- Keywords triggering this reference: `landing`, `marketing`, `saas`, `product page`, `homepage`, `startup`.
- The prompt asks for a public-facing *marketing* or *lead-gen* page, NOT an app UI.
- Single page, scrolls top-to-bottom through a narrative.

## Narrative arc (fs-005)

1. **Hero** — brand, one-line promise, one CTA, full-bleed photograph.
2. **Supporting** — in-situ photograph + one caption line reinforcing the promise.
3. **Detail (Features)** — three alternating image/text rows. Each row is *one* feature, one headline, one sentence. Not a card grid.
4. **Social proof** — a single pull-quote. Not three cards.
5. **Final CTA** — convergent endpoint. Short headline, short sentence, one button.

## Motion recipe (fs-008)

This archetype delivers exactly **three** motions — the budget. Do not add more.

- `hero-fade-up` — CSS `@keyframes fadeUp` on headline + subhead + CTA row (staggered 0 / 0.1s / 0.2s, 600ms ease-out, once).
- `sticky-nav-compact` — wired in `webspa-product-landing.motion.js`. Adds `.compact` to `.nav` after 40px of scroll. Reduces padding, adds a subtle shadow.
- `hover-cta-lift` — pure CSS on `.btn-primary:hover`. `translateY(-1px)` + shadow increase.

For Framer Motion codebases, replace the JS file with the equivalent snippets from `snippets/motion-recipes.json` (IDs: `entrance-hero-fade-up`, `scroll-sticky-nav-compact`, `hover-cta-lift`).

## Imagery (fs-009, fs-010)

- `/hero.jpg` must be an **in-situ photograph** showing the product in its real environment. Use the left third of the image as a stable tonal area for the headline overlay. See `snippets/imagery-guidance.md`.
- `/supporting.jpg` — a second contextual photograph, different subject/angle from the hero.
- `/feature-*.jpg` — one photograph per feature row. Same principle: stable tonal areas, no embedded UI, no watermarks.

Do NOT replace these with abstract gradients, floating 3D spheres, or stock illustrations of "person at laptop looking happy."

## Rubric compliance

| Rule | How this archetype satisfies it |
|---|---|
| fs-001 one composition | Hero is 92vh of one composition (image + overlaid text block) |
| fs-002 hero budget | brand + 1 H1 + 1 support sentence + 1 CTA group (primary + secondary) + 1 dominant image |
| fs-003 no cards by default | Zero cards anywhere. Features use alternating rows. Social proof uses a pull-quote. |
| fs-004 one job per section | Each `<section>` has one H2 or H3 and one purpose |
| fs-005 narrative flow | Hero → supporting → features → social-proof → final-cta |
| fs-006 no hero overlays | No floating badges, "New!" pills, or promo stickers |
| fs-007 copy discipline | Placeholder copy uses product language prompts, not marketing fluff |
| fs-008 motion recipe | Exactly 3 motions (entrance + scroll + hover) |
| fs-009 imagery | In-situ photography required; tonal-area guidance in `.hero-overlay` gradient |
| fs-010 visual anchor | Hero `<img class="hero-image">` is full-bleed `object-cover` — the visual anchor |
| fs-011 premium without decoration | Type scale + whitespace + composition carry the design. Shadows are polish, not rescue. |

## Customization contract

Safe to retune:
- Every CSS variable in `:root` (colors, type, spacing, radius)
- All copy (headline, support, features, testimonial, CTA labels)
- All image `src` (keep `alt` meaningful)
- Accent color (single color — don't introduce a 5-color palette)

Do NOT remove:
- Section ids (`#hero`, `#features`, `#social-proof`, `#final-cta`) — the evaluator greps for them
- The narrative order (hero → supporting → features → social → final)
- `data-motion` attributes on `.nav` and `.hero`
- The 3 motions

## Accessibility

- `prefers-reduced-motion` media query disables all animations/transitions
- `aria-label` on nav + primary nav list
- Alt text on every image (keep meaningful — not decorative)
- Sufficient contrast on body text (see wisdom rule vq-005 — 4.5:1 minimum)
