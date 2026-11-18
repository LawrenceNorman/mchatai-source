#!/usr/bin/env python3
"""A chapter written as single model calls: writer, gates, an independent audit, revise
(PLAYBOOK §3), instead of Claude Code subagents. Two backends (cloud-writer.json `backends`):
claude-code, each call one `claude -p` turn on the author's own subscription (the command line's
default, cliDefaultBackend), and compute-proxy, every call billed to the signed-in account's
compute tokens (cloud_models.py; book_job.py's server job).

  cloud_writer.py write  <project> <n> [--rounds N] [--budget T] [--plan-budget P] [--fresh] [--with-gathered]
  cloud_writer.py gather <project> <n> --sources s72,s73 [--parts 2-3] [--budget T] [--plan-budget P] [--fresh]
  cloud_writer.py audit  <project> <n> [--plan-budget P]    one audit of the chapter as it stands
  cloud_writer.py brief  <project> <n> [--with-gathered]    print the writer's brief; no model call
  any of them: --backend claude-code|compute-proxy (or the env HISTORY_WRITER_BACKEND)

The session file is named by the env MCHATAI_SESSION. The roles, rounds, budget and prompts are
content: history/cloud-writer.json. The writer's instructions are agents/history-chapter-writer.md
and the auditor's agents/history-auditor.md, each behind a short preface that says the call has no
tools and what to reply.

write   The writer gets the voices (history/voice.md and the domain's), the thresholds that bind
        a writer, the plan's entry for the chapter with the chapters either side, the glossary up to
        it (and the terms later chapters define, which it may not use yet), the dossier's facts for
        it, and excerpts of every source they cite. Its reply is saved as chapters/NN.json and
        gated in process (gate.chapter_findings); while a HARD finding remains and rounds are left,
        the chapter and the findings go back to it: fix the cause, not the wording. A clean chapter
        goes to the auditor, a separate call that sees the chapter, the facts and the same excerpts,
        never the writer's reply. Its blocking items go back to the writer for one revision, which
        is gated and audited again. A revision the gate alone asks for goes to gateReviseRole (the
        reviser, a cheaper model with the writer's instructions; plan §19.6), an audit's to the
        writer. Done (exit 0, status "audited") when the gate has no hard
        finding and the audit no blocking item. At maxRounds the chapter is marked "blocked" and
        the run exits 1 with what is left; it also exits 1 before a call that would take the
        chapter past chapterBudgetTokens (compute tokens) or chapterPlanBudgetTokens (plan tokens).
        --with-gathered adds dossier/facts-cloud-chNN.json's facts to the dossier's.

gather  For each source, the gatherer extracts the facts chapter n's plan entry needs, as dossier
        events. Kept only when the evidence is verbatim in the source (as _hw.norm compares it) and
        at least minQuoteWords words, and `what` copies no verbatimCopyWindowWords words in a row of
        the source (quotes.copy_words, as verbatim_copy counts them) and repeats no quote the dossier
        already has. Survivors go to dossier/facts-cloud-chNN.json, never into dossier.json.

Every call is logged under <project>/cloud/chNN/ (gather: cloud/chNN/gather/): <step>.request.json
(a summary: role, model, sizes, hash, the reply's tokens), <step>.reply.txt (the raw reply),
<step>.gate.json, <step>.audit.json, brief.json (the brief, frozen at the first run), result.json.
<project>/cloud/ledger.json tallies compute tokens per stage. A rerun resumes: a step whose request
(same prompts, same role in cloud-writer.json) replays its saved reply for free; from the first step
that differs, the old steps are set aside under stale/ (still counted against the budget) and the run
goes on live. The brief is frozen at the first run: after plan.json or the sources change, --fresh
moves the log to cloud/old/ and starts over with a new brief and a new budget.
"""
import hashlib
import json
import os
import re
import shutil
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cloud_models  # noqa: E402
from cloud_models import ModelError, fill, prompt_text  # noqa: E402
from _hw import HISTORY, Project, domain_of, domain_path, finding, load_json, norm, save_json, thresholds, words  # noqa: E402


class Stop(Exception):
    """A run that ends before its chapter is done: the budget, an unusable reply."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def read_text(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def strip_front_matter(md):
    m = re.match(r"\s*---\n.*?\n---\n", md, re.S)
    return md[m.end():] if m else md


def system_prompt(cfg, role):
    """The role's preface from cloud-writer.json (its `preface` key names another role's, as the
    reviser takes the writer's), then its agent instructions (front matter dropped)."""
    preface = prompt_text(cfg["prompts"][cfg["roles"][role].get("preface") or f"{role}Preface"])
    agent = strip_front_matter(read_text(os.path.join(HISTORY, cfg["roles"][role]["prompt"])))
    return preface.rstrip() + "\n\n---\n\n" + agent.strip() + "\n"


def jcompact(v, pad=""):
    """JSON with one object of a list per line: the same data in about half the characters of an
    indented dump, and still a reader's (and a model's) one-glance layout."""
    if isinstance(v, dict) and any(isinstance(x, (dict, list)) for x in v.values()):
        rows = [f'{pad} {json.dumps(k, ensure_ascii=False)}: {jcompact(x, pad + " ")}' for k, x in v.items()]
        return "{\n" + ",\n".join(rows) + "\n" + pad + "}"
    if isinstance(v, list) and v and all(isinstance(x, dict) for x in v):
        return "[\n" + ",\n".join(pad + " " + json.dumps(x, ensure_ascii=False) for x in v) + "\n" + pad + "]"
    return json.dumps(v, ensure_ascii=False)


def jblock(data):
    return "```json\n" + jcompact(data) + "\n```"


def cost_text(res):
    """A step's cost for the log line: replayed, compute tokens, or plan tokens on Claude Code."""
    if res.get("replayed"):
        return "replayed"
    if "planTokens" in res:
        return f"{res['planTokens']:,} plan tokens"
    return f"{res['tokensUsed']} tokens"


def hard(findings):
    return [f for f in findings if f.get("severity") == "hard"]


def rule_counts(findings):
    out = {}
    for f in findings:
        out[f["rule"]] = out.get(f["rule"], 0) + 1
    return ", ".join(f"{k}×{v}" if v > 1 else k for k, v in out.items())


# ── what the chapter stands on ───────────────────────────────────────────────

