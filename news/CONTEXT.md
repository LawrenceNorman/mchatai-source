# AI News — Feed Catalog (`news/feeds.json`)

Source of truth for the **AI News** applet's news sources on iOS + macOS.

## Why this lives here (not in the app binary)

The feed list used to be a hardcoded `allSources` array in Swift (`AINews/AINewsStore.swift`). That meant every feed fix (a dead Reuters URL, a new source) required a full App Store review cycle. This file is fetched at runtime by `NewsFeedCatalogService` from
`https://raw.githubusercontent.com/LawrenceNorman/mchatai-source/main/news/feeds.json`
(no auth, ~1-day TTL cache, bundled offline fallback), so **adding/removing a feed is a zero-rebuild git PR** — see CLAUDE.md RULE #1.

## Adding a feed (humans)

1. Append a source object to `sources[]`. Required fields (all must be present — the app's `RSSFeedSource` decoder requires them): `id`, `name`, `country`, `language`, `rssURL`, `category`, `latitude`, `longitude`, `icon`.
2. `id` is a stable slug — never reuse or renumber.
3. Pick a `category` from: `General, World, Tech, Sports, Business, Health, Science, Entertainment, Local, Videos`. (`All` is a virtual "show everything" tab, not a source category.)
4. Set `kind` if it isn't a plain RSS feed (see below). Omit `kind` for standard RSS/Atom.
5. Bump `version` and update `lastUpdated`.
6. Verify the URL is live before committing: `curl -sIL <url>` should be `200`, and the body should be RSS/Atom XML. The parser (`RSSFeedParser.swift`) handles both RSS `<item>` and Atom `<entry>`, plus `media:thumbnail`/`enclosure` images.

## `kind` values

| kind | meaning | URL handling |
|---|---|---|
| *(omitted)* / `rss` | standard RSS/Atom feed | used verbatim |
| `youtube` | official per-channel YouTube feed (`.../feeds/videos.xml?channel_id=UC…`) — Atom, no auth, stable | verbatim; UI may badge as video |
| `gnews-topic` | Google News topic section | placeholders resolved on-device |
| `gnews-local` | Google News local/search headlines | placeholders resolved on-device |
| `reddit` | subreddit `.rss` feed — **rate-limit-prone** (HTTP 429 by IP); treated as `flaky`, not `dead` | verbatim |

## URL placeholders (resolved on the device, per-user)

`rssURL` may contain these tokens; `NewsFeedCatalogService.resolvedURL(for:)` substitutes them from the user's `Locale` (and, for `gnews-local`, an optional user-set locality):

| token | resolves to | example |
|---|---|---|
| `{HL}` | host language | `en-US` |
| `{GL}` | geo / country | `US` |
| `{CEID}` | `country:LANG` | `US:EN` |
| `{QUERY}` | user locality (city) if set, else localized country name | `Seattle` / `United States` |

> Pass 1 localizes Google News by **region** (English-language). Per-language localization and CoreLocation-based city detection for `{QUERY}` are documented follow-ups; today `{QUERY}` reads an optional user-set city from app settings, else falls back to the country.

## Health metadata (cron-written — the app ignores unknown keys)

The weekly `news-feeds-sync` Cloud Function (mchataiweb) HTTP-checks every feed and stamps, per source: `healthStatus` (`ok` | `flaky` | `dead`), `lastChecked`, `lastHttpStatus`, `newestItemAgeHours`. The app **skips** any source marked `healthStatus: "dead"`. `reddit` sources are never marked `dead` on a lone 429 (rate-limit, not death). Humans curate additions; the cron maintains health and auto-prunes rot (it would have caught the dead Reuters feeds this migration removed).

## Change log

- **2026-07-01 (v1):** Initial migration out of Swift. Removed dead feeds (Reuters world/business/health → 404; `search.cnbc.com` → 503; Korea Herald → non-XML). Added new kinds: 8 `youtube` news channels, 7 `gnews-topic` (localizing), 1 `gnews-local`, 2 `reddit`. All 62 sources health-verified live at authoring time.
