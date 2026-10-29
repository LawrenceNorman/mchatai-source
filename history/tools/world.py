#!/usr/bin/env python3
"""The world around the story: a pool of period facts, each sourced, that chapters draw on (voice.md §9).

  world.py check <pool>                          every fact: a known topic, a `when`, a plain `what`, and
                                                 `evidence` verbatim (minQuoteWords+) in its fetched source;
                                                 then how many facts each topic holds
  world.py list <pool> [--topic <t>] [--stories <dir>]
                                                 the facts, one line each; with --stories, which story and
                                                 chapter has already told each one
  world.py adopt <pool> <story> <fact-id>...     copy each fact's source into the story's sources (once; a
                                                 source the story already has, by url, is reused) and print
                                                 the story's own source id for each, which its claim cites
  world.py used <stories-dir> <pool-id>          which story and chapter told each fact: era claims whose
                                                 `about` is the fact's id, in every story whose project.json
                                                 names this pool as its `world`

A pool is a folder like a story's: `world.json` (the facts), `project.json` (its domain) and
`sources/` (index.json and the fetched texts), so `fetch.py` and `richness.py mentions` work on it.
It lives at `stories/_world/<id>/`; a story names it in project.json `"world": "<id>"`, and a war told
in seasons (campaign.md) shares one pool, so no season tells what another already has.

The author, 2026-10-28: "a few sentences or a paragraph here and there every page or two or three
might help pull the reader into the time", "accurate (and verifyable)", "we don't want to over do
this or become overly repeatitive about it over the course of the book".
"""
import os
import re
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import HISTORY, Project, finding, load_json, norm, save_json, thresholds, words  # noqa: E402


def pool_facts(pool):
    return (load_json(pool.path("world.json"), {}) or {}).get("facts") or []


def topics(pool):
    return ((thresholds(pool).get("world") or {}).get("topics") or {})


def fact_problems(pool, fact, t, known_topics):
    out = []
    fid = fact.get("id") or "?"
    if known_topics and fact.get("topic") not in known_topics:
        out.append(f"{fid}: topic {fact.get('topic')!r} is not one of {', '.join(known_topics)}")
    if not str(fact.get("what") or "").strip():
        out.append(f"{fid}: no `what` (the fact, in one plain sentence)")
    if not str(fact.get("when") or "").strip():
        out.append(f"{fid}: no `when`: the time the fact holds for (\"Caesar's day\", \"a century later\", "
                   "\"found by archaeologists in 1860\"), so a writer never moves it into the wrong age")
    sid = str(fact.get("source") or "")
    text = pool.source_text(sid) if sid in pool.sources else None
    ev = fact.get("evidence") or ""
    if text is None:
        out.append(f"{fid}: source {sid or '(none)'} is not fetched into the pool")
    elif words(ev) < t["minQuoteWords"] or norm(ev) not in norm(text):
        out.append(f"{fid}: `evidence` is not a verbatim quote of {t['minQuoteWords']}+ words from {sid}")
    return out


def cmd_check(pool):
    t = thresholds(pool)
    facts = pool_facts(pool)
    known = topics(pool)
    problems, seen = [], {}
    for f in facts:
        problems += fact_problems(pool, f, t, known)
        if f.get("id") in seen:
            problems.append(f"{f.get('id')}: the id is used twice")
        seen[f.get("id")] = True
    dup = {}
    for f in facts:
        dup.setdefault(norm(f.get("evidence") or ""), []).append(f.get("id"))
    for ids in dup.values():
        if len(ids) > 1:
            problems.append(f"{', '.join(map(str, ids))}: the same quote carries more than one fact")
    # A war's pool (stories/_world/<campaign id>): a fact whose `when` names a year of the war must
    # say whether it tells an event of that season (`tells`: "54 BC") or a custom any season may
    # tell (`tells`: null). The 57 BC pass told 54 BC's siege of Quintus Cicero's camp (2026-10-29).
    camp = load_json(os.path.join(HISTORY, "domains", (load_json(pool.path("project.json"), {}) or {}).get("domain")
                                  or "pivotal-history", "campaigns", f"{os.path.basename(pool.root)}.json"), None)
    if camp:
        years = {bc_year(s.get("when")) for s in camp.get("seasons") or []} - {None}
        for f in facts:
            named = {int(y) for y in re.findall(r"\b(\d+)\s*(?:[–-]\s*\d+\s*)?BC\b", f.get("when") or "")}
            if named & years and "tells" not in f:
                problems.append(f"{f.get('id')}: `when` names a year of the war ({f.get('when')}); set `tells` to the "
                                "season of the event it tells (\"54 BC\"), or null for a custom any season may tell")
    counts = {k: 0 for k in known}
    for f in facts:
        counts[f.get("topic")] = counts.get(f.get("topic"), 0) + 1
    print(f"{len(facts)} facts: " + ", ".join(f"{k} {v}" for k, v in counts.items()))
    for p in problems:
        print("  ✗ " + p)
    print("OK" if not problems else f"{len(problems)} problem(s)")
    return 0 if not problems else 1


