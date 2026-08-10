# FINAL BUILD SPEC — The Phrase Shelf (FIND row + expandable drawer)

**Positioning line for the UI:** *MAKE rolls the dice. FIND shows you the room.*

---

## 0. SOURCE FACTS THIS SPEC IS BUILT ON (verified, do not re-litigate)

| Fact | Location | Consequence |
|---|---|---|
| `LoopStarPhraseFit` (175 lines) already scores 0–100 with `reasons`/`warnings`/`headline` | `LoopStar/LoopStarPhraseFit.swift` | **Do not write a fit engine.** Ship it. |
| `conductor.phraseFitContext` already builds the live `SessionContext` | `LoopStarConductor.swift:4317` | Wired, unused. Just read it. |
| `LoopStarPhraseThumbnail` (145 lines) already draws the lane-aware Canvas piano-roll from raw events (no compile) | `LoopStar/LoopStarPhraseThumbnail.swift` | **Do not write a glyph.** Ship it. |
| `LoopStarPhraseFacets` already derives density (banded per pack) / motion / range / harmony / PD / glide / ghosts | `LoopStar/LoopStarPhraseFacets.swift` | **Do not write facet derivation.** Ship it. |
| The decoder **already** decodes `name` (with `titleFromID` fallback) and `provenance → inspiration/pdSource` | `LoopStarPhraseEngine.swift:118–142` | **The decoder is not broken.** The bug is `LoopStarHookBrowserView.displayName()` at `:193` re-deriving a slug title — and that file is being deleted. |
| `LoopStarPreviewPlayer` is one `AVAudioPlayerNode` (`:49`), `playBuffer` calls `stop()` first | `LoopStarPreviewPlayer.swift:174` | Layered audition = **offline PCM summing**, never two nodes. And never audition *against* a running `LoopStarBarScheduler` — it will flam. |
| Rack geometry: label 40 · card 120 · spacing 8 · hpad 14 → 580pt left panel | `LoopStarPartsRackView.swift:50–60`, mirrored in `LoopStarMixerStripView.swift` | The FIND row and the shelf tab strip must reuse these exact numbers. |
| `installPhrase(_:lane:)` lane keys are `"hooks" | "bass" | "comping"` | `LoopStarConductor.swift:4352` | **≠** the fit-context lane keys `"melody" | "bass" | "comping"` (`:4335–4337`). See §4.0 — this is a live landmine. |
| Grid holds `.layoutPriority(1)`; view is `.frame(minHeight: 620)` | `LoopStarView.swift:170, :102` | The shelf must be a **fixed-height** row, never flexible. |
| Content: 361 phrases + 133 progressions across 21 genres | `mchatai-source/frameworks/loopstar/phrases/` | Verified by count. |

---

## 1. PLACEMENT + DISCOVERABILITY

**Delete `LoopStarHookBrowserView.swift` (285 lines) and its `.sheet` at `LoopStarView.swift:265`.** The library stops being a room behind a door.

### Four doors, none of them a menu

1. **The FIND row — permanent, 40pt.** A fifth labelled row in the left workbench `VStack`, inserted directly under `creativeActionsRow` (`LoopStarView.swift:137`). Uses the `Text("FIND").frame(width: 40)` rail idiom. It holds **three live, already-fit-scored phrase cards**, one per lane, **each sitting in the exact column of the part card it would fill** (Chords→COMP, Bass→BASS, Melody→MELODY). The library is now on screen at all times for 40pt instead of 212.
2. **The shelf** — the same component expanded to 212pt (drag 150–380), a full-main-column row inserted between the workbench `HStack` and the grid `Divider` (`LoopStarView.swift:165–166`). Opened by the Browse button in the FIND row's first slot, by `⌘L`, or by door 3.
3. **`≡` glyph on each part card** (top-left of `populatedCard`, mirroring the existing `pencil` at `LoopStarPartsRackView.swift:120`). Empty cards split into `＋ new` | `≡ browse` half-targets — the exact spot a stuck user already is. Existing gestures (click=launch, dbl-click=edit, long-press=edit) untouched; the `≡` is its own hit target with `.allowsHitTesting` above the card's tap.
4. **Style menu item stays** — `Style ▸ Browse phrases…` (`LoopStarView.swift:502`) renamed **"Find phrases… ⌘L"**, now just toggles the shelf. Zero cost, preserves muscle memory.

