# X Post Skill

Post a tweet, thread, or reply to X (Twitter) using the v2 API.

## Setup

1. Create an X app at https://developer.twitter.com/en/portal/dashboard with Read+Write permission.
2. Generate an OAuth 2.0 **User Access Token** (not an app-only bearer token — app-only cannot create posts).
3. Save it to the Keychain under `ExtAPI_twitter_accessToken`, or pass via `config.accessToken`.

## Config

| Key | Type | Description |
|---|---|---|
| `text` | string | Single tweet text (≤280 chars). Falls back to pipeline input text. |
| `thread` | array of strings (or JSON string) | Posts each item as a tweet, threaded via reply chain. First item may attach media. |
| `inReplyToTweetID` | string | Reply to an existing tweet by ID. |
| `mediaIDs` | array of strings | Up to 4 pre-uploaded media IDs (use the X media upload endpoint separately). |
| `accessToken` | string | Overrides Keychain credential. |
| `dryRun` | boolean | If true, logs intent without posting. |

## Output

- Success: `Posted tweet id=… URL: https://x.com/i/status/…`
- Thread success: `Posted thread of N tweets. URL: …` plus per-tweet lines in the log.
- On failure: `error` field populated; thread errors include "partially posted" diagnostic with first tweet ID for cleanup.

## Examples

Single tweet:
```json
{"command":"runSkill","skillID":"custom.xpost","config":{"text":"Hello from mChatAI"},"requestID":"x-001"}
```

Thread:
```json
{"command":"runSkill","skillID":"custom.xpost","config":{"thread":"[\"1/3 The marketing machine is built ON mChatAI itself.\",\"2/3 Every post is a pipeline. Every pipeline is a demo.\",\"3/3 Open source recipes coming soon.\"]"},"requestID":"x-002"}
```

Dry run (test without spending API quota):
```json
{"command":"runSkill","skillID":"custom.xpost","config":{"text":"Test","dryRun":true},"requestID":"x-003"}
```

## Notes

- X API v2 rejects tweets >280 chars; the skill warns but lets the API enforce.
- Thread cleanup on partial failure is the caller's responsibility — `firstID` is logged so the caller can delete.
- Media upload is NOT included in this skill (chunked upload is a separate workflow). Use a companion skill or external tool to upload media, then pass `media_id` strings here.