def plan_entry(project, n):
    """The plan's entry for chapter n; the introduction (plan.intro) for 0."""
    if int(n) == 0:
        intro = (project.plan or {}).get("intro")
        return {"n": 0, "role": "intro", **intro} if isinstance(intro, dict) else None
    return project.plan_chapter(n)


def neighbours(project, n):
    chapters = sorted((project.plan or {}).get("chapters", []), key=lambda c: int(c.get("n", 0)))
    prev = [c for c in chapters if int(c.get("n", 0)) < int(n)]
    nxt = [c for c in chapters if int(c.get("n", 0)) > int(n)]
    brief = lambda c: {"n": c.get("n"), "title": c.get("title"), "turn": c.get("turn")}  # noqa: E731
    return (brief(prev[-1]) if prev else None), (brief(nxt[0]) if nxt else None)


def gathered_path(project, n):
    return project.path("dossier", f"facts-cloud-ch{int(n):02d}.json")


def chapter_events(project, n, gathered=False):
    """(events, ids the plan names that the dossier lacks): the plan entry's `events`, or, when it
    lists none, the dossier events whose `chapter` is n; with `gathered`, the cloud gather's too."""
    d = project.dossier or {}
    by_id = {e.get("id"): e for e in d.get("events", [])}
    ids = (plan_entry(project, n) or {}).get("events") or []
    if ids:
        rows = [by_id[i] for i in ids if i in by_id]
        missing = [i for i in ids if i not in by_id]
    else:
        rows = [e for e in d.get("events", []) if str(e.get("chapter")) == str(n)]
        missing = []
    if gathered:
        rows += (load_json(gathered_path(project, n), {}) or {}).get("events", [])
    return rows, missing


def glossary(project, n):
    """(terms up to chapter n, each with the chapter that introduces it; the names later chapters
    introduce): the dossier's people[] and peoples[] and the plan's `introduces`."""
    import storytelling
    assigned = storytelling.cast_assignments(project)
    d = project.dossier or {}
    upto, later = [], []
    for r in (d.get("people") or []) + (d.get("peoples") or []):
        name = (r.get("name") or "").strip()
        chs = assigned.get(name) or []
        if not name or not chs:
            continue
        first = min(chs)
        if first <= int(n):
            row = {"name": name, "aliases": r.get("aliases") or [], "who": r.get("who") or "", "chapter": first}
            for k in ("source", "evidence"):
                if r.get(k):
                    row[k] = r[k]
            if int(n) in chs:
                row["introduceHere"] = True
            upto.append(row)
        else:
            later.append({"name": name, "aliases": r.get("aliases") or [], "chapter": first})
    return upto, later


def ledger_rows(project, n):
    entry = plan_entry(project, n) or {}
    ids = set(entry.get("ledger") or [])
    return [r for r in (project.plan or {}).get("ledger", []) if r.get("id") in ids or str(r.get("chapter")) == str(n)]


def writer_thresholds(project, cfg):
    import explainer
    t = thresholds(project)
    out = {k: t[k] for k in cfg.get("writerThresholds", []) if k in t and t[k] is not None}
    if "boxes" in out:
        out["boxes"] = explainer.box_config(project)
    return out


# ── source excerpts ──────────────────────────────────────────────────────────

_NCHAR = {}


def _nchar(ch):
    c = _NCHAR.get(ch)
    if c is None:
        c = " " if ch.isspace() else norm(ch)
        _NCHAR[ch] = c
    return c


def norm_map(text):
    """(normalised text, offsets): the text as _hw.norm compares it, character by character, with the
    offset in `text` of each character, so a match in the one is a span in the other. Footnote
    markers are kept here (norm drops them); `locate` falls back to the quote's ends for those."""
    out, idx, space = [], [], True
    for i, ch in enumerate(text or ""):
        for c in _nchar(ch):
            if c == " ":
                if space:
                    continue
                space = True
            else:
                space = False
            out.append(c)
            idx.append(i)
    return "".join(out), idx


def locate(text, quote, mapped=None):
    """(start, end) of `quote` in `text`, compared as the quote gate compares it; None if absent."""
    flat, idx = mapped or norm_map(text)
    q = norm(quote).rstrip(" ,.")
    if not q:
        return None
    tries = [q]
    w = q.split()
    if len(w) > 8:
        tries += [" ".join(w[:8]), " ".join(w[-8:])]
    for t in tries:
        at = flat.find(t)
        if at >= 0:
            return idx[at], idx[at + len(t) - 1] + 1
    return None


def _snap(text, a, b):
    """Widen nothing, cut no word: start after a space, end before one."""
    if a > 0:
        s = text.find(" ", a)
        a = s + 1 if 0 <= s < a + 40 else a
    if b < len(text):
        e = text.rfind(" ", b - 40, b)
        b = e if e > a else b
    return a, b


def excerpts(project, n, events, terms, cfg):
    """{source id: [(start, end)]} around each fact's evidence and the first mention of each term the
    chapter introduces, merged, capped per source; plus notes on what could not be placed."""
    import storytelling
    width = int(cfg.get("excerptChars", 1500))
    cap = int(cfg.get("maxExcerptCharsPerSource", 40000))
    texts, maps, wins, notes = {}, {}, {}, []

    def text_of(sid):
        if sid not in texts:
            texts[sid] = project.source_text(sid)
        return texts[sid]

    for e in events:
        sids = [str(s) for s in e.get("sources") or []]
        placed = False
        for sid in sids:
            text = text_of(sid)
            if text is None:
                notes.append(f"source {sid} (fact {e.get('id')}) is not on disk")
                continue
            wins.setdefault(sid, [])
            if not e.get("evidence"):
                continue
            span = locate(text, e["evidence"], maps.setdefault(sid, norm_map(text)))
            if span:
                wins[sid].append((max(0, span[0] - width), min(len(text), span[1] + width)))
                placed = True
                break
        if e.get("evidence") and not placed and sids:
            notes.append(f"fact {e.get('id')}: its evidence is in none of {', '.join(sids)}")
    for t in terms:
        if not t.get("introduceHere"):
            continue
        keys = [k for k in [t["name"]] + list(t.get("aliases") or []) if len(k) >= 3]
        if not keys:
            continue
        rx = storytelling.key_pattern(keys)
        for sid in list(wins):
            m = rx.search(text_of(sid) or "")
            if m:
                text = texts[sid]
                wins[sid].append((max(0, m.start() - width), min(len(text), m.end() + width)))
                break
    out = {}
    for sid, spans in wins.items():
        text = texts[sid]
        if not spans:   # facts with no evidence: the source's opening
            spans = [(0, min(len(text), 2 * width))]
        merged = []
        for a, b in sorted(spans):
            if merged and a <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], b))
            else:
                merged.append((a, b))
        kept, total = [], 0
        for a, b in merged:
            if total >= cap:
                notes.append(f"source {sid}: excerpts past {cap} characters left out")
                break
            b = min(b, a + cap - total)
            kept.append(_snap(text, a, b))
            total += b - a
        out[sid] = kept
    return out, notes, texts


