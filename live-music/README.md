# live-music/

Shared content for the **Live Music** assistant (`assistants/live-music/`), linked into
its working folder by `workdirLinks`. Public: it holds the tool only, never a venue
list or anything about a person. A person's venues are rows of their own Ledger table
"Live Music Venues" on their Mac.

| File | What it is |
|---|---|
| `tools/events.py` | `collect`: reads each venue's own calendar page, keeps this week's shows that the page publishes as data (schema.org Event in the page, or an `.ics` calendar it links to), and saves a text snapshot of every venue page that publishes none. `page`: merges the shows the assistant added by hand (`week/manual.json`), keeping only those whose title and link are on the saved snapshot, then renders `site/index.html` (static, no scripts, every show linked) and `week/summary.md`. `selftest`: offline fixtures. |

## How a week works

```
venues.json  ──collect──▶  week/events.json        shows read from the venues' own data
                           week/needs-reading.json venues that publish no data
                           week/pages/<venue>.md   their pages as text, with links
assistant reads pages ──▶  week/manual.json        shows it found, each with its link
             ──page──▶     site/index.html         the page (hub.deploy shares it)
                           week/summary.md         the same, for an AI Write document
                           week/merged.json        every show on the page, with its id
assistant picks       ──▶  week/picks.json         up to five ids, one line each; page again
```

Measured 2026-11-27 on five real venue pages: one (a large ticketing site) published
its shows as data; four did not, so on most weeks the assistant reads pages by hand
and the snapshot check is what keeps it honest.

## Changing the tool

Standard library only, Python 3.9 or later (macOS's own `python3`). Run
`python3 tools/events.py selftest` before opening a PR. The page links back to the
starter through `https://mchatai.com/open/?to=…workbench/assistant?id=live-music…`;
keep that link working.