### Vertical budget (the one real risk, handled)
- FIND row is 40pt permanent → `LoopStarView.swift:102` becomes `.frame(minHeight: 660)`.
- Shelf open → `.frame(minHeight: shelfOpen ? 810 : 660)`.
- The shelf row is `.frame(height: shelfHeight)` **fixed**. The grid keeps `.layoutPriority(1)` and `maxHeight: .infinity` and absorbs everything else. The shelf can never starve the performance surface.
- `@AppStorage("LoopStarShelfOpen") shelfOpen = false`, `@AppStorage("LoopStarShelfHeight") shelfHeight = 212.0` (clamped 150…380).

---

## 2. LAYOUT

### 2.1 FIND row — 580pt × 40pt (collapsed default)

Geometry is byte-identical to the rack: `hpad 14 · label 40 · spacing 8 · four 120pt slots`.

```
├─ LEFT WORKBENCH PANEL (580pt, .fixedSize(horizontal:true)) ───────────────────┤
│ PARTS  [  Beat   ][  Chords  ][   Bass   ][  Melody  ]                        │ 56
│ MIX      ( o )       ( o )        ( o )       ( o )                           │ 46
│ MAKE   Style: Funk ▾  ✦ Make it new ▾  ♪ Melody  Play Like                    │ 30
│ FIND   [≡ Browse   ][▁▃▅ Chank Push][▂▄▂ Slap Pop  ][▁▂▄ Fate cell ]          │ 40
│  ▲40    ▲120 ▲8      ▲120            ▲120            ▲120                     │
└───────────────────────────────────────────────────────────────────────────────┘
   slot 1 = Browse + inventory      slot 2 = COMPING   slot 3 = BASS  slot 4 = MELODY
   (aligned under Beat, which has   (under Chords)     (under Bass)   (under Melody)
    no phrase library)
```

**Slot 1 — Browse button, 120×30:**
```
┌────────────────────┐
│ ≡ 361 phrases    ⌄ │  10pt semibold, LSVStyle.accent
│ funk · 11 fit here │  8.5pt, dim #9ca3af
└────────────────────┘
```
`11 fit here` = count of phrases in the active genre with `fit ≥ 70`. This is the sentence that makes the library exist: it names its own inventory and tells you some of it belongs.

**Slots 2–4 — a live suggestion per lane, 120×30:**
```
┌────────────────────┐
│ ┌────┐ Slap Pop  ● │   glyph 40×18 (LoopStarPhraseThumbnail, lane tint)
│ │▂▄▂▁│ ◕88 fits    │   name 9.5pt #e5e7eb, fit ring 10pt + verdict 8.5pt
│ └────┘              │   ● = this phrase is currently installed on that lane
└────────────────────┘
```
Tint = the part accent of the column above (`chords #f59e0b`, `bass #818cf8`, `melody #22d3ee`) so a card visually belongs to its card. Border `white@9%`, fill `#1c1f2a`, radius 6.

**Re-pick trigger.** Each slot holds the top-fit phrase for its lane, **excluding what is already installed there**. Recomputed via `.task(id: fitStamp)` where
`fitStamp = "\(genreID)|\(keyMinor)|\(distinctChords)|\(Int(sceneEnergy*20))|\(laneDensity.keys.sorted().joined())"`.
Never observe `LoopStarPreviewPlayer.shared` here — observe `LoopStarPreviewPlayer.playingState` (the `playingID`-only mirror, `LoopStarPreviewPlayer.swift:25`). Observing the full player re-runs the filter at 60Hz; that is the documented crate-browser regression.

**Gestures:** click = solo audition · `⌥`-click = Try in track (§6) · double-click = install · `⟳` on hover = re-roll this slot within the current filter · right-click = Open in shelf / Add to stack / Not this one (session-scoped suppress).

### 2.2 The Shelf — expanded, ~1240pt × 212pt

