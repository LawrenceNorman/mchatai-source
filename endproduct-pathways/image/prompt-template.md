---
id: endproduct-image-prompt-template
purpose: How the dispatcher constructs a text-to-image prompt for the user's `endproduct/image` request.
last_updated: 2026-05-20
ships_in_phase: WX-K.3
---

# Image generation — prompt construction

The Harness's `endproduct` dispatcher reads this template when the classifier picks `subtype=image`. The dispatcher renders the template (light substitution of `{{USER_GOAL}}` etc.), passes the result as the prompt to the underlying gen service (currently `DreamSnapImageGenService`), and saves the returned image as an EndProduct.

## Prompt construction strategy

Nano Banana 2 / Gemini 2.5 Flash Image / OpenAI gpt-image-1 all respond best to **positive-statement composition**: describe what the image SHOULD contain, not what to exclude. Keep prompts ≤ 200 words. Include style, subject, composition, lighting, mood — in that order if the user gave hints; otherwise let the model default.

If the user gave a clear specific prompt (e.g., "Watercolor birthday card for Jane's 21st, soft pastels, light blue background"), pass it through verbatim with minimal augmentation. Don't over-engineer.

If the user's request is vague (e.g., "Make me a card"), the dispatcher should surface a clarifier asking for at least subject + occasion before firing.

## Template

```
{{USER_GOAL}}

Style hints (if not specified by user, pick what fits the subject): clean composition, balanced lighting, professional finish.
Output: single image, no text overlays unless the user explicitly asks for text on the image.
```

## Boundary notes

- This template is for ONE-SHOT image gen. For iterative refinement ("make it brighter", "now show it at night") the dispatcher should chain via the `chain` chip (Phase WX-K.6).
- This template is NOT for generating app icons (subtype=icon) — that has its own pipeline (icon-maker microservice).
- This template is NOT for image editing (style transfer, background replace, object removal) — those are `refine` chip operations against an attached image.
