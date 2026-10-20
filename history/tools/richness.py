#!/usr/bin/env python3
"""Is there enough record to carry a story — and how long, and what shape?

The model never asserts a tier. This computes it from what was actually fetched:

  richness.py dossier  <project>   count the record, pick tier + mode + ceiling, write dossier.computed
  richness.py plan     <project>   check the plan against the dossier, write each chapter's ceiling
  richness.py validate <project>   structural checks only; writes nothing
  richness.py table    <stories-dir> [--json]
                                   one row per scouted dossier: tier, mode, point of view, ceiling,
                                   sources, licence-clean sources, events, own words, edge re-check
  richness.py mentions <project> [source-id ...] [--terms "A|B"] [--window N] [--max-words N]
                                   print only the passages around each mention of the subject
                                   (or of --terms): the words the tier counts, and all a scout
                                   needs to read to find dated events. Whole files are for writing.

Counts (thresholds.json says what each tier needs):
  independentSources   distinct PUBLISHERS among fetched, non-clue sources that mention the subject
  beyondEncyclopedias  the same, excluding the encyclopedias (a story built only from summaries
                       of other work has nothing new to say)
  datedEvents          dossier events with a year and at least one fetched, non-clue source
  lifeStages           distinct life stages among those events
  ownWords             fetched sources that are the subject's own words (letters, testimony,
                       oral histories)
  wordsAboutSubject    words in the passages of fetched sources that name the subject (any alias),
                       a passage repeated across sources (a masthead in every issue) counted once

Mode — the SHAPE a thin record takes instead of padding: biography (the life across stages),
episode (one documented stretch), or ensemble (the person through the community the record
does hold).

Exit 0 when the dossier reaches at least tier C (or the plan is consistent); 1 otherwise.
"""
import datetime
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import Project, finding, load_json, norm, report, save_json, thresholds, words  # noqa: E402,F401

# A year, or a decade ("1890s" reads as 1890): sources often date a life only by decade.
YEAR = re.compile(r"\b(1[5-9]\d\d|20\d\d)(?=s?\b)")
# Older history (history/domains/pivotal-history): "52 BC", "AD 9", "1223", "1223-05-31". A BC year
# reads as negative, so years still sort in order. Kept apart from YEAR so a Seattle date string is
# read exactly as before.
ERA_YEAR = re.compile(r"\b(\d{1,4})\s*(BCE|BC|B\.C\.)|\b(?:AD|A\.D\.|CE)\s*(\d{1,4})\b|\b(\d{1,4})\s*(?:AD|A\.D\.|CE)\b")
MEDIEVAL_YEAR = re.compile(r"\b(1[0-4]\d\d)(?=s?\b)")
# A BC range ("214–212 BC"): the era marker covers both years, so the range starts at the first.
BC_RANGE = re.compile(r"\b(\d{1,4})\s*[–—-]\s*\d{1,4}\s*(?:BCE|BC|B\.C\.)")


def year_of(date):
    s = str(date or "")
    m = BC_RANGE.search(s)
    if m:
        return -int(m.group(1))
    m = ERA_YEAR.search(s)
    if m:
        if m.group(1):
            return -int(m.group(1))
        return int(m.group(3) or m.group(4))
    m = YEAR.search(s)
    if m:
        return int(m.group(1))
    m = MEDIEVAL_YEAR.search(s)
    return int(m.group(1)) if m else None


def passages(text):
    """Paragraphs; OCR text with no blank lines is cut into ~150-word windows instead."""
    parts = [p for p in re.split(r"\n\s*\n", text or "") if p.strip()]
    if len(parts) <= 1 and words(text) > 300:
        toks = (text or "").split()
        parts = [" ".join(toks[i:i + 150]) for i in range(0, len(toks), 150)]
    return parts


WINDOW = 75   # words on each side of a mention that count as "about" the subject
# Bumped whenever a change here can move a dossier's counts. A dossier computed by an older
# version still plans, with a note: the second story's tier moved with no source changed,
# because the counting had changed since its scout (2026-10-04).
COUNT_VERSION = "2026-10-04"


def alias_pattern(alias):
    """An alias as a pattern: its words match across any whitespace (an OCR line break between
    "John T." and "Gayton" hid the only source for one of his events, 2026-10-04), and its edges
    are word edges even when it ends in a full stop ("Mr.", "Jr.")."""
    words_ = [re.escape(w) for w in (alias or "").split()]
    return r"(?<!\w)" + r"\s+".join(words_) + r"(?!\w)" if words_ else None


def alias_matches(text, aliases, not_aliases=()):
    """(start, end) of every mention of the subject. A match inside one of the dossier's
    `notAliases` (his sons: "John Gayton Jr.", "James A. Gayton") is somebody else."""
    blocked = []
    for na in not_aliases or ():
        pat = alias_pattern(na)
        if pat:
            blocked += [(m.start(), m.end()) for m in re.finditer(pat, text, re.I)]
    out = []
    for a in aliases:
        pat = alias_pattern((a or "").strip())
        if not pat:
            continue
        for m in re.finditer(pat, text, re.I):
            if not any(bs <= m.start() < be for bs, be in blocked):
                out.append((m.start(), m.end()))
    return out


