# grants/

Shared content for the **Grants & Contracts** assistant (`assistants/grants/`),
linked into its working folder by `workdirLinks`. Public: it holds sources and
tools only, never anything about a person.

| File | What it is |
|---|---|
| `sources.json` | Where to look: official APIs (Grants.gov, Federal Register, SAM.gov with a key), funder pages to watch by region, and alert lists a person signs up for. |
| `profile.example.json` | The shape of a person's `grants-profile.json`: regions, how they can be paid, keywords, conflict-of-interest exclusions. Their copy stays in the assistant's working folder on their Mac. |
| `tools/scan.py` | Deterministic weekly scan: new vs already seen, deadline changes, funder-page diffs, conflict exclusions. Writes `runs/<date>.md/.html/.json`. `--selftest` runs offline fixtures. |
| `tools/routine_run.py` | Entry for the weekly routine; copy to `routines/grants-scan/run.py` in the working folder. |

## Adding sources

A page belongs in `sources.json` only if it is the funder's or buyer's own page,
or an official API. Bid aggregators whose terms forbid automated reading go under
`emailAlerts` (the person subscribes; the assistant reads the emails), never
under `pages`. Tag each source with the regions it serves (`us`, `us-wa`,
`us-wa-king`, ...). Run `python3 tools/scan.py --selftest` before opening a PR:
it checks that page ids are unique and every page has an https URL and a region.

## How the scan behaves

- Grants.gov keyword queries keep a hit only when the keyword is in the title
  (`keywordMatch: "title"`, the default); full-text matching returns hundreds of
  unrelated research grants. Agency-wide queries for the cultural agencies keep
  everything, because that is where vendor leads come from.
- The first read of a funder page records it; changes are reported from the
  next run, with new lines marked `date`, `keyword` or `EXCLUDED`.
- Anything matching the profile's `exclude` rules is listed as excluded and
  never enters the seen-ledger or the report's opportunities.
