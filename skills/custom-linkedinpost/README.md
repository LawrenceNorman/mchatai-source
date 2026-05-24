# LinkedIn Post Skill

Post text or article shares to LinkedIn — personal profile or company page — via the UGC Posts API (v2).

## Setup

1. Create a LinkedIn app at https://www.linkedin.com/developers/apps.
2. Add the "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn" products.
3. Run an OAuth 2.0 authorization-code flow with scopes:
   - `openid profile w_member_social` (personal posts)
   - `w_organization_social` (additional, for company-page posts; requires admin verification on the page)
4. Exchange the auth code for an access token. Save under Keychain key `ExtAPI_linkedin_accessToken`, or pass `config.accessToken`.

Tokens last 60 days; budget a refresh step before they expire.

## Config

| Key | Type | Description |
|---|---|---|
| `text` | string | Post body. Falls back to pipeline input text. |
| `authorURN` | string | Override author. E.g. `urn:li:person:xxxx` or `urn:li:organization:1234567`. Auto-resolved from `/v2/userinfo` if omitted for personal posts. |
| `target` | `"person"` or `"organization"` | Hint when `authorURN` not set. Default `person`. |
| `organizationID` | string | Numeric org ID. Builds `urn:li:organization:<id>` if used with `target=organization`. |
| `visibility` | `PUBLIC` / `CONNECTIONS` / `LOGGED_IN` | Audience. Default `PUBLIC`. |
| `articleURL` | string | If set, share is rendered as a link preview. |
| `articleTitle` | string | Title for the link card. |
| `articleDescription` | string | Description for the link card. |
| `articleThumbnailURL` | string | Image URL for the link card. |
| `accessToken` | string | Overrides Keychain credential. |
| `dryRun` | boolean | Logs intent without posting. Also skips the `/userinfo` call. |

## Output

- Success: `Posted to LinkedIn. URN: urn:li:share:xxxxxxxxxx`
- Failure: error string + HTTP status + body excerpt in log.

## Examples

Personal text post:
```json
{"command":"runSkill","skillID":"custom.linkedinpost","config":{"text":"How we ship one marketing campaign per day with one human hour: a thread."},"requestID":"li-001"}
```

Article share with link preview:
```json
{"command":"runSkill","skillID":"custom.linkedinpost","config":{"text":"New post on dogfooding marketing automation:","articleURL":"https://mchatai.com/blog/marketing-machine","articleTitle":"Building a Self-Marketing Platform","articleDescription":"How mChatAI markets itself.","articleThumbnailURL":"https://mchatai.com/og/marketing-machine.png"},"requestID":"li-002"}
```

Company page post:
```json
{"command":"runSkill","skillID":"custom.linkedinpost","config":{"text":"mChatAI v1.04 is live.","target":"organization","organizationID":"12345678"},"requestID":"li-003"}
```

Dry run:
```json
{"command":"runSkill","skillID":"custom.linkedinpost","config":{"text":"Test","dryRun":true},"requestID":"li-004"}
```

## Notes

- The skill uses the legacy `/v2/ugcPosts` endpoint (still supported, simpler request shape) rather than `/rest/posts`. Migrate to `/rest/posts` if LinkedIn deprecates UGC.
- For images/video, use `shareMediaCategory: IMAGE` or `VIDEO` with a registered LinkedIn media URN. Pre-upload via the `/v2/assets?action=registerUpload` flow; this skill currently supports only text and article shares.
- Company-page posts require the token-holder to be an admin of that page.