def mention_spans(text, aliases, window=WINDOW, not_aliases=()):
    """(tokens, spans): the text's word tokens (regex matches), and [first, last, mentions] token
    ranges within `window` words of a mention of any alias, overlapping or touching ranges merged.

    ONE definition of "about the subject", used both to COUNT (words_about) and to READ
    (`richness.py mentions`), so what a scout reads is exactly what the tier counted."""
    import bisect
    text = text or ""
    toks = list(re.finditer(r"\S+", text))
    starts = [m.start() for m in toks]
    raw = []
    if toks:
        for start, _ in alias_matches(text, aliases, not_aliases):
            i = max(0, bisect.bisect_right(starts, start) - 1)
            raw.append((max(0, i - window), min(len(toks) - 1, i + window)))
    spans = []
    for first, last in sorted(raw):
        if spans and first <= spans[-1][1] + 1:
            spans[-1][1] = max(spans[-1][1], last)
            spans[-1][2] += 1
        else:
            spans.append([first, last, 1])
    return toks, spans


def words_about(text, aliases, not_aliases=()):
    """Words within WINDOW words of a mention of the subject, overlapping windows merged.

    Counted around each MENTION, not by paragraph: a newspaper OCR page arrives as column-length
    blocks, and counting any block that mentions the name counted whole columns of other news
    (John T. Gayton read as 103,000 words, 2026-10-02). A window is the same size whatever the
    source's layout."""
    _, spans = mention_spans(text, aliases, not_aliases=not_aliases)
    return sum(last - first + 1 for first, last, _ in spans)


def own_words_count(text, span):
    """Words of a source that are the subject's own, or None when no usable span is marked.

    `ownWordsSpan` is "all" (a letter, an oral history: the whole text is theirs) or
    {"from": "<their first words>", "to": "<their last words>"} (a signed editorial on a newspaper
    page). Unmarked, an own-words source still counts toward ownWords, but only its passages
    naming the subject count as words: forty newspaper pages Horace R. Cayton edited were
    counted whole, ads and all, as his own words — 78,922 words (2026-10-02)."""
    if span == "all":
        return words(text)
    if isinstance(span, dict) and span.get("from") and span.get("to"):
        t = norm(text)
        a = t.find(norm(span["from"]))
        if a == -1:
            return None
        end = norm(span["to"])
        b = t.find(end, a)
        if b == -1:
            return None
        return len(t[a:b + len(end)].split())
    return None


def fresh_words(project, ids, aliases, k=8, threshold=0.5, not_aliases=()):
    """{source id: words in its mention windows that no earlier source already said}.

    A passage repeated across sources — a masthead in every issue, a standing byline, a
    boilerplate notice — is one passage, not one per copy. Sources are read in id order, and
    every 8-word run of each is remembered. In a later source, a mention whose own 8-word
    context was already seen is boilerplate and opens no window, and inside the windows that do
    open, words covered by an already-seen run do not count. With no repeats this equals
    words_about. (Horace R. Cayton's name sat in the Seattle Republican's masthead in every
    issue, 2026-10-02.)"""
    import bisect
    seen, out = set(), {}
    for sid in sorted(ids):
        text = project.source_text(sid) or ""
        toks = list(re.finditer(r"\S+", text))
        w = [norm(m.group(0)) for m in toks]
        hs = [hash(tuple(w[j:j + k])) for j in range(max(0, len(w) - k + 1))]
        repeat = [False] * len(w)
        for j, h in enumerate(hs):
            if h in seen:
                for x in range(j, j + k):
                    repeat[x] = True
        starts = [m.start() for m in toks]
        marked = [False] * len(w)
        for start, _ in (alias_matches(text, aliases, not_aliases) if toks else []):
            i = max(0, bisect.bisect_right(starts, start) - 1)
            core = hs[max(0, i - k + 1):min(i, len(hs) - 1) + 1]
            if core and sum(1 for h in core if h in seen) / len(core) >= threshold:
                continue                      # boilerplate: this mention's own context was seen before
            for x in range(max(0, i - WINDOW), min(len(w) - 1, i + WINDOW) + 1):
                marked[x] = True
        out[sid] = sum(1 for x in range(len(w)) if marked[x] and not repeat[x])
        seen.update(hs)
    return out


def shingles(text, k=8):
    w = norm(text).split()
    return {hash(tuple(w[i:i + k])) for i in range(max(0, len(w) - k + 1))}


def group_sources(project, usable, threshold=0.5, by_publisher=True):
    """Union of sources whose texts overlap (at least `threshold` of the smaller text's 8-word runs
    appear in the other) and, when `by_publisher`, of sources that share a publisher. Returns a
    list of sets of source ids."""
    ids = sorted(usable)
    parent = {i: i for i in ids}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        parent[find(a)] = find(b)

    if by_publisher:
        by_pub = {}
        for sid in ids:
            by_pub.setdefault(usable[sid]["publisher"].lower(), []).append(sid)
        for members in by_pub.values():
            for other in members[1:]:
                union(members[0], other)
    sh = {sid: shingles(project.source_text(sid) or "") for sid in ids}
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            if find(a) == find(b) or not sh[a] or not sh[b]:
                continue
            small, large = (sh[a], sh[b]) if len(sh[a]) <= len(sh[b]) else (sh[b], sh[a])
            if len(small & large) / len(small) >= threshold:
                union(a, b)
    groups = {}
    for sid in ids:
        groups.setdefault(find(sid), set()).add(sid)
    return list(groups.values())