def used(stories, pool_id):
    """{fact id: [(story slug, chapter n)]} over every story that names this pool."""
    out = {}
    if not os.path.isdir(stories):
        return out
    for slug in sorted(os.listdir(stories)):
        p = Project(os.path.join(stories, slug))
        meta = load_json(p.path("project.json"), {}) or {}
        if meta.get("world") != pool_id:
            continue
        for n in p.chapter_numbers():
            for c in (p.chapter(n) or {}).get("claims") or []:
                if c.get("kind") == "era" and c.get("about"):
                    out.setdefault(c["about"], [])
                    if (slug, n) not in out[c["about"]]:
                        out[c["about"]].append((slug, n))
    return out


def planned(stories, pool_id):
    """{fact id: [(story slug, chapter n)]} from every plan.json that names this pool's facts."""
    out = {}
    if not os.path.isdir(stories):
        return out
    for slug in sorted(os.listdir(stories)):
        p = Project(os.path.join(stories, slug))
        meta = load_json(p.path("project.json"), {}) or {}
        if meta.get("world") != pool_id:
            continue
        for ch in (p.plan or {}).get("chapters") or []:
            for pick in ch.get("context") or []:
                out.setdefault(pick.get("fact"), []).append((slug, ch.get("n")))
    return out


def bc_year(text):
    """The first year in "54 BC", "51–50 BC" or 54 as a number of years BC, else None."""
    if isinstance(text, (int, float)):
        return int(text)
    m = re.search(r"\d+", str(text or ""))
    return int(m.group()) if m else None


def campaign_of(project):
    """(campaign file, this story's season) for a story that is one season of a war, else (None, None)."""
    meta = load_json(project.path("project.json"), {}) or {}
    cid = meta.get("campaign")
    if not cid:
        return None, None
    camp = load_json(os.path.join(HISTORY, "domains", meta.get("domain") or "pivotal-history", "campaigns",
                                  f"{cid}.json"), None)
    if not camp:
        return None, None
    slug = os.path.basename(project.root)
    season = next((s for s in camp.get("seasons") or [] if slug in (s.get("slug"), s.get("story"))), None)
    return camp, season


def later_season(fact, season):
    """A fact that tells an event of the war (`tells`, its season's year) later than this season: it
    would tell a later season's story early (campaign.md §3: never tell how a later season ends)."""
    told, here = bc_year(fact.get("tells")), bc_year((season or {}).get("when"))
    return told is not None and here is not None and told < here


def story_pool(project):
    """(pool Project, pool id) for a story whose project.json names a `world`, else (None, None)."""
    pid = (load_json(project.path("project.json"), {}) or {}).get("world")
    if not pid:
        return None, None
    return Project(os.path.join(os.path.dirname(project.root), "_world", pid)), pid


def pick_range(ceiling, c):
    """How many world facts a body chapter of this ceiling carries: about one a `wordsPerPick`."""
    lo, hi = c.get("perChapter", [1, 3])
    if not ceiling or ceiling < c.get("minChapterWords", 700):
        return 0, hi
    return lo, max(lo, min(hi, round(ceiling / c.get("wordsPerPick", 700))))


