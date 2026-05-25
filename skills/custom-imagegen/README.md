# Image Generation Skill

Generate images via Replicate. Model-agnostic — defaults to **flux-schnell** (fast + cheap, ~1-3s per image), but accepts any model owner/name pair or specific version hash. Returns CDN-hosted image URLs.

Per platform convention ([memory: feedback_expose_all_models](../../../.claude/projects/-Users-lawrencenorman-mystuff-src-mchatai-platform/memory/feedback_expose_all_models.md)) — don't curate the model list. Pass whatever the user wants; filter at the picker, not the catalog.

## Setup

1. Create a Replicate account + API token at https://replicate.com/account/api-tokens.
2. Save under Keychain `ExtAPI_replicate_apiKey`.
3. Free tier: limited free runs per month + a few free fast models. Beyond that, pay-per-prediction (typically $0.0001-$0.05 per image depending on model).

## Config

| Key | Type | Description |
|---|---|---|
| `prompt` | string | **Required.** Falls back to pipeline input text. |
| `model` | string | `owner/name` (e.g. `stability-ai/sdxl`, `black-forest-labs/flux-schnell`). Uses latest version. Default: `black-forest-labs/flux-schnell`. |
| `version` | string | Specific version hash (overrides `model`; pins to that exact version). |
| `negativePrompt` / `negative_prompt` | string | Anti-prompt for models that support it (SDXL, SD3). Many newer models (flux) ignore this. |
| `width` / `height` | int | Output dimensions, model-permitting. |
| `aspectRatio` / `aspect_ratio` | string | E.g. `16:9`, `1:1`, `4:3` (flux family supports this). |
| `numOutputs` / `num_outputs` | int | How many images. Default 1. |
| `seed` | int | Reproducibility. |
| `steps` / `num_inference_steps` | int | Inference steps. Flux-schnell needs only 4; SDXL ~25-50. |
| `guidance` / `guidance_scale` | float | Prompt-adherence strength. |
| `outputFormat` / `output_format` | string | `webp`, `png`, `jpg` (model-dependent). |
| `input` | JSON object | Raw input passed to the model. Layered under (and overridden by) the convenience keys above. Use for model-specific params not exposed here. |
| `maxWaitSeconds` | int | Synchronous-wait window. Default 60 (max). If the model takes longer, the skill returns the polling URL. |
| `apiKey` | string | Override Keychain credential. |
| `dryRun` | boolean | Validate inputs, no API call. |

## Output

- Success (sync): `Generated N image(s) (X.YYs predict):\n<url1>\n<url2>…`
  - URLs are Replicate CDN — typically expire after ~24h. Re-host (e.g., copy to GCS) for durable use.
- Still processing: `Image generation in progress (status=processing, id=<id>). Poll: <polling-url>`
- Failure: structured error with the model's failure detail when available.

## Examples

Blog post hero image (default flux-schnell, 16:9):
```json
{"command":"runSkill","skillID":"custom.imagegen","config":{"prompt":"flat illustration of a person at a Mac, neon retro aesthetic, sunset palette","aspectRatio":"16:9","outputFormat":"webp"},"requestID":"img-001"}
```

OG card (square, exact dimensions):
```json
{"command":"runSkill","skillID":"custom.imagegen","config":{"prompt":"abstract geometric pattern, vector-noir style, white text overlay area on the right","width":1200,"height":630,"model":"black-forest-labs/flux-schnell"},"requestID":"img-002"}
```

Pinned version + custom input keys:
```json
{"command":"runSkill","skillID":"custom.imagegen","config":{"prompt":"isometric voxel game scene with player character","version":"39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b","input":"{\"refine\":\"expert_ensemble_refiner\",\"high_noise_frac\":0.8}"},"requestID":"img-003"}
```

Dry run:
```json
{"command":"runSkill","skillID":"custom.imagegen","config":{"prompt":"test","dryRun":true},"requestID":"img-004"}
```

## Notes

- **CDN URL expiry.** Replicate's image URLs are temporary (~24h). For durable use (blog images, OG cards), pipe the output into a download + upload-to-GCS step.
- **Async fallback.** If a model takes >60s, the skill returns a polling URL. Build a `replicate-poll` sibling skill or let the calling pipeline retry the prediction GET.
- **Model schema discovery.** Every Replicate model has a JSON schema at `https://api.replicate.com/v1/models/{owner}/{name}` describing valid input keys. Use this to inform `config.input` for esoteric models.
- **Cost.** flux-schnell is essentially free at low volume. Heavier models (SD3 Ultra, SDXL with refiner) can run $0.01-$0.10/image. The marketing machine pipelines should default to flux-schnell unless art direction explicitly demands otherwise.
- **Safety filtering.** Replicate applies the model's safety filter by default. Some models support `disable_safety_checker: true` in `config.input` — use carefully.