def event_evidence_problem(project, event, srcs, usable, t):
    """Why this event cannot count, or None. Its `evidence`, when given, must be a verbatim quote
    of at least minQuoteWords words from one of its fetched, countable sources. With
    eventEvidenceRequired, an event must carry one: the dated-event count sets a story's length,
    and without a quote it rests on the model's word."""
    ev = (event.get("evidence") or "").strip()
    if not ev:
        return "no evidence quote" if t.get("eventEvidenceRequired") else None
    if words(ev) < t["minQuoteWords"]:
        return f"evidence under {t['minQuoteWords']} words"
    want = norm(ev)
    for sid in srcs:
        if sid in usable and want in norm(project.source_text(sid) or ""):
            return None
    return "evidence is not verbatim in any of its sources (" + ", ".join(srcs) + ")"


def compute(project):
    d = project.dossier
    t = thresholds(project)
    if not d.get("subject"):
        return None, [finding("dossier_missing", "hard", "dossier.json is missing or has no `subject`")]
    aliases = list(dict.fromkeys([d["subject"]] + list(d.get("aliases") or [])))
    not_aliases = list(d.get("notAliases") or [])
    problems = []
    usable = {}          # id -> {publisher, words}
    own = 0
    for sid, rec in project.sources.items():
        kind = (rec.get("kind") or "").lower()
        lic = (rec.get("license") or "").lower()
        if kind == "clue-only" or lic == "clue-only":
            continue
        text = project.source_text(sid)
        if text is None or words(text) == 0:
            problems.append(finding("source_missing", "hard",
                                    f"source {sid} has no fetched text (sources/{sid}.txt) — it does not count until its bytes are on disk"))
            continue
        about = words_about(text, aliases, not_aliases)
        own_part = None
        if rec.get("ownWords"):
            own += 1
            own_part = own_words_count(text, rec.get("ownWordsSpan"))
            if own_part is None and rec.get("ownWordsSpan"):
                problems.append(finding("own_words_span_not_found", "soft",
                                        f"source {sid}: ownWordsSpan's phrases are not in its text — only the passages naming the subject count"))
            about = max(about, own_part or 0)   # the subject's own words are about the subject
        if about == 0:
            continue
        usable[sid] = {"publisher": (rec.get("publisher") or rec.get("url") or sid).strip(), "words": about,
                       "own": own_part}

    fresh = fresh_words(project, list(usable), aliases, not_aliases=not_aliases)
    for sid in usable:
        # The subject's own words count whole (their marked part); everything else counts only the
        # passages no earlier source already said.
        usable[sid]["fresh"] = max(usable[sid]["own"] or 0, fresh.get(sid, 0))

    # Independence is by publisher AND by content: a newspaper reprinting an encyclopedia entry
    # word for word is one source, not two (caught by hand in the first Black Seattle scout, where
    # a Seattle Medium page was a verbatim reprint of the BlackPast entry). Sources whose text
    # overlaps heavily join the same group, and each group counts once.
    groups = group_sources(project, usable)                         # independence: publisher OR same text
    content = group_sources(project, usable, by_publisher=False)   # words: only the same TEXT merges
    encyclopedias = {p.lower() for p in t["encyclopediaPublishers"]}
    publishers = {min(usable[sid]["publisher"].lower() for sid in g) for g in groups}
    beyond = sum(1 for g in groups if not any(usable[sid]["publisher"].lower() in encyclopedias for sid in g))
    duplicates = [sorted(g) for g in groups if len({usable[sid]["publisher"].lower() for sid in g}) > 1]
    events = []
    unverified = []
    for e in d.get("events", []):
        y = year_of(e.get("date"))
        srcs = [str(s) for s in e.get("sources", [])]
        if y is None or not any(s in usable for s in srcs):
            continue
        why = event_evidence_problem(project, e, srcs, usable, t)
        if why:
            unverified.append(f"{e.get('id', '?')}: {why}")
            continue
        events.append({**e, "_year": y})
    if unverified:
        problems.append(finding("event_unverified", "soft",
                                f"{len(unverified)} event(s) not counted — " + "; ".join(unverified[:6])
                                + (" …" if len(unverified) > 6 else "")))
    # A participant's own account that no event cites (Midway, 2026-10-18: Fletcher's report, the one
    # source aboard a ship in the fight, reached the plan only because a planner went looking for an
    # immersive passage). It is the source a point-of-view passage and the best quotations need.
    cited = {str(s) for e in d.get("events", []) for s in e.get("sources", [])}
    idle = [sid for sid, rec in project.sources.items() if rec.get("ownWords") and sid in usable and sid not in cited]
    if idle:
        problems.append(finding("own_words_uncited", "soft",
                                f"own-words source(s) {', '.join(idle)} support no dossier event — read them through "
                                "`mentions` and record what they hold"))
    # The edge re-check (domains/pivotal-history/scout.md §2.3) reads the scout's for/against quotes
    # instead of whole sources, so each must be verbatim in its source like any evidence. Two of the
    # first scout's failed on OCR line-break hyphens and nothing caught it (2026-10-16).
    bad_edge = []
    for side, rows in (d.get("edgeEvidence") or {}).items():
        for e in rows if isinstance(rows, list) else []:
            sid, q = str(e.get("source", "")), e.get("quote", "")
            if words(q) < t["minQuoteWords"] or norm(q).rstrip(" ,.") not in norm(project.source_text(sid) or ""):
                bad_edge.append(f"{side} {sid}: {q[:50]!r}")
    if bad_edge:
        problems.append(finding("edge_evidence_unverified", "soft",
                                f"{len(bad_edge)} edgeEvidence quote(s) are not verbatim in their source, so the re-check "
                                "cannot rest on them — " + "; ".join(bad_edge[:4]) + (" …" if len(bad_edge) > 4 else "")))
    # An episode's `phase` (prelude, siege, relief, aftermath) is what a life's `lifeStage` is.
    stages = {e.get("lifeStage") or e.get("phase") for e in events if e.get("lifeStage") or e.get("phase")}
    counts = {
        "independentSources": len(groups),
        "beyondEncyclopedias": beyond,
        "datedEvents": len(events),
        "lifeStages": len(stages),
        "ownWords": own,
        # A reprint adds no words about the subject: count each group of the SAME TEXT once, by its
        # longest member. Different articles from one paper are different words and all count —
        # grouping these by publisher (the first version) counted 45 Seattle Republican articles
        # about John T. Gayton as one.
        "wordsAboutSubject": sum(max(usable[sid]["fresh"] for sid in g) for g in content),
    }
    # A domain that scores licences (history/domains/pivotal-history): how many independent groups
    # hold at least one source a paid book may quote and reuse (sourcing.md §5), and how many words
    # about the subject those sources carry. Facts-only sources still give facts; these give scenes.
    clean = {c.lower() for c in t.get("licenceCleanClasses") or []}
    if clean:
        lic = {sid: (project.sources[sid].get("license") or "facts-only").lower() for sid in usable}
        counts["licenceClean"] = sum(1 for g in groups if any(lic[sid] in clean for sid in g))
        counts["licenceCleanWords"] = sum(usable[sid]["fresh"] for sid in usable if lic[sid] in clean)
        counts["ownWordsWords"] = sum(usable[sid]["own"] or 0 for sid in usable)

    tier, unmet = None, {}
    for tr in t["tiers"]:
        short = [f"{k} {counts[k]} < {v}" for k, v in tr["requires"].items() if counts.get(k, 0) < v]
        if not short:
            tier = tr
            break
        unmet[tr["id"]] = short

    years = sorted(e["_year"] for e in events)
    if len(stages) >= t["biographyMinLifeStages"]:
        mode = "biography"
    else:
        best = 0
        for y in years:
            best = max(best, sum(1 for z in years if y <= z < y + t["episodeWindowYears"]))
        mode = "episode" if years and best / len(years) >= t["episodeWindowShare"] else "ensemble"

    computed = {
        "computedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "countVersion": COUNT_VERSION,
        "counts": counts,
        "tier": tier["id"] if tier else None,
        "tierLabel": tier["label"] if tier else "not enough record yet",
        "mode": mode,
        "firstEventYear": years[0] if years else None,
        "lastEventYear": years[-1] if years else None,
        "unmet": unmet,          # the higher tiers this record does not reach, and why
        "eventsNotCounted": unverified,   # events whose evidence failed, or had none when required
        "sameContent": duplicates,   # sources under different publishers whose text is the same
    }
    if tier:
        ceiling = min(tier["words"][1], round(t["sourceRatio"] * counts["wordsAboutSubject"]))
        computed["ceilingWords"] = ceiling
        computed["estimatedChapters"] = max(tier["chapters"][0],
                                            min(tier["chapters"][1], round(ceiling / t["wordsPerChapter"]) or 1))
    # The point-of-view ladder (history/domains/pivotal-history/voice.md §2): an immersive (L1)
    # passage is EARNED by the record, as length is. Computed here, never chosen by a model.
    pov = t.get("pov")
    if isinstance(pov, dict):
        need = pov.get("l1Requires") or {}
        short = [f"{k} {counts.get(k, 0)} < {v}" for k, v in need.items() if counts.get(k, 0) < v]
        computed["pov"] = "L0" if short or not tier else "L0+L1"
        if short:
            computed["povUnmet"] = short
    if tier and tier["id"] == "C" and mode == "biography":
        problems.append(finding("mode_tier_mismatch", "soft",
                                "a biography at portrait length — check the life stages are really sourced"))
    return computed, problems


