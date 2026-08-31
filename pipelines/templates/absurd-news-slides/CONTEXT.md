# Absurd News Slides

Headlines in, a presentable deck out. The slides sibling of **Snark News Toon** —
same editorial chain, different landing pad.

## The chain

1. **webExtract** — two publisher RSS feeds. Publisher feeds, *not* Google News:
   Google News RSS links are JavaScript redirect shims and extract to an empty
   Google shell rather than the article.
2. **llmGenerate** — pick three stories worth being ironic about, return URLs only.
   This step is also the editorial filter (see below).
3. **webExtract** — read those three articles.
4. **llmGenerate** — write the deck as markdown: `#` deck title, `##` per story,
   bullets for the facts, a prose paragraph underneath for the speaker notes.
5. **appletVerb** — hand that markdown to `AISlides.place` with `mode: markdown`.

## Why `mode: markdown` and not `compose`

`place` in markdown mode is **deterministic and free**: `SlidesTextIntake` maps
the headings, bullets and paragraphs the previous step already wrote — no second
model call, no cost, and no chance of a model inventing a fact between the news
and the slide. Step 4 is the only place a model touches the content.

Use `mode: compose` instead when the incoming text is unstructured prose and you
want the model to shape it; use `mode: auto` (the default) to parse when there is
structure and compose when there is not.

## Editorial filter

Real headlines are frequently deaths, missing people and crimes against people.
Ironic jokes over those are unpleasant, so step 2 explicitly excludes them and
picks other stories instead. This is a prompt rule, which means it is advisory —
if it matters that it never slips, it needs a deterministic check after step 2.

Step 4 carries the harder rule: **the facts come first and the joke comes last.**
A deck whose bullets are only jokes has failed even when it is funny.

**Observed slip (2026-08-31, first live run):** the filter passed a story about
Russian strikes destroying Ukrainian libraries, and step 4 duly attached a wry
line to it. Nothing in the chain stops this — step 2 excludes deaths and injuries
by prompt, and a cultural-destruction story matches neither word. If this
template is ever run unattended, the deterministic check named above is not
optional; until it exists, read the deck before showing it to anyone.

## Step 1 takes ONE url

`builtin.webExtract` reads `url` as a single URL (`WebExtractSkill.swift`) —
several URLs separated by spaces are requested verbatim and 404. Multiple
sources are only reachable by letting the previous step put URLs in the flowing
text and setting `maxURLs`. All three news templates carried a space-separated
pair here and failed at step 1 until 2026-08-31.

## Already have a newscast script?

A two-anchor script — the kind Snark News Toon writes for ToonStudio — needs no
new prompt. `place` recognises speaker turns and maps them directly:

```json
{"command": "applet", "applet": "aislides", "verb": "place",
 "args": {"title": "Absurd News", "text": "DALE: Good evening.\nPRIYA: The council has banned a word.\n..."}}
```

Each slide carries a few consecutive turns as bullets and the same turns verbatim
in the speaker notes, so the deck can still be performed. No model, no cost, and
nothing in the deck that was not in the script.

## Running it

Daily is the intended cadence. Because step 5 passes an explicit `arg.title`, the
deck REPLACES the previous day's deck of the same title in place (same id, same
link) rather than leaving thirty near-identical decks behind. The slides it
displaces are copied to the deck trash and kept for 30 days.

Pass `arg.replace: "false"` to keep each run instead — the run is then saved as
"Absurd News (2)", "Absurd News (3)" and so on, because two decks sharing one
title would make every later `getDeck`/`edit` by name ambiguous.

Replacement only ever happens on an explicit title. A `place` call with no
`title` derives one from the first line of the text, and a derived title never
overwrites an existing deck.
