<!-- The brief handed to the pipeline architect when someone presses (+) on
     ToonStudio's Agents pane. It is CONTENT because what makes a recipe a
     TOON recipe — that it must end by handing a script to ToonStudio — is
     knowledge that should improve without shipping a new binary.
     Placeholder: {{description}} -->

I want a new ToonStudio agent. Here is what it should make:

{{description}}

Build me the recipe for it. Requirements specific to a ToonStudio agent:

- It MUST end by handing a finished script to ToonStudio, or nothing is filmed.
  Use `builtin.appletVerb` with `applet=ToonStudio`, `verb=importScript`,
  `textArg` pointing at the step text, and `arg.save=true`. Give `arg.title`
  something the user will recognise in their Projects list.
- The script that reaches ToonStudio is a SCREENPLAY, not an essay: named
  speakers with their lines, one line per speaker turn. Two or three recurring
  characters read better than a lone narrator.
- If the subject has real pictures worth showing, gather them and put them on
  screen behind the characters:
  `builtin.wikipedia` (wikipediaMode=summary) and `builtin.webExtract` both
  return an `Image:` URL. Feed it to `aislides.addAsset` with `url=`, put the
  returned `image_file` on a slide whose layout is `fullBleed`, `imageLeft` or
  `imageRight` — a picture on any other layout is DROPPED — then
  `aislides.renderCards` and `ToonStudio cueDeck`.
- One picture reused on every card is the usual failure. Gather a DISTINCT
  image per beat, or show fewer cards.
- Prefer few, well-configured steps. Ask me a clarifying question if the
  subject is ambiguous, rather than guessing.
