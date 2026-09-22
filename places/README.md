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
move.** Four cases:

| entry has | bytes come from | used for |
|---|---|---|
| `file` | `<base>/<file>` in this repo | first-party packs small enough for git |
| `url` (absolute https) | that URL | packs too large or too numerous for git |
| `access: "account"` | a signed URL from `GET /v1/places/packs/<id>/url` | free packs that need a signed-in account |
| `access: "premium"` | the same endpoint | paid packs |

`url` wins over `file` when both are present — so an entry carrying **both** stays
readable by clients shipped before `url` existed. Prefer that during a migration.

### Access levels — `public`, `account`, `premium`

`access` says who may have the bytes. The server decides who is entitled to a
`premium` pack; a client never decides that. For `account` there is one thing
the client decides and the server does not: whether the user is anonymous. The
endpoint accepts an anonymous session's token, so the client must treat an
anonymous user as signed out (see the table). An `account` or `premium` entry
carries **no** `file` or `url` (either would hand the bytes to anyone) and
**must** carry `sizeBytes`, because the endpoint charges each download to the
user's monthly bandwidth.

| `access` | who gets the bytes | what a client does |
|---|---|---|
| `public` (or omitted) | anyone, signed in or not | fetches `file` / `url` directly. No auth, no API call. |
| `account` | any user signed in with a real account, free | signed in with a real (non-anonymous) account: calls the endpoint with the user's Firebase ID token and downloads the signed URL. An anonymous Firebase session, which every fresh install has, counts as signed out: do not call the endpoint, show the sign-in caption. Signed out: keeps the entry listed and shows a small caption asking the user to sign in for free (e.g. *Sign in — it's free — for "Seattle Landmarks — narrated"*, with the name taken from the index). If the screen already has a way to sign in, the caption opens it. **Not a paid thing.** Never show "Premium", "Subscription required", a lock icon or any paid-plan copy for it. |
| `premium` | signed-in users the server entitles: a paid plan, a grant, or the owner | calls the endpoint like `account`. A `402` means not entitled: render the pack **locked, not missing**, show the server's `error` text, and don't retry. Tier and plan names come from that response, never from client code. |

Both gated levels share the endpoint's other answers. A `401` for a signed-in
user (an expired token, or `code: app_check_*`) is not a sign-out. Refresh the
token once, then show the server's `error` text. Only a missing sign-in shows
the sign-in caption. `429` with `reason: "bandwidth-exceeded"` shows the
server's `error` text.

**Gated entries stay listed here on purpose.** People should be able to see
what exists, with its name, summary, place count and region, before they sign
in or pay. Only the bytes are gated.

**Unknown access values are skipped.** A client drops an entry whose `access`
it does not recognise and that has no `file` or `url` it can use. That is how
builds made before `account` existed treat an `account` entry. For a family
(see below), they still show the base pack. So adding a gated level never
breaks an old client. It just hides the new entry from it.

**Hosts are allow-listed on every client** (`raw.githubusercontent.com`,
`storage.googleapis.com`, `api.mchatai.com`, `mchatai.com`). This file is remote
content, so an absolute `url` is attacker-controllable; an entry naming any other
host is skipped. Adding a host means shipping all three clients — so don't.

**Cache paths derive from the pack `id`, never from `file` or `url`.** A remote
string must not choose where a client writes on disk.

An API-served entry, with no `file` or `url`:

```json
{
  "id": "seattle-landmarks-narrated",
  "variantOf": "seattle-landmarks",
  "name": "Seattle Landmarks — narrated",
  "summary": "All 451 designated City of Seattle landmarks, 435 with a full spoken narration …",
  "access": "account",
  "placeCount": 451,
  "sizeBytes": 343782,
  "region": { "anchorLat": 47.61024, "anchorLon": -122.33452, "radiusKm": 15.4, "locality": "Seattle, WA" }
}
```

### Families — `variantOf`

Some packs are richer editions of another pack: the same places with more on
each one (narration instead of a summary, extra links). Listing them as two
unrelated packs shows people two near-identical rows, and importing both makes
two copies of every place. `variantOf` groups them instead:

```json
{ "id": "seattle-landmarks-narrated", "variantOf": "seattle-landmarks", "access": "account", … }
```

A **family** is one base entry (no `variantOf`) plus every entry whose
`variantOf` names it.

- **One row per family, named after the base.** Clients show the base entry's
  `name`, `summary` and `region`, never a second row for the variant.
- **Get fetches the richest edition the user can have.** A client tries the
  variants first and falls back to the base when a variant is locked, the
  user is signed out, or the fetch fails. When the base is used because a
  `premium` variant is locked, the client still shows the server's denial
  message, so people know the richer edition exists. When it is used because
  the user is signed out of an `account` variant, the client shows the
  sign-in caption instead (see "Access levels"). Access stays whatever each
  entry says, and the server decides.
- **One identity per family.** A client stores the imported pack under the
  base `id` whichever edition it fetched, so switching editions later updates
  the same list rather than making another one.
- **Same place-id set.** A variant carries exactly the base's place ids. It may
  change what is on each place, not which places exist. `placeCount` and the
  region anchor should match the base.
- **No chains.** A base cannot itself have `variantOf`; families are one level
  deep. An entry cannot name itself.
- **Older clients ignore the field** and keep showing both rows. That is the
  state before `variantOf` existed, so the field is additive and does not bump
  `schemaVersion`.

The validator errors on a `variantOf` that names a missing entry, itself, or
another variant, and warns when `placeCount` or the region anchor differs from
the base. It cannot check the place-id set for an `account` or `premium`
variant, because those bytes are not in this repo, so check it wherever the
variant is built.

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
