# Famous lives, local places

A light job beside a series. It takes the well-known people of a community, ranked by how
many readers already know the name, and ties each one back to the places of their life, with
a checked quote for every tie. Each person becomes a short sub-story, and every place becomes
a row on a map.

Few of these places are landmarks. Jimi Hendrix and Quincy Jones both went to Garfield High
School, which is one; the Jackson Street clubs where Jones played with Ray Charles are not.
A famous name brings readers to a place that no designation recorded. That is the point of
the job.

It is shallow on purpose: the encyclopedia article and at most two more sources per person.
A tie that those sources do not support does not exist for this job. It goes on the series'
research list instead.

The runs, the caps and the identity terms are in `offspin.json`. Commands assume the
Workbench folder, as in `PLAYBOOK.md`. A run lives in `stories/_offspin/<run-id>/`.

## Steps

1. **Rank.** This step is free: it uses Wikipedia's APIs and no model.
   `python3 history/tools/fame.py candidates stories/_offspin/<run-id> <run-id>` collects the
   run's seeds and the members of its categories, and ranks them by twelve months of
   pageviews. About a thousand names take a few minutes, and a rerun reuses the cached counts.
2. **Screen.** This step is also free.
   `fame.py screen stories/_offspin/<run-id>` reads the top-ranked articles, plus every seed,
   and prints each sentence that states one of the run's identity terms. Confirm that each
   statement is ABOUT the person. "Influenced by African-American musicians" is not.
   - Take the top `caps.people` confirmed people **in rank order**. Fame is decided by the
     ranking, never by your sense of who matters.
   - Write who you passed over, and why, in `stories/_offspin/<run-id>/screen-notes.md`.
3. **Start each person.**
   `fame.py person stories/_offspin/<run-id> "<Article title>" --identity "<the statement, verbatim>"`.
   It saves the article as source `wp`. It refuses a statement that is not in the article or
   that names no identity term.
4. **Sources.** Add at most two more sources with `fetch.py fetch`: a HistoryLink essay, a
   museum page, or a local newspaper. Read everything through `fame.py places` and
   `richness.py mentions --terms "<place>"`, never whole. Articles about famous people run to
   10,000–20,000 words, and reading them whole is what makes a cheap job expensive.
5. **Ties.** `fame.py places <person>` lists the places the sources name: landmarks first
   (with their pack id), then the run's neighbourhood terms, then other named places near the
   city's name. Each comes with its passages. Write `ties.json` (`schemas/ties.schema.json`).
   - Write one tie for each local place where the person is documented: where they lived,
     studied, worked, performed, recorded, worshipped or are buried, or a place that honours
     them.
   - Each tie carries its kind, its date, and the quote that **names the place**.
   - Add `landmark` when `places` gave a pack id.
   - Add `wikipedia` with the place's own article title when it has one. That is where its
     coordinates come from.
   - A birth or a death far away is not a local tie.
6. **Check.** Run `fame.py check <person>` until it exits 0.
7. **Sub-story.** Write `chapters/01.json` (`schemas/chapter.schema.json`).
   - The person's life in these places, in date order, in 200 to 600 words.
   - Follow `voice.md`: no invented dialogue, no inner life, and every number from a quote.
     The fame is already there, so tell the place.
   - Run `fame.py gate <person>` until it exits 0.
8. **Merge.** `fame.py merge stories/_offspin/<run-id>` writes `places.json` and `places.csv`.
   - A place takes its coordinates from the landmark pack or from its own Wikipedia article.
   - A place with neither stays in the CSV with an empty latitude and longitude. If its
     quote gives an address, look it up with `mapguide.geocode` and record `lat`, `lon` and
     `coordsFrom: "geocode: <address>"` on the tie. Otherwise the author places it.
   - Places beyond the run's region are left off the map and listed under `elsewhere`.
9. **Audit.** One fresh reader on the strongest model reads every sub-story against its
   quotes in a single pass, as in `PLAYBOOK.md` step 3.4. Repair what is flagged, then gate
   again.
10. **Land.** Nothing is published; the author reviews both of the following:
    - One StoryMaker project for the run (`storymaker.createProject`, with the run's `label` as
      a working title), with one chapter per person (`storymaker.createChapter`).
    - The places in Ledger: `ledger.appendRows` with the run's `label` as the collection,
      `places.csv` as the CSV, and `matchOn: "id"`. The columns are the ones the Ledger
      place-pack exporter reads, so an approved table becomes a map pack without new code.

## Cost

Ranking and screening cost nothing. Per person, the work is one fresh context: the passages,
the ties, and a sub-story of a few hundred words. That comes to about half a million to a
million tokens, most of it re-read context, or roughly $0.40 to $0.90 at API prices. With the
audit, a run of ten people should cost about $6 to $12. For comparison, scouting Black
Seattle cost about $75 for ten people, because its bar was a documented life rather than a
famous one. These are estimates. Record the measured cost of the first run here.

Three rules keep it cheap:

- One person per context. Never hand one context a second person.
- Never read a whole article.
- No archive digging. Places that deserve research go on the series' research list.
