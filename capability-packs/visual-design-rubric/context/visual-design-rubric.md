# Visual Design Rubric Capability Pack

Use this pack when generating or judging a frontend artifact whose success depends on visual polish, scanability, and responsive behavior.

## Design Bar

- The first viewport should show the actual product or tool, not a marketing placeholder.
- Text hierarchy should match the density of the surface. Reserve large display type for true heroes; use compact headings inside panels and controls.
- Buttons and controls need stable dimensions, clear affordances, and no text overflow.
- Layout should be built from purposeful sections and repeated item cards only where repetition exists. Avoid card-in-card composition.
- Color should have contrast and variation; avoid a one-note palette where the whole interface is one hue family.
- Images and media should reveal the product, state, gameplay, place, or object rather than act as vague decoration.
- UI elements must not overlap incoherently at any tested viewport.

## Responsive Bar

- Check compact mobile, tablet, laptop, and wide desktop compositions.
- Primary controls must remain visible and reachable.
- Fixed-format elements such as boards, toolbars, counters, tiles, and canvases need explicit dimensions or responsive constraints.
- Long labels and generated text should wrap or clamp intentionally.

## Accessibility Sanity

- Preserve keyboard access for primary actions.
- Keep focus indicators visible.
- Avoid color-only state changes.
- Maintain readable contrast for text, controls, and disabled states.

## Review Output

When reporting visual quality, include:

- visual pass/fail summary
- viewport sizes inspected
- strongest polish issue
- strongest usability issue
- whether the artifact is shippable, needs one more fix pass, or needs redesign