def plan_findings(project, chapters, t):
    """The plan's `context` picks (voice.md §9): known facts, each told once in the whole book (and
    in a war told in seasons, once across them), about one a page or two or three."""
    c = t.get("context") or {}
    pool, pid = story_pool(project)
    if pool is None or not c:
        return []
    out = []
    facts = {f.get("id"): f for f in pool_facts(pool)}
    if not facts:
        return [finding("world_empty", "hard", f"project.json names world {pid!r}, but stories/_world/{pid}/world.json "
                        "holds no facts: run the world job (history/jobs/world.md) first")]
    stories = os.path.dirname(project.root)
    me = os.path.basename(project.root)
    elsewhere = {}
    for table in (used(stories, pid), planned(stories, pid)):
        for fid, where in table.items():
            for slug, n in where:
                if slug != me:
                    elsewhere.setdefault(fid, set()).add(slug)
    adopted = {norm(project.source_text(sid) or "") for sid in project.sources}
    _, season = campaign_of(project)
    seen = {}
    for ch in chapters:
        picks = ch.get("context") or []
        for p in picks:
            fid = p.get("fact")
            f = facts.get(fid)
            if f is None:
                out.append(finding("context_unknown", "hard", f"chapter {ch.get('n')} picks world fact {fid!r}, which "
                                   f"stories/_world/{pid}/world.json does not hold"))
                continue
            if fid in seen:
                out.append(finding("context_twice", "hard", f"world fact {fid} is picked by chapters {seen[fid]} and "
                                   f"{ch.get('n')}: a book tells each fact once"))
            seen[fid] = ch.get("n")
            if fid in elsewhere:
                out.append(finding("context_repeat", "hard", f"world fact {fid} is already told or planned in "
                                   f"{', '.join(sorted(elsewhere[fid]))}: pick another (the author: not \"overly "
                                   "repeatitive about it over the course of the book\")"))
            if later_season(f, season):
                out.append(finding("context_later_season", "hard",
                                   f"world fact {fid} tells an event of {f.get('tells')}, a later season than this "
                                   f"one ({season.get('when')}): it would tell that season's story early. Pick another"))
            if not str(p.get("at") or "").strip():
                out.append(finding("context_unplaced", "soft", f"chapter {ch.get('n')}'s pick {fid} has no `at`: the "
                                   "moment in the chapter it belongs to, where the reader meets it"))
            if not any(norm(f.get("evidence") or "") in text for text in adopted):
                out.append(finding("context_not_adopted", "hard", f"world fact {fid}'s source is not in this story's "
                                   f"sources: run `world.py adopt stories/_world/{pid} {project.root} {fid}`"))
        if ch.get("role") == "afterword":
            if picks:
                out.append(finding("context_in_afterword", "soft", f"the afterword picks world facts; they belong "
                                   "in the chapters, where the story is"))
            continue
        lo, hi = pick_range(ch.get("ceilingWords"), c)
        if not lo <= len(picks) <= hi:
            out.append(finding("context_count", "soft",
                               f"chapter {ch.get('n')} picks {len(picks)} world fact(s); at its ceiling of "
                               f"{ch.get('ceilingWords')} words it takes {lo} to {hi}, about one a "
                               f"{c.get('wordsPerPick', 700)} words (voice.md §9)"))
    return out


def chapter_findings(project, n, claims, t):
    """Each fact the plan picked for chapter n is told, as claims of kind `era` whose `about` is its
    id, and kept short; a fact the plan did not pick is noted, since nothing else stops it repeating."""
    c = t.get("context") or {}
    pool, pid = story_pool(project)
    if pool is None or not c:
        return []
    pc = project.plan_chapter(n) or {}
    picks = [p.get("fact") for p in pc.get("context") or []]
    out = []
    told = {}
    for cl in claims:
        if cl.get("kind") == "era" and cl.get("about"):
            told.setdefault(cl["about"], []).append(cl)
    for fid in picks:
        if fid not in told:
            out.append(finding("context_missing", "hard",
                               f"plan.json gives this chapter world fact {fid} and no claim of kind `era` has `\"about\": "
                               f"\"{fid}\"`: tell it where the plan's `at` says, in a sentence or two (voice.md §9)"))
    cap = c.get("maxWordsPerPick", 90)
    facts = {f.get("id"): f for f in pool_facts(pool)}
    _, season = campaign_of(project)
    for fid, cls in told.items():
        if later_season(facts.get(fid) or {}, season):
            out.append(finding("context_later_season", "hard",
                               f"this chapter tells world fact {fid}, an event of {facts[fid].get('tells')}, a later "
                               f"season than {season.get('when')}: cut it and tell the plan's replacement"))
        if fid not in picks:
            out.append(finding("context_unplanned", "soft",
                               f"an era claim is about world fact {fid}, which the plan did not give this chapter: "
                               "add it to the plan's `context`, so no other chapter or season tells it again"))
        n_words = sum(words(x.get("text") or "") for x in cls)
        if n_words > cap:
            out.append(finding("context_long", "soft",
                               f"world fact {fid} takes {n_words} words here; keep it to a sentence or two, at most a "
                               f"short paragraph ({cap} words), so the story is not stopped for it"))
    return out


