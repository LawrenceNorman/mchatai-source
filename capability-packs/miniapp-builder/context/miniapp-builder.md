# Mini-App Builder Capability Pack

Use this pack when AIWizard is building a mini-app: a self-contained browser
artifact that runs inside mChatAI+ and can be published as a single HTML-based
experience.

## Build Contract

- Output a complete mini-app artifact in the platform's `miniapp` JSON shape.
- Keep the artifact self-contained. Inline CSS and JavaScript are preferred.
- The first screen is the usable app, game, or tool. Do not create a marketing
  landing page unless the user explicitly asks for one.
- Use browser-native APIs conservatively. Avoid features that are unreliable in
  webviews or published mini-apps, including Wake Lock, vibration, and
  device-motion controls unless the platform has an explicit support path.
- For public HTTPS APIs, use the mChatAI proxy route instead of direct
  cross-origin `fetch` calls.
- Persist user state with `localStorage` when the app has scores, settings,
  timers, notes, decks, or in-progress work.
- Make all controls touch friendly, keyboard accessible where relevant, and
  responsive from small mobile screens through desktop previews.

## UX Defaults

- Favor one dense, coherent composition over stacks of decorative cards.
- Games should render the actual playfield immediately and keep score, state,
  and controls visible without covering gameplay.
- Tools should prioritize repeated use: compact controls, clear state, and no
  explanatory onboarding text inside the app chrome.
- Use generated, embedded, or code-native visuals when a mini-app needs imagery,
  sprites, product signals, or gameplay assets.
- Do not let text overflow buttons, chips, cards, counters, or fixed panels.

## QA Flywheel

1. Validate that the mini-app artifact parses and contains the required fields.
2. Open it in preview and confirm the first screen is nonblank.
3. Capture a desktop and mobile screenshot.
4. Check console output for errors.
5. Exercise the primary interaction path at least once.
6. Inspect for layout overflow, clipped controls, raw JSON, placeholder text, and
   missing empty states.

## Common Failure Recipes

- **Static mock instead of app**: add real state, event handlers, and a primary
  interaction loop.
- **Invisible or tiny mobile UI**: add viewport meta, stable sizing, and larger
  touch targets.
- **Published API failure**: route through the mChatAI proxy or remove the API
  dependency.
- **Game rejects input silently**: show valid controls, accepted moves, and a
  short failure state.
- **Preview-only success**: verify the serialized artifact, not just the rendered
  assistant response.
