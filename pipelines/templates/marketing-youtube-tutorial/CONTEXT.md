---
artifact:
  type: pipeline
  id: official.pipeline.marketing-youtube-tutorial
  name: Marketing YouTube Tutorial
  version: 1.0.0
  created_by: mchatai-labs
  created_at: 2026-05-24
  updated_at: 2026-05-24

purpose:
  summary: Plan and voice a complete YouTube tutorial video (script, storyboard, thumbnail concept, description, tags, chapters, TTS narration audio) from a topic.
  problem_solved: The marketing machine needs 2 tutorial videos per week for the 5-Minute Builds playlist. Lawrence has 1 hour/day. This pipeline does the planning and the voiceover; Lawrence does the screen recording in the morning hour and stitches in his editor.
  intended_users: mChatAI marketing operator; reusable as a template for any solo creator building tutorial-style videos.

architecture:
  language: json
  frameworks: [pipeline-engine]
  platform: mchatai-plus
  has_ui: false
  requires_auth: false

dependencies:
  external_apis: []
  internal_services: [builtin.llmGenerate, builtin.ttsGenerate, builtin.saveArtifact]
  consumed_by: [custom.youtube-upload, custom.imagegen]
  storage: artifacts

development:
  main_file: pipeline.json
  config_file: manifest.json
  entry_points: [steps[0].config.userPrompt, steps[2].config.userPrompt]
  build_command: none
  test_command: "tunnel runPipeline 'Marketing YouTube Tutorial' --input 'Build a Wordle clone in 90 seconds with mChatAI'"
  deploy_command: "refreshMchataisourceCache in mChatAI+"

tags: [marketing, youtube, video, tutorial, marketing-machine]
---

## What This Does

Five sequential steps:

1. LLM produces ONE structured markdown plan with 8 sections: Title, Hook, Storyboard (8-14 scenes with timestamps + on-screen + says + overlay), Full Narration Script (600-1000 words), Thumbnail Concept, Description (YouTube field), Tags, Chapters.
2. Saves the plan as a markdown artifact.
3. LLM extracts the script section and converts it to TTS-friendly spoken text (no markdown, no headings, no scene numbers; spells out URLs and abbreviations).
4. TTS generates the voiceover audio.
5. Saves audio as a separate artifact.

Two outputs per run: the planning markdown + the narration audio.

## What This Does NOT Do (deliberately, for v1)

- **Screen recording.** `builtin.screenCapture` exists, but choreographed UI walk-throughs require Lawrence to be at the keyboard. The pipeline gives him a precise scene-by-scene script to follow.
- **Video stitching.** Combining screen recording + voiceover into a final MP4 needs a `video-stitcher` microservice (Phase MM-3.5).
- **Thumbnail generation.** The pipeline produces a thumbnail CONCEPT (visual brief + text overlay). Feed that into the `custom.imagegen` skill to actually generate the image.
- **YouTube upload.** Use `custom.youtube-upload` (Phase MM-1) with the plan's Title, Description, Tags, and Chapters fields after the final video is stitched.

## How To Use (v1 workflow)

1. Run via AI Automation > Marketing YouTube Tutorial, or via tunnel:
   ```
   {"command":"runPipeline","pipelineName":"Marketing YouTube Tutorial","input":"<topic, e.g. Build a Wordle clone in 90 seconds with mChatAI>","requestID":"yt-001"}
   ```
2. Open the planning markdown. Adjust the storyboard to match what mChatAI actually looks like today; the LLM can drift on UI specifics.
3. Open the narration audio. If a pronunciation is wrong, edit the script section (spell phonetically) and re-run.
4. Record the screen yourself. Use the storyboard as a shot list. QuickTime (`Cmd-Shift-5`) is fine for v1; the artifact filenames make it easy to assemble later.
5. (Optional) Run `custom.imagegen` on the Thumbnail Concept block to get the actual thumbnail PNG.
6. Stitch in your editor of choice (Final Cut, Resolve, CapCut). Export 1920x1080, H.264, AAC audio.
7. Upload via `custom.youtube-upload` with the Title / Description / Tags / Chapters from the plan.

## How to Continue Building This

- **video-stitcher microservice**: Phase MM-3.5. Takes screen recording + voiceover + optional intro/outro and outputs a finished MP4. Would let this pipeline become end-to-end automated.
- **Per-scene screen capture**: For a fully automated path, add `builtin.screenCapture` steps interleaved with `builtin.shortcutsSkill` triggers that drive mChatAI through the storyboard moments. Brittle but possible.
- **Auto-thumbnail step**: Append a `custom.imagegen` step that takes the Thumbnail Concept and generates the PNG, then a save step.
- **Auto-upload step**: Append a `custom.youtube-upload` step (action=initiateUpload) that parses the plan's metadata. Plumbing the upload URL into the byte-upload step still requires the video-stitcher microservice.

### Critical Entry Points

- **`steps[0].config.userPrompt`** — the master prompt. The section headings and storyboard row format are load-bearing for downstream extraction. Don't change without updating step 2.
- **`steps[2].config.userPrompt`** — script extraction + TTS conversion. The "spell out URLs / abbreviations" rules are load-bearing for TTS quality.
- **`steps[3].config`** — empty by design; TTS skill picks the configured provider.

### Key Concepts

- **One LLM call for the whole plan.** Splitting Title/Hook/Storyboard/etc. into separate LLM calls would cost more tokens and lose internal consistency (storyboard scene numbers must match script paragraphs). One call keeps the plan coherent.
- **ASCII-only enforcement** (see [[gotchas_swift_decoder_non_ascii_strings]]).
- **No publish step.** Per [[project_marketing_machine_direction]] hybrid-voice contract, Lawrence ships in his morning hour.

## Testing

Input: `"Build a snake game in 60 seconds using mChatAI's AIWizard"`.
Expect: markdown plan with 8 sections, valid storyboard rows (timestamp + on-screen + says + overlay), 600-1000 word script, plus a ~5-min audio file. Runtime: 2-4 minutes including TTS.

## Known Limitations

- **UI drift**: LLM may describe mChatAI surfaces that have moved or been renamed. Storyboard accuracy is your job to verify before recording.
- **TTS prosody**: Long instructional passages can sound monotone. Break into shorter paragraphs in the script section if it bothers you.
- **No B-roll suggestions**: Future enhancement: add a "B-Roll Moments" section that lists 3-5 visual cutaways (whiteboard sketches, terminal commands, photos of the Mac).
