# Assistant patterns

How to design an assistant without designing it from scratch, and without finding
its architecture by running into it.

Every assistant here is a set of choices on a few independent **axes**: what starts
it, what shape its state has, what it is told each turn, how long a conversation
lives, what it may do, how its output is checked, how it avoids repeating itself,
how it sounds, and what it may spend. A job-search assistant, a daily-briefing
assistant, a book researcher and a conversational companion differ in their
choices, not in their machinery. The platform implements each option once; an
assistant picks one option per axis.

**The trap is a blank axis.** When a manifest does not say what shape its state
has, the agent improvises. On 2026-10-10 a job-search thread had stored each
application as a memory, its brief carried the 40 newest memories in full on every
turn, and its CLI conversation (resumed for ten days) overflowed the model's 1M
window. Nothing was missing from the machinery. The state-shape axis was blank.

Prior art this follows: Anthropic, *Building effective agents* (2024) and *Effective
context engineering for AI agents* (2025); CSIRO Data61, *Agent Design Pattern
Catalogue* (2024); HumanLayer, *12-Factor Agents* (2025); Microsoft, *Taxonomy of
Failure Modes in Agentic AI Systems* (2025). They supply axes and failure modes, not
per-domain architectures, and neither does this file.

## How to use this

1. For a new assistant, choose one option on every axis below. Write `none` where
   that is the choice; never leave an axis unsaid.
2. Write the choices in `assistant.json`: the `pattern` block (AP.1) for the axes
   below, plus `cadence`, `tools`, `budgetUSDPerDay`, `relayTimeoutSeconds` and
   `access`. A known gap goes in a `_why…` key, so it stays visible instead of blank.
3. If no option fits, that is a new **force**. Add the option here and to the
   platform once (skeleton code, reviewed), with a lint rule for its trap. Never
   build it as a one-off inside one assistant.

## The axes

### 1. Trigger: what starts a turn

| Option | Choose when | Implemented by |
|---|---|---|
| `conversation` | The person drives it turn by turn | Workbench threads |
| `schedule` | Work is due at a time (a morning brief, a weekly digest) | Routines (`cadence`) |
| `event` | Something outside happens (a reply arrives, a page changes) | bespoke today (AI Inbox matching, AI Web watchers); AP option pending |
| `relay` | Another assistant asks | `assistant.ask` (hop limit 1, callee budget, answers are untrusted data) |

**Trap:** using `schedule` to poll for an `event` (re-reading a mailbox every morning
instead of waking when the reply lands), or the reverse.

### 2. State shape: what the assistant keeps, and where

| Option | What it is | Where it lives |
|---|---|---|
| `memories` | Durable facts about the person: preferences, constraints, ongoing work | `AssistantStore` (scoped, mirrored to the Ledger and the Markdown memory files) |
| `records` | Rows about instances of a recurring thing: applications, sessions, posts, leads | A Ledger collection the assistant owns (`ledger.*`) |
| `artifacts` | Documents it produces: briefs, drafts, stories, decks | AI Write, StoryMaker, Slides, registered as products |
| `evidence` | Sources and quotes it must be able to cite | a dossier (History Writer), source links on each item (news) |

Most assistants use more than one. Say which, and name the collection for `records`.

**Trap:** records stored as memories. Every "Applied to X" became a memory, so every
turn carried every application. A record belongs in a collection and is looked up
by name; a memory is a fact that changes how the assistant behaves.

How the platform holds the line (CW.4): list the collections in `pattern.records`
and the rows are scored as records (a row enters a message's context only when the
message names it; L0 carries one census line per collection). List the memory
openings that are really rows in `pattern.recordLeads`
(`{"applied to": "Job Applications"}`): `assistant.remember` refuses such a memory
and points at the collection, and the distiller skips it, so the series cannot grow
back. Look one row up with `ledger.getRows {"collection": …, "match": "<name>"}`.

**Open loops** are the records every assistant has: one row per thing waiting on the
person (an answer only they have, a sign-in) or on someone else (a promised reply),
with a link. `assistant.openLoop` / `closeLoop` / `listLoops`; the person sees them
under "Waiting on you" in the Assistant pane with Done / Snooze / Dismiss / Open, and
a closed loop is filtered out before any model reads the list again.

