# Browser QA Capability Pack

Use this pack when an AIWizard result can be loaded in a browser or WebView and the goal needs evidence that the artifact actually works, not just that code was generated.

## Required Verification Loop

1. Load the generated artifact in a real browser preview.
2. Capture and inspect console errors before declaring success.
3. Test the core interaction path from a fresh load.
4. Check at least three viewport classes: compact mobile, tablet, and desktop.
5. Capture a screenshot after the main interaction has produced visible state.
6. Treat blank screens, horizontal overflow, hidden primary controls, console exceptions, broken asset URLs, and blocked pointer/keyboard paths as failures.

## Mini-App Checks

- Single-file mini-apps must run without a dev server unless they explicitly need one.
- Inline scripts must not depend on unavailable build tooling, remote modules, or missing local assets.
- Buttons, controls, game boards, and counters must have stable dimensions so hover, score, or error text does not shift the whole layout.
- The artifact should recover gracefully from reload and show a useful first state immediately.

## webSPA Checks

- Install/build/preview commands must be explicit in the generated project metadata or run notes.
- Development preview and production build should both work before packaging.
- Route transitions must not produce empty pages.
- Framework hydration errors, missing root nodes, and module import failures are blocking issues.

## Reporting

Report verification as evidence, not vibes:

- preview URL or local artifact path
- viewport sizes checked
- console status
- core interactions exercised
- screenshot status
- remaining risk or skipped checks
