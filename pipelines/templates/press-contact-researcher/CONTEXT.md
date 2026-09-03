# Press Contact Researcher

Searches the web for press, newsletter, podcast and community targets that fit a launch, and
**upserts them into a "Press CRM" table in Ledger**. Rows are matched on `Outlet`, so re-running
with a different query grows and refreshes one CRM instead of stacking duplicates.

Harvested from a real campaign: the mChatAI hub launch (2026-09), where the same
research-then-upsert loop was run across five outlet categories (Mac press, AI media,
communities, podcasts/video, local + niche) before being folded into this template.

## The two tables this template assumes

### Press CRM (written by this pipeline)

```
Outlet,Category,Contact,Method,URL,Angle,Priority,Status,Contacted,FollowUp,Notes
```

- `Outlet` is the upsert key. `Category` is a closed set: press, newsletter, podcast, video,
  community, local, niche. `Priority` is honest 1–3 triage for someone with no PR agency.
- `Status` vocabulary, kept deliberately small: `not contacted` → `pitched` → `followed up` →
  one of `replied` / `covered` / `declined`. If a status needs a paragraph, it goes in Notes.
- `Contacted` / `FollowUp` are filled in **by hand** (or by an agent action) when a pitch goes
  out — the researcher always leaves them empty, and the merge semantics below make that safe.

### Posting Tracker (companion, maintained by hand or by an agent)

One row per (content piece × platform), so "did this article go everywhere?" is a filter,
not a memory:

```
Content,Type,Platform,Status,Posted,URL,Notes
```

`Type`: post, thread, Show HN, launch, video. `Status`: Planned → Draft → Posted. Add the next
article's rows in a batch when the piece is drafted, one per platform it should reach.

## Why the merge semantics matter here

This is a table a human works in daily — the pipeline must never trample the by-hand half:

- **Merge, never replace.** A research run carrying `Outlet,Category,Method,…` does not wipe
  the `Contacted`, `FollowUp` and `Status` you set after pitching.
- **An empty incoming cell means "not provided", not "clear it."** The researcher sends empty
  `Contacted`/`FollowUp` on every row; your dates stand.
- **An unmatched Outlet appends.** New categories of outlet arrive as new rows.

## The email rule (the CRM equivalent of "never invent a number")

The prompt forbids constructing email addresses. A pattern-guessed `firstname@outlet.com` is
indistinguishable from a verified one until the pitch silently bounces — or lands in a
stranger's inbox. `Method` holds only an email a source page actually displays, a
contact-form URL, or `unknown`. `unknown` is a correct, useful value: it tells you which rows
still need a human minute on the outlet's about page.

## Retargeting it at another campaign

Three edits, no rebuild:

1. **Step 1** — change `query` to your beat: `"parenting app review sites submit app"`,
   `"conservation technology newsletters pitch"`, `"Seattle tech press tips"`. Run the pipeline
   once per category; `matchOn: Outlet` means the runs accumulate into one CRM.
2. **Step 2** — the column contract is campaign-agnostic; only edit the `Angle` guidance if your
   product needs different framing.
3. **Step 3** — rename `ledgerCollection` if you want separate CRMs per product.

## Outreach cadence (wisdom, not mechanism)

- One story per pitch. A feature list is not a story; "a nature preserve tracks wildflower
  blooms with an app built in an afternoon" is.
- Personalize the first line per outlet (the `Angle` column exists so the pitch writes itself).
- Follow up ONCE, 4–7 days later, then stop. Set `FollowUp` when you pitch, filter the table on
  it each morning.
- Communities are rows too (`Category: community`) — Show HN, r/macapps, Product Hunt have
  posting rules, not inboxes; the rules go in `Notes` and violating them costs more than a
  bounced email.

## Known gap

There is no `builtin.ledgerRead` skill yet, so a "morning follow-up briefing" pipeline (read
Press CRM → summarize who's due) is not content-buildable today. That is a new Swift primitive
(see `docs/CONTENT_VERB_ENGINE.md`: composition → content PR, new primitive → Swift). The Ledger
chat agent can answer follow-up questions interactively in the meantime.