**Trap:** waiting items kept as prose. A status report that re-derives "what is
waiting on you" from memory and transcripts lists the same items every time,
because nothing records that one was dealt with (Lawrence, 2026-10-11: "so I don't
keep getting hit with it").

### 3. Context policy: what each turn is told

The platform's answer is in `mchatai_macOS/docs/ASSISTANT_CONTEXT_ARCHITECTURE.md`
and `context-policy.json` in this folder: a small **standing** layer (the rules, one
line each), a **situational** layer chosen for each message (records it names,
memories that match it), and **on-demand** tools. Records enter context only when
named. Per-assistant overrides go under `"context"` in `assistant.json` (AP.1).

**Trap:** pushing everything the assistant knows into every turn. The cost grows
with the assistant's age, not with the question.

### 4. Continuity: how long a conversation lives

| Option | Choose when |
|---|---|
| `thread-per-topic` | Conversations have subjects; memory carries what matters between them |
| `long-lived` | One running conversation is the product (a companion) |
| `session-per-run` | Scheduled work with no conversational state (a morning brief) |
| `project` | Multi-session work on one artifact (a book, a story) with its own files |

The compaction window is content: `cli-invocation.json` `envByPurpose`, where
`assistant` sets every assistant thread (200k) and `assistant:<id>` sets one
(History Writer keeps the 500k coding window because it is `project` work). A
conversation that overflows starts fresh in the same thread automatically (CW.0),
and an assistant's own CLI notes live in one folder per assistant, so a fresh
thread starts with them (CW.3).

**Trap:** treating the CLI transcript as the memory. Transcripts compact and
threads end; what must survive goes to memory or records.

### 5. Authority: what it may do

Enumerated tool grants (`tools`), the person's approval for anything outbound
(`proposeAction` → approval card), a per-day budget, and `access` tiers. A wildcard
grant (`mail.*`) covers verbs added later, including ones that send. Enumerate any
applet that can write to other people.

**Trap:** a convenient wildcard that quietly includes a sending verb.

### 6. Quality control: how output is checked

| Option | Example |
|---|---|
| `none` | Casual conversation |
| `deterministic` | Linters on the output (tone, format, links) |
| `evaluator` | A second pass that scores against a rubric |
| `human` | Approval cards before anything leaves |
| `evidence` | Every claim tied to a quoted source (the History Writer compiler) |

**Trap:** a prose rule with no checker. Rules in `CONTEXT.md` are requests, not
guarantees. Anything that must hold needs a deterministic backstop.

### 7. Freshness: how it avoids repeating itself

| Option | Choose when |
|---|---|
| `none` | Each turn stands alone |
| `seen-ledger` | Recurring output on a changing world (news, digests): a record of what was already said, with a deterministic delta gate |

**Trap:** asking the model whether something is new. It cannot tell; the ledger can.

### 8. Identity: how it sounds

`displayName`, `blurb`, the voice in `CONTEXT.md`, the person's own `feedback`
memories about tone, and (Phase LK) a look. Voice rules that must hold get a
deterministic check (axis 6).

### 9. Cost: what it may spend

`budgetUSDPerDay` (advisory), `relayTimeoutSeconds`, the backend and model. Cost is
mostly decided by axes 3 and 4. A thread that carries 900k tokens of context pays
for them on every turn.

## The assistants, mapped

"—" means not declared anywhere: the gaps AP.1 closes.

| Assistant | Trigger | State shape | Continuity | Authority | Quality control | Freshness |
|---|---|---|---|---|---|---|
| `personal` | conversation, schedule (daily), relay | memories | thread-per-topic by design; in practice threads run for weeks | unrestricted (`tools` null) | human (approval cards) | — |
| `coordinator` | schedule (daily), calls others by relay | artifacts (Daily Update), memories | — | enumerated | — | — |
| `job-search` | conversation, schedule (daily), relay | memories, records (Job Applications, Potential Jobs; `recordLeads` since CW.4) | thread-per-topic | enumerated; `mail.send` withheld | human (approval before submit) | — |
| `news` | schedule (daily), relay | artifacts, evidence (sources) | — | enumerated | evidence (cite sources) | seen-ledger designed, not declared |
| `history-writer` | conversation (manual), premium | evidence (dossier), artifacts (StoryMaker), records (Ledger) | project | enumerated + free tier | evidence (quote per claim) + deterministic (tone lint) | — |
| `litrpg` | conversation (manual) | records (Ledger rows for rules), artifacts | — | enumerated | — | — |
| `workout` | conversation, schedule (daily), relay | records (Ledger, one row per session), memories | — | enumerated | — | — |
| `music` | conversation (manual) | artifacts (LoopStar, audio library) | — | enumerated | — | — |
| `marketing` | schedule (weekly) | artifacts (posts, drafts), memories | — | unrestricted (documented why) | human (approval cards) + cold readers | — |
| `grants` | conversation, schedule (weekly scan routine), relay | memories, records (Funding Opportunities, Funding Applications), artifacts (drafts), evidence (funder quotes) | thread-per-topic | enumerated; `mail.send` withheld | human + evidence + deterministic (scan.py conflict filter) | seen-ledger (scan.py state + Ledger Key) |

What the mapping shows:

- **State shape is the most important blank.** `workout` and `litrpg` already say
  "rows in Ledger" in prose; `job-search` said "your tracker" and never said what it
  was. That is exactly where it went wrong (fixed in CW.4: Job Applications).
- **Continuity is undeclared everywhere.** Every thread defaults to long-lived, which
  is right for a companion and wrong for scheduled runs.
- **Freshness is declared nowhere**, though news and the coordinator both publish
  recurring output.

## Lint rules (AP.2, `mchatai_macOS/scripts/lint_assistant_manifests.py`, in preflight)

Each rule names the trap it prevents. A manifest that breaks one fails `preflight.sh`;
the named `_why…` key turns the failure into a printed warning, so a known gap is
documented rather than hidden.

1. Every axis is declared (an explicit `none` counts), from the vocabulary above.
2. `records` in the state shape names a collection — or `_whyRecordsUnnamed`.
3. A `schedule` trigger with `artifacts` output declares a seen-ledger — or `_whyFreshness`.
4. `tools: null` needs `_whyToolsAreUnrestricted`; a wildcard grant on an applet with a
   dangerous verb (portal/capabilities.json) needs a `_why…` key naming that applet.
5. Not yet automated: a rule in `CONTEXT.md` that says "always" or "never" about output
   should name its checker (quality control) or be marked advisory.

## Adding an option

Write the force (the situation no option handles), the option, what implements it
once in the platform, and its trap with a dated example. Then add its lint rule. If
you cannot name the trap, it is probably a variant of an existing option.
