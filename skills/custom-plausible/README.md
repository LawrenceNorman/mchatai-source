# Plausible Analytics Skill

Two surfaces in one skill: send tracking events (no auth) and query stats (Bearer API key). Self-hosted instances via `baseURL`.

## Setup

- **Event tracking only:** nothing to configure beyond the domain.
- **Stats queries:** create an API key at Plausible → Settings → API keys (Business plan or self-hosted). Save under Keychain `ExtAPI_plausible_apiKey`.
- Optional: `ExtAPI_plausible_baseURL` to point at a self-hosted instance.

## Actions (`config.action`)

### `event` (default)

Fire a tracking event. No auth required.

| Key | Description |
|---|---|
| `event` / `name` | Event name. Default `pageview`. Custom event names must be enabled in your Plausible site goals. |
| `eventURL` / `url` | **Required.** The page URL the event is associated with. |
| `domain` / `site_id` | **Required.** Your registered Plausible site (e.g. `mchatai.com`). |
| `referrer` | Optional referrer URL. |
| `props` | JSON object of custom properties (e.g. `{recipe:"wordle-clone"}`). |
| `revenue` | JSON object `{currency:"USD",amount:9.95}` for revenue events. |
| `userAgent` | Override (Plausible requires a User-Agent header). |
| `forwardedFor` / `xForwardedFor` | Original visitor IP when relaying server-side. |

### `aggregate`

Top-line metrics for a period.

| Key | Description |
|---|---|
| `site_id` / `domain` | **Required.** |
| `period` | `12mo`, `6mo`, `30d` (default), `7d`, `day`, `month`, `custom`. |
| `metrics` | Comma string. Default `visitors,pageviews`. Other: `bounce_rate`, `visit_duration`, `events`, `views_per_visit`. |
| `date` | Override reference date (ISO `YYYY-MM-DD`). |
| `filters` | Plausible filter syntax (`event:page==/blog/wordle`). |

### `timeseries`

Same metrics as `aggregate`, broken out by time bucket.

| Extra Key | Description |
|---|---|
| `interval` | `day` (default for 7d/30d) or `month` (for longer periods). |

### `breakdown`

Top N values of a property (top pages, sources, devices).

| Extra Key | Description |
|---|---|
| `property` | Default `event:page`. Common: `visit:source`, `visit:device`, `visit:browser`, `visit:country`, `event:name`, `event:props:<custom>`. |
| `limit` | Default 10. |

### Common

| Key | Description |
|---|---|
| `baseURL` | Override default `https://plausible.io`. |
| `apiKey` | Override Keychain key (stats only). |
| `dryRun` | Validate inputs, no API call. |

## Examples

Track a blog-post-view event:
```json
{"command":"runSkill","skillID":"custom.plausible","config":{"event":"pageview","url":"https://mchatai.com/blog/wordle-in-90-seconds","domain":"mchatai.com"},"requestID":"pl-001"}
```

Track a custom "recipe-installed" event with properties:
```json
{"command":"runSkill","skillID":"custom.plausible","config":{"event":"recipe-installed","url":"https://mchatai.com/r/daily-life-organizer","domain":"mchatai.com","props":"{\"recipe\":\"daily-life-organizer\",\"tier\":\"free\"}"},"requestID":"pl-002"}
```

Pull weekly aggregate metrics:
```json
{"command":"runSkill","skillID":"custom.plausible","config":{"action":"aggregate","site_id":"mchatai.com","period":"7d","metrics":"visitors,pageviews,bounce_rate,visit_duration"},"requestID":"pl-003"}
```

Top 20 pages last 30 days:
```json
{"command":"runSkill","skillID":"custom.plausible","config":{"action":"breakdown","site_id":"mchatai.com","period":"30d","property":"event:page","limit":"20","metrics":"visitors,pageviews"},"requestID":"pl-004"}
```

Daily timeseries of conversions:
```json
{"command":"runSkill","skillID":"custom.plausible","config":{"action":"timeseries","site_id":"mchatai.com","period":"30d","interval":"day","metrics":"visitors,events","filters":"event:name==recipe-installed"},"requestID":"pl-005"}
```

Dry run:
```json
{"command":"runSkill","skillID":"custom.plausible","config":{"event":"test","url":"https://mchatai.com","domain":"mchatai.com","dryRun":true},"requestID":"pl-006"}
```

## Notes

- **Stats API requires Business plan** on plausible.io ($19/mo for personal, higher for orgs). Self-hosted Plausible is free + included. For the marketing machine, self-hosted on a small VPS is the durable choice; revisit when org is bigger.
- **Custom event names** must be added as goals in Plausible Settings → Goals before they'll show up in dashboards. Events are accepted regardless, but invisible until the goal exists.
- **Property cardinality matters.** Plausible stores up to ~30 distinct custom-prop values per name efficiently; beyond that, queries get slow. Use a stable enum for `props.tier`, `props.recipe`, etc.; never inject user IDs or timestamps.
- **PostHog as alternative.** Plausible favors privacy + simplicity; PostHog favors funnel/cohort depth. Build a sibling `custom.posthog` skill if you need session replay or feature flags.
