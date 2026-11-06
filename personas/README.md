# Persona packs

One folder per persona. The same pack drives the **Persona picker in iOS ChatView** and a
**hub mini-app** (`miniapps/on-device-chat/`, the on-device chat template). Design and
field notes: `mchatai_macOS/docs/PERSONA_PACKS_ARCHITECTURE.md` (Phase EX).

- `_index.json` — all records; bump `version` (YYYY.MM.DD, `.n` for a same-day change) when
  anything changes. The app ignores an index older than its built-in fallback.
- `<id>/persona.json` — the record (keep it identical to its `_index.json` entry; `_note`
  fields are the author's and may differ).
- `<id>/chunks.json` — optional knowledge: `[{id, keywords[], text, order?}]`, each ≤~110
  words. Keyword retrieval picks two or three per turn for the on-device window.
  `order` + `knowledge.gate` keep later notes out until the person has reached them
  (a book's chapters: `book-club-gatsby`).
- `<id>/tools/build_chunks.py` — when the chunks are GENERATED from a corpus (the
  Pivotal Histories dossiers for `ask-the-era`, the mchatai.com docs for `mchatai-help`),
  the generator lives beside them and the output is never edited by hand.
- `<id>/companion.md` — optional source of the pack's companion page; pictures beside it
  in `<id>/companion/`. Build with `miniapps/on-device-chat/tools/companion_page.py <id>
  <out>` and deploy the folder with the hub `deploy` verb from mChatAI+ (`plain: true`);
  the pack's `companion.url` is that address.
- `<id>/icon.png` — optional hub icon (chat uses the SF symbol in `icon`).
- `preinstalled: true` — in the Chat picker until the person removes it (the original six);
  every other chat pack is listed under "Get more" and joins the picker when they Get it
  (EX.7). A persona pack inside a hub mini-app they installed joins the picker by itself.

Build the hub bundle: `python3 miniapps/on-device-chat/tools/build.py <id> <out-dir>`.

Rules: `name` is the identity saved chats use — never change it, add the old one to
`aliases`. A dropped persona is `retired: true`, not deleted. No personas in Swift. Since
EX.2 ChatView picks notes from `chunks.json` per turn (the page's rules; the shared fixture
in `_tests/` pins both). Nothing financial beyond the Money Check-In demo; no health advice.
