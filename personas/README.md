# Persona packs

One folder per persona. The same pack drives the **Persona picker in iOS ChatView** and a
**hub mini-app** (`miniapps/on-device-chat/`, the on-device chat template). Design and
field notes: `mchatai_macOS/docs/PERSONA_PACKS_ARCHITECTURE.md` (Phase EX).

- `_index.json` — all records; bump `version` (YYYY.MM.DD) when anything changes. The app
  ignores an index older than its built-in fallback.
- `<id>/persona.json` — the record (keep it identical to its `_index.json` entry).
- `<id>/chunks/*.md` — optional knowledge, ≤120 words each, with a `keywords:` line.
- `<id>/companion.md` — optional source of the pack's companion page.
- `<id>/icon.png` — optional hub icon (chat uses the SF symbol in `icon`).

Rules: `name` is the identity saved chats use — never change it, add the old one to
`aliases`. A dropped persona is `retired: true`, not deleted. No personas in Swift.
