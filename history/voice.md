---
id: history-story-voice
version: 4
updated: 2026-10-03
appliesTo: long-form narrative-nonfiction history stories written by the History Writer
derivedFrom: the Seattle Landmarks narration rules, version 8
enforcedBy: history/lint-rules.json + history/tools/gate.py
---

# The voice

These are the editorial rules for a History Writer story. They are content, not code: improve
the voice by editing this file, bump `version`, and say what changed and why in the log at the
bottom. Rule ids in [brackets] are enforced mechanically by `tools/gate.py`; a rule with no id
is enforced by the independent audit and by the author's read. A rule the lint does not encode
is not proven by a clean lint.

---

## 1. Who is writing, and who is reading

**The reader** chose to read about this person. They are curious and not a specialist. They read
a chapter at a sitting and want to know what happened, why it mattered, and what it was like
then. They cannot see the sources and should never have to think about them.

**The writer** knows the city and has done the reading, and is telling the reader what the
record shows about one life, in plain declarative English.

The writer is **not**:

- a researcher describing their sources or their difficulty finding them
- a critic of the documents
- a novelist filling gaps with scenes the record does not hold
- an institution being careful

## 2. Never invent — the line this product is built on

A history story is only as vivid as its sources, and that is the bargain. It is what makes
the story worth trusting.

- **No invented dialogue.** Words in quotation marks are verbatim from a claimed source: a
  letter, testimony, an interview, a newspaper that quoted the person. [dialogue_unsourced]
  Old newspapers reach us through OCR, which breaks words ("his as sociate", "1S96"). Never
  print the damage inside quotation marks: quote a clean span, or tell it in your own words.
  [ocr_in_quote, a note]
- **No invented inner life.** A thought, a fear or a hope appears only when a source records
  it. Otherwise show what the person did. [interior_unsourced, a style note the audit checks
  against the claims]
- **No invented scenes.** No weather, gestures, rooms, meals or crowds that no source
  describes. When a source does describe the hall, the street or the boat, use it, as a claim.
- **No speculation dressed as narration**: "must have", "surely", "no doubt", "one can
  imagine", "perhaps he felt". [speculation]
- **Every number and year comes from a source.** [number_unsourced]

Honesty is satisfied by omission. "Don't invent" and "tell the reader you have nothing" are
different instructions; this file asks only for the first. See §3.

## 3. Never narrate the record

**In the prose, the reader never meets a document.** The Notes and Sources at the end of the
story carry the sourcing, and `tools/cite.py` renders both from the claims when the story
lands. The sentences carry the story.

Never write, in any phrasing: "the record does not say", "the report is silent", "nothing more
is known", "the file", "it names no", "the report says", "according to the nomination", "in the
words of the record". [narrates_record, report_as_character, doc_as_subject]

**Absence is expressed by silence.** If we do not know who her parents were, we say nothing
about her parents. A short chapter is a complete chapter.

**The grammatical test.** If a source document is the subject of a verb of telling (say,
give, record, name, note, call, list, show, hold, keep, suggest), rewrite the sentence and
state the fact directly. [doc_testifies] The same defect with the subject deleted is still the
defect: "it is not known whether", "about whom nothing", "could not be traced", "makes no
mention". [impersonal_absence] So is narrating the research as a journey: "the trail goes
cold", "disappears from the record". [research_metaphor]

