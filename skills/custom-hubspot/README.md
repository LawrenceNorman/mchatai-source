# HubSpot CRM Skill

Single skill, five actions for the marketing-machine funnel: upsert/get contacts, set lifecycle stage, manage static list membership.

## Setup

1. In HubSpot: **Settings → Integrations → Private Apps → Create a private app.**
2. Grant scopes (minimum): `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.lists.read`, `crm.lists.write`.
3. Copy the access token. Save under Keychain `ExtAPI_hubspot_apiKey`.
4. Free HubSpot CRM tier is fine for v1; upgrade only if you cross the 1,000,000 contacts free limit (you won't).

## Actions (`config.action`)

### `upsertContact` (default)

Create or update a contact, keyed by `email`.

| Key | Type | Description |
|---|---|---|
| `email` | string | **Required.** |
| `firstName` / `lastName` / `company` | string | Convenience writes to `firstname` / `lastname` / `company`. |
| `lifecycleStage` | string | Convenience for `lifecyclestage`. Common values: `subscriber`, `lead`, `marketingqualifiedlead`, `salesqualifiedlead`, `opportunity`, `customer`, `evangelist`. |
| `properties` | JSON object | Any custom or built-in properties as `{key: value}`. Merged with the convenience aliases above. |

### `getContact`

Look up a contact by email.

| Key | Type | Description |
|---|---|---|
| `email` | string | **Required.** |
| `properties` | array or comma string | Which properties to return. Default: email, firstname, lastname, lifecyclestage, company, createdate, lastmodifieddate. |

### `setLifecycleStage`

Move a contact between stages. Convenience wrapper around upsert.

| Key | Type | Description |
|---|---|---|
| `email` | string | **Required.** |
| `stage` / `lifecycleStage` | string | **Required.** |

### `addToList` / `removeFromList`

Manage static-list membership (workflow trigger source). Numeric list IDs only.

| Key | Type | Description |
|---|---|---|
| `listID` | string (numeric) | **Required.** From HubSpot list URL: `/contacts/list/<id>/`. |
| `emails` | array or comma string | Contact emails to add/remove. Or use `email` for a single. |

### Common

| Key | Description |
|---|---|
| `apiKey` / `accessToken` | Override Keychain token. |
| `dryRun` | Validate inputs + log intent without calling HubSpot. |

## Output

- `upsertContact`: `HubSpot contact upserted: <email> (id=<numeric>)`
- `getContact`: one-line summary like `id=123 email=… firstname=… lifecyclestage=lead …`, or `No HubSpot contact found for <email>`
- `setLifecycleStage`: `Set lifecycle stage: <email> → <stage>`
- `addToList` / `removeFromList`: `List add on list <id>: updated=N discarded=N`

## Examples

Upsert from newsletter signup:
```json
{"command":"runSkill","skillID":"custom.hubspot","config":{"action":"upsertContact","email":"alex@example.com","firstName":"Alex","lifecycleStage":"subscriber","properties":"{\"first_recipe_used\":\"daily-life-organizer\",\"signup_source\":\"weekly-build-newsletter\"}"},"requestID":"hs-001"}
```

Promote to lead after first paid purchase:
```json
{"command":"runSkill","skillID":"custom.hubspot","config":{"action":"setLifecycleStage","email":"alex@example.com","stage":"customer"},"requestID":"hs-002"}
```

Look up contact (e.g., to gate drip content):
```json
{"command":"runSkill","skillID":"custom.hubspot","config":{"action":"getContact","email":"alex@example.com"},"requestID":"hs-003"}
```

Add to "Power-User Newsletter" segmented list (HubSpot list id 17):
```json
{"command":"runSkill","skillID":"custom.hubspot","config":{"action":"addToList","listID":"17","emails":"[\"alex@example.com\",\"sam@example.com\"]"},"requestID":"hs-004"}
```

Dry run:
```json
{"command":"runSkill","skillID":"custom.hubspot","config":{"action":"upsertContact","email":"test@example.com","firstName":"Test","dryRun":true},"requestID":"hs-005"}
```

## Notes

- **Lifecycle stages have a forward-only constraint** in HubSpot. You can't move from "customer" back to "lead" without clearing the property first. The skill does not unset.
- **Dynamic (active) lists** are managed by HubSpot via criteria — you can't add/remove explicitly. This skill works only with **static** lists. Use Workflows for criteria-based segmentation.
- **Rate limits** (HubSpot Free / Starter): 100 requests / 10 sec / token. The skill does no batching beyond single records; for bulk imports use the dedicated `/crm/v3/objects/contacts/batch/create` endpoint (extend the skill).
- **No deletion.** Add `action: "deleteContact"` later if needed; GDPR delete is a separate `/crm/v3/objects/contacts/gdpr-delete` endpoint.
- **Custom properties** must exist in HubSpot before write. Create them in Settings → Properties first; this skill does not auto-create.
