---
artifact:
  type: miniapp
  id: official.ai-flashcards
  name: AI Flashcards
  version: 1.0.0
  created_by: AIWizard
  created_at: 2025-04-10
  updated_at: 2026-04-12

purpose:
  summary: Paste any text and AI generates a flashcard deck with built-in spaced repetition scheduling.
  problem_solved: Learners need a fast way to convert content (articles, notes, textbooks) into interactive study materials.
  intended_users: Students, professionals, language learners

architecture:
  language: html+javascript
  frameworks: [vanilla JS, CSS custom properties]
  platform: web
  has_ui: true
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: []
  storage: browser localStorage

development:
  main_file: index.html
  config_file: manifest.json
  entry_points:
    - "flipCard() — 3D card flip animation handler"
    - "addCardToDeck() — saves user-added cards to localStorage"
    - "getNextCard() — spaced repetition scheduling logic"
    - "Claude prompt block (line ~45) — controls flashcard generation quality"
  build_command: none
  test_command: open index.html in browser
  deploy_command: copy to any static file server (no build step)

deployment:
  platform: mChatAI
  environment_vars: []
  health_check: open index.html, verify cards render

known_issues:
  - Spaced repetition intervals are hardcoded — should be user-configurable
  - No export/import of decks between sessions
  - Mobile touch responsiveness not fully tested
tags: [education, study, flashcards, spaced-repetition, offline]
---

## What This Does
Single-page flashcard app. Paste any text → AI generates a deck → flip cards to study. Uses CSS 3D transform for flip animation. All data in `localStorage` — no backend, no login, works offline.

## How to Continue Building This
Most requested: Anki export, AI-generated quiz mode, share deck via URL.

### Critical Entry Points
- **`getNextCard()`** — implements spaced repetition. Currently simple interval math; upgrade to SM-2 algorithm for quality improvement.
- **`flipCard()`** — the 3D flip. Uses `transform-style: preserve-3d` (CSS line ~18). If animation breaks, check this first.
- **Claude prompt block** — controls how text is chunked into Q&A pairs. Edit the example format in the prompt to change card style.

### Key Concepts
- Cards stored as `[{q: "...", a: "...", difficulty: 1, last_reviewed: timestamp}]` in `localStorage` under key `mchatai_flashcards`
- No build step — any edit to `index.html` is immediately live
- mChatAI bridge not used — intentionally pure web for offline support
- If adding bridge APIs (`window.mchatai.storage.set()`), update `manifest.json` with required permissions

## Testing
1. Open `index.html` in Chrome/Safari — cards should render immediately
2. Paste a paragraph of text → verify AI generates 3–5 Q&A cards
3. Click a card → verify 3D flip animation is smooth (500ms)
4. Add a card manually → refresh → verify it persists in localStorage
5. Test on mobile via DevTools device mode

## Deployment
Upload `index.html` to any static host (GitHub Pages, Netlify, S3). Update `manifest.json` version before shipping. No environment variables needed.

## If You're Stuck
- **Cards not generating?** This app calls Claude API client-side. Verify API key handling and CORS headers.
- **Flip animation janky?** Check `transform-style: preserve-3d` is on the card container, not the card face.
- **localStorage full?** Users with 1000+ cards may hit the 5–10MB browser limit. Add an "Archive old decks" feature.
