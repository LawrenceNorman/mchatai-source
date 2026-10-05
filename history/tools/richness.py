#!/usr/bin/env python3
"""Is there enough record to carry a story — and how long, and what shape?

The model never asserts a tier. This computes it from what was actually fetched:

  richness.py dossier  <project>   count the record, pick tier + mode + ceiling, write dossier.computed
  richness.py plan     <project>   check the plan against the dossier, write each chapter's ceiling
  richness.py validate <project>   structural checks only; writes nothing
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
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import Project, finding, load_json, norm, report, save_json, thresholds, words  # noqa: E402,F401

# A year, or a decade ("1890s" reads as 1890): sources often date a life only by decade.
YEAR = re.compile(r"\b(1[5-9]\d\d|20\d\d)(?=s?\b)")


def year_of(date):
    m = YEAR.search(str(date or ""))
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
    t = thresholds()
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
    stages = {e.get("lifeStage") for e in events if e.get("lifeStage")}
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
    for tid, why in computed["unmet"].items():
        print(f"  not tier {tid}: {'; '.join(why)}")
    if computed["tier"] is None:
        problems.append(finding("not_enough_record", "hard",
                                "below tier C — put this person on the research list, not into a story"))
    return report("dossier", problems)


def validate_plan(project, write):
    d, plan, t = project.dossier, project.plan, thresholds()
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
        allotted += len(ch.get("events", []))
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
    thin = [ch for ch in chapters if target and allotted and len(chapters) > 2
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


def main(argv):
    if len(argv) < 3 or argv[1] not in ("dossier", "plan", "validate", "mentions"):
        print(__doc__)
        return 2
    project = Project(argv[2])
    if argv[1] == "mentions":
        return cmd_mentions(project, argv)
    return {"dossier": cmd_dossier, "plan": cmd_plan, "validate": cmd_validate}[argv[1]](project)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