def render_sources(project, spans, texts):
    recs = project.sources
    parts = []
    for sid, kept in spans.items():
        rec = recs.get(sid, {})
        head = " · ".join(x for x in [sid, rec.get("title"), rec.get("publisher"), rec.get("kind"),
                                      f"licence {rec.get('license') or 'facts-only'}", rec.get("date")] if x)
        text = texts[sid]
        body = [f"### {head}"]
        for a, b in kept:
            body.append(f"[characters {a}–{b} of {len(text)}]\n{text[a:b].strip()}")
        parts.append("\n\n".join(body))
    return "\n\n".join(parts) if parts else "(no source excerpts)"


# ── the brief ────────────────────────────────────────────────────────────────

def voices(project):
    out = [("history/voice.md", read_text(os.path.join(HISTORY, "voice.md")))]
    dom = domain_of(project)
    for name in ("voice.md", "storytelling.md"):
        if dom and os.path.exists(domain_path(dom, name)):
            out.append((f"history/domains/{dom}/{name}", read_text(domain_path(dom, name))))
    return out


def brief_parts(project, n, cfg, gathered=False):
    """The brief, in named parts: the writer reads them all; the auditor reads the voices, the facts
    and the sources. Built once per run folder and frozen (brief.json)."""
    n = int(n)
    entry = plan_entry(project, n)
    if entry is None:
        raise Stop("no_plan_entry", f"plan.json has no chapter {n}")
    plan = project.plan or {}
    prev, nxt = neighbours(project, n)
    events, missing = chapter_events(project, n, gathered)
    upto, later = glossary(project, n)
    spans, notes, texts = excerpts(project, n, events, upto, cfg)
    notes += [f"the plan names fact {i}, which dossier.json does not have" for i in missing]

    meta = load_json(project.path("project.json"), {}) or {}
    story = {k: v for k, v in {
        "subject": meta.get("subject") or plan.get("subject"), "domain": domain_of(project), "voice": meta.get("voice"),
        "question": plan.get("question"), "notes": plan.get("notes"), "analogies": plan.get("analogies"),
        "mnemonics": plan.get("mnemonics"), "glossaryAllow": plan.get("glossaryAllow"),
        "observations": [o for o in plan.get("observations") or [] if str(o.get("chapter")) == str(n)] or None,
    }.items() if v}
    chapter = {"chapter": entry, "previous": prev, "next": nxt}
    rows = ledger_rows(project, n)
    if rows:
        chapter["ledger"] = rows

    gl = ("Terms up to this chapter (`introduceHere`: this chapter defines it, with a claim of kind `cast` whose "
          "`about` is its name, in the paragraph of its first mention):\n" + jblock(upto))
    except_here = ""
    if later and n == 0:
        # The introduction's one exception (storytelling.cast_findings): a map piece's own name may be used.
        import explainer
        import storytelling
        pat = storytelling.map_piece_pattern(project)
        if pat:
            for row in later:
                ok = [k for k in [row["name"]] + list(row.get("aliases") or []) if pat.fullmatch(k.strip())]
                if ok:
                    row["mapNameHere"] = ok
            rings = explainer.route_rings(project)[0]
            except_here = (", except a row's `mapNameHere` words: in the introduction only, a map piece's own name in "
                           "plan.route may be used before its chapter, as a name on the map, and a later term inside one "
                           "(the \"transformer\" of \"transformer blocks\") is not counted. The map's pieces: "
                           + "; ".join(f"{r}: {', '.join(v)}" for r, v in rings.items()))
    if later:
        gl += ("\n\nTerms later chapters define. The gate refuses any of these names or aliases in this chapter "
               "(cast_before_intro)" + except_here + ":\n" + jblock(later))
    return {
        "voices": "\n\n".join(f"## The voice: {label}\n\n{text.strip()}" for label, text in voices(project)),
        "thresholds": "## The thresholds the gate holds you to\n\n" + jblock(writer_thresholds(project, cfg)),
        "chapter": "## Your chapter (plan.json)\n\n" + jblock({"story": story, **chapter}),
        "glossary": "## The glossary (dossier.json people[])\n\n" + gl,
        "facts": f"## The dossier's facts for chapter {n}\n\n" + jblock(events),
        "sources": "## The sources (excerpts of sources/<id>.txt)\n\n" + render_sources(project, spans, texts),
        "notes": notes,
        "title": entry.get("title") or "",
    }


def writer_brief(parts):
    return "\n\n".join(parts[k] for k in ("voices", "thresholds", "chapter", "glossary", "facts", "sources"))


def chapter_as_sent(ch):
    keep = ("chapter", "title", "text", "passages", "claims")
    return {k: ch[k] for k in keep if k in ch}


def writer_marks(ch):
    """Every sentence, marked W (the writer's own) or with the claims it anchors (storytelling.py writer)."""
    import storytelling
    spans, writer, _ = storytelling.classify(ch, [])
    anc = storytelling.anchored(ch, spans)
    lines = []
    for i, (pi, si, _, _, s) in enumerate(spans):
        mark = "W" if i in writer else ",".join(c.get("id", "?") for c in anc.get(i, []))
        lines.append(f"{pi}.{si} [{mark}] {s}")
    return "\n".join(lines)


def audit_brief(parts, ch, n, cfg):
    glossary_here = parts["glossary"]
    return "\n\n".join([
        parts["voices"], parts["facts"], glossary_here, parts["sources"],
        f"## The chapter under audit (chapters/{int(n):02d}.json)\n\n" + jblock(chapter_as_sent(ch)),
        "## Its sentences (storytelling.py writer)\n\n" + writer_marks(ch),
        "## What to do\n\n" + fill(cfg["prompts"]["audit"], n=n, title=ch.get("title", "")),
    ])


