# places/ — place packs

Curated, offline-renderable sets of points of interest ("place packs"), consumed
identically by iOS, macOS and Android over raw HTTPS:

```
https://raw.githubusercontent.com/LawrenceNorman/mchatai-source/main/places/index.json
https://raw.githubusercontent.com/LawrenceNorman/mchatai-source/main/places/packs/<id>.json
```

Packs here are **tier 3** of `mchatai_macOS/docs/DATASET_HOSTING_ARCHITECTURE.md`:
the curated slice clients actually download. Raw sources (tier 1) are never
stored; working corpora (tier 2) live in local caches with their recipe in git
(see `mchatai_macOS/scripts/tools/landmark-corpus/`). Keep every pack small
enough that a UK user downloading a Seattle pack is not absurd (~300 KB raw,
~30 KB gzipped on the wire — raw.githubusercontent serves gzip + ETag).

**First-party vs third-party.** Only first-party (platform-authored) packs live
in this repo, via PR. Third-party packs — a user's own export — go through the
metered `EndProduct` publish path into platform storage and are fetched from
there. Same JSON, same schema, same validator; only the origin and the
accounting differ. Do not accept third-party packs as PRs here: content in git
is unmeterable, unrevocable without a history rewrite, and every macOS user
clones this repo.

Both are produced by the same Ledger → pack exporter in mChatAI+ (macOS), which
emits **one artifact** and takes a destination.

## index.json

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-09-11",
  "packs": [
    {
      "id": "seattle-landmarks",
      "name": "Seattle Landmarks",
      "summary": "All 451 designated City of Seattle landmarks.",
      "file": "packs/seattle-landmarks.json",
      "placeCount": 451,
      "sizeBytes": 301234,
      "updatedAt": "2026-09-11",
      "region": {
        "anchorLat": 47.6062,
        "anchorLon": -122.3321,
        "radiusKm": 25,
        "locality": "Seattle, WA"
      }
    }
  ]
}
```

### Where the bytes live — `file`, `url`, `access` (Phase SL.5)

The index is always small, always public, always in git. **Only the pack bytes
move.** Three cases:

| entry has | bytes come from | used for |
|---|---|---|
| `file` | `<base>/<file>` in this repo | first-party packs small enough for git |
| `url` (absolute https) | that URL | packs too large or too numerous for git |
| `access: "premium"` | a signed URL from `GET /v1/places/packs/<id>/url` | paid packs |

`url` wins over `file` when both are present — so an entry carrying **both** stays
readable by clients shipped before `url` existed. Prefer that during a migration.

**Premium entries stay listed here on purpose.** People should be able to see
what exists, with its name, summary, place count and region, before they pay.
Only the bytes are gated, and the gate lives on the server — a client never
decides its own entitlement. A locked pack renders as locked, not missing.

**Hosts are allow-listed on every client** (`raw.githubusercontent.com`,
`storage.googleapis.com`, `api.mchatai.com`, `mchatai.com`). This file is remote
content, so an absolute `url` is attacker-controllable; an entry naming any other
host is skipped. Adding a host means shipping all three clients — so don't.

**Cache paths derive from the pack `id`, never from `file` or `url`.** A remote
string must not choose where a client writes on disk.

```json
{
  "id": "seattle-landmarks-narrated",
  "name": "Seattle Landmarks — narrated walks",
  "summary": "All 435 landmarks with full audio-tour narration.",
  "access": "premium",
  "placeCount": 435,
  "sizeBytes": 794624,
  "region": { "anchorLat": 47.6062, "anchorLon": -122.3321, "radiusKm": 25, "locality": "Seattle, WA" }
}
```

## packs/&lt;id&gt;.json

```json
{
  "schemaVersion": 1,
  "id": "seattle-landmarks",
  "name": "Seattle Landmarks",
  "summary": "All 451 designated City of Seattle landmarks.",
  "generatedAt": "2026-09-11T19:00:00Z",
  "attribution": "City of Seattle Department of Neighborhoods; Wikipedia (CC BY-SA)",
  "region": { "anchorLat": 47.6062, "anchorLon": -122.3321, "radiusKm": 25, "locality": "Seattle, WA" },
  "places": [
    {
      "id": "panama-hotel",
      "name": "Panama Hotel",
      "lat": 47.598702,
      "lon": -122.326533,
      "address": "605 S Main St",
      "neighborhood": "Chinatown-International District",
      "category": "Hotel",
      "text": "Built in 1910 …",
      "imageUrl": "https://…/panama-hotel.jpg",
      "links": [
        { "title": "Wikipedia", "url": "https://en.wikipedia.org/wiki/Panama_Hotel_(Seattle)" },
        { "title": "Map", "url": "https://maps.apple.com/?ll=47.598702,-122.326533" }
      ]
    }
  ]
}
```

Per-place fields: `id`, `name`, `lat`, `lon` are **required**. `text`,
`address`, `neighborhood`, `category`, `imageUrl`, `links` are optional.
`links` is the only nested structure allowed: an array of
`{ "title": …, "url": … }`.

## Schema rules (enforced by the validator)

- **Flat camelCase keys** everywhere. No snake_case, no kebab-case keys.
- **ISO 8601 strings for dates** (`"2026-09-11"` / `"2026-09-11T19:00:00Z"`),
  never epoch numbers or platform Date encodings.
- **Omit rather than null.** A field with no value is absent; `null` is a
  validation error.
- **Additive fields never bump `schemaVersion`.** Clients decode unknown fields
  tolerantly (optional-with-default); the validator accepts *scalar* keys it
  does not know, and only ever type-checks the ones it does. New nested
  (object/array) values are rejected everywhere except `links` — places are
  flat, and the flatness is part of the contract. `schemaVersion` changes only
  for an incompatible reshape — which should essentially never happen.
- Packs are plain JSON held in memory on mobile. No SQLite on the client.

## "Packs near me"

The region key convention is **anchor + radius** — the only convention that
answers "near me" directly. (Weather uses anchor+radius, dates-and-holidays
uses ISO country, News uses `{GL}/{CEID}`; those remain per-domain. Packs
declare `region.anchorLat` / `region.anchorLon` / `region.radiusKm`, with an
optional human `locality`.)

A client fetches `index.json` (one small GET), then:

```
show pack ⇔ haversineKm(userLocation, region.anchor) <= region.radiusKm + 50
```

The fixed 50 km slack keeps a pack visible from just outside its own radius
(the user driving toward Seattle). Pack bodies are fetched lazily, only for
packs the user opens.

## Validation

```
node places/tests/validate_place_packs.mjs              # whole repo: index + every pack
node places/tests/validate_place_packs.mjs <pack.json>  # one standalone pack (third-party path)
```

Zero dependencies. Wired into `mchatai_macOS/scripts/preflight.sh` (block 1d),
so index/pack drift cannot land. The exporter runs the exact same schema either
way — first-party and third-party packs must never diverge.
