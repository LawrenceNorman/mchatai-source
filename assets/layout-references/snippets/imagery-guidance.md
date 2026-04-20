# Imagery Guidance (Phase DF)

Companion to wisdom rules `fs-009` (imagery standards) and `fs-010` (visual anchor required). This file expands each rule with concrete examples. The wisdom pack keeps each rule short; this file is the *long form* the generator can consult when making an image-vs-gradient decision.

---

## Rule 1 — Prefer in-situ photography over abstract gradients

**The rule:** a hero image should do narrative work. Show the product in an environment, show a person using it, show the place the product takes you. Abstract gradients + 3D blobs + generic geometric shapes do zero narrative work — they are a *safe default* that LLMs reach for, and they consistently produce forgettable output.

**BAD:**

- Purple-to-pink gradient background with three floating 3D spheres and a centered "Get Started" button
- Full-screen noise texture + a gradient blob + a centered signup form
- A stock illustration of "person at laptop looking happy" (generic, no brand)

**GOOD:**

- A habit-tracker app: photograph of someone checking off a habit at a kitchen counter with a coffee cup in frame
- A developer tool: photograph of two engineers at a whiteboard, laptop open with the product in the frame but not the subject
- A travel-booking app: a wide photograph of the destination type the user is booking, not of the app UI

**When abstract IS okay:** brand systems that are genuinely abstract by identity (Linear, Stripe, Vercel), where the geometry IS the brand. If you cannot articulate *why* the abstract hero is the brand identity, use a photograph instead.

---

## Rule 2 — Hero images must have stable tonal areas for text overlay

**The rule:** when text overlays an image, the image must have a region of uniform tonality (light or dark) where the text can sit. Overlaying a headline on a busy area (a face, detailed pattern, text inside the image) is unreadable.

**BAD:**

- Headline centered over a photo of a crowd, busy cityscape, or a face
- Headline over a photo with a gradient overlay added as a bandaid — a weak layout trying to save a bad image choice

**GOOD:**

- Headline in the left third over an out-of-focus wall or sky; right two thirds hold the subject
- Headline at the top over a blurred upper band (composition-first, not filter-first)
- Image chosen *because* it has a negative-space region exactly where the headline goes

**Workflow:** when you choose / generate a hero image, first decide where the text will overlay, then crop/pick so that region is tonally stable. Do not crop blindly and then add a `bg-black/50 absolute inset-0` patch on top.

---

## Rule 3 — No embedded UI / signage / device chrome inside source images

**The rule:** the image should not itself contain a UI frame, a device mockup, fake browser chrome, embedded signage, or a watermark. Nested UI-in-UI looks unprofessional and distracts from the real UI.

**BAD:**

- Hero image is a laptop mockup with a screenshot of the product pasted inside it — UI frame fights real UI
- Photograph of a phone held in a hand with a mockup of the app on the screen
- Stock image with a visible watermark, logo, or news-graphic lower-third

**GOOD:**

- Photograph of the laptop from the side — screen not visible or out of focus
- Photograph of the product's packaging on a counter (physical context)
- Full-bleed photograph of the environment the product operates in (kitchen, workshop, desk) with no embedded screens

**Exception:** product-feature screenshots on a dedicated "how it works" section can show real UI. The *hero* cannot.

---

## Rule 4 — The first viewport must have a real visual anchor

**The rule:** decorative texture alone does not count as a visual anchor. A visual anchor is a *dominant thing* — an image, an illustration at large scale, a real photograph, or a distinctive primary element of the product itself (e.g. an oversized input if the product is a writing tool). Subtle noise, gradient mesh, faint grid pattern — none of these anchor the page.

**BAD:**

- Hero: centered H1 + subhead + CTA over a gradient mesh. No anchor, feels like a splash screen
- Hero: same but with "noise" SVG background. Same problem
- Hero: same but with a thin 1px border grid pattern. Still no anchor

**GOOD:**

- Hero: full-bleed photograph of the product in its context; headline overlays the stable tonal area
- Hero: large product illustration tied to the brand, offset to one side (60% width), with text on the other side
- Hero: oversized primary input (if the product is a writing/search/chat tool) sitting at the visual center, filled with sample content that demonstrates what the product does

**Test:** squint at your hero. What's the biggest, boldest element on the page? If the answer is "the headline" and nothing else, add an anchor. If the answer is "a background gradient", you have no anchor.

---

## Quick checklist before committing a hero

- [ ] Is there a dominant visual anchor (image / illustration / product element)?
- [ ] Does the anchor do narrative work (or is it decorative)?
- [ ] If text overlays the image, is the overlay region tonally stable?
- [ ] Is the image free of embedded UI, device chrome, and watermarks?
- [ ] Would the hero still read as strong if the gradient/shadow/noise layer were removed? (fs-011)

If any answer is no, fix the hero before shipping.
