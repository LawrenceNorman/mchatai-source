#!/usr/bin/env python3
"""Voice v2 for an episode: the writer's own sentences, the cold open, the cast, the afterword
and the picture floor (domains/pivotal-history/voice.md §2a, §10–§13; storytelling.md).

  storytelling.py writer  <project> <n>   the chapter's sentences, each marked W (the writer's own:
                                          it anchors no claim) or with the ids of the claims it anchors
  storytelling.py cast    <project>       the cast: each entry, its line, the chapter the plan
                                          introduces it in, and where the chapters first name it
  storytelling.py measure <project>       the measures the author's A/B reads (plan §7), per chapter:
                                          words, the writer's share, questions, words a sentence,
                                          reading grade, pictures

A writer's sentence is drawn by the anchors the writer already supplies: a sentence that anchors
no claim is the writer's own. It may ask, scale, weigh, read or draw a lesson (storytelling.md),
and never adds a fact. Inside one, the rules thresholds `writer.exemptRules` names do not fire
(the way `pov.l1ExemptRules` works inside a declared passage).

Every check here is off unless the project's domain asks for it (thresholds `writer`, `intro`,
`cast`, `pictures`, `eraShareScope`), so a History Writer life gates exactly as it did.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import (Project, finding, norm, numbers, quoted_spans, report, spelled_numbers,  # noqa: E402
                 strip_quoted, thresholds, voice_version, words)


def v2(project):
    """True for a story told in voice v2 (project.json "voice": 2) in a domain that has the writer's
    rules. Its hard rules and the writer's relaxed rules bind only such a story; a story told
    before v2 gets the measuring notes (writer_absent, intro_question_missing) and nothing else."""
    return isinstance(thresholds(project).get("writer"), dict) and voice_version(project) >= 2


# ── sentences with their places in the text ──────────────────────────────────

def sentence_spans(text):
    """[(paragraph index, sentence index, start, end, sentence)] with offsets into `text`, in the
    order and with the splitting of cite.flat_sentences, so index i here is sentence i there."""
    import cite
    out, pi, pos = [], 0, 0
    text = text or ""
    for sep in list(re.finditer(r"\n\s*\n", text)) + [None]:
        stop = sep.start() if sep else len(text)
        raw = text[pos:stop]
        para = raw.strip()
        if para:
            lead = pos + (len(raw) - len(raw.lstrip()))
            for si, (a, b) in enumerate(cite.sentences(para)):
                out.append((pi, si, lead + a, lead + b, para[a:b]))
            pi += 1
        pos = sep.end() if sep else len(text)
    return out


def chapter_role(project, n):
    return ((project.plan_chapter(n) or {}).get("role") or ("intro" if int(n) == 0 else "chapter"))


def anchored(ch, spans=None):
    """{sentence index: [claims]} for the live claims whose anchor resolves to one sentence."""
    import cite
    sents = [(pi, si, s) for pi, si, _, _, s in (spans if spans is not None else sentence_spans(ch.get("text", "")))]
    out = {}
    for c in cite.live_claims(ch):
        if c.get("anchor"):
            hits = cite.resolve(c["anchor"], sents)
            if len(hits) == 1:
                out.setdefault(hits[0], []).append(c)
    return out


def classify(ch, l1=()):
    """(spans, writer, relaxed): every sentence with its offsets; the indexes of the writer's own
    sentences (no anchored claim, outside a declared passage); and the indexes where the writer's
    exemptions apply: the writer's sentences, and a sentence whose every claim is a sourced
    comparison (kind `scale`), which is the writer's comparison with its figure sourced."""
    spans = sentence_spans(ch.get("text", ""))
    anc = anchored(ch, spans)
    writer, relaxed = [], []
    for i, (_, _, a, _, _) in enumerate(spans):
        if any(x <= a < y for x, y in l1):
            continue
        claims = anc.get(i)
        if not claims:
            writer.append(i)
            relaxed.append(i)
        elif all(c.get("kind") == "scale" for c in claims):
            relaxed.append(i)
    return spans, writer, relaxed


