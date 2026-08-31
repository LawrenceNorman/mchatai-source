# Ledger Table Refresh

Searches the web for current values and **updates an existing Ledger table in place**. Rows are
matched on a key column, so running it weekly keeps one table current instead of growing it by a
full copy every run.

Ships configured for the 2026 fantasy draft board, because that is the case it was built for:
*"a Ledger pipeline search Agent that can update the fantasy stats and ranking."* It is not
fantasy-specific — see **Retargeting**.

## Why this template needed a platform change

`builtin.ledgerAppend` only ever appended. A second run over a 150-player board produced 150
duplicate rows, not 150 updates, so a recurring refresh was not buildable on top of it. LG.17
added `ledgerMatchOn`: name a key column and a row whose key already exists is **merged** rather
than duplicated.

Three properties of that merge are what make this template safe to run on a table somebody has
been editing by hand:

- **Merge, never replace.** A feed carrying `Player,Rank,ProjPoints` does not wipe the `Notes`
  and `ByeWeek` columns you typed yourself.
- **An empty incoming cell means "not provided", not "clear it."** A blank leaves the existing
  value standing. This is what makes rule 1 in the prompt — *leave it empty rather than guess* —
  a safe instruction rather than a destructive one.
- **An unmatched key appends.** A rookie signed mid-season becomes a new row.

## Steps

| # | Skill | What it does |
|---|---|---|
| 1 | `builtin.webSearch` | Runs the `query` in config and fetches excerpts from the top results. |
| 2 | `builtin.llmGenerate` | Extracts the excerpts into CSV under a fixed column contract. |
| 3 | `builtin.ledgerAppend` | Upserts on `ledgerMatchOn`, reporting updated vs added separately. |

## Retargeting it at another table

Three edits, no rebuild:

1. **Step 3** — set `ledgerCollection` to the table's name and `ledgerMatchOn` to its key column.
2. **Step 2** — replace the `TARGET TABLE`, `KEY COLUMN` and `COLUMN CONTRACT` lines in
   `userPrompt` with that table's real column names, spelled exactly as Ledger has them.
3. **Step 1** — change `query` to what you would actually search for.

To read the current column names: `applet ledger getSchema {"collection": "<name>"}`. Its summary
line lists every column and kind in the form the prompt wants.

**Two things go wrong here, and the second is worse.**

*Header spelling.* Matching is case-insensitive, so `player` finds `Player` — but `Proj Points`
does not find `ProjPoints`, and a mismatched header quietly creates a second column rather than
failing. After the first run, open the table and check the column count. If it grew, a header is
misspelled.

*Column SCALE.* Found the hard way on the first live run, 2026-08-30. The contract named
`ProjPoints` but did not say what it holds, so a web search that returned **per-game** projections
wrote `22.3` over a column of **full-season** totals like `331.4` — for 40 players at once. Nothing
errored, nothing looked broken, and the numbers were still plausible. A column name is not a
contract; the unit is.

So the prompt now carries a units table with an expected magnitude per column, plus a hard rule:
*if you cannot tell which scale the source is on, leave the cell empty.* An empty cell keeps the
correct value. Give any column you add the same treatment — this is the failure mode of every
refresh pipeline, not a fantasy-football quirk.

## Reading the result

Step 3's output distinguishes the two outcomes, because a clean refresh legitimately moves the
row count by zero and would otherwise read as a no-op:

```
Ledger '2026 Fantasy Draft' refreshed on 'Player': 137 row(s) updated, 4 added.
```

If `ledgerMatchOn` names a column the CSV does not carry, the step says so explicitly and warns
that rows were **appended** rather than updated — the failure that silently doubles a table.

## Cost and cadence

One search plus one long LLM call, roughly 90 seconds. Weekly in season is the intended cadence.
Running it more often mostly re-reads the same pages.