def cmd_dossier(project):
    computed, problems = compute(project)
    if computed is None:
        return report("dossier", problems)
    d = project.dossier
    d["computed"] = computed
    save_json(project.path("dossier.json"), d)
    c = computed["counts"]
    print(f"{d['subject']} — tier {computed['tier'] or '—'} ({computed['tierLabel']}), mode {computed['mode']}")
    for k, v in c.items():
        print(f"  {k:<20} {v}")
    if computed.get("ceilingWords"):
        print(f"  ceiling              {computed['ceilingWords']} words, ~{computed['estimatedChapters']} chapter(s)")
    if computed.get("pov"):
        unmet = f" (L1 needs: {'; '.join(computed['povUnmet'])})" if computed.get("povUnmet") else ""
        print(f"  point of view        {computed['pov']}{unmet}")
    for tid, why in computed["unmet"].items():
        print(f"  not tier {tid}: {'; '.join(why)}")
    if computed["tier"] is None:
        problems.append(finding("not_enough_record", "hard",
                                "below tier C — put this person on the research list, not into a story"))
    return report("dossier", problems)


def validate_plan(project, write):
    d, plan, t = project.dossier, project.plan, thresholds(project)
    out = []
    computed = d.get("computed") or {}
    if not computed.get("ceilingWords"):
        out.append(finding("dossier_not_computed", "hard", "run `richness.py dossier` first — the plan's ceilings come from it"))
        return out
    if computed.get("countVersion") != COUNT_VERSION:
        out.append(finding("dossier_counted_by_older_tool", "soft",
                           f"the dossier was counted by an older richness.py ({computed.get('countVersion') or 'before versions'}, now "
                           f"{COUNT_VERSION}); run `richness.py dossier` so the ceilings match today's counting"))
    events = {e["id"]: e for e in d.get("events", []) if "id" in e}
    chapters = plan.get("chapters", [])
    if not chapters:
        return [finding("plan_empty", "hard", "plan.json has no chapters")]
    allotted = 0
    for ch in chapters:
        for eid in ch.get("events", []):
            if eid not in events:
                out.append(finding("plan_unknown_event", "hard", f"chapter {ch.get('n')} allots event {eid!r}, which the dossier does not hold"))
        if ch.get("role") != "afterword":
            allotted += len(ch.get("events", []))
    out += story_shape_findings(project, chapters, events, t)
    sources = project.sources
    rows = plan.get("ledger", [])
    for r in rows:
        ev = (r.get("evidence") or {})
        sid, quote = str(ev.get("source", "")), ev.get("quote", "")
        for key in ("id", "entity", "field", "value", "chapter"):
            if key not in r:
                out.append(finding("ledger_row_incomplete", "hard", f"ledger row {r.get('id', '?')} has no `{key}`"))
        if sid not in sources:
            out.append(finding("ledger_source_unknown", "hard", f"ledger row {r.get('id')} cites source {sid!r}, which is not in sources/index.json"))
            continue
        text = project.source_text(sid) or ""
        if words(quote) < t["minQuoteWords"] or norm(quote) not in norm(text):
            out.append(finding("ledger_quote_unverified", "hard",
                               f"ledger row {r.get('id')}: its evidence is not a verbatim quote of {t['minQuoteWords']}+ words from source {sid}"))
        # A `shows` phrase is matched as literal text, so an elision inside one ("awarded ... on 4 October
        # 1861") can never be in any prose: the chapter cannot pass (Hampton Roads, 2026-10-18, twice).
        for phrase in r.get("shows") or []:
            if "..." in phrase or "…" in phrase:
                out.append(finding("shows_unmatchable", "hard",
                                   f"ledger row {r.get('id')}: `shows` {phrase[:60]!r} contains an ellipsis and is matched as "
                                   "literal text, so no prose can contain it; give whole phrases instead"))
        # A `shows` phrase is what the prose must contain, so one clipped from a facts-only source puts
        # that source's own sentence into the story (Midway, 2026-10-18: ten words of Wikipedia, which
        # the copy gate then had to be argued around). Write `shows` as a short paraphrase.
        if (sources[sid].get("license") or "facts-only").lower() == "facts-only":
            for phrase in r.get("shows") or []:
                if words(phrase) >= t.get("showsCopyWords", 6) and norm(phrase) in norm(text):
                    out.append(finding("shows_copies_source", "soft",
                                       f"ledger row {r.get('id')}: `shows` {phrase[:60]!r} is copied from facts-only source {sid}; "
                                       "write it as a short paraphrase, or the prose must reproduce the source to pass"))
    ids = {r.get("id") for r in rows}
    for ch in chapters:
        for lid in ch.get("ledger", []):
            if lid not in ids:
                out.append(finding("plan_unknown_ledger_row", "hard", f"chapter {ch.get('n')} lists ledger row {lid!r}, which plan.ledger does not define"))
    story = computed["ceilingWords"]
    # D2: the dossier earns a CEILING, a maximum. A planner may choose a shorter story
    # (`targetWords`); that lowers each chapter's starved floor and never its ceiling. Without
    # it the floor was a share of the maximum, a quota that forced padding the voice forbids
    # (the Black Seattle pilot, 2026-10-02: cutting a chapter's paragraphs about the men around
    # her, as the series' sensitivity rule asks, left it "starved").
    target = plan.get("targetWords")
    if target is not None and (not isinstance(target, (int, float)) or target <= 0 or target > story):
        out.append(finding("target_over_ceiling", "hard",
                           f"plan.targetWords {target!r} must be a positive number no larger than the dossier's ceiling of {story} words"))
        target = None
    if write and allotted:
        for ch in chapters:
            if ch.get("role") == "afterword":
                # The afterword takes no share of the story's events or its ceiling: it has its own
                # length (domain voice §12), and no floor but a note.
                ch["ceilingWords"] = ((t.get("afterword") or {}).get("words") or [0, 600])[1]
                ch.pop("floorWords", None)
                ch.pop("targetWords", None)
                continue
            share = len(ch.get("events", [])) / allotted
            ch["ceilingWords"] = round(story * share)
            ch["floorWords"] = round(t["starvedFraction"] * (target or story) * share)
            if target:
                # The length to aim for. The third story's writers never saw the story's target and
                # wrote 5,228 words against 3,500 (2026-10-04); the gate notes a chapter well past it.
                ch["targetWords"] = round(target * share)
            else:
                ch.pop("targetWords", None)
        plan["computed"] = {"storyCeilingWords": story, "allottedEvents": allotted,
                            **({"targetWords": target} if target else {}),
                            "computedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")}
        save_json(project.path("plan.json"), plan)
    # Every chapter costs a writer and an auditor, about 7M tokens whatever its length: the tier-B
    # stories planned five chapters of 280-560 words and cost as much as the book-length ones
    # (2026-10-05). A short chapter is better merged with its neighbour.
    thin = [ch for ch in chapters if target and allotted and len(chapters) > 2 and ch.get("role") != "afterword"
            and round(target * len(ch.get("events", [])) / allotted) < t.get("thinChapterWords", 450)]
    if thin:
        out.append(finding("chapters_thin", "soft",
                           f"{len(thin)} chapter(s) aim under {t.get('thinChapterWords', 450)} words "
                           f"({', '.join(str(ch.get('n')) for ch in thin)}): merge each with a neighbour. Every chapter "
                           "costs a writer and an auditor whatever its length, and fewer, fuller chapters read better"))
    last = computed.get("lastEventYear")
    ends = [y for y in (year_of((ch.get("span") or {}).get("to")) for ch in chapters) if y is not None]
    if last and ends and max(ends) < last and not plan.get("endNote"):
        out.append(finding("story_end_before_record", "hard",
                           f"the dossier holds events up to {last} but the plan stops at {max(ends)} — carry the story there, or say why it stops in plan.endNote"))
    return out