# ── specifics: what a writer's sentence may not add ──────────────────────────

MONTHS = set("january february march april may june july august september october november december".split())
NAME = re.compile(r"(?<![\w'’])([A-ZÀ-Þ][\w'’-]*)")
ROMAN = re.compile(r"^[IVXLC]+$")


def _stem(w):
    w = norm(w).strip("'’.,;:!?()\"")
    w = re.sub(r"['’]s$", "", w)
    return w[:-1] if len(w) > 3 and w.endswith("s") else w


def number_values(text):
    vals = set()
    for tok in numbers(text):
        t = tok.replace(",", "")
        try:
            vals.add(float(t))
        except ValueError:
            pass
    vals |= {float(v) for _, v in spelled_numbers(text)}
    return vals


def cast_entries(project):
    """The cast: the dossier's people[] and peoples[], each {name, keys, who, source, evidence,
    kind}. `keys` are the names a chapter may use for the entry: the name, a name in brackets
    ("Vergasillaunus (Vercassivellaunus)"), the surname of a person's full name, and `aliases`."""
    d = project.dossier or {}
    out = []
    for kind, rows in (("person", d.get("people") or []), ("people", d.get("peoples") or [])):
        for r in rows:
            name = (r.get("name") or "").strip()
            if not name:
                continue
            keys = [re.sub(r"\s*\(.*?\)\s*", " ", name).strip()]
            keys += re.findall(r"\(([^)]+)\)", name)
            if kind == "person":
                parts = keys[0].split()
                if len(parts) > 1 and len(parts[-1]) > 3:
                    keys.append(parts[-1])
            keys += [a for a in r.get("aliases") or [] if a]
            seen, uniq = set(), []
            for k in keys:
                if k and k.lower() not in seen:
                    seen.add(k.lower())
                    uniq.append(k)
            out.append({"name": name, "keys": uniq, "who": r.get("who") or "", "source": r.get("source") or "",
                        "evidence": r.get("evidence") or "", "kind": kind})
    return out


def key_pattern(keys):
    return re.compile(r"(?<![\w-])(?:" + "|".join(re.escape(k) for k in sorted(keys, key=len, reverse=True)) + r")(?![\w-])")


def specific_findings(spans, writer, ch, project, cfg):
    """writer_specific: a number, a month, a name or a place in a writer's sentence that no anchored
    sentence of the chapter (or the cast list) states, and any quotation (a quotation is a sourced
    fact: anchor its claim on that sentence)."""
    wset = set(writer)
    stated = " ".join(s for i, (_, _, _, _, s) in enumerate(spans) if i not in wset)
    have_vals = number_values(stated)
    ignore = {float(v) for v in cfg.get("specificIgnoreValues", [1])}
    have_names = {_stem(w) for w in re.findall(r"[\w'’-]+", stated)}
    for e in cast_entries(project):
        for k in e["keys"]:
            have_names |= {_stem(w) for w in re.findall(r"[\w'’-]+", k)}
    text = ch.get("text", "")
    # A capital at the start of a sentence is a name only if the chapter also capitalises it inside one.
    mid_caps = set()
    for i, (_, _, _, _, s) in enumerate(spans):
        for m in NAME.finditer(strip_quoted(s)):
            if m.start() > 0 and not re.search(r"[:;.!?]\s*$", s[:m.start()]):
                mid_caps.add(_stem(m.group(1)))
    out = []
    for i in writer:
        s = spans[i][4]
        bare = strip_quoted(s)
        why = []
        for v in sorted(number_values(bare) - have_vals - ignore):
            why.append(f"the number {int(v) if v == int(v) else v}")
        for m in NAME.finditer(bare):
            w = m.group(1).rstrip("'’-")
            st = _stem(w)
            if len(w) < 2 or ROMAN.match(w) or w.isupper() or st in have_names:
                continue
            if st in MONTHS:
                why.append(f"the month {w!r}")
                continue
            first = m.start() == 0 or bool(re.search(r"[:;.!?]\s*$", bare[:m.start()]))
            if first and st not in mid_caps:
                continue
            why.append(f"the name {w!r}")
        for _, _, inner in quoted_spans(s):
            if words(inner) >= 3:
                why.append("a quotation")
        if why:
            out.append(finding("writer_specific", "hard",
                               f"a writer's sentence (it anchors no claim) adds {', '.join(dict.fromkeys(why))}, which no "
                               "anchored sentence of this chapter or the cast states. The writer's sentences add no facts "
                               "(voice.md §2a): anchor a claim on this sentence, or cut the specific", s[:200]))
    return out


