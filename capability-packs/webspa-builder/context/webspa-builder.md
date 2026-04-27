# webSPA Builder Capability Pack

Use this pack when AIWizard is building a deployable web single-page app:
multi-file HTML/CSS/JavaScript, usually Vite-style, optionally with React, Vue,
or Svelte when the user or platform explicitly selects that framework.

## Build Contract

- Output a complete `webspa` JSON artifact with `id`, `name`, `framework`, and a
  `files` array.
- Include every file needed to install, build, preview, and package the app.
- Prefer `framework: "vanilla"` for simple L1 apps unless the goal requests a
  framework or the workflow clearly benefits from one.
- For framework apps, provide a minimal `package.json` with build and preview
  scripts, and keep dependencies mainstream and justified.
- The first screen must be the actual site, app, dashboard, or product surface.
  Do not use a generic landing page for an operational tool.
- Use stable responsive constraints for panels, media, boards, charts, and fixed
  controls so hover states and dynamic text cannot shift the layout.
- For public HTTPS APIs, use platform-approved proxy or integration routes rather
  than direct cross-origin calls that fail after publish.

## UX Defaults

- SaaS and operational tools should be quiet, dense, and scannable.
- Branded/product pages should show the product or place in the first viewport.
- Games and immersive experiences may be more expressive, animated, and visual.
- Use real or generated visual assets where the experience needs images; do not
  lean on abstract gradients as the main subject.
- Navigation should be predictable. Keep primary actions visible and secondary
  actions in menus, tabs, or toolbars.

## QA Flywheel

1. Validate the `webspa` artifact schema and file paths.
2. Install dependencies only when required.
3. Run the build script and capture the first compiler/runtime error.
4. Launch preview and inspect desktop and mobile screenshots.
5. Check browser console errors and broken asset paths.
6. Exercise the primary workflow, including empty/error states.

## Common Failure Recipes

- **Missing package files**: add `package.json`, entry file, and root HTML.
- **Framework mismatch**: align `framework`, files, imports, and dependencies.
- **Blank preview**: check mount element, script path, build output, and console.
- **Responsive overlap**: replace viewport-scaled typography with stable layout
  constraints and wrapping.
- **Generic hero instead of app**: move the working product surface into the first
  viewport and remove explanatory filler.
