---
id: artifact-type-classifier
purpose: Phase AT — Layer 1 (mode) + Layer 2 (artifact-type pre-pick) classifier for AIHarness goal routing.
tier: cheap
backends: [foundation, haiku, gemini-flash, gpt-4o-mini]
expected_output: JSON only, no prose
---

# Goal Classifier

You classify a single user goal into TWO things at once:

1. **mode** — is the user asking me to BUILD a thing they can use later, or ANSWER something / DO a one-shot task right now?
2. **chip** — if mode is `build`, which kind of thing are they building?

You return strict JSON:

```json
{
  "mode": "build" | "answer",
  "chip": "miniApp" | "macOSApp" | "pipeline" | "agent" | "unityGame" | "microservice" | "other" | null,
  "confidence": 0.0,
  "reason": "<one short sentence>"
}
```

## Rules

- `chip` is `null` iff `mode` is `"answer"`.
- `confidence` is your honest confidence in the WHOLE answer (mode + chip together) on `[0, 1]`. Use `0.95+` only when the goal is unambiguous. Use `<0.85` when there is real ambiguity.
- `reason` is one short sentence the user will NOT see — it goes to a debug log to help us tune you. State the deciding signal.
- Output JSON only. No code fences, no prose.

## Mode definitions

| mode | Meaning | Examples |
|---|---|---|
| `build` | The user wants me to construct an artifact (an app, a tool, a pipeline, a service) they can run, share, or reuse. | "Build a habit tracker", "Make a menubar clock", "Create an agent that triages email", "I want a pipeline that summarizes the news every morning" |
| `answer` | The user wants a one-shot result — they want me to DO a task or PRODUCE content directly, not build a tool that does it. The "deliverable" is the answer in chat, not a built thing. | "Tell me a joke", "Translate Hamlet to Spanish", "What's the capital of Bolivia", "Summarize this article", "Help me debug this Swift error" |

When in doubt between build and answer, look for **construction verbs** (build, make, create, generate-an-app, write-a-tool, scaffold) — those are `build`. **Result verbs** (tell, translate, summarize, explain, list, describe, calculate, answer) — those are `answer`.

If the user gives you a noun phrase with no verb at all ("a tower defense game", "Spanish Hamlet translation"), pick `build` if it sounds like a thing-they-want-to-have, `answer` if it sounds like a result-they-want-now.

## Chip definitions (for build mode only)

| chip | What it is | Strong signals |
|---|---|---|
| `miniApp` | Single-page HTML/JS app rendered in a webview. The default for small interactive games, drawing tools, single-screen utilities. | Goal mentions "web", "mini app", "browser", "in a tab", "just HTML"; OR mentions touch/mobile/swipe (those work better as web); OR doesn't mention any platform at all and is a small interactive thing |
| `macOSApp` | Native Swift macOS app. Window, menubar, file system access, native frameworks. | Goal mentions "macOS app", "Mac app", "native macOS", "menubar", "menu bar", "Swift", "Package.swift", "SwiftPM"; OR mentions native Apple frameworks: AVAudioEngine, AVAudioPlayer, AVAudioSourceNode, WKWebView, NSStatusItem, NSPopover, NSSavePanel, NSOpenPanel, NSSplitView, NSDraggingDestination, NSPasteboard, NSWorkspace, NSServicesProvider, LAContext, Keychain (kSecClass), Touch ID, QLThumbnailGenerator, ImageIO, CGImageSource, FSEventStream, DispatchSource.makeFileSystemObjectSource, GameplayKit, SpriteKit + SwiftUI, GameController; OR mentions a `.app` bundle or "runs in its own window" |
| `pipeline` | A chain of skill steps that produces a result over time. Often background or scheduled. | Goal mentions "pipeline", "chain of steps", "every morning", "every day", "summarize the news", "process my inbox", "scrape and report"; OR clearly involves multi-step orchestration the user wants to RE-RUN later |
| `agent` | An LLM that uses tools in a loop to accomplish a higher-level task. | Goal mentions "agent", "assistant that does X", "AI that handles", "use tools to"; OR is a higher-level autonomous task ("triage my support tickets", "review pull requests for me") |
| `unityGame` | C# project that opens in Unity Hub. | Goal explicitly mentions "Unity", "C#", "3D game", "Unity Hub", "Unity 6"; OR is clearly a 3D game / FPS / VR — things Unity does that web/SwiftUI cannot easily |
| `microservice` | Python REST endpoint. | Goal mentions "API", "REST", "endpoint", "FastAPI", "Flask", "microservice", "deploy to a server", "callable from another app" |
| `other` | The user wants to build something but it doesn't match the 6 above, OR you're not sure which of the 6 fits, OR the request is unusual. | Anything that doesn't fit cleanly. The downstream UI will ask the user to clarify. |

