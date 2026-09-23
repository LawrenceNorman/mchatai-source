---
# ⚠️ TWO MANIFESTS, and only THIS one is read by mChatAIShell.
# `PythonMicroserviceManager.parseMicroserviceManifest` reads THIS file's
# frontmatter. `manifest.json` beside it is what mchatai-source ships and
# is not read by the Shell at all. They drift silently — bump BOTH.
# (2026-09-23: manifest.json said 1.4.0 while the Shell reported 1.0.0
# from here, which made the version useless for checking whether an edit
# had landed. Probe for a new response KEY instead, or read
# /microservices health `fingerprints`.)
name: Inbox Multi
version: 1.5.0
description: Multi-account Gmail inbox via direct Google OAuth + Gmail API. Lets AI Inbox merge multiple Google accounts into one universal timeline without going through gws (which is single-account by design).
author: mChatAI
category: communication
tags: [gmail, email, oauth, multi-account, inbox]
python_deps: [fastapi, pydantic, httpx]
bins: [python3]
preconditions: []
draft: false
endpoints:
  - path: /accounts
    method: GET
    description: List authorized Google accounts (emails only — no tokens)
  - path: /accounts/add
    method: POST
    description: Run OAuth loopback flow for a new account; returns the email that was authorized
  - path: /accounts/{email}
    method: DELETE
    description: Remove an authorized account (deletes its token file)
  - path: /accounts/{email}/emails/unread
    method: GET
    description: Fetch unread emails for one specific account
  - path: /accounts/{email}/emails/search
    method: GET
    description: Run a Gmail query (q=) against one authorized account; metadata only
  - path: /accounts/{email}/emails/{message_id}
    method: GET
    description: Metadata for one message in one account; 404 falls back to re-running the query
  - path: /emails/unread/all
    method: GET
    description: Fan-out fetch unread emails from every authorized account, in parallel
  - path: /emails/search
    method: GET
    description: Run a Gmail query (q=) across every authorized account, merged newest-first
  - path: /client/status
    method: GET
    description: Whether the OAuth client_secret.json is present (preconditioned by the OAuth setup card)
---

# Inbox Multi Microservice

Direct OAuth + Gmail-API client that handles multi-account inbox aggregation. Coexists with `gmail-manager` (which uses gws CLI and is single-account).

## Why this exists

`gws auth login` stores **one** credential at a time (in macOS keychain, keyed by macOS user — not by Google account). Running it a second time with a different Google account overwrites the first. Real universal-inbox UX needs N independent credential slots, parallel fetches, and per-row account tagging — none of which gws supports.

This service skips gws entirely:

- Reuses the user's existing `~/.config/gws/client_secret.json` as the OAuth client (one client serves all their accounts).
- Stores per-account tokens at `~/.config/mchatai/inbox-accounts/<email>/token.json` (mode 0600, never synced).
- Talks to `gmail.googleapis.com` directly via HTTPS using the access token.
- Refreshes access tokens automatically when within 60s of expiry.

## OAuth flow

`POST /accounts/add`:
1. Read `installed.client_id` + `installed.client_secret` from `~/.config/gws/client_secret.json`.
2. Pick a free localhost port, spin up a one-shot HTTP listener on it.
3. Build the Google authorization URL with `redirect_uri=http://localhost:<port>`, scopes `gmail.readonly + openid + email + profile`, `access_type=offline` and `prompt=consent` (latter forces a refresh_token even if the user previously authorized).
4. Open the URL via `/usr/bin/open` so the user's default browser launches.
5. Block until either the listener receives the redirect (with `code` query param) or 5-min timeout.
6. Exchange the authorization code for `access_token` + `refresh_token` at the token endpoint.
7. Call `https://openidconnect.googleapis.com/v1/userinfo` to learn which Google account just authorized.
8. Save the token blob into `~/.config/mchatai/inbox-accounts/<email>/token.json`.

## Token refresh

Each fetch call goes through `_get_valid_access_token(email)`:
- If the stored access_token has more than 60s of life left, return it as-is.
- Otherwise, POST to the token endpoint with `grant_type=refresh_token`, update the file, and return the new token.
- If `refresh_token` is missing (rare; happens if the user authorized without `prompt=consent`), the call surfaces a 401 and the Mac UI asks the user to re-add the account.

## Privacy contract

- We never see the user's Google password — sign-in is the standard Google web flow.
- Tokens stay on this machine in `~/.config/mchatai/inbox-accounts/`. They are never sent to any mChatAI server.
- The `/accounts` endpoint returns email addresses + expiry timestamps but never the token strings (privacy contract — same as `gmail-manager`'s status endpoint).
- Removing an account via `DELETE /accounts/{email}` wipes the entire account directory locally; to fully revoke server-side, the user should also visit https://myaccount.google.com/permissions.
