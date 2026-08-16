# toon-studio — content for the AIVidGen cutout animation applet

Everything AIVidGen draws or prompts with lives here. The macOS binary carries
only the **format** (decoders, renderer, repair) plus a frozen `_fallback_only`
starter for offline first launch. Per RULE #1, a change in this directory
reaches every user on the next `refreshMchataisourceCache` with **no rebuild**.

```
toon-studio/
  prompts/          system prompts for LLM authoring  (source of truth)
    toon.character.md
    toon.backdrop.md
    toon.story.md
  puppets/*.json    the cast
  backdrops/*.json  the scenery
  styles.json       look packs applied over everything
```

## Load order

`ToonLibraryStore` merges three layers, later winning by `id`:

1. **Frozen starter** — `ToonFixtures.swift` in the app. Offline fallback only.
2. **This directory** — via `MchataisourceCacheService`.
3. **User library** — `~/Library/Application Support/mChatAI/AIVidGen/library/`,
   whatever that person generated on their own machine. Per RULE #2 it stays local.

Everything is run through `ToonRigRepair` on load, not just on generation, so
content authored by hand gets the same guarantees as content authored by a model.

## Puppets

Cutout rigs in **puppet space**: y is up, feet at `y = 0`, top of head near
`y = 1.0`, `x = 0` is the centre line. Shape coordinates are absolute; `parent`
only decides what a pose rotation carries with it.

Two slots are swapped per frame: `"swap":"viseme"` (the mouth, driven by the
lip-sync track) and `"swap":"eyes"` (squashed vertically to blink). The mouth
part holds no artwork — the nine mouth shapes live in the top-level `visemes`
map, keyed `X A B C D E F G H` (the Rhubarb convention).

**A cast must look like different people.** Vary skin tone, hair silhouette,
build and clothing shape — not colour alone. `prompts/toon.character.md` carries
the full guidance and a worked reference rig; read it before adding a character.

## Backdrops

Parallax layers in **stage space**: `y = 0` is the ground characters stand on.
Each layer's `parallax` sets how much camera it inherits (0 pinned to frame,
1 moves with the world, up to 2 for foreground that outruns the camera).

Three things decide whether scenery reads, and all three are enforced or checked
at render time:

- **Repetition.** A city is a row of buildings; a facade is a grid of windows.
  Use the `repeat` primitive rather than hand-placing shapes. Six rectangles
  look like six rectangles.
- **Value ladder.** Far layers lightest, near darkest, stepping ≥ 0.09 in
  luminance. Generated scenery gets this inverted more often than not, so
  `ToonRigRepair.gradeValueLadder` enforces it via a non-destructive per-layer
  multiplier.
- **Sky gradient.** Set `skyTop` and `skyBottom`. A flat sky is the strongest
  cheap-cutout tell, and dusk is unreadable without a ramp. Interiors set a
  single `sky` instead and keep every layer at parallax 0.85–1.0.

Keep distant silhouettes out of `y = 0.41…0.51` — character eye level is 0.46,
so a horizon there draws a line through every face in every shot.

## Verifying

The applet ships a contact-sheet command that renders every puppet and backdrop
in the merged library to one PNG:

```bash
tunnel_send "sheet" '{"command":"diagToonContactSheet","cell":260,"requestID":"sheet"}' 90
```

Look at it. A numeric gate (`paths > 0`) passed two grey rectangles for weeks;
a contact sheet could not have.
