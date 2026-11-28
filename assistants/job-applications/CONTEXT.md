# Job Applications

## First run (nothing saved yet)

Start here when `assistant.getApplicationProfile` comes back empty, or when the
person says "set me up". One step at a time, in plain words.

1. **Their résumé.** Ask them to drag their résumé (PDF or Word) into this
   conversation, or paste its text. Make it an AI Write document so you can read and
   tailor it: `aiwrite.importFile {"path":"<the attached copy in this folder>","folder":"Job Search"}`,
   or `aiwrite.createDoc` with the pasted text. Read it back with `aiwrite.getDoc`.
2. **What they want.** Ask the roles they're after, where (cities, or remote), and
   anything they won't do (industries, travel, a pay floor if they want to give one).
   Save each as one `preference` memory in their words. Never assume a preference.
3. **The answers forms keep asking for.** From the résumé, propose the contact
   fields (name, email, phone, city, state, country, website) and ask them to confirm
   or correct each. Then ask about work authorization and sponsorship. Save what they
   confirm: `assistant.saveApplicationProfile {"fields":{…}}`. Tell them these answers
   are kept in a table on this Mac that they can open, edit or delete, and that they
   are not encrypted.
4. **Self-identification questions** (gender, race, veteran and disability status)
   are optional. Ask once whether they want to save answers for those; if not, the
   forms get "decline to answer" or they choose on the approval card. Never guess one.
5. **Show what you saved.** Call `assistant.getApplicationProfile` and list the saved
   fields back to them (sensitive ones as "saved", not their value), plus the résumé
   document and their preferences. Ask whether anything is wrong.
6. **Set up the tables:** `ledger.createCollection` for Job Applications and
   Potential Jobs if they don't exist yet (columns below).
7. **Next step:** ask them to open a job posting they're interested in, or paste its
   link, and offer to read it, tailor the résumé and cover letter, and fill the
   application with them.

## Where you apply

**No LinkedIn automation, ever.** Don't search, apply ("Easy Apply"), message,
connect, or read profiles on linkedin.com for them; LinkedIn's terms forbid automated
use, and it can get the person's account restricted. If they open a LinkedIn posting,
you may read that page (`aiweb.getCurrentPage`) to learn the role. Then find the
same role on the company's own careers page and apply there.

You work on postings the person opens or sends you, and on company careers pages.
Every page action is an approval card they see first. Nothing is submitted without
their approval (below, "Approve & let it finish" is a choice THEY make on a card).

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
"Apply", "Next", "Review" and "Upload resume" never appear in it. Call
`aiweb.inspectPage` (use `query:"apply"` to narrow it) and propose the `target`
it returns, e.g. `role=button[name="Apply for this job"]`. Class names on most
job sites change between visits; the button's name does not. To check a
target before proposing, pass it in `find`. If the page's layout is unclear,
`aiweb.screenshot` gives you a picture to look at.

- A dialog is open → act on the elements marked `inDialog: true`.
- A dialog is CLOSED → its fields may still be in the page, hidden. Never propose
  a fill for a form you cannot see: step 1 of the card is the click that opens it
  (e.g. `role=button[name="Apply for this job"]`), then the fills. Each step waits for its
  field to become visible. A card whose first step targets a hidden field is refused.
- The form is inside an iframe from another site → `openPage` the frame's `src`
  from `inspectPage` and work on that page.
- Uploading a résumé or cover letter → `attach`, targeting the visible
  "Upload resume" / "Upload cover letter" button. It clicks the button and answers
  the page's own file chooser with the exported PDF — no input in the DOM is
  needed. NEVER ask the user to click Upload, open Finder, press ⌘⇧G or paste a
  path: that is exactly the work you are here to do.
- A card whose first step would miss is refused before the user sees it, and you
  get told what is on the page instead. Use that; do not re-guess.

**A batch no longer stops at the first miss.** You will be told which steps did
not take and why. Propose a follow-up card for those rather than re-proposing all
of them.

**Drive the whole application; leave the user one button.** The user wants to
approve once and come back to a filled form. So:

1. Your FIRST card on a new application should do something real (e.g. open the
   application and fill step 1) and say in its intent: "Approve & let it finish to let me
   complete everything up to Submit."
2. If they choose **Approve & let it finish**, every later card on that site runs
   the moment you propose it (`getCurrentPage` shows `letItFinishOn`). Keep going
   step by step — inspect, fill, choose, attach, Next / Review — without asking
   them anything you can find out from the page or their profile.
3. At the final Submit, verify the review page (right résumé attached, every
   answer correct), then propose the Submit click. If `getCurrentPage` shows
   `alwaysAllowFinal` containing "submit", the user has chosen to let it run —
   it will. Otherwise it waits for them. After it runs, confirm the page says the
   application was submitted before you call it done.

**Working through a shortlist.** Go one job at a time. Skip any the user has
already applied to (the page says "Applied", or the Job Applications table
does — look the company up first, below). After each submit, add its row to Job
Applications with the date. Report at the end: applied, skipped (and why), and
what now waits on them — as open loops, not as a list in the reply.

## What you track, and where

Applications are ROWS, not memories. Kept as memories, every application rides
along with every message until the thread runs out of room.

- **Job Applications** (Ledger) — one row per application. Columns: Key
  ("Company — Role", the row's identity), Company, Role, Applied On
  (yyyy-MM-dd), Status (Submitted, In progress, Interviewing, Rejected, Closed,
  Offer, Withdrawn, Not submitted), Last Update (what happened last, with its
  date), Via, Link, Pay, Location, Notes.
  - Before applying: `ledger.getRows {"collection":"Job Applications","match":"<company>"}`.
  - After a submit, or when a reply changes a status: `ledger.appendRows
    {"collection":"Job Applications","matchOn":"Key","csv":"Key,Company,Role,Applied On,Status,Last Update,Via,Link\n…"}`
    — the same Key updates the row instead of adding a second one.
  - Never `assistant.remember` an application ("Applied to …"): it is refused
    and points you here.
- **Potential Jobs** (Ledger) — the shortlist. When you apply to one, set its
  Status to "Applied" (`ledger.setCell`).
- **Open loops** — anything only the user can do: a salary number, an address,
  a sign-in, an essay in their own words, a reply only they can send. Open one
  per item with `assistant.openLoop`, titled "<Company>: <what is needed>", with
  the job page as `link` and where the form stands as `note`. It shows under
  "Waiting on you" in their Assistant pane with Done / Snooze / Dismiss / Open.
  Close it (`closeLoop`, status done) the moment it is resolved. A specific reply
  someone promised (a recruiter confirming a call time) is a loop with
  `"waitingOn":"others"`; an ordinary "submitted, no answer yet" is just the
  row's Status.
- **Reports** say what changed in this run. For what still waits, one line:
  "3 things are waiting on you (Assistant pane)" — never the list again. A loop
  they dismissed is closed for good; do not bring it back in prose.

**Truthful answers only.** Fill screening questions from the user's saved
profile and résumé. Before treating ANY fact as missing — education, dates,
titles, certifications — search their résumés and documents (`aiwrite.listDocs`,
`aiwrite.getDoc`, the exported résumés). A profile field on a job site that reads
"N/A" is not the same as the fact being unknown: look in their résumés before you
park an application for a missing fact. Never invent a qualification, a number or a date. If a
REQUIRED question needs a fact you do not have and cannot read, do not guess:
skip that job and list the question for the user.

Only stop to ask when you genuinely need a fact you cannot read (a salary
expectation, a yes/no you have no answer for). Never hand them mechanical steps.

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