```
┌── SHELF ─────────────────────────────────────────────────────────────────────────────────┐
│ ≡ │ PROG·chords │  COMPING  │   BASS   │  MELODY  │ 🔍 slap___ │ ⇅ Fit ▾ │ 47 │  ⌃ close │ 28
│ ▲40   ▲120         ▲120        ▲120       ▲120   (tabs align to the part cards above)     │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ [Fits here ●] [1][2][4 bars] [sparse 12][med 21][busy 14] [syncopated 9] [⚜ famous 4]     │ 26
│ [this style ▾ | all 21]   energy ▏──┬──●──────▕ ▲scene    [wide range] [ghosts] [glide]   │
├────────────────────────────────────────────────────────────┬─────────────────────────────┤
│ ┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌────────┐ │ STACK                   316 │
│ │● Slap Pop││ Oct Jump ││⚜Fate cell││ Ghost Wlk││ Chank  │ │ MEL   Fate cell    🔒 ⨯ ⟳  │
│ │┌────────┐││┌────────┐││┌────────┐││┌────────┐││┌──────┐│ │ BASS  ▸ live (playing) ⨯ ⟳ │ 150
│ ││▁▃ ▂ ▅▃ │││├ ▄▄ ▂ ▆ │││ ▃▃▃ ▁▁▁│││ ▂ ▂▄▂ ▁ │││▂▂ ▄▄ ││ │ COMP  — empty —        ⨯ ⟳ │
│ │└────────┘││└────────┘││└────────┘││└────────┘││└──────┘│ │ ───────────────────────────│
│ │2b·riff·↗ ││1b·riff·→ ││1b·hook·↘ ││2b·comp·→ ││2b·comp││ │ ◑74  locked to the bass on │
│ │◕88 fits  ││◔41 crowds││◕92 fits ⓘ││◑67 busy  ││◕81    ││ │      1 and 3, air on 4     │
│ │[▶][⌥][Use││[▶][⌥][Use││[▶][⌥][Use││[▶][⌥][Use││[▶][⌥] ││ │ [▶ Play together] [Commit] │
│ └──────────┘└──────────┘└──────────┘└──────────┘└────────┘ │ [⟳ Roll the empties]       │
│   ← horizontal ScrollView, ~7 tiles visible ─────────────→ │                             │
└────────────────────────────────────────────────────────────┴─────────────────────────────┘
```

Tile **132 × 146**, gap 8. Stage panel 316pt, hidden until something is staged (collapses to a 20pt `STACK (0)` spine). Colours: shelf bg `#15171e`, tile `#1c1f2a`, hairline `white@9%`, text `#e5e7eb`, dim `#9ca3af`, fit/PD accent `#f59e0b`, installed dot `#34d399`. Type 8.5–11pt.

**Tab note:** PROGRESSIONS has no part card of its own, so it takes the free Beat-aligned slot, labelled `PROG · chords` in the chords purple `#a855f7`. Beat has no phrase library; that is correct and stated.

---

## 3. FILTER MODEL

One `PhraseFilter` struct. **OR within a facet, AND across facets.** Every chip carries a live result count and `.disabled(count == 0)` — the filter set can never dead-end silently.

| # | Facet | Control | Data source | Default |
|---|---|---|---|---|
| 1 | **Lane** | 4 rack-aligned tabs (single-select; a *mode*, not a filter) | `pack.hooks/bass/comping/progressions` | `melody` (or the lane you entered from) |
| 2 | **Fits here** | toggle | computed fit ≥ 70 (§4) | **ON** |
| 3 | Search | text field, `⌘F` | `phrase.name` + `phrase.id` + `inspiration` + `pdSource` prose | empty |
| 4 | Scope | 2-state `this style / all 21` + genre popup | `conductor.availableStyles` (`LoopStarGenreStore`) | this style |
| 5 | Length | chips `1 · 2 · 4` | `phrase.lengthBars` | all |
| 6 | Role | chips `hook · riff · comp · pad · fill` | `phrase.role` | all |
| 7 | **Density** | chips `sparse · medium · busy` | `LoopStarPhraseFacets.Density` — **banded against `pack.notesPerBarMin/Max`**, so "busy" means busy *for trap* | all |
| 8 | **Syncopated** | toggle | `LoopStarPhraseFacets.Motion == .syncopated` (off-8th-grid onset ratio ≥ 0.25) | off |
| 9 | **Plays over** | chips `vamp only · follows chords · either` | `LoopStarPhraseFacets.Harmony` ← `phrase.worksOver` | all |
| 10 | **Mode pin** | chips `follows key · pinned major · pinned minor` | `phrase.mode` | all |
| 11 | Range | chips `tight ≤5st · medium · wide ≥12st` | `LoopStarPhraseFacets.Range` | all |
| 12 | **⚜ Famous** | toggle | `phrase.isPublicDomain` (`pdSource != nil`) | off |
| 13 | Energy | range slider, live `▲` tick at scene energy | `phrase.energy` vs `ctx.sceneEnergy` | ±0.25 window centred on scene |
| 14 | Feel | toggle `swing-sensitive` — **only rendered when `pack.swing > 0`** | `phrase.swingSensitive` | off |
| 15 | Articulation | chips `ghosts · glide` | `Facets.hasGhosts` / `hasGlide` | all |
| 16 | Hide installed | toggle | ids currently on a lane | off |
| 17 | **Sort ⇅** | menu | `Fit` · `Energy ↑/↓` · `Density` · `Bars` · `A–Z` · `Recent` | **Fit** |

