# Reddit Submit Skill

Submit a text or link post to a subreddit, or reply to a post/comment, via Reddit's OAuth API.

**Use sparingly.** Reddit communities mark and remove low-effort or AI-feeling posts fast. This skill is best paired with a human in the loop — draft in pipeline, queue for review in your morning hour, hit publish.

## Setup

1. Create an OAuth app at https://www.reddit.com/prefs/apps (type: "script" or "web app").
2. Run the OAuth 2.0 authorization-code flow to get a **user-context access token** with at minimum the `submit` (and `edit` if you'll comment) scope. Access tokens expire after 60 minutes; the refresh-token-driven renewal is your problem (out of scope for this skill).
3. Save:
   - `ExtAPI_reddit_accessToken` — the bearer access token
   - `ExtAPI_reddit_userAgent` — a UNIQUE, DESCRIPTIVE User-Agent (Reddit blocks generic ones). Pattern: `<app>/<version> by /u/<username>`. Example: `mChatAI-Marketing/1.0 by /u/lawrence`.
4. (Optional) Override either via `config.accessToken` / `config.userAgent`.

## Config

### Action: `submit` (default)

| Key | Type | Description |
|---|---|---|
| `subreddit` / `sr` | string | **Required.** Without `/r/` prefix. E.g. `IndieGaming`. |
| `title` | string | **Required.** Max 300 chars. |
| `kind` | `self` or `link` | Default inferred from presence of `url`. |
| `text` | string | Body for self posts. Falls back to pipeline input text. |
| `url` | string | URL for link posts. |
| `nsfw` | boolean | Default false. |
| `spoiler` | boolean | Default false. |
| `sendReplies` | boolean | Default true (you receive notifications on replies). |

### Action: `comment`

| Key | Type | Description |
|---|---|---|
| `thingID` / `thing_id` | string | **Required.** Format `t3_xxx` (post) or `t1_xxx` (comment). Get from the `name` field of any post/comment object. |
| `text` | string | **Required.** Comment body. Falls back to pipeline input text. |

### Common

| Key | Description |
|---|---|
| `accessToken` | Override Keychain token. |
| `userAgent` | Override Keychain user agent. |
| `dryRun` | Validate inputs and log intent without calling Reddit. |

## Output

- Submit success: `Posted to /r/<sr>. URL: <permalink>`
- Comment success: `Posted Reddit comment (id=t1_xxx)`
- Failure: error includes Reddit's structured error code/message when available (e.g. `RATELIMIT: you are doing that too much`, `SUBREDDIT_NOEXIST`, `THREAD_LOCKED`).

## Examples

Text post to a subreddit:
```json
{"command":"runSkill","skillID":"custom.reddit-submit","config":{"subreddit":"SideProject","title":"I built a marketing machine for my Mac app — here's what I learned","text":"After 3 weeks of...","sendReplies":true},"requestID":"r-001"}
```

Link share:
```json
{"command":"runSkill","skillID":"custom.reddit-submit","config":{"subreddit":"MacApps","title":"mChatAI v1: turn ideas into native macOS apps in minutes","url":"https://mchatai.com","kind":"link"},"requestID":"r-002"}
```

Comment on a post:
```json
{"command":"runSkill","skillID":"custom.reddit-submit","config":{"action":"comment","thingID":"t3_abc123","text":"Thanks for the question — yes, it ships notarized direct-download, not via App Store."},"requestID":"r-003"}
```

Dry run:
```json
{"command":"runSkill","skillID":"custom.reddit-submit","config":{"subreddit":"test","title":"x","text":"y","dryRun":true},"requestID":"r-004"}
```

## Notes & Pitfalls

- **Subreddit rules.** Many subreddits ban link posts, self-promotion, or AI-generated content. Read the rules; mods remove violators silently. This skill cannot enforce policy.
- **Karma + age gates.** New accounts (no karma, <30 days) get rate-limited to ~1 post per 10 min per subreddit. Reddit returns `RATELIMIT` with a wait time; the skill surfaces that.
- **User-Agent enforcement.** Reddit's API blocks generic User-Agents (`python-requests/2.x`, `curl/7.x`, etc.) — set a unique one in `ExtAPI_reddit_userAgent` or you'll get 429s.
- **OAuth refresh.** Tokens expire in 60 min. Build a refresh step or rotate manually. This skill does not implement refresh.
- **Crosspost.** Not supported in v1. Use the `crosspost_fullname` parameter and `kind: "crosspost"` if you extend this skill.
- **Image / video / poll posts** not supported. Add via separate endpoints (`/api/v1/media/asset.json` upload then `kind: "image"`).