def story_shape_findings(project, chapters, events, t):
    """An episode's plan (domain voice §10-§12), when the domain asks: the afterword is one chapter,
    the last; every cast entry is introduced by exactly one chapter (or the introduction) and its
    line is sourced like a claim; and the book's question, each chapter's turn and the observations
    are written down before anyone writes. Off for a History Writer life."""
    out = []
    after = [c for c in chapters if c.get("role") == "afterword"]
    if len(after) > 1:
        out.append(finding("afterword_twice", "hard", "the plan has more than one afterword; a book has one, after its last chapter"))
    if after and chapters[-1] is not after[0]:
        out.append(finding("afterword_not_last", "hard", f"the afterword (chapter {after[0].get('n')}) must be the plan's last chapter"))
    for c in chapters:
        if c.get("role") not in (None, "chapter", "afterword"):
            out.append(finding("plan_role_unknown", "hard", f"chapter {c.get('n')} has role {c.get('role')!r}; a chapter is a chapter or the afterword"))
    import storytelling
    if (t.get("cast") or {}).get("required") and storytelling.v2(project):
        import voice_lint
        entries = storytelling.cast_entries(project)
        assigned = storytelling.cast_assignments(project)
        sources = project.sources
        for label in assigned:
            if storytelling.entry_named(entries, label) is None or label not in {e["name"] for e in entries}:
                out.append(finding("plan_unknown_cast", "hard",
                                   f"the plan introduces {label!r}, which is not a cast entry's `name` in the dossier's people[] or peoples[]"))
        for e in entries:
            where = assigned.get(e["name"]) or []
            if not where:
                out.append(finding("cast_unassigned", "hard",
                                   f"{e['name']} is in the cast and no chapter introduces them: add the name to one chapter's "
                                   "`introduces` (or plan.intro.introduces) (domain voice §11)"))
            elif len(where) > 1:
                out.append(finding("cast_assigned_twice", "hard", f"{e['name']} is introduced by more than one chapter ({where})"))
            if not e["who"]:
                out.append(finding("cast_who_missing", "hard", f"cast entry {e['name']} has no `who`: one line saying who they were"))
            text = project.source_text(e["source"]) if e["source"] in sources else None
            if text is None or words(e["evidence"]) < t["minQuoteWords"] or norm(e["evidence"]) not in norm(text):
                out.append(finding("cast_quote_unverified", "hard",
                                   f"cast entry {e['name']}: its `evidence` is not a verbatim quote of {t['minQuoteWords']}+ words "
                                   f"from source {e['source'] or '(none)'}; the Who's who is sourced like a note"))
            for f in voice_lint.phrase_findings(e["who"], voice_lint.compiled_rules(project=project)):
                if f["severity"] == "hard":
                    out.append(finding("cast_who_voice", "hard", f"cast entry {e['name']}'s line: {f['message']}", e["who"]))
    shape = (t.get("plan") or {}) if storytelling.v2(project) else {}
    plan = project.plan or {}
    if shape.get("question") and not str(plan.get("question") or "").strip():
        out.append(finding("question_missing", "soft", "the plan has no `question`: the one the book answers, which the introduction asks (domain voice §10)"))
    if shape.get("turns"):
        flat = [str(c.get("n")) for c in chapters if c.get("role") != "afterword" and not str(c.get("turn") or "").strip()]
        if flat:
            out.append(finding("turn_missing", "soft",
                               f"chapter(s) {', '.join(flat)} have no `turn`: what the reader wants to know next, which the chapter "
                               "ends on instead of a summary (domain voice §10)"))
    lo_hi = shape.get("observations")
    if lo_hi:
        obs = plan.get("observations") or []
        if not lo_hi[0] <= len(obs) <= lo_hi[1]:
            out.append(finding("observations_count", "soft",
                               f"the plan has {len(obs)} observation(s); an episode has {lo_hi[0]} to {lo_hi[1]}: what makes it worth "
                               "telling, each with the chapter that lands it and the phrases that carry it (domain voice §12)"))
        nums = {int(c.get("n")) for c in chapters}
        for i, o in enumerate(obs, 1):
            if not o.get("text") or int(o.get("chapter", -1)) not in nums or not o.get("shows"):
                out.append(finding("observation_incomplete", "soft",
                                   f"observation {i} needs `text`, a `chapter` the plan holds and `shows` (phrases the prose will carry)"))
            for eid in o.get("events") or []:
                if eid not in events:
                    out.append(finding("plan_unknown_event", "hard", f"observation {i} names event {eid!r}, which the dossier does not hold"))
    return out