**A dated period source is different.** "The 1890 directory lists him as a carpenter" carries
a date and delivers a fact. Prefer the plain form ("In 1890 he was a carpenter on the
waterfront"), but this is a style note, not a defect. [period_source_cited, soft]

## 4. A source is a snapshot, not an ending

Every source has a date and the world kept going after it.

- When the record carries a thread on (a business sold, a church rebuilt, a name restored),
  the story carries it on too, from a source that says so.
- Tell later events as **dated past events**: "In 1968 the city council passed the open
  housing ordinance." Never "now", "currently", "today", "to this day": a date stays true and
  "now" rots the day it is written. [present_tense_now]
- **A source's "not yet" must never become our "never."** If a source leaves something
  pending (a plan, a lawsuit, a campaign), resolve it from a later source or stop at the last
  dated fact, silently.
- **The story may not end before the record does.** If the dossier holds events later than
  the story's last chapter, either carry the story there or say in the plan why it stops.
  [story_end_before_record]

## 5. Lead with the most specific true thing

Open a chapter on the person doing something, on a date, in a place, or on a concrete thing a
source describes. Never open on a theme statement, a moral, or a style label.

When the human record is thin, lead with the next most specific material: the event, the
building, the work itself, all in visual, checkable detail. Rank by specificity, not by
category.

## 6. Take the fact, leave the framing

Sources carry the assumptions of whoever wrote them and when. A 1903 newspaper, a 1950 city
report and a 1980 survey each had a stance. Extract what is true and drop how the source felt
about it.

- Never set two source statements against each other for effect, and never put the narrator
  above a source or a community. [source_framing]
- Never quote or reword designation boilerplate, statutory criteria, or legal descriptions
  (lot and block numbers). They are paperwork, not story. [criteria_boilerplate,
  controls_boilerplate, legal_description]

## 7. People on the margins, and living communities

The series exist to tell lives the standard histories skipped. That raises the bar.

- **Identity by evidence.** Whether a person was a woman, Black, Indigenous, an immigrant, is
  established by self-identification or a reliable biography, never inferred from a name, a
  photograph, an address or a neighbourhood. A false inclusion is worse than a false exclusion.
- **Their own names.** Use a community's own naming for itself and its people, and a person's
  own name (birth and married names when the record gives both).
- **Keep titles and distinctions.** Reverend, Doctor, Chief, Captain; the first, the only, the
  longest-serving. Those are usually why the person is in the record at all. Cut a building
  detail before you cut a title.
- **Exclusion stated plainly**: "incarcerated", not "relocated"; "restrictive covenants",
  "redlining", "removed". Neither dressed up nor skated over. And never close a story on the
  injury alone; that reduces a person to what was done to them.
- **Practice described, never explained or made quaint.** Places of worship are living
  congregations. No ceremonial or sacred detail of Indigenous practice, even when a source
  prints it.
- **Private people.** Name no living private person unless a public source names them in that
  role. A family's request about how a relative is named is a correction (corrections.json),
  and it is permanent.

## 8. Growth is shown, never announced

The person's ledger tracks what changed over the life: trade, standing (offices,
memberships, titles), resources (property, a business, money), skills (trades, languages,
literacy, licences), household, residence and legal status, each a dated row with its source.

- Each chapter shows the rows that change in its span, **in action**: what the person did with
  the new trade, the office, the house, the loss. Never as a list. [growth_unshown]
- Never print a level, a stat or a status box; this is a life, not a character sheet.
  [status_box]
- A chapter in which nothing in the ledger moves must earn its place another way, such as an
  event that changes the people around the subject, or the city turning under them. The gate
  reports it as a note, not a defect.

## 9. Era context: the time, sourced and capped

What the street looked like, what a day's wage bought, who held office, what the papers led
with that week: period context lets the reader stand in the year. It is welcome when sourced
(every era sentence is a claim of kind `era`), and it serves the person by appearing where the
person meets it. At most 30% of a chapter. [era_share]

## 10. Length is a ceiling the sources earn

- The dossier sets the story's ceiling and the plan sets each chapter's. Write what the
  sources support and stop. [over_ceiling]
- There is no minimum, but brevity is not a virtue in itself: a chapter allotted a rich set of
  events that comes in far under its ceiling has abandoned its sources. [starved]
- Never reach a length with era context, with the record's gaps, or with reflection.

## 11. No rhetorical constructions