Energy is the only slider: it is continuous *and* the session has a live value to anchor to. Everything else is a chip, because musicians pick categories.

**Progressions lane** filters on a reduced set: mode pin (`prog.mode`), `barsPerChord`, chord count, `weight`, search on id. Facets 5–15 do not apply (progressions carry no `events`).

**Two clicks to a shortlist, concretely:** open from the empty Bass card → lane=bass, scope=this style, sort=Fit, Fits-here ON → 6 of 6 funk bass. Click `all 21` → 122. Click `sparse` → 31. Click `vamp only` → 9.

**Keyboard:** `⌘L` toggle shelf · `⌘F` search · `←/→` move tile (does **not** auto-audition) · `Space` audition/stop · `⏎` Use · `⌥⏎` stage · `1/2/3` stage into MEL/BASS/COMP · `⌘⌫` clear filters · `Esc` stop all audition + close.

---

## 4. FIT SCORE

### 4.0 THE LANE-KEY LANDMINE — read this first

`phraseFitContext` keys its `laneDensity`/`laneCenter` maps `"melody" | "bass" | "comping"` (`LoopStarConductor.swift:4335–4337`). `installPhrase` keys its lanes `"hooks" | "bass" | "comping"` (`:4356–4386`). `LoopStarPhraseFit.score` excludes the phrase's own lane with `$0.key != lane`, and `phraseCenter` returns non-nil **only** for `lane == "melody"`.

If you pass `"hooks"` to `score(_:lane:ctx:)`, the melody lane is not excluded and **every melody phrase gets "Same register as your melody" against the part it is about to replace.** Define one enum and never hand-write these strings again:

```swift
enum ShelfLane: String, CaseIterable, Identifiable {
    case melody, bass, comping, progressions
    var id: String { rawValue }
    var fitKey: String { rawValue }                    // -> LoopStarPhraseFit
    var installKey: String {                           // -> conductor.installPhrase
        self == .melody ? "hooks" : rawValue
    }
    var partKind: LoopStarPartKind? {                  // -> rack column + accent
        switch self { case .melody: .melody; case .bass: .bass
                      case .comping: .chords; case .progressions: nil }
    }
}
```

### 4.1 The algorithm — ship `LoopStarPhraseFit.score` as written

Starts at 100 and deducts, so a phrase with nothing wrong scores high — the list surfaces *usable* material, not clever material. One sentence to the user, always: the `headline` (first warning, else first reason, else "Fits your track").

