#!/usr/bin/env python3
"""An explainer's own checks (domains/explainer/voice.md §4 and §5), run by gate.py on every chapter of
a project whose domain thresholds ask for them. A project in any other domain gets none of them.

  acronym_undefined   a technical name or acronym in the prose (a word with two or more capitals:
                      CPU, ViT, ReLU, MobileNet, PyTorch) that is not a glossary entry or one of its
                      aliases, and not on the plan's glossaryAllow list (thresholds `glossary`)
  box_missing         a fixed box the chapter does not carry: a paragraph that is exactly its title
  box_spoken_length   the spoken box's body is outside its word range (said aloud, about thirty seconds)
  box_questions       the questions box asks fewer questions than it must, or leaves one unanswered
  where_we_are        the map box (boxes.whereBox; its first whereParagraphs paragraphs, default 1)
                      names no piece of plan.route next to a neighbour in the same ring: one of the chapter's `lights` when the plan lists them, else a
                      piece of any ring (inside, around, under); route.keys are the words for each

The glossary is the dossier's cast (storytelling.cast_entries): each term is defined, with a claim of
kind `cast`, in the chapter the plan assigns (cast_unintroduced), and a domain may make its use before
that chapter hard (thresholds cast.beforeIntroSeverity).

  explainer.py terms <project>    every technical name the chapters use that the glossary lacks
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import storytelling  # noqa: E402
from _hw import Project, finding, strip_quoted, thresholds, words  # noqa: E402

TECH = re.compile(r"(?<![\w'’])([A-Za-z]*[A-Z][a-z0-9]*[A-Z][A-Za-z0-9]*)(?!\w)")


def glossary_keys(project):
    keys = set()
    for e in storytelling.cast_entries(project):
        keys |= {k.lower() for k in e["keys"]}
        keys |= {w.lower() for k in e["keys"] for w in k.split() if TECH.fullmatch(w)}
    keys |= {a.lower() for a in (project.plan or {}).get("glossaryAllow") or []}
    keys |= {a.lower() for a in (thresholds(project).get("glossary") or {}).get("allow") or []}
    return keys


def unknown_terms(project, text):
    """[(token, offset)] for each technical name in `text` (quotations blanked) the glossary lacks,
    once per name. A plural ("GPUs") is its singular's."""
    keys = glossary_keys(project)
    out, seen = [], set()
    for m in TECH.finditer(strip_quoted(text or "")):
        tok = m.group(1)
        low = tok.lower()
        if low in keys or (low.endswith("s") and low[:-1] in keys) or low in seen:
            continue
        seen.add(low)
        out.append((tok, m.start()))
    return out


def term_findings(project, n, ch):
    if not isinstance(thresholds(project).get("glossary"), dict) or not storytelling.v2(project):
        return []
    text = ch.get("text", "")
    spans = storytelling.sentence_spans(text)
    out = []
    for tok, at in unknown_terms(project, text):
        where = next((s for _, _, a, b, s in spans if a <= at < b), "")
        out.append(finding("acronym_undefined", "hard",
                           f"{tok!r} is a technical name or acronym the glossary does not have: add it to the dossier's "
                           "terms (people[], with its definition and the chapter that teaches it), give it as an alias "
                           "of the entry it names, or put it on plan.glossaryAllow if no reader needs it defined "
                           "(voice.md §4)", where[:200]))
    return out


def box_config(project):
    cfg = thresholds(project).get("boxes")
    if not isinstance(cfg, dict):
        return None
    return {**cfg, **((project.plan or {}).get("boxes") or {})}