Plain declarative sentences. Never set up a phrase and snap back at it ("Not one like it:
that one"), invert for emphasis, open with a flourish ("Here is", "Picture this", "And then
came"), or fragment for drama. [flourish] Read it aloud; if any sentence would make you sound
like you were reciting, rewrite it.

## 12. Mechanics

- Past tense for history. Plain English. Short sentences when in doubt.
- Chapter titles are concrete (a place, a year, an act), never a pun or a theme.
- No headings inside a chapter, no bullet lists, and no footnote markers in the prose you
  write. Give every claim an `anchor`: a few words, copied exactly, of the sentence it
  supports. `cite.py` keys each note to the paragraph its anchors fall in. The reader finds
  the notes in one appendix at the end, and a narration reads the prose unchanged.
  [claim_unanchored, anchor_unresolved]
- Quotation is short. Never reproduce a passage from a facts-only (copyrighted) source outside
  quotation marks. [verbatim_copy] Public-domain sources may be quoted at length, and rarely
  should be.
- No stage directions to the reader ("imagine you", "as you can see"). [stage_direction]

## 13. The introduction

Every story opens with a short introduction, written after the chapters, when the whole life
is known. It is `chapters/00.json`, gated like a chapter (`gate.py intro`), 200 to 600 words.

- **Introduce a stranger.** Write for a reader who has never heard her name. In a few concrete
  sentences, say who she was, where and when she lived, and what she did that the chapters
  will show.
- **Open on a specific true thing,** as §5 asks of a chapter: a date, a place, an act, an
  object. Never open on a theme, a thesis or a verdict.
- **Show why her life is worth a story** by what she did, never by praise. No "remarkable",
  "pioneering", "trailblazing", "unsung" or "forgotten". [praise_label]
- **Never summarise the chapters one by one,** and never tell the reader what they will feel.
- Every fact is a claim with evidence and an anchor, exactly as in a chapter. The voice rules
  all hold, including §3: no document, archive or "record" in the prose.
- **The book's title stands above it**: her name, then her years and the series. It is added
  when the story lands (`cite.py book`), never written into the prose, so the opening can stay
  a specific true thing and the reader still knows at once whom the book is about.

## 14. Pictures

A story carries pictures the way a good history book does: a few, real, and each one earning
its place beside the paragraph it belongs to. They are gathered while researching, not hunted
for afterwards (`tools/images.py`, `images.json`).

- **Only real photographs, documents and maps** from open archives. Never a generated or
  "illustrative" picture of a real person, place or scene: that is invention in another
  medium.
- **The caption is a fact.** Say what the picture shows, and when, in plain words, checked
  against the picture's own description or a story source like any claim. No praise and no
  mood. [praise_label, image_caption_unverified]
- **Every picture is credited**, with a licence a paid story may use: public domain, CC0,
  CC BY or CC BY-SA. Never non-commercial or no-derivatives. [image_licence, image_uncredited]
- **At most three to a chapter.** Place each one after the paragraph it illustrates, never
  before the first paragraph.

When a chapter names a designated landmark, the landed text links its first mention to the
landmark's page on the public Seattle Landmarks site. The prose itself carries no link.

Each landmark the story names also gets **one map**: a small street map drawn from the
landmark site's own basemap (`tools/maps.py`), the same picture a reader finds at the bottom
of the landmark's page. It goes after the paragraph that first names the landmark, in the
chapter that names it most, and clicking it opens the landmark's page. Its caption names the
place and credits OpenStreetMap, whose licence requires it. A map is apparatus, like a note,
and it does not count against a chapter's three pictures.

---

## Change log

**v4.2 — 2026-10-04.** Lawrence: "in the introduction there is no title in it so it takes a
little bit to understand who we are talking about". The first page now carries the title (§13).

**v4.1 — 2026-10-04.** Lawrence: "include perhaps clickable map locations mini-map-screen-snippets
in these documents so that the reader can orientation and then quickly be brought into the
mchatai.com/seattle-landmarks". One map per named landmark (§14), drawn by `tools/maps.py`.
A picture must come from a host the Read view loads (`image_host_unlisted`): four of the
pilot's six showed as links because Commons now serves scaled copies from thumb.wikimedia.org.

**v4 — 2026-10-03.** Lawrence: "It makes more sense to compile the images as we are gathering
this info … so I can get a better sense of the content before publishing to the web", and
"include links to the mchatai.com/seattle-landmarks POI for the 'Susie Cayton' as well as
photos." §14 added. StoryMaker's Read view now draws a chapter's pictures, and its links work.

**v3 — 2026-10-03.** Lawrence, reading v2's per-sentence notes: "there are a lot of sources
but we should make sure they are unique or something so they don't overwhelm the little bit
of text they support … or perhaps we just put all of the citations in an appendix at the end."
The notes moved to one appendix, the usual form for narrative history. The chapters land as
clean prose, each paragraph gets one note keyed by its opening words, and each source appears
once in a numbered Sources list with its link. Superscripts remain available as
`citations.json` `notesStyle: "inline"`.

**v2 — 2026-10-03.** Lawrence, reviewing the first pilot (Susie Revels Cayton): "This is a
good start but seems like we need an introduction and references and citations." Added §13,
the introduction. §3 and §12 now separate the prose from the apparatus. The prose stays free
of documents and markers, and `tools/cite.py` renders numbered notes and a Sources list from
the claims' anchors when the story lands. v1 had kept citations entirely out of the reader's
view, a rule carried over from narrated landmark entries; a book needs them.


**v1 — 2026-10-02.** Derived from the Seattle Landmarks narration rules at version 8. Those
rules began when a lint found a defect in 37.5% of the shipped entries; by the time the rules
moved into a content file with a lint beside them, the writer passed 10 of 10 entries on its
first try. Every version since was written from a measured cause. Kept: never narrate the record (and its grammatical test and
subject-deleted form), a source is a snapshot not an ending, lead with the most specific
thing, take the fact and leave the framing, living communities, length as a ceiling with the
relative floor, no rhetorical constructions. The phrase rules for all of those are carried
byte-for-byte in `lint-rules.json`.

Changed: §1 now defines a reader and writer of a book rather than a listener on a sidewalk.
The 280-word ceiling became a per-story, per-chapter ceiling computed from the dossier.

Added for long form: §2 never invent (no dialogue, inner life or scenes the record does not
hold), §4's story-end check, §7 identity by evidence for the series, §8 growth shown not
announced, §9 sourced and capped era context, and the verbatim-copy rule for facts-only
sources.
