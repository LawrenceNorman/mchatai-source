# Capability Packs

Capability Packs are source-driven bundles loaded by mChatAI+ AI Automation.
They are the platform's plugin-like layer: a pack can provide context, tool
contracts, templates, evaluator rubrics, setup requirements, permissions, and
quality labels.

Pipelines remain executable workflows. Capability Packs are reusable domain
substrates that AIWizard, Pipeline Builder, Agent Studio, and Dev Agents can
load when they need specialized knowledge or tools.

## Current Pack

- `macos-app-builder`: native SwiftUI/AppKit macOS app generation, build, QA,
  and packaging guidance.
- `miniapp-builder`: single-file HTML/CSS/JS mini-app generation, preview, QA,
  and publish-readiness guidance.
- `pipeline-builder`: AI Automation pipeline and DAG pipeline composition,
  validation, run, and output-quality guidance.
- `webspa-builder`: deployable multi-file web SPA generation, build, preview,
  responsive QA, and package guidance.

## Planned Pack Families

- Builder packs: mini-app, webSPA, pipeline, DAG agent, Python microservice,
  Unity, React Native, Electron/Tauri, Android.
- QA and repair packs: browser QA, visual design rubric, signing/packaging,
  Xcode test triage, feedback auto-fix, self-healing content, security review.
- Integration packs: GitHub, Google Workspace, MCP federation, cloud services,
  speech, icon/image generation, documents, presentations, spreadsheets.
- Product-domain packs: Vault/document intelligence, MapGuide/spatial,
  calendar/productivity, music/audio, game design, community publish.