def findings_text(findings):
    lines = []
    for f in hard(findings):
        lines.append(f"- HARD [{f['rule']}] {f['message']}" + (f"\n    sentence: {f['sentence']}" if f.get("sentence") else ""))
    soft = [f for f in findings if f.get("severity") != "hard"]
    if soft:
        lines.append("\nNotes (soft):")
        lines += [f"- [{f['rule']}] {f['message']}" + (f"\n    sentence: {f['sentence']}" if f.get("sentence") else "")
                  for f in soft]
    return "\n".join(lines)


def revise_tail(cfg, ch, findings, n, error=None):
    parts = []
    if ch is not None:
        parts.append(f"## Your chapter as it stands (chapters/{int(n):02d}.json)\n\n" + jblock(chapter_as_sent(ch)))
    if error:
        parts.append("## What to do\n\n" + fill(cfg["prompts"]["notJson"], error=error))
        return "\n\n".join(parts)
    parts.append("## The gate's findings\n\n" + findings_text(findings))
    parts.append("## What to do\n\n" + prompt_text(cfg["prompts"]["revise"]))
    return "\n\n".join(parts)


def audit_tail(cfg, ch, blocking, n):
    items = []
    for i, b in enumerate(blocking, 1):
        items.append(f"{i}. sentence: {b.get('sentence', '')}\n   problem: {b.get('problem', '')}\n   fix: {b.get('fix', '')}")
    return "\n\n".join([
        f"## Your chapter as it stands (chapters/{int(n):02d}.json)\n\n" + jblock(chapter_as_sent(ch)),
        "## The independent audit: blocking items\n\n" + "\n".join(items),
        "## What to do\n\n" + prompt_text(cfg["prompts"]["auditRevise"]),
    ])


# ── replies ──────────────────────────────────────────────────────────────────

def parse_json_reply(text, want=()):
    """The first JSON object in a reply that has every key in `want`: the whole reply, a fenced block,
    or an object after some prose."""
    s = (text or "").strip()
    cands = [m.group(1) for m in re.finditer(r"```(?:json)?\s*\n(.*?)\n\s*```", s, re.S)] + [s]
    dec = json.JSONDecoder()
    for c in cands:
        for k, m in enumerate(re.finditer(r"\{", c)):
            if k >= 200:
                break
            try:
                obj, _ = dec.raw_decode(c, m.start())
            except ValueError:
                continue
            if isinstance(obj, dict) and all(w in obj for w in want):
                return obj
    raise ValueError("no JSON object" + (f" with {', '.join(want)}" if want else "") + " in the reply")


CLAIM_KEYS = ("id", "text", "source", "anchor", "evidence", "kind", "about")


def as_chapter(obj, n, title=""):
    """A reply's object as chapters/NN.json: the schema's keys, the chapter's number, status draft."""
    if isinstance(obj.get("chapter"), dict):
        obj = obj["chapter"]
    text, claims = obj.get("text"), obj.get("claims")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("the object has no `text`")
    if not isinstance(claims, list) or not all(isinstance(c, dict) for c in claims):
        raise ValueError("the object has no `claims` list of objects")
    out = {"chapter": int(n), "title": obj.get("title") or title, "status": "draft", "text": text.strip()}
    if isinstance(obj.get("passages"), list) and obj["passages"]:
        out["passages"] = obj["passages"]
    out["claims"] = []
    for i, c in enumerate(claims, 1):
        row = {k: c[k] for k in CLAIM_KEYS if c.get(k) not in (None, "")}
        row.setdefault("id", f"c{i}")
        row["id"], row["source"] = str(row["id"]), str(row.get("source", ""))
        out["claims"].append(row)
    return out


def as_audit(obj):
    blocking = []
    for b in obj.get("blocking") or []:
        blocking.append(b if isinstance(b, dict) else {"sentence": "", "problem": str(b), "fix": ""})
    notes = [n if isinstance(n, str) else json.dumps(n, ensure_ascii=False) for n in obj.get("notes") or []]
    return {"blocking": blocking, "notes": notes}


# ── a run's folder: steps, replay, budget, ledger ────────────────────────────

FIXED = {"brief.json", "brief.md", "result.json", "dropped.json"}