def feeling_pattern(cfg):
    verbs = "|".join(map(re.escape, cfg.get("feelingVerbs") or []))
    states = "|".join(map(re.escape, cfg.get("feelingStates") or []))
    who = r"(?:\b(?:he|she|they)\b|(?-i:\b[A-Z][\w'’-]+)|\bthe\s+(?-i:[A-Z][\w'’-]+))"
    parts = []
    if verbs:
        parts.append(who + r"\s+(?:(?:would|might|could|must|may)\s+)?(?:have\s+)?(?:" + verbs + r")\b")
    if states:
        parts.append(who + r"\s+(?:was|were|would be|would have been|must have been|felt)\s+(?:so\s+|very\s+)?(?:" + states + r")\b")
    return re.compile("|".join(parts), re.I) if parts else None


def writer_findings(project, n, ch, l1=()):
    """voice.md §2a: the writer's sentences, checked as such. [] unless the domain has a `writer`."""
    t = thresholds(project)
    cfg = t.get("writer")
    if not isinstance(cfg, dict):
        return []
    text = ch.get("text", "")
    spans, writer, _ = classify(ch, l1)
    out = []
    role = chapter_role(project, n)
    total = words(text)
    mine = sum(words(spans[i][4]) for i in writer)
    cap = cfg.get("afterwordMaxShare", 0.7) if role == "afterword" else cfg.get("maxShare", 0.25)
    if total and mine / total > cap:
        out.append(finding("writer_share", "hard",
                           f"the writer's own sentences are {100 * mine / total:.0f}% of this "
                           f"{'afterword' if role == 'afterword' else 'chapter'} (cap {100 * cap:.0f}%): the sourced "
                           "story carries it. Cut a question, a comparison or a reading, or anchor a claim on it"))
    if len(writer) < cfg.get("minSentences", 1):
        out.append(finding("writer_absent", "soft",
                           "no sentence here is the writer's own: every sentence anchors a claim, so nothing asks, scales, "
                           "weighs, reads or draws a lesson (voice.md §2a, storytelling.md). The first Alesia read 'stale and "
                           "nearly unengaging' this way"))
    if not v2(project):
        # Told before v2: an unanchored sentence there is not a writer's sentence by design, so only the
        # measure (writer_absent) applies; the hard rules wait until the story is told again.
        return [f for f in out if f["rule"] == "writer_absent"]
    out += specific_findings(spans, writer, ch, project, cfg)
    rx = feeling_pattern(cfg)
    if rx:
        for i in writer:
            s = spans[i][4]
            m = rx.search(strip_quoted(s))
            if m:
                out.append(finding("writer_feeling", "hard",
                                   f"{m.group(0).strip()!r}: a feeling or a thought given to someone who was there, in a "
                                   "sentence no source backs. Show what they did; offer a reading of a decision as a reading "
                                   "(voice.md §2a)", s[:200]))
    return out


