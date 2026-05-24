# YouTube Upload Skill

Initiates a YouTube resumable upload session, updates metadata on existing videos, or fetches video stats. **The actual video-byte upload is delegated** — JSCore can't stream large multipart bodies, so a sibling shell command or a video-stitcher microservice does the `PUT` once this skill returns the upload URL.

## Setup

1. Create a Google Cloud project; enable the YouTube Data API v3.
2. Configure OAuth consent + create an OAuth client (Desktop or Web type).
3. Run the OAuth 2.0 authorization-code flow against scope `https://www.googleapis.com/auth/youtube.upload` (and `https://www.googleapis.com/auth/youtube` for `getVideo`/`updateMetadata`).
4. Save the bearer access token under Keychain `ExtAPI_youtube_accessToken`. Tokens expire in 1 hour — wire your refresh-token flow elsewhere.
5. Verify your channel for uploads at https://www.youtube.com/verify before first use (gates videos > 15 min and certain features).

## Actions (`config.action`)

### `initiateUpload` (default)

Starts a resumable upload session. Returns the URL the caller should PUT video bytes to.

| Key | Description |
|---|---|
| `title` | **Required.** Max 100 chars. |
| `description` | Max 5000 chars. |
| `tags` | Array, comma string, or JSON string. Aggregate ≤500 chars. |
| `categoryID` | YouTube category. Default `22` (People & Blogs). See https://developers.google.com/youtube/v3/docs/videoCategories/list. |
| `defaultLanguage` | ISO 639-1 code (e.g. `en`). |
| `privacyStatus` | `private` (default), `unlisted`, `public`. |
| `publishAt` | ISO8601 scheduled-publish timestamp. Requires `privacyStatus=private`. |
| `madeForKids` | Boolean. |
| `embeddable` | Boolean. |
| `license` | `youtube` or `creativeCommon`. |
| `fileSizeBytes` | Hint for the Content-Length header (improves resume reliability). |
| `contentType` | MIME type. Default `video/*`. |

Output: human-readable instructions including the `uploadURL` line; subsequent steps (a shell skill or `video-stitcher` microservice) parse that line and PUT the bytes:

```
curl -X PUT -H 'Content-Type: video/*' --data-binary @video.mp4 '<uploadURL>'
```

The server returns the created Video resource (JSON with `videoId`) once the bytes finish.

### `updateMetadata`

Update an existing video's snippet/status (e.g., flip from `private` → `public` after review).

| Key | Description |
|---|---|
| `videoID` | **Required.** |
| `title`, `description`, `tags`, `categoryID`, `defaultLanguage` | New snippet fields. |
| `privacyStatus`, `publishAt`, `madeForKids`, `embeddable`, `license` | New status fields. |

### `getVideo`

Fetch a video's current metadata + statistics (for analytics rollups, performance triggers).

| Key | Description |
|---|---|
| `videoID` | **Required.** |
| `parts` | Comma string of YouTube parts. Default `snippet,status,statistics`. |

### Common

| Key | Description |
|---|---|
| `accessToken` | Override Keychain token. |
| `dryRun` | Validate inputs, no API call. |

## Examples

Initiate an upload (used in a pipeline before the video-stitcher microservice PUTs the bytes):
```json
{"command":"runSkill","skillID":"custom.youtube-upload","config":{"title":"Build a Wordle clone in 90 seconds","description":"...","tags":"mchatai,build,wordle","privacyStatus":"private","fileSizeBytes":"45000000"},"requestID":"yt-001"}
```

Flip a private video to public after Lawrence approves it:
```json
{"command":"runSkill","skillID":"custom.youtube-upload","config":{"action":"updateMetadata","videoID":"abc123XYZ","title":"Build a Wordle clone in 90 seconds","description":"...","privacyStatus":"public"},"requestID":"yt-002"}
```

Pull view/like stats for analytics rollup:
```json
{"command":"runSkill","skillID":"custom.youtube-upload","config":{"action":"getVideo","videoID":"abc123XYZ","parts":"snippet,statistics"},"requestID":"yt-003"}
```

Dry run:
```json
{"command":"runSkill","skillID":"custom.youtube-upload","config":{"title":"Test","dryRun":true},"requestID":"yt-004"}
```

## Notes & Pitfalls

- **Quota.** YouTube Data API v3 has a hard 10,000-unit daily quota per project. One upload = 1,600 units. So you can upload ~6 videos/day per project on the default quota. Request more from Google Cloud Console if needed.
- **Channel verification.** Long videos and certain features require a verified channel. Upload via the web UI once first; subsequent API uploads inherit.
- **Resumable URL expiry.** 1 week from session start. Re-call `initiateUpload` if expired.
- **Thumbnail upload.** Not yet supported — `POST /youtube/v3/thumbnails/set` is a separate multipart endpoint requiring a binary body. Build a sibling skill or microservice when needed.
- **Captions.** Use `/youtube/v3/captions` (separate skill). Auto-captioning happens server-side post-upload.
- **Categoryless behavior.** If you skip `categoryID`, YouTube assigns "People & Blogs" by default. For tech tutorials, `27` (Education) or `28` (Science & Technology) test better in search.