class Run:
    def __init__(self, project, n, client, cfg, sub=None, ordered=True, out=print):
        self.project, self.n, self.client, self.cfg, self.out = project, int(n), client, cfg, out
        self.root = project.path("cloud", f"ch{self.n:02d}")
        self.dir = os.path.join(self.root, sub) if sub else self.root
        self.sub = sub
        self.ordered = ordered
        self.visited = set()
        self.live_calls = 0
        self.plan_cap = None   # --plan-budget for this run

    def file(self, name):
        return os.path.join(self.dir, name)

    def archive(self):
        """--fresh: the log moves to cloud/old/, where no run's budget counts it (a write run's gather/
        folder stays)."""
        if not os.path.isdir(self.dir):
            return
        name = f"ch{self.n:02d}" + (f"-{self.sub}" if self.sub else "") + "-" + time.strftime("%Y%m%d-%H%M%S")
        dest = self.project.path("cloud", "old", name)
        os.makedirs(dest, exist_ok=True)
        for f in os.listdir(self.dir):
            if self.sub is None and f == "gather":
                continue
            shutil.move(self.file(f), os.path.join(dest, f))
        self.out(f"  moved the old log to {os.path.relpath(dest, self.project.root)}")

    def brief(self, build, built_with=None):
        """The brief, frozen at the first run so a rerun replays; rebuilt when it was built with other
        options (--with-gathered)."""
        path = self.file("brief.json")
        parts = load_json(path)
        if parts and parts.get("builtWith") == built_with:
            return parts
        if parts:
            self.out("  the brief was built with other options; building it again")
        parts = {**build(), "builtWith": built_with}
        save_json(path, parts)
        with open(self.file("brief.md"), "w", encoding="utf-8") as fh:
            fh.write(writer_brief(parts) + "\n")
        return parts

    def requests(self):
        """Every request summary this run's budget counts: this folder and its stale/ steps (a write
        run does not count its gather/ folder)."""
        out = []
        for base, dirs, files in os.walk(self.dir):
            if base == self.dir and self.sub is None and "gather" in dirs:
                dirs.remove("gather")
            out += [load_json(os.path.join(base, f), {}) for f in files if f.endswith(".request.json")]
        return out

    def spent(self):
        return round(sum(float((r.get("reply") or {}).get("tokensUsed") or 0) for r in self.requests()), 4)

    def plan_spent(self):
        return sum(int((r.get("reply") or {}).get("planTokens") or 0) for r in self.requests())

    def check_budget(self, role, cap):
        plan_cap = int(self.plan_cap or self.cfg.get("chapterPlanBudgetTokens") or 0)
        if plan_cap:
            used = self.plan_spent()
            # The largest earlier call of this role; for a role not yet called, the largest of any.
            sizes = [(r.get("role"), int((r.get("reply") or {}).get("planTokens") or 0)) for r in self.requests()]
            guess = max([t for who, t in sizes if who == role] or [t for _, t in sizes] or [0])
            if used + guess > plan_cap:
                raise Stop("plan_budget", f"chapter {self.n} has used {used:,} of its {plan_cap:,} plan tokens; another {role} "
                                          f"call (the largest so far used {guess:,}) would pass it. Raise "
                                          "chapterPlanBudgetTokens in history/cloud-writer.json, or rerun with --plan-budget")
        spent = self.spent()
        guess = max([float((r.get("reply") or {}).get("tokensUsed") or 0) for r in self.requests() if r.get("role") == role]
                    or [0])
        if spent + guess > cap:
            raise Stop("budget", f"chapter {self.n} has spent {spent:g} of its {cap:g} compute tokens; another {role} call "
                                 f"(the largest so far cost {guess:g}) would pass it. Raise chapterBudgetTokens in "
                                 "history/cloud-writer.json, or rerun with --budget")

    def step_files(self, step=None):
        if not os.path.isdir(self.dir):
            return []
        return [f for f in os.listdir(self.dir)
                if os.path.isfile(self.file(f)) and f not in FIXED and (step is None or f.split(".", 1)[0] == step)]

    def set_aside(self, step):
        """A step whose request changed: it, and (in an ordered run) every step this run has not
        reached, no longer describes what happens next."""
        names = [f for f in self.step_files() if f.split(".", 1)[0] == step or
                 (self.ordered and f.split(".", 1)[0] not in self.visited)]
        if not names:
            return
        dest = os.path.join(self.dir, "stale", time.strftime("%Y%m%d-%H%M%S"))
        os.makedirs(dest, exist_ok=True)
        for f in names:
            shutil.move(self.file(f), os.path.join(dest, f))
        self.out(f"  {step}: the request changed since the last run; {len(names)} old file(s) set aside in "
                 f"{os.path.relpath(dest, self.project.root)}")

    def call(self, step, role, system, user, stage, cap, sent=None):
        """The model's reply to this step: replayed from the folder when the same request was answered
        before, else a live call (budget checked first, then logged and added to the ledger)."""
        self.visited.add(step)
        r = self.client.role(role)
        spec = json.dumps({k: r.get(k) for k in ("provider", "model", "maxOutputTokens", "temperature", "reasoningEffort")},
                          sort_keys=True)
        # A new model or a bigger budget is a new request: a reply cut off at the old budget is never replayed.
        digest = hashlib.sha256((spec + "\0" + system + "\0" + user).encode("utf-8")).hexdigest()
        req_path, reply_path = self.file(f"{step}.request.json"), self.file(f"{step}.reply.txt")
        req = load_json(req_path)
        if req and req.get("sha256") == digest and (req.get("reply") or {}).get("ok") and os.path.exists(reply_path):
            return {"text": read_text(reply_path), "finishReason": req["reply"].get("finishReason"),
                    "tokensUsed": 0, "model": req.get("model"), "replayed": True}
        if req or self.step_files(step):
            self.set_aside(step)
        self.check_budget(role, cap)
        req = {"step": step, "stage": stage, "role": role, "model": r.get("model"), "provider": r.get("provider"),
               "maxOutputTokens": r.get("maxOutputTokens"), "systemChars": len(system), "userChars": len(user),
               "sha256": digest, "sent": sent or {}, "at": now_iso()}
        save_json(req_path, req)
        self.live_calls += 1
        try:
            res = self.client.chat(role, system, user, stage=stage)
        except ModelError as e:
            req["reply"] = {"ok": False, "error": e.code, "message": str(e), "tokensUsed": e.tokensUsed, "at": now_iso()}
            save_json(req_path, req)
            if e.tokensUsed:
                self.ledger(stage, step, r, e.tokensUsed)
            raise
        with open(reply_path, "w", encoding="utf-8") as fh:
            fh.write(res["text"])
        req["reply"] = {"ok": True, "tokensUsed": res["tokensUsed"], "finishReason": res["finishReason"],
                        "model": res.get("model"), "at": now_iso(),
                        **({"planTokens": res["planTokens"]} if "planTokens" in res else {})}
        save_json(req_path, req)
        self.ledger(stage, step, r, res["tokensUsed"], res.get("planTokens"))
        return res

    def ledger(self, stage, step, role, used, plan=None):
        path = self.project.path("cloud", "ledger.json")
        led = load_json(path, {}) or {}
        led.setdefault("_comment", "Compute tokens (1 token = $0.01) every cloud_writer.py call was charged, per stage; "
                                   "cumulative across runs. planTokens: what a call on the claude-code backend used of "
                                   "the author's Claude Code plan instead (no compute tokens).")
        key = f"ch{self.n:02d}.{stage}"
        st = led.setdefault("stages", {}).setdefault(key, {"tokens": 0, "calls": 0})
        st["tokens"] = round(st["tokens"] + float(used or 0), 4)
        st["calls"] += 1
        led["total"] = round(float(led.get("total") or 0) + float(used or 0), 4)
        row = {"at": now_iso(), "stage": key, "step": step, "role": role.get("name"), "model": role.get("model"),
               "tokensUsed": used}
        if plan is not None:
            st["planTokens"] = int(st.get("planTokens") or 0) + int(plan)
            led["planTotal"] = int(led.get("planTotal") or 0) + int(plan)
            row.update(provider=role.get("provider"), planTokens=int(plan))
        led.setdefault("calls", []).append(row)
        led["updated"] = now_iso()
        save_json(path, led)


# ── write ────────────────────────────────────────────────────────────────────

