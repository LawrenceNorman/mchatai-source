---
id: history-sourcing
version: 1
updated: 2026-10-02
appliesTo: every source the History Writer reads, cites or counts
---

# Sourcing

The voice (voice.md) says how a story is told. This file says what it may be told FROM. Both
are content, improved by PR.

## 1. A source is bytes on disk, not a URL

A source counts, for a dossier or for a claim, only when its text has been fetched and saved
as `sources/<id>.txt`, with its record in `sources/index.json`. Three reasons, all measured:

- **A 200 is not a document.** Archive servers answer 200 with a placeholder image for
  records they have not digitised. Read the first bytes before you trust a download; a PDF
  starts with `%PDF`.
- **Deep-research agents invent references.** A 2026 study of 221,000 URLs found 3–13% of the
  references research agents cite were hallucinated and 5–18% did not resolve (arXiv
  2604.03173). Fetch every URL. A citation that does not open is worse than none.
- **Evidence must be checkable.** Every claim carries a verbatim quote from the fetched text;
  `tools/quotes.py` checks it against the file. Nobody re-reads a website from memory.

Sites that refuse automated fetching (some archives return 403 to scripts) are read through
the AI Web applet, which is a real browser, and saved from there. Never guess what a page says.

## 2. Clues are not sources

Enthusiast sites, blogs, tour-company pages, aggregators, social media, video and AI
summaries are **clues**. They tell you a name is worth chasing. You may read them to learn
who and what to look for. You may not cite them for a fact or reuse their sentences. Record
them in the dossier with `kind: "clue-only"`, where they never count toward a tier.

If a clue cannot be confirmed in a citable source, it does not reach the story. Record it in
the dossier's `deadEnds`. A dead end recorded is useful; one quietly promoted to a fact is the
failure this pipeline exists to prevent.

## 3. Preferred sources, best first

1. **Primary and public-domain records.** National Register nominations, census and court
   records, federal and state documents, newspapers before 1930, the person's own letters and
   testimony, oral histories.
2. **Government records**: city council minutes, landmark reports, school and parks
   histories, municipal archives.
3. **Public-history archives and encyclopedias with named authors and their own citations.**
4. **Later newspaper reporting**, named and dated.
5. **Books**, cited by title, author, publisher, year and page.

## 4. Independence

Count independent sources the way biographers and encyclopedias do: several items from the
same publisher are one source. Each source record carries `publisher`, and
`tools/richness.py` counts distinct publishers, never URLs. Ten pages of one encyclopedia are
one source.

**Parts of one institution.** Count the editorial body that produced the work. A university press,
a library's digital collections, and a project with its own editors and masthead (the Seattle Civil
Rights and Labor History Project) are separate publishers; an office's or department's web pages fold
into the university. When unsure, fold them together: an undercount is safer than an inflated tier.
This is the rule the first Black Seattle scout applied to keep candidates comparable (2026-10-02).

**Reprints.** A page that reprints another source's text is not a second source; `richness.py`
merges sources whose text overlaps, whatever their publisher.

## 5. Licence classes: what a paid product may reuse

Each source record carries a `license` class. `tools/quotes.py` enforces the third row.

| Class | Typical sources | May we… |
|---|---|---|
| `pd` | U.S. federal records, NPS nominations, newspapers before 1930, census | quote and reuse freely; still prefer our own sentences |
| `cc-by` | openly licensed works with attribution only | quote briefly with credit |
| `facts-only` | copyrighted books and journalism, CC BY-NC-ND essays (HistoryLink's licence), Wikipedia (CC BY-SA: reusing its prose would put our text under share-alike), anything unknown | take facts and verify them with short quotes; **never reproduce passages** [verbatim_copy] |
| `clue-only` | §2 | nothing; never counts |

When in doubt, a source is `facts-only`. HistoryLink's essays are CC BY-NC-ND 3.0 for text: a
premium product may use their facts and must credit them, and must not reuse their prose.

## 6. Identity sources

Series membership is a claim like any other. The dossier records `identityBasis` and the
source that supports it: the person's self-identification, or a reliable biography. A
surname, a photograph, an address, a neighbourhood or a congregation's later identity is
never evidence of a person's identity. Every inclusion is re-checked by a second reader whose
job is to refute it.

## 7. Where to look in Seattle

Checked 2026-10-02. Access methods change, so confirm before you depend on one.

| Source | Access | Licence |
|---|---|---|
| Chronicling America (Library of Congress) | search with `fetch.py get "https://www.loc.gov/collections/chronicling-america/?q=…&fo=json&c=50"` (it spaces searches 20 s apart for every agent on the Mac); each result's `word_coordinates_url`, without its `&q=` and with `&full_text=1` added, is the page's OCR — save that with `fetch.py fetch`. Skip the per-page `at=resource` lookup | public domain before 1930; pages 1770–1963. The search host blocked bursts for over an hour; the OCR host (tile.loc.gov) did not |
| UW Libraries Digital Collections | CONTENTdm read-only API | per-item rights; collections include American Indians of the Pacific Northwest, Nikkei newspapers, African American oral histories, Labor Archives, Women Who Rock |
| Seattle Municipal Archives | CollectiveAccess portal and finding aids | city records |
| Seattle Civil Rights and Labor History Project (UW) | web pages, video oral histories | UW copyright; oral histories are the person's own words |
| HistoryLink | web essays with numbered sources | CC BY-NC-ND 3.0 (facts only) |
| Densho, BlackPast, Washington Digital Newspapers | refuse scripted fetching; read through AI Web | confirm terms per item |
| Wing Luke Museum, Burke Museum, Duwamish / Suquamish / Muckleshoot sites | web pages and PDFs | community-authored; preferred for Indigenous Seattle; confirm terms |
| National Register nominations (NPS) | PDFs; check `%PDF` | public domain |
| Seattle landmark designation reports and nominations | PDFs from seattle.gov | public records |

## 8. Pictures

A picture is a source too: it is fetched, its record kept, and what its caption says is checked
against its description (`tools/images.py`, rules in `images.json`).

| Licence | May a paid story use it? |
|---|---|
| Public domain, PD-US, CC0 | Yes, credited by its archive or author. |
| CC BY | Yes, with the credit the licence asks for. |
| CC BY-SA | Yes, with credit. Share-alike binds the picture, never the story beside it. |
| Any NC or ND licence, fair use, unstated | No. |

Where to look first: the pictures already on the person's Wikipedia article and on related
articles; a Wikimedia Commons search; the Library of Congress for pre-1930 newspaper pages
and photographs. A landmark photograph on a city website has no stated licence for reuse:
link to the landmark's page instead of copying the picture.
