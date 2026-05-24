# SendGrid Email Skill

Send transactional or marketing email via SendGrid v3. Supports single + multi-recipient sends, inline HTML/text, dynamic templates, cc/bcc, reply-to, categories, sandbox mode.

The platform-wide SendGrid key already exists in GCP Secret Manager as `SENDGRID_API_KEY` (per memory `project_email_provider_sendgrid`). For local sends from mChatAI+, you need an API key with **Mail Send** permission saved locally.

## Setup

1. Create an API key at https://app.sendgrid.com/settings/api_keys with at minimum the "Mail Send" permission.
2. Verify a sender (Single Sender Verification or Domain Authentication) at https://app.sendgrid.com/settings/sender_auth.
3. Save the API key under Keychain `ExtAPI_sendgrid_apiKey`, or pass via `config.apiKey`.

## Config

| Key | Type | Description |
|---|---|---|
| `from` | string | **Required.** Sender email. Must match a verified sender or authenticated domain. |
| `fromName` | string | Friendly sender name. |
| `to` | string \| array \| JSON | **Required.** Single email, comma-separated emails, or JSON array of strings/`{email,name}` objects. |
| `cc` | string \| array | Same shape as `to`. |
| `bcc` | string \| array | Same shape as `to`. |
| `subject` | string | Required unless `templateID` is set. |
| `text` | string | Plain-text body. Falls back to pipeline input text. |
| `html` | string | HTML body. Can coexist with `text` (SendGrid serves the right MIME part per client). |
| `templateID` | string | SendGrid Dynamic Template ID (`d-xxxx`). When set, `subject`/`text`/`html` are ignored (template provides them). |
| `dynamicTemplateData` | JSON object | Variables for the template. |
| `replyTo` | string | Reply-to email. |
| `categories` | string \| array | Tags for SendGrid analytics (max 10). |
| `sandboxMode` | boolean | Validates request but doesn't deliver. Useful for credentials testing. |
| `apiKey` | string | Overrides Keychain credential. |
| `dryRun` | boolean | Logs intent without calling SendGrid at all. |

## Output

- Success: `Email accepted by SendGrid (id=…)` — SendGrid returns 202 + an `X-Message-Id` header.
- Sandbox: same 202 response with delivery suppressed.
- Failure: error string + HTTP status + body excerpt in log (SendGrid returns structured error JSON).

## Examples

Single recipient, inline text:
```json
{"command":"runSkill","skillID":"custom.sendgrid-email","config":{"from":"hello@mchatai.com","fromName":"mChatAI","to":"user@example.com","subject":"Your weekly build","text":"Three new recipes this week..."},"requestID":"sg-001"}
```

Multi-recipient with HTML + tracking categories:
```json
{"command":"runSkill","skillID":"custom.sendgrid-email","config":{"from":"hello@mchatai.com","to":"[\"a@example.com\",\"b@example.com\"]","subject":"Weekly Build","html":"<h1>This week</h1><p>...</p>","categories":"weekly,newsletter"},"requestID":"sg-002"}
```

Dynamic template:
```json
{"command":"runSkill","skillID":"custom.sendgrid-email","config":{"from":"hello@mchatai.com","to":"user@example.com","templateID":"d-abc123","dynamicTemplateData":"{\"firstName\":\"Alex\",\"recipeURL\":\"https://mchatai.com/r/wordle\"}"},"requestID":"sg-003"}
```

Sandbox (validates request, no delivery):
```json
{"command":"runSkill","skillID":"custom.sendgrid-email","config":{"from":"hello@mchatai.com","to":"test@example.com","subject":"Test","text":"x","sandboxMode":true},"requestID":"sg-004"}
```

Dry run (no API call):
```json
{"command":"runSkill","skillID":"custom.sendgrid-email","config":{"from":"hello@mchatai.com","to":"test@example.com","subject":"Test","text":"x","dryRun":true},"requestID":"sg-005"}
```

## Notes

- This is single-send only. For high-volume list segmentation (Marketing Campaigns API), build a separate `custom.sendgrid-campaign` skill.
- Attachments are not yet supported. Add by extending `body.attachments` with `{content, filename, type, disposition}` entries (content is base64). Most marketing sends don't need them.
- For unsubscribe links/footers, use a Dynamic Template that includes the SendGrid `{{{unsubscribe}}}` substitution tag — required for CAN-SPAM/GDPR-compliant bulk sends.
- This skill does NOT manage HubSpot list membership. Combine with `custom.hubspot` (Phase MM-1 future skill) for segmented sends.
