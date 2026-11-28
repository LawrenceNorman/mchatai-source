#!/usr/bin/env python3
"""A season's mathematics lesson (domains/pivotal-history/campaign.md §7). A campaign whose seasons
carry a `mathematics` block teaches as well as tells: each season's plan has one lesson chapter
(plan role "lesson"), after the story's last chapter and before the afterword, and the seasons'
concepts form a ladder that climbs in episode order and never reaches forward.

  lesson.py check <campaign-id>     the ladder: every concept has an id, an idea and terms; ids are
                                    unique; `buildsOn` names a concept of an earlier season, or one
                                    listed before it in its own; no lead names a later season's concept
  lesson.py ladder <campaign-id>    the ladder as a table, season by season: level, concepts, and
                                    what each builds on
  lesson.py terms <project>         every word in the story's chapters that names a later season's
                                    concept, chapter by chapter

Run by richness.py plan, for a season whose campaign file gives it `mathematics`:
  lesson_missing          hard  the plan has no lesson chapter
  lesson_twice            hard  it has more than one
  lesson_misplaced        hard  the lesson is not right after the story's chapters (before the
                                afterword, when there is one)
  lesson_has_events       hard  the lesson is allotted dossier events: the story's chapters tell them
  lesson_concepts_unknown hard  its `concepts` names an id of no season up to this one
  lesson_concepts_missing soft  this season's concepts it does not list

Run by gate.py on every chapter of a season of such a campaign:
  later_idea              soft  a word that names a later season's concept (its `terms`), outside a
                                quotation: the reader of an early season must not be handed a later
                                season's idea (campaign.md §3, §6). Soft, for the auditor: "a cubic"
                                in a Greek season may be a solid, not an equation.
  lesson_concept_unnamed  soft  in the lesson, a concept it lists whose terms it never uses
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import HISTORY, Project, finding, load_json, report, strip_quoted, thresholds  # noqa: E402


def campaign_file(cid, domain="pivotal-history"):
    return load_json(os.path.join(HISTORY, "domains", domain, "campaigns", f"{cid}.json"), None)


def teaches(camp):
    """True for a campaign whose seasons carry the mathematics ladder."""
    return bool(camp) and any(isinstance(s.get("mathematics"), dict) for s in camp.get("seasons") or [])


def season_of(project):
    """(campaign, season) for a story that is a season of a teaching campaign, else (None, None)."""
    import world
    camp, season = world.campaign_of(project)
    if not teaches(camp) or season is None:
        return None, None
    return camp, season


def concepts(season):
    return [c for c in ((season or {}).get("mathematics") or {}).get("concepts") or [] if isinstance(c, dict)]


def ladder(camp):
    """[(episode, season, [concept, …])] in episode order."""
    rows = sorted(camp.get("seasons") or [], key=lambda s: s.get("episode", 0))
    return [(s.get("episode"), s, concepts(s)) for s in rows]


def known_through(camp, episode):
    """{concept id} taught by this season or any earlier one."""
    return {c.get("id") for ep, _, cs in ladder(camp) if ep is not None and ep <= episode for c in cs}


def term_pattern(term):
    return re.compile(r"(?<![\w-])" + re.escape(term) + r"(?![\w-])", re.I)


def later_terms(camp, season):
    """[(term, episode, concept id)] naming a concept of a later season than `season`."""
    here = season.get("episode", 0)
    out = []
    for ep, _, cs in ladder(camp):
        if ep is None or ep <= here:
            continue
        for c in cs:
            for t in c.get("terms") or []:
                out.append((t, ep, c.get("id")))
    return out


def lesson_words(project, season=None):
    """[floor, ceiling] for the lesson: the season's `lessonWords`, else the domain's `lesson.words`."""
    if season is None:
        _, season = season_of(project)
    own = ((season or {}).get("mathematics") or {}).get("lessonWords")
    if isinstance(own, list) and len(own) == 2:
        return own
    return (thresholds(project).get("lesson") or {}).get("words") or [800, 2400]


def try_it_questions(project):
    """How many questions the lesson's Try it box asks: the season's `tryIt`, else None."""
    _, season = season_of(project)
    n = ((season or {}).get("mathematics") or {}).get("tryIt")
    return n if isinstance(n, int) and n > 0 else None


# ── the plan ─────────────────────────────────────────────────────────────────

def plan_findings(project, chapters):
    camp, season = season_of(project)
    if season is None or not isinstance(season.get("mathematics"), dict):
        return []
    lessons = [c for c in chapters if c.get("role") == "lesson"]
    if not lessons:
        return [finding("lesson_missing", "hard",
                        f"season {season.get('episode')} teaches its mathematics (the campaign file's `mathematics`), "
                        "and the plan has no lesson: add one chapter with \"role\": \"lesson\" after the story's last "
                        "chapter and before the afterword, its `concepts` this season's (campaign.md §7)")]
    out = []
    if len(lessons) > 1:
        out.append(finding("lesson_twice", "hard", "the plan has more than one lesson; a season has one, after its story"))
    lesson = lessons[0]
    i = chapters.index(lesson)
    after = chapters[i + 1:]
    if any(c.get("role") != "afterword" for c in after) or any(c.get("role") in ("lesson",) for c in chapters[:i]):
        out.append(finding("lesson_misplaced", "hard",
                           f"the lesson (chapter {lesson.get('n')}) comes right after the story's last chapter, with only "
                           "the afterword after it (campaign.md §7)"))
    if lesson.get("events"):
        out.append(finding("lesson_has_events", "hard",
                           f"the lesson (chapter {lesson.get('n')}) is allotted events; the story's chapters tell them, "
                           "and the lesson's facts are claims like any chapter's"))
    listed = [str(x) for x in lesson.get("concepts") or []]
    known = known_through(camp, season.get("episode", 0))
    unknown = [x for x in listed if x not in known]
    if unknown:
        out.append(finding("lesson_concepts_unknown", "hard",
                           f"the lesson lists {', '.join(unknown)}, which no season up to this one teaches "
                           "(the campaign file's `mathematics`); a lesson never reaches forward"))
    missing = [c.get("id") for c in concepts(season) if c.get("id") not in listed]
    if missing:
        out.append(finding("lesson_concepts_missing", "soft",
                           f"this season's concepts the lesson does not list: {', '.join(missing)}"))
    return out


# ── the chapters ─────────────────────────────────────────────────────────────

def later_idea_findings(project, ch, camp, season):
    text = strip_quoted(ch.get("text", ""))
    out, seen = [], set()
    for term, ep, cid in later_terms(camp, season):
        m = term_pattern(term).search(text)
        if not m or term.lower() in seen:
            continue
        seen.add(term.lower())
        a = text.rfind("\n", 0, m.start()) + 1
        b = text.find("\n", m.end())
        out.append(finding("later_idea", "soft",
                           f"{term!r} names {cid}, the idea of season {ep}: this season must not hand it over early "
                           "(campaign.md §3, §6). A writer's sentence may look ahead without naming it",
                           text[a:b if b > 0 else len(text)].strip()[:200]))
    return out


def lesson_chapter_findings(project, n, ch, camp):
    pc = project.plan_chapter(n) or {}
    if pc.get("role") != "lesson":
        return []
    by_id = {c.get("id"): c for _, _, cs in ladder(camp) for c in cs}
    text = ch.get("text", "")
    out = []
    for cid in pc.get("concepts") or []:
        c = by_id.get(cid)
        if c and not any(term_pattern(t).search(text) for t in c.get("terms") or []):
            out.append(finding("lesson_concept_unnamed", "soft",
                               f"the lesson lists {cid} and never names it ({', '.join(c.get('terms') or [])}): teach it "
                               "by its name, so the reader can find it again"))
    return out


def chapter_findings(project, n, ch):
    camp, season = season_of(project)
    if season is None:
        return []
    return later_idea_findings(project, ch, camp, season) + lesson_chapter_findings(project, n, ch, camp)


# ── the campaign file ────────────────────────────────────────────────────────

LEAD_KEYS = ("asWritten", "workedExample", "whereItStopped")


def check_findings(camp):
    out = []
    seen = {}
    for ep, s, cs in ladder(camp):
        m = s.get("mathematics")
        if m is None:
            continue
        if not isinstance(m, dict):
            out.append(finding("math_block", "hard", f"season {ep}: `mathematics` must be an object"))
            continue
        for key in ("level", "concepts", "tryIt", "lessonWords"):
            if not m.get(key):
                out.append(finding("math_block_incomplete", "hard", f"season {ep}: `mathematics` has no `{key}`"))
        before_in_season = set()
        for c in cs:
            cid = c.get("id")
            if not cid or not str(c.get("idea") or "").strip() or not c.get("terms"):
                out.append(finding("concept_incomplete", "hard",
                                   f"season {ep}: concept {cid or '(no id)'} needs an `id`, an `idea` and `terms`"))
            if cid in seen:
                out.append(finding("concept_twice", "hard", f"concept {cid} is in season {seen[cid]} and season {ep}"))
            for b in c.get("buildsOn") or []:
                if b in before_in_season:
                    continue
                if b not in seen:
                    where = next((e for e, _, xs in ladder(camp) for x in xs if x.get("id") == b), None)
                    why = f"a concept of season {where}, a later one" if where else "a concept no season teaches"
                    out.append(finding("builds_forward", "hard",
                                       f"season {ep}: {cid} builds on {b}, {why}; the ladder never reaches forward"))
            seen[cid] = ep
            before_in_season.add(cid)
        lead = " ".join(str(m.get(k) or "") for k in LEAD_KEYS) + " " + " ".join(str(c.get("idea") or "") for c in cs)
        for term, later, cid in later_terms(camp, s):
            if term_pattern(term).search(lead):
                out.append(finding("lead_later_idea", "soft",
                                   f"season {ep}'s leads say {term!r}, the name of {cid} (season {later})"))
    terms = {}
    for ep, _, cs in ladder(camp):
        for c in cs:
            for t in c.get("terms") or []:
                terms.setdefault(t.lower(), []).append(f"{c.get('id')} (season {ep})")
    for t, where in sorted(terms.items()):
        if len(where) > 1:
            out.append(finding("term_shared", "soft", f"{t!r} names more than one concept: {', '.join(where)}"))
    return out


def cmd_check(cid):
    camp = campaign_file(cid)
    if not camp:
        print(f"no campaign file {cid}.json")
        return 2
    if not teaches(camp):
        print(f"{cid}: no season carries `mathematics`")
        return 0
    return report(f"ladder {cid}", check_findings(camp))


def cmd_ladder(cid):
    camp = campaign_file(cid)
    if not camp or not teaches(camp):
        print(f"{cid}: no ladder")
        return 2
    for ep, s, cs in ladder(camp):
        m = s.get("mathematics") or {}
        print(f"{ep:>2}  {s.get('when', '')}  {s.get('slug')}")
        print(f"    {m.get('level', '(no level)')}  ·  lesson {'–'.join(map(str, m.get('lessonWords') or []))} words, "
              f"{m.get('tryIt', '?')} Try it questions")
        for c in cs:
            builds = f"  ← {', '.join(c.get('buildsOn'))}" if c.get("buildsOn") else ""
            print(f"      {c.get('id')}{builds}")
    total = sum(len(cs) for _, _, cs in ladder(camp))
    print(f"{len(ladder(camp))} seasons, {total} concepts")
    return 0


def cmd_terms(project):
    camp, season = season_of(project)
    if season is None:
        print("not a season of a campaign that teaches its mathematics")
        return 0
    hits = 0
    for n in project.chapter_numbers():
        for f in later_idea_findings(project, project.chapter(n) or {}, camp, season):
            hits += 1
            print(f"ch{n}: {f['message']}\n      {f['sentence']}")
    print(f"{hits} later idea(s) named")
    return 0


def main(argv):
    if len(argv) >= 3 and argv[1] == "check":
        return cmd_check(argv[2])
    if len(argv) >= 3 and argv[1] == "ladder":
        return cmd_ladder(argv[2])
    if len(argv) >= 3 and argv[1] == "terms":
        return cmd_terms(Project(argv[2]))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
