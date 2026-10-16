# TouchLanguage content

Everything the TouchLanguage applet *is* lives here: who the tutors are, what a level
means, how a mode behaves, the prompts, the speech ladder per language, and the
word lists. The iOS applet (`mchatai/mChatAI/mChatAI/TouchLanguage/`) fetches these
files from this repo at runtime (ETag-conditional, cached, with frozen
`_fallback_only` copies bundled for an offline first launch). A change here ships
with zero rebuild once it is pushed to `main`; a phone never sees an unpushed edit.

Design: `mchatai_macOS/docs/TOUCHLANGUAGE_ARCHITECTURE.md` (Phase TL).

| File | What |
|---|---|
| `personas.json` | Tutors: name, language, locale (sets the recogniser and the voice), region, a few lines of who they are, an opening line |
| `levels.json` | Novice / Intermediate / Advanced: patience (end-of-speech seconds), sentence cap, speaking rate, vocabulary band, correction style, the prompt instruction |
| `modes.json` | Chat, Story time, Word lab: the prompt block each adds and how the first turn starts |
| `prompts/*.md` | The tutor system prompt, the per-turn user template, the mode blocks, the feedback card, translation. Placeholders are `{{name}}`; the allowed set is in `tools/check.py` |
| `strings.json` | Short spoken lines per language (didn't catch that, took too long, the native-language note) |
| `speech.json` | ASR and TTS ladders per language, in the shape `SPEECH_HARNESS_SPEC.md` (Phase VH) proposes. Cloud model ids live here |
| `jobs.json` | The three AI jobs (turn, feedback, translate) in the `content/ai-jobs/jobs.json` shape. iOS-only; they move into `content/ai-jobs/` once the Mac loader filters by platform |
| `wordlists/<lang>/` | Word lists the Word lab draws from. `wordlists/README.md` has provenance |
| `tools/check.py` | `python3 touchlanguage/tools/check.py` validates all of the above |

## Adding a language pair

1. `speech.json`: add the language with its locales, the default locale, and the two
   ladders. Only locales the device can recognise on-device belong in `locales`
   (`SpeechTranscriber.supportedLocales` lists 30 on iOS 26).
2. `strings.json`: the spoken lines in that language.
3. `personas.json`: at least one persona per locale.
4. `wordlists/<lang>/common-1000.csv` (`rank,word,translation`) if Word lab should work.
5. Run `tools/check.py`, push.

## Adding a persona

One object in `personas.json`. `locale` must be in that language's `locales`.
`voiceName` is a hint (an Apple voice name such as "Paulina"); the app falls back
to the best installed voice for the locale. Keep `details` to two or three lines:
it is pasted into the system prompt.

## Rules

- Nothing in this folder names a product other than mChatAI and TouchLanguage.
- Prompts are spoken aloud: no markdown, lists or emoji in anything the tutor says.
- The learner's words come from speech recognition: prompts must never treat a
  recognition slip as a mistake.
