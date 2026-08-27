# Snark News Toon

Headlines in, satirical animated newscast out.

## The chain

1. **webExtract** — two publisher RSS feeds. Publisher feeds, *not* Google News:
   Google News RSS links are JavaScript redirect shims and extract to an empty
   Google shell rather than the article.
2. **llmGenerate** — pick three stories worth being ironic about, return URLs only.
   This step is also the editorial filter (see below).
3. **webExtract** — read those three articles.
4. **llmGenerate** — the 60-second two-anchor script. Bans parentheticals, because
   anything in brackets gets read aloud by the voice engine.
5. **appletVerb** — hand the script to `ToonStudio.importScript`, which casts it,
   picks a backdrop and saves a film.

## Editorial filter

Real headlines are frequently deaths, missing people and crimes against people.
Ironic jokes over those are unpleasant, so step 2 explicitly excludes them and
picks other stories instead. This is a prompt rule, which means it is advisory —
if it matters that it never slips, it needs a deterministic check after step 2.

## Making it free

Set both anchors to Apple on-device voices — `ToonStudio.setVoice` with
`provider: "apple"`. Apple TTS costs nothing, needs no key and works offline,
so a daily run has no per-character cost.

## Making it a newsdesk rather than a conversation

Set `presentation: "presenter"` on the film. The gaze pass then has the speaker
address the *viewer* and the listener attend to them — without it, two anchors
turn to face each other, which is a conversation, not a broadcast.