def question_findings(project, ch, l1=()):
    """voice.md §10: the introduction asks the book's question, in a writer's sentence."""
    t = thresholds(project)
    if not (t.get("intro") or {}).get("requiresQuestion") or not isinstance(t.get("writer"), dict):
        return []
    spans, writer, _ = classify(ch, l1)
    if any(spans[i][4].rstrip("\"”’)").endswith("?") for i in writer):
        return []
    return [finding("intro_question_missing", "soft",
                    "the introduction asks no question: the cold open names the question the book answers, in a "
                    "writer's sentence (voice.md §10; the plan's `question`)")]


# ── the cold open keeps the ending ───────────────────────────────────────────

def shingles(text, k=8):
    ws = norm(text).split()
    return {" ".join(ws[i:i + k]) for i in range(len(ws) - k + 1)}


def outcome_findings(project, ch):
    """voice.md §10: the introduction does not give the ending away. The dossier's `outcome`
    names the events that resolve the episode and the phrases that would tell it."""
    t = thresholds(project)
    if not (t.get("intro") or {}).get("hidesOutcome"):
        return []
    d = project.dossier or {}
    oc = d.get("outcome")
    if not isinstance(oc, dict) or not (oc.get("events") or oc.get("phrases")):
        if not v2(project):
            return []
        return [finding("outcome_unmarked", "soft",
                        "the dossier has no `outcome` (the events that resolve the episode and three to six phrases that "
                        "would give it away; scout.md), so the gate cannot check the introduction keeps the ending")]
    events = {e.get("id"): e for e in d.get("events", [])}
    out = []
    import cite
    for eid in oc.get("events") or []:
        ev = (events.get(eid) or {}).get("evidence") or ""
        sh = shingles(ev)
        if not sh:
            continue
        for c in cite.live_claims(ch):
            if sh & shingles(c.get("evidence", "")):
                out.append(finding("intro_spoils_outcome", "hard",
                                   f"claim {c.get('id')} quotes the evidence of {eid}, an event that resolves the episode: the "
                                   "introduction keeps the ending (voice.md §10). Open on a scene, ask the question, orient the "
                                   "reader, and stop before the outcome", c.get("anchor") or c.get("text", "")[:160]))
    text = ch.get("text", "")
    for ph in oc.get("phrases") or []:
        m = re.search(r"(?<!\w)" + re.escape(ph) + r"(?!\w)", text, re.I)
        if m:
            from _hw import sentence_around
            out.append(finding("intro_spoils_outcome", "hard",
                               f"{m.group(0)!r} gives the ending away (dossier outcome.phrases): the introduction keeps it "
                               "(voice.md §10)", sentence_around(text, m.start(), m.end())))
    return out


# ── the cast, introduced on first meeting ────────────────────────────────────

def cast_assignments(project):
    """{entry name: [chapter numbers that introduce it]}: plan.intro.introduces (chapter 0) and each
    chapter's `introduces`."""
    plan = project.plan or {}
    out = {}
    for name in (plan.get("intro") or {}).get("introduces") or []:
        out.setdefault(name, []).append(0)
    for c in plan.get("chapters", []):
        for name in c.get("introduces") or []:
            out.setdefault(name, []).append(int(c.get("n")))
    return out


def entry_named(entries, label):
    lab = (label or "").strip().lower()
    for e in entries:
        if lab == e["name"].lower() or lab in (k.lower() for k in e["keys"]):
            return e
    return None