def write_chapter(project, n, client, cfg=None, rounds=None, budget=None, gathered=False, fresh=False, out=print,
                  plan_budget=None):
    """Write, gate, audit and revise chapter n. (exit code, result dict)."""
    import gate
    cfg = cfg or cloud_models.load_config()
    n = int(n)
    run = Run(project, n, client, cfg, out=out)
    run.plan_cap = plan_budget
    max_rounds = int(rounds or cfg.get("maxRounds", 4))
    cap = float(budget or cfg.get("chapterBudgetTokens", 400))
    result = {"chapter": n, "status": None, "rounds": 0, "audits": 0}

    def finish(code, status, why, ch=None, **extra):
        if ch is not None and status in ("audited", "blocked"):
            ch["status"] = status
            save_json(project.chapter_path(n), ch)
        result.update(status=status, reason=why, spent=run.spent(), planTokens=run.plan_spent(), liveCalls=run.live_calls,
                      at=now_iso(), **extra)
        if os.path.isdir(run.dir):
            save_json(run.file("result.json"), result)
        out(f"ch{n:02d}: {status} — {why} ({result['spent']:g} compute tokens, {result['planTokens']:,} plan tokens on this "
            f"chapter, {run.live_calls} live call(s) this run)")
        return code, result

    unshown = [r.get("id") for r in ledger_rows(project, n) if not r.get("shows")]
    if unshown:
        return finish(2, "stopped", f"ledger row(s) {', '.join(unshown)} have no `shows` phrases; the writer would have to "
                                    "quote their summary-style value (history-chapter-writer step 2). Set them in plan.json first")
    if fresh:
        run.archive()
    try:
        parts = run.brief(lambda: brief_parts(project, n, cfg, gathered), {"gathered": bool(gathered)})
    except Stop as e:
        return finish(2, "stopped", str(e))
    for note in parts.get("notes") or []:
        out(f"  note: {note}")
    title = parts.get("title") or ""
    brief = writer_brief(parts)
    w_system, a_system = system_prompt(cfg, "writer"), system_prompt(cfg, "auditor")

    # Plan §19.6: a revision the gate alone asks for goes to the cheaper reviser; the audit's go to the writer.
    gate_role = cfg.get("gateReviseRole") if cfg.get("gateReviseRole") in cfg["roles"] else "writer"
    systems = {"writer": w_system, gate_role: system_prompt(cfg, gate_role)}

    def writer_round(rnd, tail, stage, sent, role="writer"):
        step = f"r{rnd:02d}-{stage}"
        res = run.call(step, role, systems[role], brief + "\n\n" + tail, stage, cap, {**sent, **({"role": role} if role != "writer" else {})})
        if res.get("finishReason") == "length":
            raise Stop("output_budget", f"the {role}'s reply in {step} was cut off at its maxOutputTokens: raise "
                                        f"roles.{role}.maxOutputTokens in history/cloud-writer.json")
        try:
            ch = as_chapter(parse_json_reply(res["text"], want=("text",)), n, title)
        except ValueError as e:
            found = [finding("reply_not_json", "hard", f"the writer's reply is not the chapter JSON: {e}")]
            save_json(run.file(f"{step}.gate.json"), found)
            out(f"  {step}: {cost_text(res)} · not JSON ({e})")
            return None, found, str(e)
        save_json(project.chapter_path(n), ch)
        found = gate.chapter_findings(project, n)
        save_json(run.file(f"{step}.gate.json"), found)
        h = hard(found)
        out(f"  {step}: {cost_text(res)} · "
            f"{len(ch['text'].split())} words, {len(ch['claims'])} claims · gate: "
            + (f"{len(h)} hard ({rule_counts(h)})" if h else "clean") + (f", {len(found) - len(h)} note(s)" if len(found) > len(h) else ""))
        return ch, found, None

    ch, found, err = None, [], None
    rnd = audits = 0
    try:
        rnd = 1
        result["rounds"] = rnd
        got, found, err = writer_round(rnd, "## What to do\n\n" + fill(cfg["prompts"]["write"], n=n, title=title), "write", {})
        ch = got or ch
        while True:
            h = hard(found)
            if h:
                if rnd >= max_rounds:
                    return finish(1, "blocked", f"{len(h)} hard finding(s) after {rnd} round(s): {rule_counts(h)}", ch,
                                  findings=h)
                rnd += 1
                result["rounds"] = rnd
                got, found, err = writer_round(rnd, revise_tail(cfg, ch, found, n, err), "revise",
                                               {"findings": [f["rule"] for f in h]}, role=gate_role)
                ch = got or ch
                continue
            ch["status"] = "gated"
            save_json(project.chapter_path(n), ch)
            audits += 1
            result["audits"] = audits
            verdict = audit(run, cfg, parts, ch, n, a_system, audits, cap, out)
            if verdict is None:   # the auditor's reply was not JSON: ask once more
                audits += 1
                result["audits"] = audits
                verdict = audit(run, cfg, parts, ch, n, a_system, audits, cap, out)
                if verdict is None:
                    return finish(1, "stopped", f"the auditor's reply was not JSON twice; see cloud/ch{n:02d}/a{audits:02d}-audit.reply.txt", ch)
            if not verdict["blocking"]:
                return finish(0, "audited", f"gate clean and audit clear after {rnd} round(s), {audits} audit(s)", ch,
                              notes=verdict["notes"], softFindings=[f for f in found if f.get("severity") != "hard"])
            if rnd >= max_rounds:
                return finish(1, "blocked", f"the audit's {len(verdict['blocking'])} blocking item(s) remain after {rnd} "
                                            "round(s)", ch, blocking=verdict["blocking"], notes=verdict["notes"])
            rnd += 1
            result["rounds"] = rnd
            got, found, err = writer_round(rnd, audit_tail(cfg, ch, verdict["blocking"], n), "revise",
                                           {"blocking": len(verdict["blocking"])})
            ch = got or ch
    except Stop as e:
        return finish(1, "stopped", str(e), ch, stopCode=e.code)
    except ModelError as e:
        return finish(1, "error", f"{e.code}: {e}", ch, errorCode=e.code)


def audit(run, cfg, parts, ch, n, system, k, cap, out):
    step = f"a{k:02d}-audit"
    res = run.call(step, "auditor", system, audit_brief(parts, ch, n, cfg), "audit", cap)
    try:
        verdict = as_audit(parse_json_reply(res["text"], want=("blocking",)))
    except ValueError as e:
        out(f"  {step}: the auditor's reply is not JSON ({e})")
        return None
    save_json(run.file(f"{step}.audit.json"), verdict)
    out(f"  {step}: {cost_text(res)} · "
        f"{len(verdict['blocking'])} blocking, {len(verdict['notes'])} note(s)")
    return verdict


