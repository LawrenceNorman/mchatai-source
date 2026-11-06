---
artifact:
  type: miniapp
  id: official.on-device-chat
  name: Money Check-In
  version: 1.0.0
  created_by: Claude Code
  created_at: 2026-11-05
  updated_at: 2026-11-05

purpose:
  summary: A private chat mini-app that runs on Apple's on-device model through the mChatAI iOS app, and the template for bespoke on-device chat mini-apps.
  problem_solved: Sensitive conversations (money, feelings) where the promise is that nothing leaves the device and nothing is stored.
  intended_users: Anyone with mChatAI on an Apple Intelligence iPhone or iPad

architecture:
  language: html+javascript
  frameworks: [vanilla JS, CSS custom properties]
  platform: mchatai-ios
  has_ui: true
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: ["window.mChatAI.llm.info()", "window.mChatAI.llm.generate(prompt, {provider: 'apple'})"]
  storage: none (conversation is memory-only)

development:
  main_file: index.html
  config_file: manifest.json
  entry_points:
    - "CONFIG (top of the script) — title, persona/system prompt, starters, temperature, maxTokens, outside-app copy"
    - "detectEnvironment() — decides which screen to show"
    - "buildPrompt() — folds recent turns into one prompt inside the device's context window"
  build_command: none
  test_command: "DEBUG build. Simulator: serve this folder on 127.0.0.1:<free port, never 8765>, open mchatai://debug/hub?url=http%3A%2F%2F127.0.0.1%3A<port>%2Findex.html. Device: devicectl device copy to --domain-type appDataContainer --domain-identifier com.sevenhillsstudio.mchatai --destination Documents/odm/index.html, then open mchatai://debug/hub?doc=odm/index.html"
  deploy_command: publish to the Community Hub from mChatAI+

known_issues:
  - Context is ~4K tokens (8K on newer devices on iOS 27), so long chats drop their oldest turns
tags: [chat, private, on-device, apple-intelligence, template]
---

## What This Does
A chat UI over Apple's on-device model, reached through the mChatAI iOS app's
bridge (Phase ODM, `OnDeviceModelBridge.swift`). It checks its environment first:

| Where it's opened | What it shows |
|---|---|
| A browser (incl. mchatai.com) | "Open this in the mChatAI app": no `window.webkit.messageHandlers.mChatAI` (only the app's web views have it) |
| mChatAI+ on a Mac | "Open this on your iPhone or iPad": in the app, `navigator.maxTouchPoints` is 0 |
| mChatAI on iPhone/iPad from before the bridge shipped | "Coming in the next mChatAI update": no `llm.info` |
| mChatAI on a device without Apple Intelligence, or with it off / still downloading | The headline + message `llm.info()` returns; "Check again" unless the device is ineligible |
| mChatAI with the model ready | The chat |

## Making a bespoke chat mini-app from this
Copy the folder and change only `CONFIG`:
- the persona: `system`
- the opening screen: `welcomeTitle` / `welcomeBody` / `starters`
- reply length: `turnReminder`, appended to every turn (the 3B model follows the
  last instruction it reads far better than the system prompt), and
  `maxSentences`, a display cap for when it runs long anyway.

Keep
`provider: "apple"`: hub pages get only the on-device model, never the user's
API-key providers.

## Bridge contract
- `llm.info()` → `{host: "mChatAI", platform: "iOS", appVersion, onDevice: {available, status, headline, message, model, contextSize?}}`.
  `status` is one of `available`, `deviceNotEligible`, `appleIntelligenceNotEnabled`, `modelNotReady`, `unknown`.
- `llm.stream(prompt, options, onText)` — same as generate, but `onText(textSoFar)` runs as the reply is written (cumulative text, ~every 50 ms). The page falls back to `generate` on builds without it.
- `llm.generate(prompt, {provider: "apple", system?, temperature?, maxTokens?})` → `{text, provider: "apple", model: "apple-on-device", onDevice: true}`.
  One stateless turn. Errors reject with a bracketed code first: `[context_exceeded]`, `[refused]`, `[busy]`, `[unavailable]`, `[unsupported_language]`, `[unsupported_provider]`, `[not_allowed]`, `[error]`.

## Privacy
The page makes no network requests and stores nothing; closing it clears the
chat. Keep it that way when copying it: one `fetch()` would break the
"nothing leaves your device" promise the copy makes.