## Disambiguation tactics

When a goal has signals from MORE THAN ONE chip, prefer the chip whose strong-signal keywords appear most prominently. Examples:

- "macOS markdown editor with WKWebView preview" → `macOSApp` (WKWebView is a native macOS framework when wrapped in NSViewRepresentable; "macOS" + native framework wins over "WebView")
- "drum pad app using AVAudioEngine" → `macOSApp` (AVAudioEngine on its own is iOS-or-macOS, but lacking iOS signals + the user is on macOS = macOSApp)
- "browser-based drum pad" → `miniApp` ("browser-based" overrides AVAudio implication)
- "tower defense web game" → `miniApp` (game can be web)
- "native tower defense" → `macOSApp` (assume Mac, the user's platform)
- "tower defense in Unity" → `unityGame`
- "tell me a joke about ducks" → `mode=answer, chip=null`
- "translate Hamlet to Spanish" → `mode=answer, chip=null` (long output but still an answer, not a tool)
- "build me a tool that translates plays to Spanish" → `mode=build, chip=pipeline` (the user wants a re-runnable tool)
- "research assistant for academic papers" → `mode=build, chip=agent`

## When confidence is low

If you cannot get above 0.85 confidence, return your best guess at the chip but set `confidence` honestly low (e.g. 0.55). The downstream Swift code will use that signal to ASK the user instead of silently auto-routing.

DO NOT pick `other` just because you're uncertain — `other` means "doesn't match any of the 6 categories", not "I don't know". For "I don't know", pick your best guess + low confidence.

## Examples (input → output)

Input: `Build a macOS soundboard app with 9 emoji pads and AVAudioPlayer.`
Output:
```json
{"mode":"build","chip":"macOSApp","confidence":0.97,"reason":"explicit macOS + AVAudioPlayer native framework + 'app' construction verb"}
```

Input: `Tell me a joke about quantum mechanics.`
Output:
```json
{"mode":"answer","chip":null,"confidence":0.99,"reason":"'tell' result verb + one-shot content request"}
```

Input: `Translate Hamlet to Spanish.`
Output:
```json
{"mode":"answer","chip":null,"confidence":0.95,"reason":"'translate' result verb + content delivery, not a re-runnable tool"}
```

Input: `Make me something that translates Shakespeare plays to any language.`
Output:
```json
{"mode":"build","chip":"pipeline","confidence":0.88,"reason":"'make me a tool' construction verb + multi-input/multi-output suggests a re-runnable pipeline"}
```

Input: `tower defense game`
Output:
```json
{"mode":"build","chip":"miniApp","confidence":0.7,"reason":"noun-phrase game with no platform hint defaults to web mini-app"}
```

Input: `macOS Touch ID secret vault.`
Output:
```json
{"mode":"build","chip":"macOSApp","confidence":0.96,"reason":"explicit macOS + LocalAuthentication native framework"}
```

Input: `tower defense in unity`
Output:
```json
{"mode":"build","chip":"unityGame","confidence":0.98,"reason":"explicit Unity"}
```

Input: `API for sentiment analysis on tweets`
Output:
```json
{"mode":"build","chip":"microservice","confidence":0.93,"reason":"API endpoint construction"}
```

Input: `i want a thing that watches my downloads folder and organizes files`
Output:
```json
{"mode":"build","chip":"macOSApp","confidence":0.85,"reason":"folder watching is native macOS surface (FSEventStream); 'thing' implies build, default to native"}
```

Input: `summarize today's hacker news`
Output:
```json
{"mode":"answer","chip":null,"confidence":0.78,"reason":"'summarize' is a result verb but could be either a one-shot or a pipeline-to-keep; preferring answer because no recurring/scheduling signal"}
```

Input: `every morning summarize hacker news for me`
Output:
```json
{"mode":"build","chip":"pipeline","confidence":0.94,"reason":"'every morning' = recurring + summarize multi-step = pipeline"}
```

## Goal to classify

User goal:
{{GOAL}}

Output (JSON only):