def cmd_list(pool, topic=None, stories=None):
    told = used(stories, os.path.basename(pool.root)) if stories else {}
    for f in pool_facts(pool):
        if topic and f.get("topic") != topic:
            continue
        where = "; ".join(f"{s} ch{n}" for s, n in told.get(f.get("id"), []))
        print(f"{f.get('id'):>5} [{f.get('topic')}] {f.get('what')}  ({f.get('when')}; {f.get('source')})"
              + (f"  — told in {where}" if where else ""))
    return 0


def adopt(pool, story, fact_ids):
    """Copy each fact's source into the story; [(fact id, story source id, evidence)]."""
    facts = {f.get("id"): f for f in pool_facts(pool)}
    path = story.path("sources", "index.json")
    raw = load_json(path, [])
    rows = raw.get("sources", []) if isinstance(raw, dict) else raw
    by_url = {r.get("url"): r["id"] for r in rows if r.get("url")}
    taken = {str(r["id"]) for r in rows}
    out = []
    for fid in fact_ids:
        f = facts.get(fid)
        if not f:
            raise SystemExit(f"no fact {fid!r} in {pool.root}/world.json")
        src = pool.sources.get(str(f.get("source")))
        if not src:
            raise SystemExit(f"fact {fid}: source {f.get('source')!r} is not in the pool's sources")
        sid = by_url.get(src.get("url"))
        if not sid:
            k = 1
            while f"s{k}" in taken:
                k += 1
            sid = f"s{k}"
            taken.add(sid)
            row = dict(src, id=sid, file=f"sources/{sid}.txt", world=os.path.basename(pool.root))
            for key in ("ownWords", "ownWordsSpan", "_spanNote"):
                row.pop(key, None)              # whose own words a source holds is a story's call
            shutil.copyfile(pool.path(src.get("file") or f"sources/{src['id']}.txt"), story.path(row["file"]))
            rows.append(row)
            if src.get("url"):
                by_url[src["url"]] = sid
        out.append((fid, sid, f.get("evidence")))
    if isinstance(raw, dict):
        raw["sources"] = rows
        save_json(path, raw)
    else:
        save_json(path, rows)
    return out


def cmd_adopt(pool, story, fact_ids):
    for fid, sid, ev in adopt(pool, story, fact_ids):
        print(f"{fid} → {sid}: “{ev}”")
    return 0


def cmd_used(stories, pool_id):
    told = used(stories, pool_id)
    for fid in sorted(told, key=lambda x: (len(x), x)):
        print(f"{fid}: " + "; ".join(f"{s} ch{n}" for s, n in told[fid]))
    print(f"{len(told)} fact(s) told")
    return 0


def _flag(argv, name):
    return argv[argv.index(name) + 1] if name in argv and argv.index(name) + 1 < len(argv) else None


def main(argv):
    if len(argv) >= 3 and argv[1] == "check":
        return cmd_check(Project(argv[2]))
    if len(argv) >= 3 and argv[1] == "list":
        return cmd_list(Project(argv[2]), _flag(argv, "--topic"), _flag(argv, "--stories"))
    if len(argv) >= 5 and argv[1] == "adopt":
        return cmd_adopt(Project(argv[2]), Project(argv[3]), argv[4:])
    if len(argv) >= 4 and argv[1] == "used":
        return cmd_used(argv[2], argv[3])
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