def cmd_plan(project):
    problems = validate_plan(project, write=True)
    plan = project.plan
    for ch in plan.get("chapters", []):
        aim = f", aim for {ch['targetWords']}" if ch.get("targetWords") else ""
        print(f"  ch{ch.get('n')}: {ch.get('title', '')} — {len(ch.get('events', []))} event(s), ceiling {ch.get('ceilingWords', '?')} words{aim}")
    return report("plan", problems)


def cmd_validate(project):
    problems = []
    if not project.dossier.get("subject"):
        problems.append(finding("dossier_missing", "hard", "dossier.json is missing or has no `subject`"))
    if os.path.exists(project.path("plan.json")):
        problems += validate_plan(project, write=False)
    return report("validate", problems)


def _flag(argv, name, default=None):
    if name in argv:
        i = argv.index(name)
        if i + 1 < len(argv):
            return argv[i + 1]
    return default


def cmd_mentions(project, argv):
    """Read economy (2026-10-02): the first Black Seattle scout read whole sources into each
    agent's context and re-read that context on every call — about 100M tokens, nearly all of it
    the same context read again, against an estimate of 1–2M. A scout needs the passages that
    name the person, and those are exactly the windows the tier counts."""
    rest = argv[3:]
    terms = _flag(rest, "--terms")
    window = int(_flag(rest, "--window", WINDOW))
    budget = int(_flag(rest, "--max-words", 6000))
    flags = {"--terms", "--window", "--max-words"}
    ids, skip = [], False
    for a in rest:
        if skip:
            skip = False
            continue
        if a in flags:
            skip = True
            continue
        ids.append(a)
    if terms:
        aliases = [t.strip() for t in terms.split("|") if t.strip()]
    else:
        d = project.dossier
        subject = d.get("subject") or (load_json(project.path("project.json"), {}) or {}).get("subject")
        aliases = list(dict.fromkeys([subject] + list(d.get("aliases") or []))) if subject else []
    if not aliases:
        print("no terms: write dossier.json (subject, aliases) or pass --terms \"Name|Other name\"")
        return 2
    sources = project.sources
    unknown = [i for i in ids if i not in sources]
    if unknown:
        print(f"unknown source id(s): {', '.join(unknown)} (sources/index.json has {', '.join(sorted(sources)) or 'none'})")
        return 2
    shown, held, silent = 0, [], []
    for sid in (ids or sorted(sources)):
        rec = sources[sid]
        text = project.source_text(sid)
        if text is None:
            silent.append(f"{sid} (not fetched)")
            continue
        toks, spans = mention_spans(text, aliases, window, not_aliases=(project.dossier or {}).get("notAliases") or [])
        if not spans:
            silent.append(f"{sid} ({len(toks)} words)")
            continue
        notes = []
        if (rec.get("kind") or "").lower() == "clue-only" or (rec.get("license") or "").lower() == "clue-only":
            notes.append("CLUE ONLY — never cite")
        if rec.get("ownWords"):
            span = rec.get("ownWordsSpan")
            if span == "all":
                notes.append("own words — the whole text counts")
            elif isinstance(span, dict):
                notes.append("own words — the marked ownWordsSpan counts")
            else:
                # It used to say "the whole text counts" here, which was never true: unmarked, only
                # these passages count, and the writer set spans believing they would SHRINK the
                # count (2026-10-04).
                notes.append("own words, no ownWordsSpan marked — only these passages count; mark the span")
        about = sum(b - a + 1 for a, b, _ in spans)
        header = (f"== {sid} · {rec.get('publisher', '?')} · {str(rec.get('title') or rec.get('url') or '')[:80]}"
                  f" · {len(toks)} words, {sum(n for _, _, n in spans)} mention(s), {about} about"
                  + (f" · {'; '.join(notes)}" if notes else "") + " ==")
        printed_header = False
        for first, last, _ in spans:
            n = last - first + 1
            if held or (shown + n > budget and shown > 0):
                held.append((sid, n))    # in order: once one passage waits, every later one does
                continue
            if not printed_header:
                print(header)
                printed_header = True
            print(f"[words {first + 1}-{last + 1}] " + " ".join(m.group(0) for m in toks[first:last + 1]))
            print()
            shown += n
    if held:
        per = {}
        for sid, n in held:
            per[sid] = per.get(sid, 0) + n
        where = list(per)
        listed = ", ".join(f"{sid} {per[sid]}" for sid in where[:40]) + (f", and {len(where) - 40} more" if len(where) > 40 else "")
        print(f"… held back (budget {budget} words): {len(held)} passage(s), {sum(per.values())} words, in {listed}.")
        print(f"   Read them by id: richness.py mentions <project> {' '.join(where[:12])}{' …' if len(where) > 12 else ''}")
    if silent:
        print("no mention of " + " / ".join(aliases) + ": " + ", ".join(silent))
    return 0


