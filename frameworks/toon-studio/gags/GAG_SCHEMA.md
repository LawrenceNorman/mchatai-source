# Gags — reusable physical comedy

A **gag** is a named piece of choreography with ROLES, bound late to whichever
rig is actually on stage. This is the model every mature cutout tool uses —
Toon Boom action templates, Character Animator triggers, Moho Actions, Unity
Timeline's asset/instance binding — because the alternative (code per gag) does
not survive its second story.

Adding a gag is a PR. No Swift, no rebuild.

## Shape

```json
{
  "id": "blow-down",
  "triggers": ["huffs and puffs", "blows the house", "blew the house in"],
  "roles": {
    "agent":     { "kind": "cast", "needsAnyOf": { "poses": ["lean", "idle"] } },
    "structure": { "kind": "prop",
                   "conjure": ["ts_prop_house_straw", "ts_prop_house_brick"],
                   "needsAnyOf": { "clips": ["collapse"] } },
    "occupant":  { "kind": "cast", "optional": true,
                   "at": { "role": "structure", "dy": 0.07, "scale": 0.30 } }
  },
  "beats": [ { "at": 0.0, "role": "agent", "pose": "lean" },
             { "at": 0.55, "role": "agent", "move": { "scaleBy": 1.08 } } ],
  "seconds": 3.4
}
```

* **triggers** — exact phrases, matched case-insensitively against the scene's
  stage directions. Phrases only in v1: verb NLP is how a gag fires on the
  wrong sentence, and a wrong gag is worse than no gag.
* **roles** — `kind` is `cast` or `prop`. `needsAnyOf` lists poses/clips/parts
  the bound rig must actually have; a role that cannot bind means the gag does
  not fire **at all**. Never a partial gag.
* **conjure** — for a `prop` role with nothing suitable on stage, the props to
  stage. This is the fix for the fact that a house painted into a BACKDROP can
  never fall down: backdrops have no poses and are not cue targets.
  A **list**, ranked against the location — the scene's backdrop id, the
  direction that fired the gag, and the scene's dialogue, which is where "I
  shall build my house of straw!" actually names the material. A bare string
  still decodes.
  When the location names its material, there is **no substituting**: if the
  best-matching prop cannot do the job, the gag refuses rather than swapping in
  one that can. That is how the wolf stopped flattening the brick house.
* **optional** — a role the gag can play without. Absent, an uncastable role
  kills the gag; set, it is simply skipped.
* **at** — stage this role at another role's mark, offset by `dx`/`dy`/`scale`.
  How an occupant gets put in the window of the house they live in. A higher
  `dy` is further UPSTAGE as well as higher up, and the renderer draws upstage
  first, so this is also what puts them behind the wall to be framed by it.
  Anchored roles are cast last, after their anchor has a mark.
* **beats** — cue ops in gag-relative seconds. Every field maps to a real
  `ToonCue` channel: `pose`, `clip`, `move` `{x,y,scale,scaleBy}`, `shake`,
  `effect`, `sound`, `hold`.
* **seconds** — total length; the binder sizes the action shot to it.

## Rules the engine forces on you

1. **A clip beat must not carry a duration.** `ToonProject.swift:1128` — a
   duration makes the clip expire and the prop snaps back to its rest pose
   mid-shot. Non-looping clips hold their last key; that is what leaves a heap
   on screen.
2. **Pose tracks are rebuilt per shot.** Only position, visibility and
   expressions survive a cut, so a gag that leaves a lasting state declares
   `"persist": {"role": "structure", "pose": "collapsed"}` and the binder
   re-stamps it on every later shot in the scene.
3. **Sound names must exist in the library.** `whoosh`, `boom`, `crumble`,
   `wind` do; `inhale`, `gust`, `crash` do not. A chain that resolves to
   nothing plays as silence and reports success.
4. **Effects spawn at an explicit `move`.** Anchoring to a target resolves at
   shot start, not cue time.
5. **Scale a body with `scaleBy`, never `scale`.** `move.scale` is ABSOLUTE
   stage scale and staging places a character at 0.62, so an author writing
   `"scale": 1.08` for "inhale a little" gets a 1.74x giant. `scaleBy` is a
   multiplier on whatever mark the role was bound to, which is the only thing a
   reusable gag can know. The binder restores any scale it changed when the gag
   ends — position and scale carry to the end of the SCENE, so a gag that does
   not tidy up is permanent, two scenes away from where anyone is looking.
6. **Every matching gag is tried, in index order, until one CASTS.** A gag that
   cannot bind is not an error — it is this location declining an action that
   does not play here. Put the specific gag above its fallback in `_index.json`:
   `blow-down` sits above `blow-fail`, so the brick house (which has no
   `collapse` clip) declines the first and plays the second. **The story's
   outcome is a property of the RIG, not a branch in code.**