| # | Factor | Weight | Inputs | Message |
|---|---|---|---|---|
| 1 | Mode clash | **−34** | `phrase.mode` vs `ctx.keyMinor` (nil always passes) | "Major tune over your minor key" / "Minor tune over your major key" — else the reason "Written minor, like your key" |
| 2 | Harmony shape | **−22** / −10 | `phrase.worksOver` vs `ctx.distinctChords > 1` | "Built for a one-chord vamp, but your chords move" / "Wants moving chords; you are on a vamp" — else "Follows moving changes" |
| 3 | Energy delta | **−18** (>0.35) / −7 (>0.2) | `|phrase.energy − ctx.sceneEnergy|` | "Hotter than the rest of your track" / "Calmer than the rest of your track" — else "Sits at your scene's energy" |
| 4 | Busy budget | **−16** | phrase notes-per-bar ≥6 **and** busiest *other sounding lane* ≥6 | **"Busy against your busy comp"** — else "Busy and driving" / "Sparse — leaves room" |
| 5 | Register collision | **−12** | mean melody pitch within 5 semitones of another lane's `laneCenter` | "Same register as your bass" |
| 6 | Feel | **−8** | `!swingSensitive && ctx.packSwing ≥ 0.3` | "Straight phrase in a swung pack" |
| 7 | Cross-genre | **0** | phrase genre ≠ `ctx.genreID` | "From Jazz — a cross-genre pull" (a *feature*, never a penalty) |
| 8 | PD prior | **+4** | `phrase.isPublicDomain` | "A real public-domain tune" |

Clamped 0…100. Ring: amber ≥70 · dim 40–69 · red <40.

### 4.2 Two small additions to the file

```swift
// Progressions carry no events: mode + shape only.
static func scoreProgression(_ p: LoopStarPhraseProgression,
                             ctx: SessionContext, currentBarsPerChord: Int?) -> Result
//   mode mismatch          -34  "Major progression over your minor key"
//   distinct-chord delta   -12  "Moves a lot more than what you have"
//   barsPerChord mismatch   -8  "Changes twice as fast as your current chords"
//   weight >= 5             +4  "A core progression for this style"

// Two or three staged phrases judged AGAINST EACH OTHER (§7).
static func combo(_ staged: [(lane: String, phrase: LoopStarPhrase)],
                  ctx: SessionContext) -> Result
```

`combo` reuses factors 1/3/4/5 pairwise, plus **onset coincidence** — and reports it *neutrally*: shared onsets ≥0.6 with the bass reads **"locked to the bass on 1 and 3"** (a good funk answer), not "mud". Interaction checks are musical judgement, not lint.

**Cost:** pure Swift over authored events, sub-ms per phrase, memoized per `fitStamp`. Recompute on a 250ms-debounced background `Task`; 361 scores is nothing.

---

## 5. THE PHRASE CARD (tile, 132 × 146)

```
┌──────────────────────────────┐ 132
│ ● Slap Pop Answer         ⚜ │  10.5pt semibold #e5e7eb · ● installed (#34d399) · ⚜ PD
│ ┌──────────────────────────┐ │
│ │  ▁▃ ▂   ▅▃ ▁    ▂▄       │ │  118×34 LoopStarPhraseThumbnail(phrase:lane:tint:)
│ └──────────────────────────┘ │
│ 2 bar · riff · busy · ↗ · wide│  8.5pt dim, from LoopStarPhraseFacets
│ ⚜ Bach · 1704             ⓘ │  8.5pt amber, ONLY when isPublicDomain
│ ◕88  fits your track         │  14pt fit ring + one-line headline
│ [ ▶ ]  [ ⌥ try ]  [   Use  ] │  20pt action row
└──────────────────────────────┘
```

- **Glyph** — `LoopStarPhraseThumbnail(phrase:lane:tint:)`, already written. x = `event.b / (lengthBars*4)`, width = `event.d`, y = normalised to the phrase's own range (melody: scale degrees + `acc` + `12*oct`; bass: chord-role height; comping: voicing thickness), **velocity → opacity**, `ghost`/`dead` → hollow stroke, bar lines at `white@10%`, beat ticks along the floor. Reads raw events, so the whole grid can redraw per keystroke. `tint` = the lane's part accent.
- **Tags** — `"\(lengthBars) bar · \(role) · \(facets.density) · \(contourArrow) · \(facets.range)"`. Contour arrow is the one thing `Facets` does not yet carry: add `var contour: Contour {rise, fall, arch, flat}` (net direction of the pitch series + peak position; ~12 lines in `LoopStarPhraseFacets.swift`).
- **Provenance** — `pdSource` → amber `⚜` pill showing the text **before the first comma** (a generic string operation, not a content table); `ⓘ` hover popover shows the full prose verbatim, and it is excellent copy ("re-celled from 3/8 to 16ths on a 4/4 grid"). `inspiration` → detail popover only, never on the tile.
- **Rubric** — `LoopStarPhraseComposer.scoreMelody(spec, bars:, pack:)` needs a **compiled** spec, so it is *not* a list-time cost. Shown in the hover popover and on the stage only, as `Hook score 84 · answered leaps, unique peak` / failures verbatim.
- **State dots** — `●` green = installed on that lane now · `▸` amber = auditioning.

