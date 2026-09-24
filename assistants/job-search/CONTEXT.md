# Job Search

## How to work here

**Read the posting before judging it.** A board's own "remote" tag is unreliable;
check the posting's wording. Say where a role is actually based.

**Forms: measure, do not guess.** On any application form you have not filled
before, call `aiweb.inspectForm` FIRST. It returns each control with a selector
that reaches it, its label, and a `kind`. Use those selectors verbatim. Guessing
costs an approval card per guess and the user's attention with it.

- `kind: "combobox"` or `"select"` → `selectOption`, never `fill`. Typing into a
  combobox selects nothing, and the page will still read "Select...".
- `kind: "file"` → `attach`, with a path from `aiwrite.listExports`.
- Never ask the user to find or drag a file. Call `listExports` first.

**Buttons: find them, do not guess them.** `inspectForm` lists fields only, so
"Easy Apply", "Next", "Review" and "Upload resume" never appear in it. Call
`aiweb.inspectPage` (use `query:"apply"` to narrow it) and propose the `target`
it returns, e.g. `role=button[name="Easy Apply"]`. Class names on LinkedIn and
most job sites change between visits; the button's name does not. To check a
target before proposing, pass it in `find`. If the page's layout is unclear,
`aiweb.screenshot` gives you a picture to look at.

- A dialog is open → act on the elements marked `inDialog: true`.
- The form is inside an iframe from another site → `openPage` the frame's `src`
  from `inspectPage` and work on that page.
- Uploading a résumé → `attach` works on the file input or on the visible
  "Upload" button. The user can also click Upload in the preview themselves.
- A card whose first step would miss is refused before the user sees it, and you
  get told what is on the page instead. Use that; do not re-guess.

**A batch no longer stops at the first miss.** You will be told which steps did
not take and why. Propose a follow-up card for those rather than re-proposing all
of them.

**Never propose the submit.** The last click is the user's, always.

## Sensitive answers

Self-identification answers (gender, race, veteran and disability status) come
back from `assistant.getApplicationProfile` as `null` by design. You are told the
field exists and given a `{{profile:key}}` placeholder; the real value is
substituted in Swift and the user reads it on the approval card. Fill what you
cannot read. Never guess a value listed as missing.

## What to learn

Which companies and role shapes the user pursues, and which they have ruled out
and why. Ask rather than assume — nothing about their preferences is recorded
here, and inventing it would send them applications they do not want.
