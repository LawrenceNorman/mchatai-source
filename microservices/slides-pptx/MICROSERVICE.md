---
name: Slides PPTX
version: 0.1.0
description: Export an AI Slides deck to an editable PowerPoint (.pptx) — native charts and tables, real text with bold/italic/links, pictures cropped to their focus, speaker notes, brand footer. Runs on the user's Mac.
author: mChatAI
category: document
tags: [slides, pptx, powerpoint, export, presentation]
python_deps: [fastapi, pydantic, python-pptx]
draft: false
endpoints:
  - path: /export
    method: POST
    description: Write the deck (as AI Slides lays it out) to output_path as .pptx.
  - path: /prepare
    method: POST
    description: Make sure python-pptx is importable, installing it on first use.
  - path: /info
    method: GET
    description: Capabilities and the python-pptx version.
  - path: /healthz
    method: GET
    description: Liveness probe.
---

# Slides PPTX

The optional PowerPoint export for AI Slides (Phase SL2.9). The app does all of the
interpretation — layouts, the brand, inline Markdown, and every chart RESOLVED to numbers
through the platform chart kit — and sends one JSON document. This service only draws it with
`python-pptx`, so a `.pptx` matches the app's own PDF export slide for slide.

Runs on the user's machine (CLAUDE.md RULE #2): installed on demand from mchatai-source by
`MicroserviceInstallCoordinator` when the user first picks Export ▸ PowerPoint. Never deployed
centrally.

## POST /export

```json
{
  "output_path": "/Users/me/Desktop/Q3 Review.pptx",
  "assets_dir": "/Users/me/Library/Containers/…/Slides/<deck-id>/assets",
  "deck": { "title": "…", "theme": { … }, "brand": { … }, "slides": [ … ] }
}
```

The CALLER picks `output_path` (the app is sandboxed; the service is not) — the file is
written to `<output_path>.part` and renamed only when complete. Response:
`{"status": "ok", "output_path": …, "slides": N, "size_bytes": …, "warnings": [...]}`.
