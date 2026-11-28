# morning-brief/

Shared content for the **Morning Brief** assistant (`assistants/morning-brief/`), linked
into its working folder by `workdirLinks`. Public: it holds the tool only. A person's
city, topics and feeds live in `brief.json` in their own working folder and in the
assistant's memories on their Mac.

| File | What it is |
|---|---|
| `tools/brief.py` | `collect`: one news search per section (the city, then each topic's search words) plus the person's own RSS/Atom feeds; keeps the last 36 hours, drops repeats across sections and anything in the seen-ledger; writes `today/items.json` and `today/items.md` (headline, source, link, a snippet of at most 200 characters). `mark-seen`: after a brief is published, records the stories it used (`--used`) for 30 days. `selftest`: offline fixtures. |

The model writes the brief from `items.md` only; the tool decides what is a candidate
and what was already said (the deterministic half, as in
`mchatai_macOS/docs/LOCAL_NEWS_NETWORK_ARCHITECTURE.md` §4a). Items are a headline, a
short snippet and a link out, never a rehosted article.

Measured 2026-11-27 with a demo city and two topics: 24 candidates in four sections,
about half of them on-topic. A second run after `mark-seen` offered none of them again.
Choosing is the assistant's job; the tool only guarantees nothing repeats.

## Changing the tool

Standard library only, Python 3.9 or later (macOS's own `python3`). Run
`python3 tools/brief.py selftest` before opening a PR.