def cast_findings(project, n, ch):
    """voice.md §11: the chapter that introduces a cast entry says who they were, with a claim of kind
    `cast` (its `about` names the entry) in the paragraph of the first mention; a name used before
    the chapter that introduces it is noted."""
    t = thresholds(project)
    if not (t.get("cast") or {}).get("required") or not v2(project):
        return []
    entries = cast_entries(project)
    if not entries:
        return []
    assigned = cast_assignments(project)
    text = ch.get("text", "")
    spans = sentence_spans(text)
    anc = anchored(ch, spans)
    out = []
    n = int(n)
    for e in entries:
        where = assigned.get(e["name"]) or []
        rx = key_pattern(e["keys"])
        m = rx.search(text)
        if n in where:
            if not m:
                out.append(finding("cast_unintroduced", "hard",
                                   f"the plan has this chapter introduce {e['name']}, and it never names them (voice.md §11)"))
                continue
            para = next((pi for pi, _, a, b, _ in spans if a <= m.start() < b), None)
            ok = any(c.get("kind") == "cast" and entry_named([e], c.get("about")) is not None
                     for i, cs in anc.items() if spans[i][0] == para for c in cs)
            if not ok:
                out.append(finding("cast_unintroduced", "hard",
                                   f"{e['name']} is first named here without being introduced: the paragraph of the first "
                                   f"mention needs a claim of kind `cast` with \"about\": \"{e['name']}\" saying who they were "
                                   f"(the dossier's line: {e['who'][:80]!r}) (voice.md §11)", spans[next(
                                       i for i, x in enumerate(spans) if x[2] <= m.start() < x[3])][4][:200]))
        elif where and m and n < min(where):
            out.append(finding("cast_before_intro", "soft",
                               f"{e['name']} is named here, before chapter {min(where)} introduces them: introduce them at the "
                               "first meeting, or move the introduction (voice.md §11)"))
    return out


# ── the book: pictures and era context ───────────────────────────────────────

def picture_floor_findings(project):
    """voice.md §13: every body chapter carries at least one picture."""
    t = thresholds(project)
    cfg = t.get("pictures")
    if not isinstance(cfg, dict) or not v2(project):
        return []
    import images
    floor = cfg.get("minPerChapter", 1)
    exempt = set(cfg.get("exemptRoles") or [])
    per = {}
    for r in images.index(project):
        if not r.get("portraitOnly"):
            per[int(r.get("chapter", -1))] = per.get(int(r.get("chapter", -1)), 0) + 1
    out = []
    for c in project.plan.get("chapters", []):
        k = int(c.get("n"))
        if (c.get("role") or "chapter") in exempt:
            continue
        if per.get(k, 0) < floor:
            out.append(finding("picture_floor", "hard",
                               f"chapter {k} has {per.get(k, 0)} picture(s); every chapter carries at least {floor} "
                               "(voice.md §13): a period plan, the site, an object, or an approved illustration"))
    return out


def era_book_findings(project):
    """voice.md §11: an episode's era cap is measured over its body chapters, not each one."""
    t = thresholds(project)
    if t.get("eraShareScope") != "book" or not v2(project):
        return []
    era = total = 0
    for c in project.plan.get("chapters", []):
        if (c.get("role") or "chapter") == "afterword":
            continue
        ch = project.chapter(c.get("n")) or {}
        total += words(ch.get("text", ""))
        era += sum(words(x.get("text", "")) for x in ch.get("claims", []) if x.get("kind") == "era" and not x.get("retired"))
    if total and era / total > t["eraShareMax"]:
        return [finding("era_share", "hard",
                        f"era context is {100 * era / total:.0f}% of the book's chapters (cap {100 * t['eraShareMax']:.0f}%) — "
                        "the episode is the subject")]
    return []


# ── measures (the plan's §7 table) ───────────────────────────────────────────

def syllables(word):
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 0
    groups = re.findall(r"[aeiouy]+", w)
    k = len(groups)
    if w.endswith("e") and not w.endswith(("le", "ee", "ye")) and k > 1:
        k -= 1
    return max(1, k)


def readability(text):
    """(sentences, words, words a sentence, Flesch-Kincaid grade) of plain prose."""
    sents = [s for _, _, _, _, s in sentence_spans(text)]
    ws = re.findall(r"[A-Za-zÀ-ÿ'’-]+|\d[\d,.]*", text or "")
    if not sents or not ws:
        return len(sents), len(ws), 0.0, 0.0
    syl = sum(syllables(w) for w in ws)
    wps = len(ws) / len(sents)
    grade = 0.39 * wps + 11.8 * syl / len(ws) - 15.59
    return len(sents), len(ws), wps, grade