TIER_ORDER = {"A": 0, "B": 1, "C": 2}


def table_rows(stories_dir):
    """One row per scouted dossier under `stories_dir`, from what richness.py computed and the
    re-check recorded — never from a model's summary. Best tier first, then most words."""
    rows = []
    for slug in sorted(os.listdir(stories_dir)):
        project = Project(os.path.join(stories_dir, slug))
        d = project.dossier
        if not d.get("subject"):
            continue
        c = d.get("computed") or {}
        n = c.get("counts") or {}
        check = d.get("edgeCheck") or {}
        rows.append({
            "slug": slug, "subject": d["subject"], "edge": d.get("edge") or "",
            "tier": c.get("tier"), "mode": c.get("mode"), "pov": c.get("pov"),
            "ceilingWords": c.get("ceilingWords"), "independentSources": n.get("independentSources"),
            "licenceClean": n.get("licenceClean"), "datedEvents": n.get("datedEvents"),
            "ownWords": n.get("ownWords"), "wordsAboutSubject": n.get("wordsAboutSubject"),
            "edgeCheck": check.get("verdict"), "counted": bool(c),
            "years": [c.get("firstEventYear"), c.get("lastEventYear")],
        })
    rows.sort(key=lambda r: (TIER_ORDER.get(r["tier"], 9), -(r["wordsAboutSubject"] or 0)))
    return rows


