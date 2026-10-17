# History domains

A domain is a content overlay for a new kind of history written by the same engine: the History
Writer's voice, sourcing rules, playbook and gates, plus what that kind of history needs.

A project joins a domain with one line in its `project.json`: `"domain": "<id>"`. Then
`tools/_hw.py` reads `domains/<id>/thresholds.json` over `history/thresholds.json` (each key it
names replaces the base key; every other base key holds) and appends `domains/<id>/lint-rules.json`
to `history/lint-rules.json`. A domain adds rules and changes calibrations; it never removes a base
rule. A rule may be exempt inside a declared passage only when the domain names it in content
(`pov.l1ExemptRules`). A project with no `domain` reads exactly the base files. A domain that does
not exist is an error.

| Domain | What it tells |
|---|---|
| `pivotal-history` | Pivotal episodes decided by a tactical, scientific, technical or logistic edge |
