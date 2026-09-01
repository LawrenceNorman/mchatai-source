# Classic Children's Story

Name a traditional tale; get back a finished ToonStudio film of it.

    applet ToonStudio → Agents → Classic Children's Story
    "Write me a story of the three little pigs and the big bad wolf."

## Public domain only, and it will say so

Step 1 identifies the tale and aims a search at the collection that carries it — Grimm,
Andersen, Aesop, Joseph Jacobs, Andrew Lang, Perrault. All published before 1929.

Ask for something still in copyright — a modern character, a film, a franchise — and it
answers `NO PUBLIC DOMAIN SOURCE: <what you asked for>` and stops. It does not quietly
substitute a different story, and it does not write one itself. A retelling of a
copyrighted work is not what this is for, and inventing a folk tale while claiming to
have found one is worse than refusing.

## The four steps

| | | |
|---|---|---|
| 1 | `llmGenerate` | Which tale is this, and what query finds its full text? |
| 2 | `webSearch` | Run it, and read the top three results. |
| 3 | `llmGenerate` | Adapt the source into a screenplay. |
| 4 | `ToonStudio.importScript` | Cast, stage and save the film. |

## Two things that took a failure to learn

**The search query decides everything.** The first version emitted
`site:gutenberg.org "The Three Little Pigs" "public domain"` and found catalogue pages —
everything *about* the tale, none *of* it. Search operators narrow onto licence and index
pages; the words "public domain" find copyright notices. So the prompt now bans operators
outright and asks for a plain-language query ending in "full text".

**Step 3 refusing is not the end of the danger.** When the source came back unusable the
model correctly answered `SOURCE PROBLEM: …` — and `importScript` read those fifteen
characters as a *story premise* and invented an unrelated film about a giant fish, which
the pipeline reported as a success. `importScript` now refuses input with no dialogue in
it (see `docs/APPLET_VERB_SCOPING.md`), so an upstream failure surfaces as a failure. That
guard is on the verb rather than here, because any recipe could have produced it.

## What it is told to keep

The shape audiences know: the three attempts, the repeated line verbatim every time, the
turn at the end. And it is told to keep it for children — villains are thwarted,
embarrassed and sent home, never harmed. Traditional tales are often grim; this version
is not.