def cmd_table(stories_dir, as_json=False):
    rows = table_rows(stories_dir)
    if as_json:
        print(json.dumps(rows, indent=1, ensure_ascii=False))
        return 0
    head = f"{'episode':<34} {'tier':<4} {'mode':<9} {'pov':<6} {'ceiling':>7} {'srcs':>4} {'clean':>5} {'events':>6} {'own':>3} {'words':>6}  edge check"
    print(head)
    print("-" * len(head))
    for r in rows:
        print(f"{r['subject'][:34]:<34} {r['tier'] or '—':<4} {r['mode'] or '—':<9} {r['pov'] or '—':<6} "
              f"{r['ceilingWords'] or '—':>7} {r['independentSources'] if r['independentSources'] is not None else '—':>4} "
              f"{r['licenceClean'] if r['licenceClean'] is not None else '—':>5} {r['datedEvents'] if r['datedEvents'] is not None else '—':>6} "
              f"{r['ownWords'] if r['ownWords'] is not None else '—':>3} {r['wordsAboutSubject'] or '—':>6}  "
              f"{r['edgeCheck'] or ('not counted' if not r['counted'] else 'not re-checked')}")
    return 0


def main(argv):
    if len(argv) >= 3 and argv[1] == "table":
        return cmd_table(argv[2], "--json" in argv)
    if len(argv) < 3 or argv[1] not in ("dossier", "plan", "validate", "mentions"):
        print(__doc__)
        return 2
    project = Project(argv[2])
    if argv[1] == "mentions":
        return cmd_mentions(project, argv)
    return {"dossier": cmd_dossier, "plan": cmd_plan, "validate": cmd_validate}[argv[1]](project)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