def audit_only(project, n, client, cfg=None, out=print, plan_budget=None):
    """One independent audit of chapter n as it stands (after a revision made by hand against the
    gate): refused while the gate has a hard finding. (exit code, verdict). The verdict goes to
    cloud/chNN/aKK-audit.audit.json; a clean one marks the chapter audited."""
    import gate
    cfg = cfg or cloud_models.load_config()
    n = int(n)
    ch = project.chapter(n)
    if not ch:
        out(f"chapter {n} has no file")
        return 2, None
    h = hard(gate.chapter_findings(project, n))
    if h:
        out(f"ch{n:02d}: the gate has {len(h)} hard finding(s) ({rule_counts(h)}); fix them before an audit")
        return 1, None
    run = Run(project, n, client, cfg, out=out)
    run.plan_cap = plan_budget
    parts = run.brief(lambda: brief_parts(project, n, cfg, False), {"gathered": False})
    done = [f for f in run.step_files() if re.match(r"a\d\d-audit\.request\.json$", f)]
    k = len(done) + 1
    try:
        verdict = audit(run, cfg, parts, ch, n, system_prompt(cfg, "auditor"), k, float(cfg.get("chapterBudgetTokens", 400)), out)
    except (Stop, ModelError) as e:
        out(f"ch{n:02d}: audit stopped — {e}")
        return 1, None
    if verdict is None:
        return 1, None
    if not verdict["blocking"]:
        ch["status"] = "audited"
        save_json(project.chapter_path(n), ch)
    for b in verdict["blocking"]:
        out(f"  blocking: {json.dumps(b, ensure_ascii=False)[:400]}")
    out(f"ch{n:02d}: audit {'clear' if not verdict['blocking'] else str(len(verdict['blocking'])) + ' blocking'} "
        f"({run.plan_spent():,} plan tokens, {run.spent():g} compute tokens on this chapter)")
    return (0 if not verdict["blocking"] else 1), verdict


# ── gather ───────────────────────────────────────────────────────────────────

def chunks(text, size):
    """The text in parts of at most `size` characters, cut at paragraph breaks where it can be."""
    if len(text) <= size:
        return [text]
    out, cur = [], ""
    for para in re.split(r"(\n\s*\n)", text):
        if len(cur) + len(para) > size and cur:
            out.append(cur)
            cur = ""
        while len(para) > size:
            out.append(para[:size])
            para = para[size:]
        cur += para
    if cur.strip():
        out.append(cur)
    return out


def event_problems(ev, flat, windows, t, seen):
    """Why a gathered event cannot be kept ([] when it can)."""
    import quotes
    out = []
    evd, what = ev.get("evidence") or "", ev.get("what") or ""
    if not isinstance(evd, str) or words(evd) < t["minQuoteWords"]:
        out.append(f"evidence is {words(evd) if isinstance(evd, str) else 0} words, under minQuoteWords ({t['minQuoteWords']})")
    elif norm(evd).rstrip(" ,.") not in flat:
        out.append("evidence is not verbatim in the source")
    elif norm(evd).rstrip(" ,.") in seen:
        out.append(f"the same quote as {seen[norm(evd).rstrip(' ,.')]}")
    if not isinstance(what, str) or not what.strip():
        out.append("no `what`")
    else:
        k = t["verbatimCopyWindowWords"]
        w = quotes.copy_words(what)
        if any(tuple(w[i:i + k]) in windows for i in range(len(w) - k + 1)):
            out.append(f"`what` copies {k}+ consecutive words of the source")
    return out


