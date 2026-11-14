#!/usr/bin/env python3
"""An explainer's own checks (domains/explainer/voice.md §4 and §5), run by gate.py on every chapter of
a project whose domain thresholds ask for them. A project in any other domain gets none of them.

  acronym_undefined   a technical name or acronym in the prose (a word with two or more capitals:
                      CPU, ViT, ReLU, MobileNet, PyTorch) that is not a glossary entry or one of its
                      aliases, and not on the plan's glossaryAllow list (thresholds `glossary`)
  box_missing         a fixed box the chapter does not carry: a paragraph that is exactly its title
  box_spoken_length   the spoken box's body is outside its word range (said aloud, about thirty seconds)
  box_questions       the questions box asks fewer questions than it must, or leaves one unanswered

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
