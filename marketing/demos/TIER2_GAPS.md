# Tier-2 Gaps Catalog

Small cross-app affordances that each unlock one or more new demo/marketing scenarios. **No code lives here** — this is the prioritization parking lot. Ship a gap when (a) a scenario you want for marketing depends on it AND (b) the test suite has logged repeated `surfacedBugs` hits against it.

## How this file gets used

- **TM Hub feedback loop:** when scenarios are run via `record-and-narrate.sh`, each scene declares `requires: [<accessibility-label>, …]`. Missing labels become `surfacedBugs` entries in the `tm_runs/<id>` Firestore doc. Run a Cloud Function aggregator periodically and rank gaps by hit count.
- **Prioritization heuristic** (user-stated): *"A gap only ships if shipping it unlocks at least one new demo-able scenario AND that scenario is something we want in marketing."* No speculative refactors.
- **Each entry must say which scenario(s) it unlocks.** If you can't name a scenario that needs it, it doesn't belong here — file it as a regular product idea instead.

Effort scale: **S** ≤ half day · **M** ≤ 2 days · **L** > 2 days.

---

## Gap 1 — Long-press AI menu on Chat assistant bubble  ·  Effort: M
**Current:** Chat assistant messages are plain markdown. Long-press surfaces the iOS default copy/share menu.
**Gap:** Add a custom `.contextMenu` (or long-press handler) with "Open in AI Write", "Open in AI ToDo", "Open in Calendar". Tapping pre-loads the bubble's text into a new doc / task list / event note prompt.
**Unlocks:**
- Recipe → Shopping List (user's "tell me how to make Pho → Open in ToDos → Extract a shopping list" example)
- Research Q&A → AI Write doc
- Code snippet → save to Notes/Write
- Plan/Itinerary → Calendar event drafts
**Pointer:** Chat assistant message renderer (likely `mchatai/mChatAI/mChatAI/Chat/Components/MessageBubbleView.swift` or equivalent — confirm on impl). New helper to dispatch `.navigateToApplet` with seed-text payload.

## Gap 2 — Tappable Perplexity citation links  ·  Effort: S–M
**Current:** Perplexity Sonar responses include `[1]` `[2]` footnote markers and a `citations[]` array, but the markers render as plain text. User has to copy-paste URLs from the response.
**Gap:** Provider-specific post-processor: parse `[N]` markers, look up the matching URL in `citations[]`, render as a tappable link that opens **Web AI** with the URL pre-loaded.
**Unlocks:** **AI Research → Podcast** (the user's original walkthrough scenario — Chat → tap citation → WebAI → AI Write → Export as Audio → Podcasts).
**Pointer:** Chat assistant message markdown renderer + `Chat/ChatViewModel+ProviderResponses.swift` (confirm path on impl) to preserve `citations[]` in the rendered Message model.

## Gap 3 — Web AI "Open in AI Write" CTA after Save  ·  Effort: S
**Current:** WebAI summary view has a "Save to AI Write" button. After tapping, the action completes with a toast but doesn't surface a follow-up tap target to navigate to the new doc.
**Gap:** After save succeeds, surface an inline "Saved · Open in AI Write →" non-blocking confirmation that navigates via the existing `.navigateToApplet` notification (same pattern as `WritingEditorView.swift:1402-1406`).
**Unlocks:** Research → Notes → Audio workflow (extends the AI Research scenario from Gap 2).
**Pointer:** `mchatai/mChatAI/mChatAI/AIWeb/WebAIView.swift` (summary view section).

## Gap 4 — AI News "Send to AI Write"  ·  Effort: S
**Current:** Each AINews article has a system Share Sheet (`AINewsMainView.swift:290`). No direct in-app handoff to AIWrite.
**Gap:** Add a single-article "Send to AI Write" button + multi-select mode with "Combine N articles into a brief" that pre-loads AI Write with the assembled text.
**Unlocks:**
- Morning Brief scenario (multi-article → AI Write → Export as Audio → Podcasts)
- Daily Podcast Series scenario (single article + commentary → audio)
**Pointer:** `mchatai/mChatAI/mChatAI/AINews/AINewsMainView.swift` + `AINewsDetailView.swift`.

## Gap 5 — AI Reader highlight → "Add to AI Write"  ·  Effort: S
**Current:** AIReader has an AI Actions menu on highlight (Summarize, etc.) at `AIReaderDetailView.swift`.
**Gap:** Add an "Add to AI Write" menu item next to existing AI Actions. Tapping appends the highlight (with chapter citation) to a "Quote Collection" doc or a user-chosen existing doc.
**Unlocks:** Quote Collection workflow, study workflows (highlights → flashcards once Gap 7 ships).
**Pointer:** `mchatai/mChatAI/mChatAI/AIReader/AIReaderDetailView.swift`.

## Gap 6 — DreamSnap → "Use in AI Write / Caption with AI / Publish to Hub"  ·  Effort: M
**Current:** DreamSnap generates images but has no in-app handoff to other apps. Photos stay in DreamSnap library.
**Gap:** Action sheet on a generated image: "Use in AI Write" (creates a doc with image embedded), "Caption with AI" (round-trips through Chat for a caption then back into AI Write), "Publish to Hub" (one-step playable card publish).
**Unlocks:**
- Photo Story → Hub playable card scenario
- Captioned image marketing-content workflow
**Pointer:** `mchatai/mChatAI/mChatAI/DreamSnap/` — find the generated-image detail view.

## Gap 7 — Quiznect ← AI Write flashcard import  ·  Effort: M
**Current:** Quiznect generates quizzes from a topic prompt. No import from existing structured content.
**Gap:** AI Write doc → "Send as Quiznect quiz" button. AI Write parses doc structure (or asks LLM to extract Q&A pairs), Quiznect imports as a custom quiz.
**Unlocks:** Study Sprint scenario (AIWikipedia → AIWrite → flashcards → Quiznect → Chat explains wrong answers).
**Pointer:** `mchatai/mChatAI/mChatAI/Quiznect/QuiznectMainView.swift` (import path) + AI Write export-as menu.

## Gap 8 — Calendar event → AI Write notes  ·  Effort: S
**Current:** Calendar shows agenda but no handoff to AI Write for event notes/prep.
**Gap:** On an event detail view, add "Take notes in AI Write" — creates a doc titled `<event title> — <date>` and pre-loads with event metadata + attendee list.
**Unlocks:**
- Meeting Prep scenario
- Trip Journal scenario (multi-day events become a journal series)
**Pointer:** `mchatai/mChatAI/mChatAI/AICalendar/AICalendarMainView.swift` + event detail view.

## Gap 9 — Health → Chat context drop-in  ·  Effort: M
**Current:** Health tab shows step trends + workouts but doesn't surface as Chat context.
**Gap:** On a Health summary card, add "Ask Chat about this" — passes the relevant time-window summary (steps / sleep / workouts) as a system message into a new Chat session.
**Unlocks:**
- Workout Plan scenario ("design a 3-day push for someone at 8k steps/day baseline")
- "Ask about my data" scenarios
**Pointer:** `mchatai/mChatAI/mChatAI/HealthFitness/HealthFitnessTabView.swift`.

## Gap 10 — HandsFree → AI Write transcript save  ·  Effort: S
**Current:** HandsFree captures voice conversations in-session, can replay, but has no direct "save to AI Write" handoff.
**Gap:** End-of-session button "Save transcript to AI Write" — formats the conversation as a journal entry and opens AI Write with it preloaded.
**Unlocks:** Voice Journal scenario (HandsFree ramble → journal → Export as Audio → Podcasts daily).
**Pointer:** `mchatai/mChatAI/mChatAI/HandsFreeChatView.swift`.

## Gap 11 — Standardized cross-app "Open in…" action sheet (foundational)  ·  Effort: L
**Current:** Each cross-app handoff above is bespoke. Different patterns per source app.
**Gap:** One shared SwiftUI component `OpenInActionSheet(payload: CrossAppPayload, eligible: [Applet])` that any app can present. Standardizes the payload (text / image / url / event), the destination list, the navigation dispatch (`.navigateToApplet` notification + payload), and the destination side's `HubImportRouter`-style pickup.
**Unlocks:** Foundational — turns Gaps 1, 3, 4, 5, 6, 8, 10 from 10 one-off implementations into 1 reusable pattern. After this lands, adding a new "X → Y" handoff is ~30 minutes.
**Pointer:** New file `mchatai/mChatAI/mChatAI/Shared/OpenInActionSheet.swift`. Existing `HubImportRouter.shared.pendingAudioTrack` pattern (see `WritingEditorView.swift:1397`) is the prior art for receive-side staging.

---

## Suggested ship order (when you decide to start drawing from this list)

1. **Gap 11** first if you'll do 3+ of the others — the per-gap cost drops dramatically once the action sheet exists.
2. **Gap 3** (WebAI → AIWrite) — smallest gap, unlocks the most immediate marketing scenario when paired with Gap 2.
3. **Gap 2** (Perplexity citations) — unlocks the user's exemplar AI Research scenario.
4. **Gap 1** (Chat long-press AI menu) — single biggest scenario unlock count, but bigger lift.
5. Remaining gaps as scenarios prioritize them.

## Out of scope for this catalog

These are real product needs but don't drive demo scenarios, so they go elsewhere (CHANGELOG / roadmap / issue tracker), not here:
- Bug fixes to existing single-app features
- Performance / accessibility improvements
- New stand-alone apps (e.g., a new home tile)
- Backend / infrastructure work

This catalog is strictly *cross-app affordances that gate a marketing scenario*.
