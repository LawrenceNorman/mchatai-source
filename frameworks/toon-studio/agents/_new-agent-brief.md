<!-- The brief handed to the pipeline architect when someone presses (+) on
     ToonStudio's Agents pane. It is CONTENT because what makes a recipe a
     TOON recipe — that it must end by handing a script to ToonStudio, and how
     pictures reach the screen — is knowledge that should improve without
     shipping a new binary. Placeholder: {{description}} -->

I want a new ToonStudio agent. Here is what it should make:

{{description}}

Build me the recipe for it. Requirements specific to a ToonStudio agent:

**It must end by handing a script to ToonStudio, or nothing is filmed.**
Use `builtin.appletVerb` with `applet=ToonStudio`, `verb=importScript`,
`textArg` pointing at the step text, `arg.save=true`, `arg.voice=true` (without
this the film has no audio), and `arg.title` — `{{title}}` in an arg value
resolves to whatever an earlier step left in `title`, which the wikipedia step
sets to the article it found.

**How many people are on screen.** Fewer is better, and it is the single
biggest lever on how a film reads:
- An EXPLAINER, tutorial or lesson: ONE presenter. A lone narrator sounds
  bare in prose and plays perfectly well as a film, because the pictures carry
  the other half. Two extra characters standing silent waiting for their turn
  is clutter, and it crowds the slide.
- A STORY or a debate: two, occasionally three, when they genuinely disagree
  or play parts.
Never write a character called NARRATOR and never write a voice that is only
heard — ToonStudio films who is on stage, and an off-screen speaker's lines
are dropped, taking their half of the script with them.

**Pictures.** If the subject has real ones worth showing:
`builtin.wikipedia` has three modes worth knowing:
- `summary` — ONE article, for a named thing ("Apollo 11"). Returns its text
  and an `Image:` URL.
- `research` — SEVERAL articles about a subject, for "explain X to me" and
  anything phrased as a question. It strips the question wording before
  searching, ranks past disambiguation stubs, and keeps the user's own phrasing
  as `title` so the film is named for what they asked. Use this for explainers
  and tutorials; `summary` on "How does AI work" returns the article *Claude
  (AI)* and films the wrong subject. `articleCount` defaults to 3.
- `images` — takes a JSON list of `{caption, wikipedia_title}` and returns a
  picture for each in ONE step. Pass
that straight to `AISlides` `composePictureDeck` (`textArg=pictures`), then
`ToonStudio` `cueDeck` with the same `arg.deck` title. Ask for a DIFFERENT
article per beat — one picture repeated across a film is the usual failure —
and prefer articles whose own lead image belongs to the period being
described.

**Writing quality.** Say what the script must contain, not just its subject:
dates and numbers the first time each thing appears, causes before
consequences, plain declarative sentences, and no exclamation marks. Left to
itself a model writes short, breathless, factless dialogue.

**The shape that works.** When the film wants pictures — which is any time I
ask for slides or photos — build it like this, in this order. Copy the keys
exactly; a missing `textArg` means the script never reaches ToonStudio and the
film comes out empty.

```pipeline
{
  "name": "<Agent Name>",
  "steps": [
    {"skillID": "builtin.wikipedia",
     "config": {"wikipediaMode": "summary", "maxChars": "4000"}},

    {"skillID": "builtin.llmGenerate",
     "config": {"userPrompt": "…the SCRIPT brief: who presents, how long, what it must contain…\n\nSOURCE MATERIAL:\n{{INPUT}}",
                "llmMaxTokens": "6000", "llmTimeout": "300"}},

    {"skillID": "builtin.appletVerb",
     "config": {"applet": "ToonStudio", "verb": "importScript", "textArg": "text",
                "arg.save": "true", "arg.voice": "true", "arg.title": "{{title}}",
                "keepText": "true"}},

    {"skillID": "builtin.llmGenerate",
     "config": {"userPrompt": "…choose N moments from the screenplay that deserve a picture; return ONLY {\"beats\":[{\"caption\":\"…\",\"wikipedia_title\":\"…\"}]}, a DIFFERENT article each time…\n\nSCREENPLAY:\n{{INPUT}}",
                "llmMaxTokens": "1500", "llmTimeout": "180"}},

    {"skillID": "builtin.wikipedia",
     "config": {"wikipediaMode": "images"}},

    {"skillID": "builtin.appletVerb",
     "config": {"applet": "AISlides", "verb": "composePictureDeck", "textArg": "pictures",
                "arg.title": "<Deck Name>", "arg.theme": "broadcast"}},

    {"skillID": "builtin.appletVerb",
     "config": {"applet": "ToonStudio", "verb": "cueDeck", "arg.deck": "<the same Deck Name>"}}
  ]
}
```

`keepText: "true"` on the importScript step is what lets step 4 still see the
screenplay. The deck name in the last two steps must match exactly.

**Every `userPrompt` that needs the previous step's output must contain the
literal token `{{INPUT}}`**, spelt exactly that way and placed at the END,
under a heading. It is the ONLY way text flows between steps. A prompt without
it runs against nothing but its own instructions.

Write the two `userPrompt` bodies yourself — they are the part that decides
whether the film is any good. Ask me a clarifying question if the subject is
ambiguous rather than guessing.
