---
# ⚠️ TWO MANIFESTS, and only THIS one is read by mChatAIShell
# (`PythonMicroserviceManager.parseMicroserviceManifest`). `manifest.json`
# beside it is what mchatai-source ships. Bump BOTH.
name: Mail Graph
version: 1.0.0
description: Outlook.com, Hotmail, Live and Microsoft 365 mail for AI Inbox via Microsoft Graph — the Microsoft counterpart of inbox-multi. Multi-account, PKCE sign-in with no client secret, metadata-only list/search/thread routes, a human-only body route, and flag/read/archive/trash with undo. Never sends mail and never deletes permanently.
author: mChatAI
category: communication
tags: [outlook, hotmail, microsoft, email, oauth, multi-account, inbox]
python_deps: [fastapi, pydantic, httpx]
bins: [python3]
preconditions: []
draft: true
endpoints:
  - path: /healthz
    method: GET
    description: Liveness probe
  - path: /client/status
    method: GET
    description: Whether an app registration client ID is configured, and from where
  - path: /accounts
    method: GET
    description: List authorized Microsoft accounts (addresses only — no tokens)
  - path: /accounts/add
    method: POST
    description: START a browser sign-in (PKCE, loopback redirect); returns a flow_id at once — one sign-in at a time
  - path: /accounts/add/{flow_id}
    method: GET
    description: A sign-in's state — waiting, done (with the address and grant), error, cancelled or expired
  - path: /accounts/add/{flow_id}/cancel
    method: POST
    description: Cancel a waiting sign-in (closes the loopback listener)
  - path: /accounts/{email}
    method: DELETE
    description: Forget an account on this Mac (deletes its token file)
  - path: /emails/unread/all
    method: GET
    description: Unread Inbox mail across every account (or `account=`), merged newest-first, paged per account
  - path: /emails/search
    method: GET
    description: A Gmail-grammar query (q=) translated for Graph, across every account (or `account=`); metadata only
  - path: /accounts/{email}/threads/{thread_id}
    method: GET
    description: Every message in one conversation, oldest first; metadata only
  - path: /accounts/{email}/messages/{message_id}/body
    method: GET
    description: One message's HTML and text for a HUMAN reader behind the quarantined view — never an agent
  - path: /accounts/{email}/messages/read
    method: POST
    description: Mark messages read or unread
  - path: /accounts/{email}/messages/flag
    method: POST
    description: Flag or unflag messages (Outlook's star)
  - path: /accounts/{email}/messages/move
    method: POST
    description: Archive (Inbox messages only) or move to Deleted Items; records each move for undo
  - path: /accounts/{email}/messages/restore
    method: POST
    description: Undo an archive or trash — back to the folder each message came from
---

# Mail Graph Microservice

> **PARKED 2026-09-26 — built and tested (23/23), not shipped.** The owner
> chose to hold Outlook support back to limit what has to be maintained.
> `manifest.json` lists no platforms so the Microservice Store cannot offer
> it, and the app's `MicrosoftGraphProvider.isEnabled` is false. Un-parking:
> `mchatai_macOS/PLATFORM_ROADMAP.md` item 2g.

Microsoft Graph client for AI Inbox's universal inbox (Phase MX.8 in
`mchatai_macOS/docs/AI_INBOX_ARCHITECTURE.md`). One service covers every
Microsoft mailbox: Outlook.com, Hotmail, Live, MSN and Microsoft 365 work or
school accounts.

## Why it looks like inbox-multi

Its routes mirror `inbox-multi`'s so that the Mac's `MicrosoftGraphProvider`
and `GmailProvider` are two translators over one shape. The same MX.10 paging
contract (`next_page_tokens`, per account, continuation asks only accounts
that still have pages) and the same safety split (metadata routes for
agents, one body route for a human) apply.

## Sign-in

A FLOW, not a request: `POST /accounts/add` starts it and returns a
`flow_id`, and the app polls `GET /accounts/add/{flow_id}`. mChatAIShell gives
up on a forwarded call after 120 seconds and reports that as a bare "request
timed out", while Microsoft's consent page can take longer — a blocking route
would report failure for sign-ins that then succeed. Polling also makes cancel
real.

A public client: authorization code + PKCE over `http://localhost:<port>`,
no client secret. Microsoft ignores the port when matching localhost redirect
URIs, so the app registration names `http://localhost` once.

The client ID comes from `client.json` beside `main.py` (shipped with
mchatai-source, so a new ID needs no app rebuild), overridden by
`~/.config/mchatai/mail-graph/client.json`. Each account keeps the client ID
it was added with, so changing the file never strands existing accounts.

Scopes: `offline_access User.Read Mail.ReadWrite`. Never `Mail.Send`.

Tokens: `~/.config/mchatai/mail-graph-accounts/<address>/token.json`, mode
0600, written atomically. Refresh tokens rotate on every use and are written
back under a per-account lock.

## Queries

The app's saved searches and the search box speak Gmail's grammar. `_plan`
translates it: `is:unread`, `is:starred`, `has:attachment`, `in:<folder>`,
`newer_than:`, `after:`/`before:`, `category:` (→ Outlook's Focused/Other),
`from:<address>` as filters; `from: to: cc: subject:` and free text as KQL
search. Deleted Items and Junk are left out unless the query says
`in:anywhere` or names them, as Gmail does.

## Moves change ids

Graph's default message ids change when a message changes folder. The
immutable-id header would avoid that but breaks `webLink`, so the service
records every move (old id → new id, plus the folder it came from). Undo uses
that record; ids the Mac still holds keep resolving. The record lives in the
process, so after a sidecar restart an undo of an older move is reported as
a failure (or, with no records at all, a message in Archive or Deleted Items
goes back to the Inbox).

## Archive means "out of the Inbox"

A conversation includes your replies from Sent Items. Archive moves only the
messages that are in the Inbox, as Gmail's archive removes only the INBOX
label. Trash moves everything it is given.
