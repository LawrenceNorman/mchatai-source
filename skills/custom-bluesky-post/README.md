# Bluesky Post Skill

Post text or threads to Bluesky via the AT Protocol.

## Setup

1. Generate an **App Password** at https://bsky.app/settings/app-passwords (NEVER use your main account password).
2. Save credentials to Keychain:
   - `ExtAPI_bluesky_handle` — your handle (e.g., `lawrence.bsky.social`)
   - `ExtAPI_bluesky_appPassword` — the generated app password
3. (Optional) Override the PDS service URL via `ExtAPI_bluesky_serviceURL` if you self-host.

## Config

| Key | Type | Description |
|---|---|---|
| `text` | string | Single post text (≤300 graphemes). Falls back to pipeline input text. |
| `thread` | array of strings (or JSON string) | Posts each item as its own record, chained via `reply.root` + `reply.parent`. |
| `serviceURL` | string | Override PDS endpoint. Default `https://bsky.social`. |
| `identifier` / `handle` | string | Override Keychain handle. |
| `appPassword` / `password` | string | Override Keychain app password. |
| `dryRun` | boolean | Validate inputs and log intent without authenticating or posting. |

## Output

- Success: `Posted to Bluesky. URL: https://bsky.app/profile/<handle>/post/<rkey>`
- Thread success: `Posted Bluesky thread of N posts. URL: …`
- Failure: error + per-step HTTP log; thread errors include "Thread partial: posted X/N. First: <uri>" so you can clean up.

## Examples

Single post:
```json
{"command":"runSkill","skillID":"custom.bluesky-post","config":{"text":"Hello Bluesky from mChatAI."},"requestID":"bsky-001"}
```

Thread:
```json
{"command":"runSkill","skillID":"custom.bluesky-post","config":{"thread":"[\"1/3 The marketing machine ships its own posts.\",\"2/3 Every pipeline is a demo.\",\"3/3 Open source recipes coming soon.\"]"},"requestID":"bsky-002"}
```

Dry run:
```json
{"command":"runSkill","skillID":"custom.bluesky-post","config":{"text":"Test","dryRun":true},"requestID":"bsky-003"}
```

## Notes

- Bluesky's 300-character limit is in **graphemes**, not bytes. The skill warns but lets the API enforce.
- Images, link cards, and quote-posts are not supported in v1; add via the embed field (`record.embed = {$type: "app.bsky.embed.images", images: [...]}`) when needed.
- App passwords are revocable per-session at the Bluesky settings page — kill compromised tokens without changing your main password.
- Federated PDS (Personal Data Server) support: set `serviceURL` to your own instance's URL.