def box_findings(project, n, ch):
    cfg = box_config(project)
    if not cfg or not storytelling.v2(project):
        return []
    if storytelling.chapter_role(project, n) in (cfg.get("exemptRoles") or []):
        return []
    titles = cfg.get("required") or []
    paras = [p.strip() for p in re.split(r"\n\s*\n", ch.get("text", "")) if p.strip()]
    at = {}
    for i, p in enumerate(paras):
        if p in titles and p not in at:
            at[p] = i
    out = [finding("box_missing", "hard",
                   f"the chapter has no {t!r} box: a paragraph that is exactly {t!r}, followed by its body (voice.md §5)")
           for t in titles if t not in at]
    starts = sorted(at.values())

    def body(title):
        i = at[title]
        return paras[i + 1:next((j for j in starts if j > i), len(paras))]

    spoken = cfg.get("spokenBox")
    if spoken in at:
        n_words = sum(words(p) for p in body(spoken))
        lo, hi = cfg.get("spokenWords") or [55, 95]
        if not lo <= n_words <= hi:
            out.append(finding("box_spoken_length", "hard",
                               f"the {spoken!r} box is {n_words} words; said aloud in about thirty seconds it is {lo} to "
                               f"{hi} (voice.md §5)"))
    # The map box opens the chapter, so its body (to the next box title) would be the whole chapter: the box itself is
    # its first paragraph(s) (whereParagraphs).
    out += where_findings(project, n, body(cfg["whereBox"])[:int(cfg.get("whereParagraphs", 1))]
                          if cfg.get("whereBox") in at else None, cfg)
    asks = cfg.get("questionsBox")
    if asks in at:
        import cite
        sents = [p[a:b].strip() for p in body(asks) for a, b in cite.sentences(p)]
        questions = [i for i, s in enumerate(sents) if s.endswith("?")]
        unanswered = [sents[i] for i in questions if i + 1 >= len(sents) or sents[i + 1].endswith("?")]
        need = cfg.get("questions", 3)
        if len(questions) < need:
            out.append(finding("box_questions", "hard",
                               f"the {asks!r} box asks {len(questions)} question(s); it asks {need}, each with its full "
                               "answer (voice.md §5)"))
        for q in unanswered:
            out.append(finding("box_questions", "hard",
                               f"a question in the {asks!r} box has no answer after it (voice.md §5)", q[:200]))
    return out


def route_rings(project):
    """plan.route's rings, {ring: [piece, ...]} in order (any list of names: inside, around, under, or v2's
    pieces and stack), its `keys` {piece: [words that name it in prose]} and the rings whose ends meet."""
    route = (project.plan or {}).get("route") or {}
    rings = {k: v for k, v in route.items() if not k.startswith("_") and k not in ("keys", "loops")
             and isinstance(v, list) and v and all(isinstance(p, str) for p in v)}
    return rings, route.get("keys") or {}, set(route.get("loops") or [])


def where_findings(project, n, paras, cfg):
    """where_we_are: the 'Where we are' box (boxes.whereBox) names a piece of the map and a piece next to it in
    the same ring (domains/explainer/voice.md §5; plan of record §17, §19.1). When the chapter's plan entry
    lists `lights`, the piece is one of them; otherwise a piece of any ring will do."""
    if paras is None:
        return []   # box_missing has already said so
    rings, keys, loops = route_rings(project)
    if not rings:
        return []
    text = strip_quoted(" ".join(paras))

    def names(piece):
        words = keys.get(piece) or [piece]
        return any(re.search(r"(?<![\w-])" + re.escape(w) + r"(?![\w-])", text, re.I) for w in words)

    named = {(r, i) for r, pieces in rings.items() for i, p in enumerate(pieces) if names(p)}
    entry = next((c for c in (project.plan or {}).get("chapters") or [] if str(c.get("n")) == str(n)), {}) or {}
    lights = [p for p in entry.get("lights") or [] if any(p in v for v in rings.values())]

    def beside(r, i):
        k = len(rings[r])
        near = {(i - 1) % k, (i + 1) % k} if r in loops else {i - 1, i + 1}
        return {(r, j) for j in near if 0 <= j < k and j != i}

    lit = [(r, i) for r, i in named if not lights or rings[r][i] in lights]
    if any(beside(r, i) & named for r, i in lit):
        return []
    box = cfg["whereBox"]
    if lights and not lit:
        why = f"names none of the pieces this chapter lights ({', '.join(lights)})"
    elif lit:
        why = (f"names {', '.join(sorted({rings[r][i] for r, i in lit}))} but no piece next to it on the map "
               f"({', '.join(sorted({rings[r][j] for r, i in lit for _, j in beside(r, i)}))})")
    else:
        why = "names no piece of the map (plan.route: " + "; ".join(f"{r}: {', '.join(v)}" for r, v in rings.items()) + ")"
    return [finding("where_we_are", cfg.get("whereSeverity", "hard"),
                    f"the {box!r} box {why}: say where the chapter sits on the map, by a piece's name, and what comes "
                    "before or after it (voice.md §5)")]


def chapter_findings(project, n, ch):
    return term_findings(project, n, ch) + box_findings(project, n, ch)


def cmd_terms(project):
    missing = {}
    for n in project.chapter_numbers():
        for tok, _ in unknown_terms(project, (project.chapter(n) or {}).get("text", "")):
            missing.setdefault(tok, []).append(n)
    for tok, chs in sorted(missing.items(), key=lambda kv: kv[0].lower()):
        print(f"{tok:24} chapters {', '.join(map(str, chs))}")
    print(f"{len(missing)} technical name(s) the glossary lacks")
    return 1 if missing else 0


def main(argv):
    if len(argv) >= 3 and argv[1] == "terms":
        return cmd_terms(Project(argv[2]))
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