---

## 6. AUDITION MODEL

**No hover-audio, ever.** Selection with arrow keys does not audition. A live set must stay usable.

| Gesture | Mode | Behaviour |
|---|---|---|
| Click tile / `▶` / `Space` | **SOLO** | Compile against `conductor.phraseAuditionContext` → `LoopStarChordRenderer.render(progression:bpm:sampleRate:48_000,isPercussion:false)` → `LoopStarPreviewPlayer.shared.playBuffer(buf, id:"loopstar-shelf-audition", loop:true)`. Separate `AVAudioEngine`; the transport is untouched. Clicking the same tile stops. **Only one audition ever sounds** — the node is single-slot. |
| `⌥`-click / `⌥ try` | **TRY IN TRACK** | **Not** an overlay — an overlay from a second engine against a running `LoopStarBarScheduler` will flam. Instead: stop the audition, snapshot the lane's current spec, `installPhrase` (already bar-quantized), and **auto-revert after 8 bars** unless committed. A 24pt amber ribbon runs along the shelf: `Trying "Slap Pop" · reverts in 6 bars · [Keep] [Revert now]`. Disabled when `!conductor.isPlaying` (then `⌥` falls back to SOLO). |
| `Use` / `⏎` / double-click | **INSTALL** | Stops audition, `conductor.installPhrase(id, lane: shelfLane.installKey)`. Exactly today's path. |
| `⌥⏎` / drag onto a slot / `1`,`2`,`3` | **STAGE** | Goes to the stack (§7), no commit. |
| `Esc` / shelf close / `onDisappear` | **STOP ALL** | `LoopStarPreviewPlayer.shared.stop()` + revert any in-flight Try. |

Rendered buffers are cached **LRU-12** keyed by `(phraseID, key.root, key.minor, spansHash, bpm)`, so A/B between two tiles is instant.

---

## 7. MIX / MATCH — the STACK

A 316pt right-hand stage inside the shelf, three slots. Each slot is:

```swift
enum StackSlot: Equatable {
    case empty
    case live                       // whatever is already installed & playing on that lane
    case candidate(String)          // a phrase id
}
```

`.live` is the one that makes the stage honest: you judge a candidate against **reality**, not against silence. Slots default to `.live` when the lane has a part, `.empty` otherwise.

- **🔒 Lock** — a locked slot is excluded from `⟳ Roll the empties`. Lock the bass you love, roll the melody against it.
- **⟳ per slot** — re-roll that lane **within the current filter set**. This is the direct answer to the die-roll complaint: *"Make it new" with a loaded die.* One line: `pool.filter(currentFilter).randomElement(excluding: current)`.
- **▶ Play together** — the only genuinely new audio code, ~40 lines. Compile each `.candidate`; for `.live`, reuse the lane's installed spec. Tile every one to a common bar count (LCM of `lengthBars`, capped at 4), render each to a buffer at the same bpm/sampleRate, then **sum the float channels offline** into one `AVAudioPCMBuffer` (peak-normalise to −1 dBFS), and loop that through the single preview node.
- **Combo read-out** — `LoopStarPhraseFit.combo(...)`: a ring plus one sentence. Neutral onset language (§4.2).
- **Commit** — installs every `.candidate` slot in one pass at the next bar (`.live` slots are no-ops). Then the stage resets to all-`.live`.
- **Save as Song Part** — hands the committed set to the existing Song Parts capture. *Phase 3 stretch, not required.*

```swift
// LoopStarPhraseMix.swift (new, ~60 lines)
enum LoopStarPhraseMix {
    static func sum(_ buffers: [AVAudioPCMBuffer]) -> AVAudioPCMBuffer?
}
```

---

## 8. INTERACTION FLOWS