def gather(project, n, source_ids, client, cfg=None, budget=None, fresh=False, out=print, plan_budget=None, parts_range=None):
    """Gather chapter n's facts from each source. (exit code, {kept, dropped}). `parts_range` (first, last), 1-based,
    gathers only those parts of each source (a long filing whose business section is one part); evidence is still
    checked against the whole source."""
    import quotes
    cfg = cfg or cloud_models.load_config()
    n = int(n)
    entry = plan_entry(project, n)
    if entry is None:
        out(f"plan.json has no chapter {n}")
        return 2, {}
    t = thresholds(project)
    run = Run(project, n, client, cfg, sub="gather", ordered=False, out=out)
    run.plan_cap = plan_budget
    if fresh:
        run.archive()
    cap = float(budget or cfg.get("chapterBudgetTokens", 400))
    system = fill(cfg["prompts"]["gatherer"], minQuoteWords=t["minQuoteWords"],
                  verbatimCopyWindowWords=t["verbatimCopyWindowWords"])
    have, _ = chapter_events(project, n)
    upto, _ = glossary(project, n)
    seen = {norm(e["evidence"]).rstrip(" ,."): f"dossier fact {e.get('id')}"
            for e in (project.dossier or {}).get("events", []) if e.get("evidence")}
    stage_names = [e.get("lifeStage") for e in have if e.get("lifeStage")]
    stage_default = max(set(stage_names), key=stage_names.count) if stage_names else None
    # The plan's part for the chapter, when it names one, is every gathered fact's lifeStage: a gatherer may not invent one.
    stage_plan = entry.get("lifeStage")
    # A fact that says what a term the chapter introduces is carries `about` (the term, as the glossary names it), so
    # the glossary page can cite it; any other `about` is dropped.
    here = {g["name"].lower(): g["name"] for g in upto if g.get("introduceHere")}
    context = jblock({"chapter": {k: entry.get(k) for k in ("n", "title", "summary", "turn", "introduces") if entry.get(k)},
                      "termsIntroduced": [{"name": g["name"], "who": g["who"]} for g in upto if g.get("introduceHere")],
                      "factsTheDossierHas": [{"id": e.get("id"), "what": e.get("what"), "lifeStage": e.get("lifeStage")}
                                             for e in have]})
    kept, dropped, done = [], [], set()
    stopped = None   # {"code", "message"} when the run ends early (book_job.py reads it)
    recs = project.sources
    try:
        for sid in source_ids:
            text = project.source_text(sid)
            if text is None:
                dropped.append({"source": sid, "reason": "not in sources/index.json, or never fetched"})
                out(f"  {sid}: not in sources/index.json, or never fetched")
                continue
            rec = recs.get(sid, {})
            flat = norm(text)
            src_words = quotes.copy_words(text)
            k = t["verbatimCopyWindowWords"]
            windows = {tuple(src_words[i:i + k]) for i in range(len(src_words) - k + 1)}
            parts = chunks(text, int(cfg.get("gatherChunkChars", 120000)))
            n_kept = 0
            for pi, part in enumerate(parts, 1):
                if parts_range and not parts_range[0] <= pi <= parts_range[1]:
                    continue
                head = " · ".join(x for x in [sid, rec.get("title"), rec.get("publisher"), rec.get("kind"), rec.get("date")] if x)
                user = (f"## Chapter {n} (plan.json)\n\n{context}\n\n## The source: {head}"
                        + (f" (part {pi} of {len(parts)})" if len(parts) > 1 else "") + f"\n\n{part}\n\n## What to do\n\n"
                        f"Gather the facts chapter {n} needs from this text. Reply with ONLY {{\"events\": [...]}}.")
                step = f"gather-{sid}-{pi:02d}"
                res = run.call(step, "gatherer", system, user, "gather", cap, {"source": sid, "part": pi})
                try:
                    events = parse_json_reply(res["text"], want=("events",))["events"]
                except (ValueError, KeyError) as e:
                    dropped.append({"source": sid, "part": pi, "reason": f"the reply is not JSON ({e})"})
                    out(f"  {step}: the reply is not JSON ({e})")
                    continue
                for ev in events if isinstance(events, list) else []:
                    if not isinstance(ev, dict):
                        continue
                    why = event_problems(ev, flat, windows, t, seen)
                    if why:
                        dropped.append({"source": sid, "what": ev.get("what"), "evidence": ev.get("evidence"), "reason": "; ".join(why)})
                        continue
                    n_kept += 1
                    row = {"id": f"cl{n:02d}_{sid}_{n_kept:02d}", "what": ev["what"].strip(), "sources": [sid],
                           "evidence": ev["evidence"], "lifeStage": stage_plan or ev.get("lifeStage") or stage_default,
                           "chapter": n, "date": str(ev.get("date") or rec.get("date") or ""),
                           "about": here.get(str(ev.get("about") or "").strip().lower())}
                    kept.append({k2: v for k2, v in row.items() if v not in (None, "")})
                    seen[norm(ev["evidence"]).rstrip(" ,.")] = row["id"]
                out(f"  {step}: {cost_text(res)}")
            done.add(sid)
    except Stop as e:
        out(f"gather ch{n:02d}: stopped — {e}")
        code, stopped = 1, {"code": e.code, "message": str(e), "kind": "stop"}
    except ModelError as e:
        out(f"gather ch{n:02d}: error — {e.code}: {e}")
        code, stopped = 1, {"code": e.code, "message": f"{e.code}: {e}", "kind": "model"}
    else:
        code = 0

    path = gathered_path(project, n)
    prior = (load_json(path, {}) or {}).get("events", [])
    events = [e for e in prior if not set(e.get("sources") or []) & done] + kept   # a source gathered again replaces its facts
    save_json(path, {"group": f"cloud-ch{n:02d}", "chapter": n, "gatheredAt": now_iso(),
                     "_comment": "Facts gathered by cloud_writer.py gather on the gatherer role; evidence verified verbatim "
                                 "in each source. Not in dossier.json until the author or the planning thread merges them.",
                     "events": events})
    save_json(run.file("dropped.json"), dropped)
    for d in dropped:
        out(f"  dropped ({d.get('source')}): {d['reason']}" + (f" — {str(d.get('what'))[:90]!r}" if d.get("what") else ""))
    out(f"gather ch{n:02d}: kept {len(kept)}, dropped {len(dropped)} → {os.path.relpath(path, project.root)} "
        f"({run.spent():g} compute tokens, {run.plan_spent():,} plan tokens on this chapter's gathering)")
    return code, {"kept": kept, "dropped": dropped, **({"error": stopped} if stopped else {})}


# ── command line ─────────────────────────────────────────────────────────────

def _flag(argv, name, default=None):
    if name in argv:
        i = argv.index(name)
        if i + 1 < len(argv):
            return argv[i + 1]
    return default


def main(argv):
    if len(argv) >= 4 and argv[1] in ("write", "gather", "brief", "audit"):
        project, n = Project(argv[2]), int(argv[3])
        base = cloud_models.load_config()
        backend = _flag(argv, "--backend") or os.environ.get("HISTORY_WRITER_BACKEND") or base.get("cliDefaultBackend")
        cfg = cloud_models.load_config(backend=backend) if backend and backend != "compute-proxy" else base
        if argv[1] == "brief":
            parts = brief_parts(project, n, cfg, "--with-gathered" in argv)
            print(writer_brief(parts))
            for note in parts["notes"]:
                print(f"note: {note}", file=sys.stderr)
            return 0
        print(f"backend: {cfg.get('backend') or 'compute-proxy'}"
              + (" (the author's Claude Code plan; no compute tokens)" if cfg.get("backend") == "claude-code"
                 else " (compute tokens, billed to the signed-in account)"))
        client = cloud_models.make_client(cfg)
        budget = _flag(argv, "--budget")
        plan_budget = _flag(argv, "--plan-budget")
        plan_budget = int(plan_budget) if plan_budget else None
        if argv[1] == "write":
            code, _ = write_chapter(project, n, client, cfg, rounds=_flag(argv, "--rounds"), budget=budget,
                                    gathered="--with-gathered" in argv, fresh="--fresh" in argv, plan_budget=plan_budget)
            return code
        if argv[1] == "audit":
            code, _ = audit_only(project, n, client, cfg, plan_budget=plan_budget)
            return code
        ids = [s.strip() for s in (_flag(argv, "--sources") or "").split(",") if s.strip()]
        if not ids:
            print("gather needs --sources s72,s73,...")
            return 2
        pr = _flag(argv, "--parts")
        pr = tuple(int(x) for x in pr.split("-")) if pr and "-" in pr else ((int(pr), int(pr)) if pr else None)
        code, _ = gather(project, n, ids, client, cfg, budget=budget, fresh="--fresh" in argv, plan_budget=plan_budget,
                         parts_range=pr)
        return code
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