def measure(project):
    import images
    t = thresholds(project)
    pics = {}
    for r in images.index(project):
        if not r.get("portraitOnly"):
            pics[int(r.get("chapter", -1))] = pics.get(int(r.get("chapter", -1)), 0) + 1
    rows = []
    for n in project.chapter_numbers():
        ch = project.chapter(n) or {}
        spans, writer, _ = classify(ch, [])
        text = ch.get("text", "")
        nsent, nw, wps, grade = readability(text)
        mine = sum(words(spans[i][4]) for i in writer)
        rows.append({"n": n, "role": chapter_role(project, n), "words": words(text), "sentences": nsent,
                     "writerSentences": len(writer), "writerShare": (mine / words(text)) if words(text) else 0.0,
                     "questions": sum(1 for _, _, _, _, s in spans if s.rstrip("\"”’)").endswith("?")),
                     "wordsPerSentence": wps, "grade": grade, "pictures": pics.get(n, 0),
                     "claims": len([c for c in ch.get("claims", []) if not c.get("retired")])})
    return rows, t


def cmd_measure(project):
    rows, _ = measure(project)
    print(f"{'ch':>3} {'role':<10} {'words':>6} {'sents':>5} {'W':>3} {'W%':>4} {'?':>2} {'w/s':>5} {'grade':>5} {'pics':>4} {'claims':>6}")
    tot = {"words": 0, "sentences": 0, "writerSentences": 0, "questions": 0, "pictures": 0, "claims": 0}
    for r in rows:
        print(f"{r['n']:>3} {r['role']:<10} {r['words']:>6} {r['sentences']:>5} {r['writerSentences']:>3} "
              f"{100 * r['writerShare']:>3.0f}% {r['questions']:>2} {r['wordsPerSentence']:>5.1f} {r['grade']:>5.1f} "
              f"{r['pictures']:>4} {r['claims']:>6}")
        for k in tot:
            tot[k] += r[k]
    if rows:
        wps = tot["words"] / tot["sentences"] if tot["sentences"] else 0
        print(f"all {'':<10} {tot['words']:>6} {tot['sentences']:>5} {tot['writerSentences']:>3} "
              f"{'':>4} {tot['questions']:>2} {wps:>5.1f} {'':>5} {tot['pictures']:>4} {tot['claims']:>6}")
    return 0


def cmd_writer(project, n):
    ch = project.chapter(n)
    if ch is None:
        print(f"chapters/{int(n):02d}.json does not exist")
        return 2
    spans, writer, _ = classify(ch, [])
    anc = anchored(ch, spans)
    for i, (pi, si, _, _, s) in enumerate(spans):
        mark = "W" if i in writer else ",".join(c.get("id", "?") for c in anc.get(i, []))
        print(f"{pi:>2}.{si:<2} {mark:>10}  {s[:150]}")
    return 0


def cmd_cast(project):
    entries = cast_entries(project)
    assigned = cast_assignments(project)
    if not entries:
        print("the dossier has no people[] or peoples[]")
        return 0
    for e in entries:
        first = []
        for n in project.chapter_numbers():
            if key_pattern(e["keys"]).search((project.chapter(n) or {}).get("text", "")):
                first.append(n)
        print(f"{e['name']} ({e['kind']}): {e['who'] or '— no `who`'}\n    introduced in: "
              f"{assigned.get(e['name']) or 'UNASSIGNED'}; named in chapters: {first or 'none'}")
    return 0


def main(argv):
    if len(argv) >= 4 and argv[1] == "writer":
        return cmd_writer(Project(argv[2]), argv[3])
    if len(argv) >= 3 and argv[1] == "cast":
        return cmd_cast(Project(argv[2]))
    if len(argv) >= 3 and argv[1] == "measure":
        return cmd_measure(Project(argv[2]))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