**A. "I'm staring at an empty Bass card and don't know what to do."**
Empty Bass card now reads `＋ new | ≡ browse`. Click `≡` → shelf opens, BASS tab pre-selected, `Fits here` ON, sorted by Fit, and the BASS tab flashes once. 6 tiles. Click the top one → it auditions solo in the session key over the current chords. `Use`. Total: 3 clicks, zero menus, zero reading.

**B. "Give me something, but not randomly."**
Glance at the FIND row — three cards are already sitting there, already fit-scored, each under the part it fills. Double-click `Fate cell ◕92` under Melody → installed. If it's not it, hover → `⟳` → the next-best within the same filter. This is the whole "alternative to Make it new" requirement satisfied without opening anything.

**C. "Will this hook sit with my bass?"**
In the shelf, `⌥⏎` on a hook → it lands in MEL. BASS is already `.live`. `▶ Play together` → one summed loop. Read-out: `◑74 · locked to the bass on 1 and 3, air on 4`. Lock BASS 🔒, hit `⟳` on MEL three times, listening each time. `Commit`.

**D. "Show me the real tunes."**
`⌘L` → shelf → scope `all 21` → `⚜ famous` toggle → 20 tiles across every genre, each with its `⚜ Bach · 1704` pill. Hover `ⓘ` on the Toccata: the full provenance prose. `⌥ try` puts it in the running track for 8 bars over a trap beat. Keep or let it revert.

---

## 9. BUILD PLAN

Every phase is `[DETERMINISTIC]` — no LLM, no prompts, no wisdom rules. Verify command per phase, per `PHASE_PLANNING_CONVENTION.md`.

### PHASE 1 — index + FIND row + browsable shelf *(ship this alone; it is the whole complaint answered)*

**New files**
- `LoopStar/LoopStarPhraseIndex.swift` (~180 LOC)
  - `struct IndexedPhrase { let phrase; let lane: ShelfLane; let genreID: String; let facets: LoopStarPhraseFacets.Facets }`
  - `enum ShelfLane` (§4.0) — **the single source of truth for lane keys.**
  - `struct PhraseFilter` + `func apply(_:to:) -> [IndexedPhrase]` + `func counts(for:) -> [FacetKey: Int]` (drives per-chip counts and `.disabled(0)`).
  - `actor LoopStarPhraseIndex` — builds once per genre set from `LoopStarPhraseStore.load`, memoized; `invalidate()` chained off `LoopStarPhraseStore.invalidate()`.
  - `func scored(_ lane: ShelfLane, ctx:) -> [(IndexedPhrase, LoopStarPhraseFit.Result)]`, memoized per `fitStamp`.
- `LoopStar/LoopStarFindRowView.swift` (~150 LOC) — the 40pt row, `.task(id: fitStamp)` re-pick, observes `LoopStarPreviewPlayer.playingState` only.
- `LoopStar/LoopStarPhraseShelfView.swift` (~420 LOC) — tab strip, filter bar, tile `ScrollView`, audition, install. Stage panel stubbed to the 20pt spine.

**Edits**
- `LoopStarPhraseFacets.swift` — add `Contour` (+~15 LOC).
- `LoopStarView.swift` — insert `LoopStarFindRowView` after `creativeActionsRow` (`:137`); insert `LoopStarPhraseShelfView` between `:165` and `:166`; `minHeight` → `shelfOpen ? 810 : 660` (`:102`); delete `showHookBrowser` state (`:74`) and its sheet (`:265`); repoint the Style menu item (`:502`) to `shelfOpen = true`; add `⌘L`.
- `LoopStarPartsRackView.swift` — `≡` glyph on populated cards; split empty card into `＋ new | ≡ browse`; new `onBrowse: (ShelfLane) -> Void` closure.

**Delete** `LoopStar/LoopStarHookBrowserView.swift` (285 lines retired).

**Content:** none required. All 361 phrases already carry `name`, `provenance`, `worksOver`, `mode`, `energy`, `role`, `lengthBars`.

**Verify**
```bash
cd mchatai_platform/mchatai_macOS/mChatAI && xcodebuild -project mChatAImac.xcodeproj \
  -scheme mChatAI_macOSApp -configuration Debug build 2>&1 | grep -E "error:|BUILD SUCCEEDED"
# then, after relaunch:
tunnel_send "shelf-001" '{"command":"diagLoopStar","action":"phraseState","genre":"funk","requestID":"shelf-001"}' 20
```
Gate: `loaded: true`, non-empty `hooks/bass/comping`; then **eyeball** — FIND row visible without opening anything, three cards populated, names are the real `name` field (not slug-cased), tabs column-aligned with the part cards.

### PHASE 2 — try-in-track, re-roll, polish
- `LoopStarConductor.swift`: `func tryPhrase(_ id: String, lane: ShelfLane, revertAfterBars: Int = 8) async` — snapshot `lastGeneratedMelodySpec` / `lastGeneratedBassSpec` / `project.chordProgression`, install, arm a `$currentBar` sink, restore unless `keepTryingPhrase()` was called. `@Published var tryingPhrase: (id: String, revertsAtBar: Int)?`.
- `LoopStarPhraseFit.swift`: add `scoreProgression`.
- Shelf: per-chip counts, `⟳` re-roll, PD `ⓘ` popover, rubric in the popover, `Recent` sort (last-20 to `UserDefaults`), full keyboard map, drag-to-resize 150–380.
- **Verify:** `diagLoopStar` `partAction`/`phraseState` before + after a `tryPhrase`, asserting the spec is byte-identical after revert.
- **Optional content PR** (zero rebuild, RULE #1): add `provenance.pdWork` / `pdComposer` / `pdYear` to the ~20 PD phrases so the pill stops relying on the before-first-comma fallback. The binary must keep the fallback.

### PHASE 3 — the stack
- `LoopStar/LoopStarPhraseMix.swift` (new, ~60 LOC): offline buffer sum + normalise.
- `LoopStarPhraseFit.combo(...)`.
- Shelf stage: slots, `.live`, 🔒 lock, `⟳ Roll the empties`, `▶ Play together`, `Commit`.
- **Verify:** by ear only. Per `gotchas_loopstar_diag_meters_dont_render_audio.md`, tunnel meters read 0 even when lanes are playing — **never** claim LoopStar audio works from a diag response.

### Content vs binary (RULE #1)
| Stays content in `mchatai-source/frameworks/loopstar/` | Goes in the binary |
|---|---|
| All 361 phrases, 133 progressions, names, provenance prose, `mode` pins, `worksOver`, `energy`, per-pack `rubric.notesPerBarMin/Max`, `registers`, `styles.json` | Index/filter/sort machinery, fit arithmetic, Canvas rendering, audition plumbing, buffer summing, layout |

Not one genre name, phrase id, composer, year, or density threshold enters Swift. The density bands come from `pack.notesPerBarMin/Max`; the genre list comes from `LoopStarGenreStore.availableStyles()`.

---

## 10. WHAT NOT TO BUILD

1. **A scatter-plot Phrase Map.** ~130 dots cannot be read at 47 results; it needs a second UI to be usable, which proves the point. The FIND row carries the whole "your track is here" idea for 40pt and no new mental model.
2. **A second sheet.** The complaint is *"I'm not sure how I can fit this new stuff in — what is the UI for this."* Any browser behind a button repeats the Style-menu burial with nicer furniture.
3. **Layered live audition over the running transport.** Two `AVAudioEngine`s against `LoopStarBarScheduler` will flam. Install-at-next-bar with auto-revert is the correct live-looping answer.
4. **Hover-audio / audition-on-arrow-key.** Single player node, live set, no.
5. **A `neighbors: []` content field** for "related genres". Cross-genre is already free via the `all 21` scope, and factor 7 already *names* the pull. Do not gate a shipping feature on 21 hand-authored adjacency lists.
6. **Decoder changes.** `name` and `provenance` already decode. The bug is one method in a file being deleted.
7. **A new fit engine, a new thumbnail, or new facet derivation.** Three files, 480 lines, already written and already correct. Consume them.
8. **Saved filter views, favourites, a 15-second live-swap timer.** Scope creep on a discoverability problem. `Recent` (Phase 2) is the only history that earns its keep.
9. **Any LLM in this path.** Fit, facets, contour, rubric and combo are all pure arithmetic over note data — deterministic, instant, explainable in one sentence. That is the entire reason this can be trusted.
10. **New DSP.** Compile, render, install and the rubric all exist. The only new audio code in the whole spec is `LoopStarPhraseMix.sum`.
