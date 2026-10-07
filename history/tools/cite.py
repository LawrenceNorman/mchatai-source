#!/usr/bin/env python3
"""Notes and Sources, rendered from the claims. The writer's prose never carries apparatus.

Every claim already names its source and quotes it. This turns that into what a reader of a
history expects. Two styles (citations.json `notesStyle`):

  appendix (default)  the chapters land as clean prose. One Notes appendix at the end, by
                      chapter, one note per paragraph keyed by its opening words, citing
                      numbers; then the Sources, numbered once each in the order the story
                      first cites them, with links. The usual form for narrative history, and
                      what the author asked for on the first pilot (2026-10-03): the notes no
                      longer outweigh the text they support.
  inline              a superscript after each run of sentences citing the same sources, the
                      notes at the end of each chapter, the Sources grouped by kind.

The prose in chapters/NN.json never carries apparatus in either style, so the gates read it as
written and a narration reads it aloud unchanged.

  cite.py anchors <project> [n] [--write]  tie each claim to the sentence it supports. --write
                                           fills `anchor` where the match is certain and lists
                                           the rest for the writer to set by hand
  cite.py anchors <project> [n] --list     every claim beside the sentence its anchor resolves
                                           to, for the writer to check before anything lands
  cite.py check   <project> [n]            anchors resolve to one sentence; sources can be cited
  cite.py render  <project> <n>            one chapter with its notes, as it will land
  cite.py sources <project>                the Sources list for every source a claim cites
  cite.py book    <project>                book/: the introduction, every chapter with notes, the
                                           Sources, and manifest.json saying what lands where.
                                           Refused while any claim is unanchored
  cite.py strip   <file>                   a landed text without its markers and notes: what a
                                           narration reads, and what the gates checked
  cite.py land    <project> [--dry]        book/ into StoryMaker through ./mchatai: creates what
                                           is missing, replaces what changed (never the author's),
                                           reads every chapter back
  cite.py outline <project>                plan.json's chapters (title, `summary`) as StoryMaker's
                                           outline through ./mchatai, with no shell quoting to break
  cite.py adopt   <project>                after the author's review: review/NN.txt (each chapter
                                           as they left it) becomes the story's text; anchors
                                           follow it, and what cannot is listed to settle

A claim's `anchor` is a few verbatim words of the sentence it supports. Where a note goes is
data, never a guess at render time: a citation on the wrong sentence is worse than none.
Exit codes: 0 clean, 1 findings or refused, 2 usage.
"""
import datetime
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _hw import HISTORY, Project, finding, load_json, norm, report, save_json, spelled_numbers, words  # noqa: E402

SUPER = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")
MARK = re.compile(r"[⁰¹²³⁴⁵⁶⁷⁸⁹]+")
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
          "October", "November", "December"]


def style():
    return (load_json(os.path.join(HISTORY, "citations.json"), {}) or {})


# ── sentences ────────────────────────────────────────────────────────────────

ABBREV = {"ca", "mr", "mrs", "ms", "dr", "st", "rev", "jr", "sr", "co", "inc", "no", "gen", "capt", "col",
          "lt", "sgt", "hon", "prof", "mt", "ave", "wash", "vol", "pp", "p", "vs", "etc", "ft", "messrs"}
# A name's suffix or a list's close sits at the END of what it abbreviates, so a capital after
# it starts a new sentence ("named Horace Jr. The family…") — except in a few set phrases.
TERMINAL_ABBREV = {"jr", "sr", "inc", "co", "etc"}
TERMINAL_CONTINUES = {"high", "college", "day"}
_END = re.compile(r"[.!?][\"”’)\]]*(?=\s+[\"“(\[]?[A-Z0-9])")


def continues_after(word, following):
    """True when the full stop after `word` does not end the sentence: an abbreviation or an
    initial ("Mrs.", "H. R. Cayton"). A suffix ("Horace Jr.", "etc.") before a capitalised
    word does end it ("Martin Luther King Jr. Day" does not)."""
    if not (word.lower() in ABBREV or len(word) == 1):
        return False
    if word.lower() in TERMINAL_ABBREV:
        nxt = re.match(r"\s*[\"“(\[]?([A-Za-z]+)", following)
        if nxt and nxt.group(1)[0].isupper() and nxt.group(1).lower() not in TERMINAL_CONTINUES:
            return False
    return True


def sentences(paragraph):
    """[(start, end)] spans of a paragraph's sentences. A full stop after an abbreviation or an
    initial ("Mrs.", "H. R. Cayton") does not end a sentence; see continues_after."""
    spans, start = [], 0
    for m in _END.finditer(paragraph):
        before = paragraph[start:m.start() + 1]
        word = re.search(r"([A-Za-z]+)\.$", before)
        if m.group(0).startswith(".") and word and continues_after(word.group(1), paragraph[m.end():]):
            continue
        spans.append((start, m.end()))
        start = m.end()
        while start < len(paragraph) and paragraph[start].isspace():
            start += 1
    if paragraph[start:].strip():
        spans.append((start, len(paragraph.rstrip())))
    return spans


def paragraphs(text):
    """[(paragraph text, [sentence strings])]."""
    out = []
    for p in re.split(r"\n\s*\n", text or ""):
        p = p.strip()
        if p:
            out.append((p, [p[a:b] for a, b in sentences(p)]))
    return out


def flat_sentences(text):
    return [(pi, si, s) for pi, (_, ss) in enumerate(paragraphs(text)) for si, s in enumerate(ss)]


# ── anchors ──────────────────────────────────────────────────────────────────

STOP = set("a an the and or of to in on at by for with from as is was were be been being her his she he "
           "it its their they them this that which who whom had has have not but into than then there "
           "out up over after before about also one".split())


def _stem(w):
    for suf in ("'s", "’s", "ing", "ed", "es", "ly", "s"):
        if len(w) > len(suf) + 2 and w.endswith(suf):
            return w[:-len(suf)]
    return w


def _tokens(s):
    s = norm(s)
    for tok, v in spelled_numbers(s):
        s = s.replace(tok.lower(), str(v), 1)
    return {_stem(w) for w in re.findall(r"[a-z0-9]+", s) if w not in STOP}


def live_claims(ch):
    """A chapter's claims, minus the ones retired after the author cut the fact they supported
    (`"retired": "<why>"`, set when adopting a review, PLAYBOOK §4)."""
    return [c for c in (ch or {}).get("claims", []) if not c.get("retired")]


def resolve(anchor, sents):
    """Indexes of the sentences holding `anchor` (whitespace, quotes and dashes ignored). An
    anchor running across a sentence end resolves to the later sentence."""
    a = norm(anchor)
    if not a:
        return []
    hits = [i for i, (_, _, s) in enumerate(sents) if a in norm(s)]
    if hits:
        return hits
    return [i + 1 for i in range(len(sents) - 1) if a in norm(sents[i][2] + " " + sents[i + 1][2])]


def propose(claim, sents):
    """(best index, score, margin): which sentence a claim's own words point at, weighted by how
    rare each word is in the chapter."""
    import math
    sets = [_tokens(s) for _, _, s in sents]
    df = {}
    for st in sets:
        for w in st:
            df[w] = df.get(w, 0) + 1
    idf = {w: math.log((len(sets) + 1) / (n + 0.5)) for w, n in df.items()}
    ct = _tokens(claim.get("text", ""))
    total = sum(idf.get(w, math.log(len(sets) + 1)) for w in ct) or 1
    scores = sorted(((sum(idf[w] for w in ct & st) / total, i) for i, st in enumerate(sets)), reverse=True)
    if not scores:
        return None, 0.0, 0.0
    best, i = scores[0]
    second = scores[1][0] if len(scores) > 1 else 0.0
    return i, best, best - second


def anchor_for(i, sents):
    """The shortest opening of sentence i, five words or more, found nowhere else in the chapter."""
    s = sents[i][2]
    ws = s.split()
    every = [norm(x) for _, _, x in sents]
    for k in range(min(5, len(ws)), len(ws) + 1):
        cand = " ".join(ws[:k])
        if sum(1 for x in every if norm(cand) in x) == 1:
            return cand
    return s


def anchor_findings(project, n):
    """For the chapter gate: an anchor that resolves to no sentence, or to several, is wrong and
    fails; a claim with no anchor yet is a note (chapters written before anchors existed), and
    `cite.py book` refuses it."""
    ch = project.chapter(n)
    if ch is None:
        return []
    sents = flat_sentences(ch.get("text", ""))
    out = []
    missing = [c.get("id", "?") for c in live_claims(ch) if not c.get("anchor")]
    if missing:
        out.append(finding("claim_unanchored", "soft",
                           f"{len(missing)} claim(s) have no `anchor` yet ({', '.join(missing[:8])}{' …' if len(missing) > 8 else ''}) — "
                           "cite.py anchors sets the certain ones; the story cannot land without them"))
    for c in live_claims(ch):
        if c.get("anchor"):
            hits = resolve(c["anchor"], sents)
            if len(hits) != 1:
                out.append(finding("anchor_unresolved", "hard",
                                   f"claim {c.get('id')}: anchor {c['anchor'][:60]!r} is in {len(hits)} sentences of the prose — it must be in exactly one"))
    return out


def cmd_anchors(project, numbers, write):
    t = style()
    lo, margin = t.get("anchorMinScore", 0.55), t.get("anchorMinMargin", 0.15)
    open_claims = 0
    for n in numbers:
        ch = project.chapter(n)
        if ch is None:
            continue
        sents = flat_sentences(ch.get("text", ""))
        changed, todo = 0, []
        for c in live_claims(ch):
            if c.get("anchor") and len(resolve(c["anchor"], sents)) == 1:
                continue
            i, score, gap = propose(c, sents)
            if i is not None and score >= lo and gap >= margin:
                if write:
                    c["anchor"] = anchor_for(i, sents)
                    changed += 1
            else:
                todo.append((c, i, score))
        if write and changed:
            save_json(project.chapter_path(n), ch)
        print(f"chapter {n}: {len(ch.get('claims', []))} claims, {changed} anchored now, {len(todo)} for you to set")
        for c, i, score in todo:
            open_claims += 1
            guess = sents[i][2][:140] if i is not None else "—"
            print(f"  {c.get('id')}: {c.get('text', '')[:110]!r}\n      best guess ({score:.2f}): {guess!r}")
    if open_claims:
        print(f"\nSet `anchor` on these {open_claims} claim(s) by hand: a few verbatim words of the sentence each one supports.")
    return 1 if open_claims else 0


def cmd_anchor_list(project, numbers):
    bad = 0
    for n in numbers:
        ch = project.chapter(n)
        if ch is None:
            continue
        sents = flat_sentences(ch.get("text", ""))
        print(f"== chapter {n} ==")
        for c in live_claims(ch):
            hits = resolve(c.get("anchor", ""), sents) if c.get("anchor") else []
            where = sents[hits[0]][2][:150] if len(hits) == 1 else ("UNRESOLVED" if c.get("anchor") else "NO ANCHOR")
            bad += len(hits) != 1
            print(f"{c.get('id')}  [{c.get('source')}]  {c.get('text', '')[:120]}\n    -> {where}")
    return 1 if bad else 0


# ── formatting a source ──────────────────────────────────────────────────────

def fmt_date(d):
    d = str(d or "").strip()
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", d[:10])
    if m:
        return f"{int(m.group(3))} {MONTHS[int(m.group(2)) - 1]} {m.group(1)}"
    m = re.fullmatch(r"(\d{4})-(\d{2})", d[:7]) if len(d) == 7 else None
    if m:
        return f"{MONTHS[int(m.group(2)) - 1]} {m.group(1)}"
    return d


def clean_title(title, publisher):
    t = re.sub(r"\s+", " ", title or "").strip()
    # A quotation inside a title takes single quotes, since the title itself goes in double ones.
    t = re.sub(r"[\"“]([^\"”]+)[\"”]", r"‘\1’", t)
    t = re.sub(r"\s*[-|–—:]\s*$", "", t)
    for sep in (" | ", " - ", " – ", " — ", " :: "):
        if publisher and t.lower().endswith((sep + publisher).lower()):
            t = t[: -len(sep + publisher)]
        parts = t.split(sep)
        if len(parts) > 1 and publisher and parts[-1].strip().lower() in (publisher.lower(), publisher.lower() + ".org"):
            t = sep.join(parts[:-1])
    return t.strip(" -|–—")


NEWS_PAGE = re.compile(r",?\s*page\s+(\d+)\b\s*[—–:-]?\s*(.*)$", re.I)
CA_OCR = re.compile(r"/data/(sn\d+)/[^/]+/(\d{4})(\d{2})(\d{2})(\d{2})/")


def newspaper_page(rec):
    """(paper, date, page, page URL) for a newspaper page, else None."""
    title = re.sub(r"\s+", " ", rec.get("title") or "")
    m = NEWS_PAGE.search(title)
    date = str(rec.get("date") or "")
    if not m or not re.match(r"\d{4}-\d{2}-\d{2}", date):
        return None
    page = int(m.group(1))
    url = rec.get("url") or ""
    # Most of the second story's pages were recorded with the OCR segment percent-encoded
    # (segment=%2Fservice%2Fndnp%2F…), which the pattern never matched: 31 of 44 entries in its
    # Sources linked the raw OCR service instead of the reader's page (2026-10-04).
    import urllib.parse
    ca = CA_OCR.search(urllib.parse.unquote(url))
    if ca:
        lccn, y, mo, d, ed = ca.groups()
        url = f"https://chroniclingamerica.loc.gov/lccn/{lccn}/{y}-{mo}-{d}/ed-{int(ed)}/seq-{page}/"
    paper = (rec.get("cite") or {}).get("publisher") or rec.get("publisher") or NEWS_PAGE.sub("", title).split(",")[0]
    return paper, date[:10], page, url


def newspaper_item(rec):
    """What on the page is cited, when the record says ("'Handy Andy' by Susie Revels Cayton")."""
    m = NEWS_PAGE.search(re.sub(r"\s+", " ", rec.get("title") or ""))
    item = (rec.get("cite") or {}).get("item") or (m.group(2).strip() if m else "")
    return re.sub(r"['\"“]([^'\"”]+)['\"”]", r"‘\1’", item)


def parts(rec):
    c = rec.get("cite") or {}
    pub = (c.get("publisher") or rec.get("publisher") or "").strip()
    title = clean_title(c.get("title") or rec.get("title") or "", pub)
    return {"publisher": pub, "title": title, "author": c.get("author", ""),
            "date": c.get("date") or rec.get("date") or "", "url": c.get("url") or rec.get("originalURL") or rec.get("url") or "",
            "accessed": (rec.get("fetchedAt") or "")[:10]}


def short_cite(rec, detail=False):
    """The note form. The Sources list carries the full entry, so a note says only enough to
    find it there: a newspaper by paper, date and page; anything else by its author's surname
    (or, with no author, its publisher) and its title. `detail` adds the date, for the rare
    pair of sources that would otherwise read the same."""
    np = newspaper_page(rec)
    if np:
        paper, date, page, _ = np
        return f"{paper}, {fmt_date(date)}, p. {page}"
    p = parts(rec)
    who = p["author"].split()[-1] if p["author"] else p["publisher"]
    if p["title"] and p["title"].lower() != (p["publisher"] or "").lower():
        s = f"{who}, “{p['title']}”" if who else f"“{p['title']}”"
    else:
        s = who or p["url"]
    if detail and p["date"]:
        s += f", {fmt_date(p['date'])}"
    return s


def note_forms(sources, ids):
    """{source id: note form}, with a date added wherever two sources would read the same."""
    forms = {sid: short_cite(sources[sid]) for sid in ids}
    seen = {}
    for sid, f in forms.items():
        seen.setdefault(f, []).append(sid)
    for f, group in seen.items():
        if len(group) > 1:
            for sid in group:
                forms[sid] = short_cite(sources[sid], detail=True)
    return forms


def full_cite(rec):
    p = parts(rec)
    out = []
    if p["author"]:
        out.append(p["author"] + ".")
    if p["publisher"]:
        out.append(p["publisher"] + ".")
    if p["title"] and p["title"].lower() != p["publisher"].lower():
        out.append(f"“{p['title']}.”")
    if p["date"]:
        out.append(fmt_date(p["date"]) + ".")
    if p["accessed"] and p["url"]:
        out.append(f"Accessed {fmt_date(p['accessed'])}.")
    if p["url"]:
        out.append(p["url"])
    return " ".join(out)


# ── rendering ────────────────────────────────────────────────────────────────

def chapter_notes(project, n):
    """(rendered text, [note strings], findings). One note per run of sentences in a paragraph
    that cite the same sources; the marker goes after the run's last sentence."""
    ch = project.chapter(n)
    if ch is None:
        return None, [], [finding("chapter_missing", "hard", f"chapters/{int(n):02d}.json does not exist")]
    sources = project.sources
    sents = flat_sentences(ch.get("text", ""))
    cited = {}
    out = []
    for c in live_claims(ch):
        sid = str(c.get("source", ""))
        if not c.get("anchor"):
            out.append(finding("claim_unanchored", "hard", f"ch{n} claim {c.get('id')}: no `anchor` — run cite.py anchors"))
            continue
        hits = resolve(c["anchor"], sents)
        if len(hits) != 1:
            out.append(finding("anchor_unresolved", "hard",
                               f"ch{n} claim {c.get('id')}: anchor {c['anchor'][:60]!r} is in {len(hits)} sentences — it must be in exactly one"))
            continue
        if sid not in sources:
            out.append(finding("source_unknown", "hard", f"ch{n} claim {c.get('id')}: source {sid!r} is not in sources/index.json"))
            continue
        cited.setdefault(hits[0], [])
        if sid not in cited[hits[0]]:
            cited[hits[0]].append(sid)
    rendered, notes = [], []
    pending = None          # (marker target (paragraph, sentence), source list)
    by_para = {}
    for idx, (pi, si, s) in enumerate(sents):
        by_para.setdefault(pi, []).append((si, s, cited.get(idx)))
    markers = {}            # (pi, si) -> note number
    for pi in sorted(by_para):
        run_end, run_src = None, None
        for si, s, src in by_para[pi]:
            if not src:
                continue
            if run_src is not None and src == run_src:
                run_end = (pi, si)
                continue
            if run_src is not None:
                notes.append(run_src)
                markers[run_end] = len(notes)
            run_end, run_src = (pi, si), src
        if run_src is not None:
            notes.append(run_src)
            markers[run_end] = len(notes)
    for pi, (para, ss) in enumerate(paragraphs(ch.get("text", ""))):
        pieces = []
        for si, s in enumerate(ss):
            k = markers.get((pi, si))
            pieces.append(s + (str(k).translate(SUPER) if k else ""))
        rendered.append(" ".join(pieces))
    forms = note_forms(sources, sorted({sid for src in notes for sid in src}))
    note_lines = [f"{i}. " + "; ".join(forms[sid] for sid in src) + "." for i, src in enumerate(notes, 1)]
    return "\n\n".join(rendered), note_lines, out


def landed_text(project, n):
    body, notes, problems = chapter_notes(project, n)
    if body is None:
        return None, problems
    label = style().get("notesHeading", "Notes")
    return (body + ("\n\n" + label + "\n\n" + "\n".join(notes) if notes else "")), problems


def cited_sources(project, numbers):
    seen = []
    for n in numbers:
        ch = project.chapter(n) or {}
        for c in live_claims(ch):
            sid = str(c.get("source", ""))
            if sid in project.sources and sid not in seen:
                seen.append(sid)
    return seen


GROUPS = [("Newspapers", lambda r: newspaper_page(r) is not None),
          ("Records and reports", lambda r: (r.get("kind") or "") == "government"),
          ("Archives, collections and oral histories", lambda r: (r.get("kind") or "") in ("archive", "community", "primary")),
          ("Articles and later reporting", lambda r: (r.get("kind") or "") == "news"),
          ("Books", lambda r: (r.get("kind") or "") == "book"),
          ("Encyclopedias and reference works", lambda r: (r.get("kind") or "") == "encyclopedia"),
          ("Other", lambda r: True)]


def sources_text(project, numbers):
    st = style()
    srcs = project.sources
    ids = cited_sources(project, numbers)
    lines = [st.get("sourcesHeading", "Sources"), ""]
    if st.get("sourcesIntro"):
        lines += [st["sourcesIntro"], ""]
    placed = set()
    for label, test in GROUPS:
        group = [sid for sid in ids if sid not in placed and test(srcs[sid])]
        if not group:
            continue
        placed |= set(group)
        lines += [label, ""]
        if label == "Newspapers":
            papers = {}
            for sid in group:
                paper, date, page, url = newspaper_page(srcs[sid])
                papers.setdefault(paper, []).append((date, page, url, newspaper_item(srcs[sid])))
            for paper, issues in sorted(papers.items()):
                issues.sort()
                lines.append(f"{paper}. {st.get('newspaperArchive', 'Library of Congress, Chronicling America')}.")
                for date, page, url, item in issues:
                    lines.append(f"    {fmt_date(date)}, p. {page}" + (f", {item}" if item else "") + f". {url}")
                lines.append("")
        else:
            for sid in sorted(group, key=lambda s: full_cite(srcs[s]).lower()):
                lines.append(full_cite(srcs[sid]))
                lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def strip_notes(text):
    """A landed text as the writer wrote it: markers gone, the Notes block gone."""
    label = style().get("notesHeading", "Notes")
    body = re.split(r"\n\n" + re.escape(label) + r"\n\n", text, maxsplit=1)[0]
    return MARK.sub("", body)


# ── the appendix style ──────────────────────────────────────────────────────

def notes_style():
    return style().get("notesStyle", "appendix")


def paragraph_sources(project, n):
    """([(paragraph text, [source ids, first use first])], findings) for one chapter."""
    ch = project.chapter(n)
    if ch is None:
        return [], [finding("chapter_missing", "hard", f"chapters/{int(n):02d}.json does not exist")]
    text = ch.get("text", "")
    sents = flat_sentences(text)
    paras = paragraphs(text)
    per = [[] for _ in paras]
    first = [[] for _ in paras]          # (sentence index, claim order) of each source's first use
    problems = []
    for k, c in enumerate(live_claims(ch)):
        sid = str(c.get("source", ""))
        if not c.get("anchor"):
            problems.append(finding("claim_unanchored", "hard", f"ch{n} claim {c.get('id')}: no `anchor` — run cite.py anchors"))
            continue
        hits = resolve(c["anchor"], sents)
        if len(hits) != 1:
            problems.append(finding("anchor_unresolved", "hard",
                                    f"ch{n} claim {c.get('id')}: anchor {c['anchor'][:60]!r} is in {len(hits)} sentences — it must be in exactly one"))
            continue
        if sid not in project.sources:
            problems.append(finding("source_unknown", "hard", f"ch{n} claim {c.get('id')}: source {sid!r} is not in sources/index.json"))
            continue
        pi = sents[hits[0]][0]
        if sid not in per[pi]:
            per[pi].append(sid)
            first[pi].append((hits[0], k))
    for pi in range(len(paras)):
        order = sorted(range(len(per[pi])), key=lambda j: first[pi][j])
        per[pi] = [per[pi][j] for j in order]
    return [(paras[i][0], per[i]) for i in range(len(paras))], problems


KEY_TAIL = set("a an the and or but of on in at to for with by from as her his its their our that which "
               "who whom whose when where while than then she he they it we you had has have was were is are "
               "be been being did do does".split())


def key_phrase(paragraph, limit=8):
    """The opening words a note is keyed to: up to `limit` words, never past the first
    sentence's end, never ending on a small word ("…appeared on the"), and with any
    quotation it opens closed again in single quotes."""
    ws = []
    parts = paragraph.split()
    for k, w in enumerate(parts):
        ws.append(w)
        bare = re.sub(r"[^A-Za-z]", "", w)
        following = parts[k + 1] if k + 1 < len(parts) else ""
        ends = re.search(r"[.!?][\"”’)]*$", w) and not (w.endswith(".") and continues_after(bare, following))
        if len(ws) >= limit or ends:
            break
    # A key that ends inside a quotation it opened stops before the quotation instead.
    opens = [i for i, w in enumerate(ws) if re.match(r"^[\"“]", w)]
    if opens and sum(ch in "\"“”" for ch in " ".join(ws)) % 2 == 1 and opens[-1] >= 4:
        ws = ws[:opens[-1]]
    while len(ws) > 3 and re.sub(r"[^\w']", "", ws[-1]).lower() in KEY_TAIL:
        ws.pop()
    key = " ".join(ws).rstrip(",;:—–-.!?")
    # Quotations inside the key take single quotes (the key itself sits in double ones).
    out, opened = [], False
    for ch in key:
        if ch in "\"“”":
            out.append("’" if opened else "‘")
            opened = not opened
        else:
            out.append(ch)
    key = "".join(out).rstrip()
    if opened:
        key = key.rstrip("’‘").rstrip() + "’"
    return key


def source_numbers(project, numbers):
    """{source id: number}, numbered in the order the story first cites them, paragraph by
    paragraph, the introduction first."""
    out = {}
    for n in numbers:
        rows, _ = paragraph_sources(project, n)
        for _, sids in rows:
            for sid in sids:
                out.setdefault(sid, len(out) + 1)
    return out


def title_block(project):
    """The book's title for the top of its first page: the subject's name, then the years and the
    series (citations.json `titleBlock`). Apparatus, like the notes: the prose never carries it.
    Only what the story's records hold: no years without a lifespan, no series without a name."""
    if (style().get("titleBlock") or {}).get("enabled") is False:
        return ""
    meta = load_json(project.path("project.json"), {}) or {}
    dossier = project.dossier or {}
    name = (meta.get("subject") or dossier.get("subject") or "").strip()
    if not name:
        return ""

    def year(value):
        m = re.match(r"\d{3,4}", str(value or ""))
        return m.group(0) if m else None
    life = dossier.get("lifespan") or {}
    born, died = year(life.get("born")), year(life.get("died"))
    years = f"{born}–{died}" if born and died else (f"born {born}" if born else (f"died {died}" if died else ""))
    sid = meta.get("series") or dossier.get("series")
    known = (load_json(os.path.join(HISTORY, "series.json"), {}) or {}).get("series", [])
    series = next((s.get("title") for s in known if s.get("id") == sid and s.get("title")), "")
    dek = " · ".join(x for x in (years, series) if x)
    return f"# {name}\n\n*{dek}*" if dek else f"# {name}"


TITLE_BLOCK = re.compile(r"\A# [^\n]*\n(?:[ \t]*\n\*[^*\n]+\*[ \t]*\n)?\s*")


def chapter_heading(project, n):
    ch = project.chapter(n) or {}
    return ch.get("title") or ("Introduction" if int(n) == 0 else f"Chapter {n}")


def notes_appendix(project, numbers):
    st = style()
    nums = source_numbers(project, numbers)
    lines = [st.get("notesHeading", "Notes"), ""]
    if st.get("notesIntro"):
        lines += [st["notesIntro"], ""]
    for n in numbers:
        rows, _ = paragraph_sources(project, n)
        cited = [(p, sids) for p, sids in rows if sids]
        if not cited:
            continue
        lines += [chapter_heading(project, n), ""]
        for p, sids in cited:
            refs = ", ".join(str(nums[sid]) for sid in sorted(set(sids), key=lambda x: nums[x]))
            lines.append(f"“{key_phrase(p)}”: {refs}.")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def full_entry(rec):
    """A numbered Sources entry: a newspaper page by paper, date and page, with the page a
    reader can open; anything else in full."""
    np = newspaper_page(rec)
    if np:
        paper, date, page, url = np
        item = newspaper_item(rec)
        archive = style().get("newspaperArchive", "Library of Congress, Chronicling America")
        return f"{paper}, {fmt_date(date)}, p. {page}" + (f", {item}" if item else "") + f". {archive}. {url}"
    return full_cite(rec)


def numbered_sources(project, numbers):
    st = style()
    srcs = project.sources
    nums = source_numbers(project, numbers)
    lines = [st.get("sourcesHeading", "Sources"), ""]
    if st.get("numberedSourcesIntro"):
        lines += [st["numberedSourcesIntro"], ""]
    for sid, k in sorted(nums.items(), key=lambda kv: kv[1]):
        lines.append(f"{k}. {full_entry(srcs[sid])}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


# ── pictures and landmark links (images.json, voice.md §14) ─────────────────

def _images():
    import images
    return images


def image_markdown(rec):
    """One picture on its own line; the caption and credit are its alt text, which the
    StoryMaker Read view draws under it."""
    im = _images()
    caption = (rec.get("caption") or "").strip().rstrip(".")
    credit = im.credit_line(rec)
    alt = (caption + "." + (f" {credit}." if credit else "")).replace("[", "(").replace("]", ")")
    url = (rec.get("url") or "").replace("(", "%28").replace(")", "%29").replace(" ", "%20")
    return f"![{alt}]({url})"


def chapter_images(project, n):
    """{paragraph index: [image markdown lines]} for chapter n."""
    im = _images()
    out = {}
    for rec in im.index(project):
        if int(rec.get("chapter", -1)) != int(n):
            continue
        pi = im.paragraph_index(project, n, rec.get("after", ""))
        if pi is not None:
            out.setdefault(pi, []).append(image_markdown(rec))
    return out


# A full stop belongs to an abbreviation ("Ave."), never to the whole word: "…at 815 2nd Avenue."
# ends a sentence, and the link must not take the sentence's full stop with it.
_STREET = {"AVE": r"(?:Avenue|Ave\.?)", "ST": r"(?:Street|St\.?)", "PL": r"(?:Place|Pl\.?)", "BLVD": r"(?:Blvd\.?|Boulevard)",
           "DR": r"(?:Drive|Dr\.?)", "RD": r"(?:Rd\.?|Road)", "CT": r"(?:Ct\.?|Court)", "TER": r"(?:Terrace|Ter\.?)", "WAY": r"Way",
           "PKWY": r"(?:Pkwy\.?|Parkway)", "LN": r"(?:Ln\.?|Lane)"}
_DIR = {"E": r"(?:East|E\.?)", "W": r"(?:West|W\.?)", "N": r"(?:North|N\.?)", "S": r"(?:South|S\.?)",
        "NE": r"(?:NE|Northeast|North\s+East)", "NW": r"(?:NW|Northwest|North\s+West)",
        "SE": r"(?:SE|Southeast|South\s+East)", "SW": r"(?:SW|Southwest|South\s+West)"}


_UNITS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"]
_TEENS = ["tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth",
          "eighteenth", "nineteenth"]
_TENS = {2: "twent", 3: "thirt", 4: "fort", 5: "fift", 6: "sixt", 7: "sevent", 8: "eight", 9: "ninet"}


def ordinal_word(n):
    """12 → "twelfth", 21 → "twenty-first", for 1–99; None outside that."""
    if 1 <= n <= 9:
        return _UNITS[n]
    if 10 <= n <= 19:
        return _TEENS[n - 10]
    if 20 <= n <= 99:
        t, u = divmod(n, 10)
        return _TENS[t] + ("ieth" if not u else "y-" + _UNITS[u])
    return None


def word_pattern(w):
    """One word of a landmark's name or address. An ordinal matches as a numeral or a word,
    "1st" or "First": the pack files First African Methodist Episcopal Church as "1st …", and a
    story writes it out (2026-10-04)."""
    m = re.fullmatch(r"(\d+)(?:st|nd|rd|th)", w, re.I)
    n = int(m.group(1)) if m else next((i for i in range(1, 100) if ordinal_word(i) == w.lower()), None)
    if n is not None and ordinal_word(n):
        return "(?:" + re.escape(f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}") + "|" + re.escape(ordinal_word(n)) + ")"
    return re.escape(w)


def cased_word_pattern(w):
    """A word of a landmark's NAME: a capitalised word must be capitalised in the prose, the rest of it
    in any case; a small word (of, the) in any case; an ordinal as a numeral or a word."""
    p = word_pattern(w)
    if p != re.escape(w):                        # an ordinal: "(?:1st|First)" as written, any case
        return "(?i:" + p + ")"
    if w[:1].isupper():
        return re.escape(w[0]) + "(?i:" + re.escape(w[1:]) + ")" if len(w) > 1 else re.escape(w)
    return "(?i:" + re.escape(w) + ")"


def address_pattern(address):
    """'518 14th Ave E' → a pattern that also matches '518 14th Avenue East'. None unless it is
    a street address (starts with a number)."""
    toks = (address or "").replace(",", " ").split()
    if len(toks) < 3 or not re.fullmatch(r"\d+[A-Za-z½]?", toks[0]):
        return None
    parts = []
    for t in toks:
        key = t.rstrip(".").upper()
        parts.append(_STREET.get(key) or _DIR.get(key) or word_pattern(t))
    return r"\s+".join(parts)


# Words of a landmark's name that say what KIND of place it is, not WHICH: "Cayton" and "Revels"
# identify Cayton Revels House, "House" does not.
GENERIC_NAME_WORDS = set(
    "the and of for building house home bank church hall apartments apartment hotel school station office "
    "club park company inc community center residence block theatre theater store market library temple "
    "hospital garage warehouse tower lodge court terrace street avenue way north south east west "
    "seattle washington puget sound pacific northwest american national state states united city county "
    "new old great first second third".split())


class LandmarkMatcher:
    """A landmark's mentions in prose. Its name always counts. Its address counts only when a word
    of its name that says WHICH place it is ("Cayton", not "House") is in the same paragraph: an
    address names a lot, and the landmark standing there today may be a later building or another
    business. The 1917 Epler Cafeteria at 815 Second Avenue is not the Bank of California
    landmark at that address (Horace Cayton's book editor, 2026-10-04)."""

    def __init__(self, place, name_pattern, addr_pattern):
        # The name keeps its capitals ("Black Property" is a landmark; "the first Black property owner"
        # is not, William Grose's book, 2026-10-05); an address matches in any case.
        alts = [p for p in (name_pattern, "(?i:" + addr_pattern + ")" if addr_pattern else None) if p]
        self.place = place
        self.rx = re.compile(r"\b(?:" + "|".join(alts) + r")(?![\w-])")
        self.addr = re.compile(addr_pattern, re.I) if addr_pattern else None
        self.words = [w for w in re.findall(r"[A-Za-z]+", place.get("name", ""))
                      if len(w) > 2 and w.lower() not in GENERIC_NAME_WORDS]

    def is_address(self, m):
        return bool(self.addr and self.addr.fullmatch(m.group(0)))

    def confirmed(self, text, m):
        """A name match; or an address match with a word of the name in its paragraph."""
        if not self.is_address(m):
            return True
        a, b = m.start(), m.end()
        starts = [x.end() for x in re.finditer(r"\n\s*\n", text[:a])]
        after = re.search(r"\n\s*\n", text[b:])
        para = text[starts[-1] if starts else 0:a] + " " + text[b:b + after.start() if after else len(text)]
        return any(re.search(r"\b" + re.escape(w) + r"\b", para, re.I) for w in self.words)

    def finditer(self, text):
        return (m for m in self.rx.finditer(text or "") if self.confirmed(text or "", m))

    def search(self, text):
        return next(self.finditer(text), None)

    def findall(self, text):
        return [m.group(0) for m in self.finditer(text)]

    def unconfirmed(self, text):
        """Address matches refused for want of the name nearby: `cite.py check` names them."""
        return [m for m in self.rx.finditer(text or "") if not self.confirmed(text or "", m)]


def landmark_patterns():
    """[(id, place, LandmarkMatcher)] from the configured landmark pack."""
    cfg = (_images().config().get("landmarkLinks") or {})
    if not cfg.get("pack"):
        return []
    root = os.path.dirname(os.path.realpath(HISTORY))
    pack = load_json(os.path.join(root, "places", "packs", f"{cfg['pack']}.json"), {}) or {}
    out = []
    for place in pack.get("places", []):
        name = place.get("name", "")
        name_pattern = (r"[\s\-–]+".join(cased_word_pattern(w) for w in re.split(r"[\s\-–]+", name) if w)
                        if len(name.split()) >= 2 else None)
        addr = address_pattern(place.get("address", ""))
        if name_pattern or addr:
            out.append((place["id"], place, LandmarkMatcher(place, name_pattern, addr)))
    return out


def name_as_written(place, shown):
    """The words the prose used for a landmark, when they are its NAME (not its address): the
    story writes "First African Methodist Episcopal Church" where the pack has "1st …", and the
    map's caption and the Places list should say it the way the book does (2026-10-04)."""
    name = place.get("name", "")
    if not shown or len(name.split()) < 2:
        return name
    rx = re.compile(r"[\s\-–]+".join(word_pattern(w) for w in re.split(r"[\s\-–]+", name) if w), re.I)
    return shown if rx.fullmatch(shown) else name


def link_landmarks(text, used, patterns=None):
    """The text with each landmark's FIRST mention linked to its page; `used` collects them."""
    cfg = (_images().config().get("landmarkLinks") or {})
    template = cfg.get("url")
    if not template:
        return text
    hits = []
    for lid, place, rx in (patterns if patterns is not None else landmark_patterns()):
        m = rx.search(text)
        if m:
            hits.append((m.start(), m.end(), lid, place))
    hits.sort()
    out, last, taken = [], 0, []
    for a, b, lid, place in hits:
        if any(a < y and b > x for x, y in taken):
            continue
        url = template.replace("{id}", lid)
        out.append(text[last:a] + f"[{text[a:b]}]({url})")
        last = b
        taken.append((a, b))
        prev = used.get(lid)
        shown = name_as_written(place, text[a:b])
        if prev and prev[2] != place.get("name"):
            shown = prev[2]                       # the first name-form mention stands
        used[lid] = (place, url, shown)
    out.append(text[last:])
    return "".join(out)


def map_records(project):
    """{landmark id: map record} for every map maps.py drew that is still on disk."""
    rows = load_json(project.path("images", "maps", "index.json"), []) or []
    return {r["id"]: r for r in rows if r.get("file") and os.path.exists(project.path(r["file"]))}


def map_markdown(project, rec, name=None):
    """A landmark's map on its own line: the picture links to the landmark's page, and its alt text
    (drawn under it) names the place and carries the basemap's credit."""
    import pathlib
    where = ", ".join(x for x in (name or rec.get("name"), rec.get("address"), rec.get("neighborhood")) if x)
    alt = where + "."
    if rec.get("url"):
        alt += f" Click the map for its page in {rec.get('label') or 'Landmarks'}."
    if rec.get("credit"):
        alt += f" {rec['credit']}."
    alt = alt.replace("[", "(").replace("]", ")")
    img = pathlib.Path(project.path(rec["file"])).resolve().as_uri()
    return f"[![{alt}]({img})]({rec['url']})" if rec.get("url") else f"![{alt}]({img})"


def map_chapters(project, nums, patterns=None):
    """{chapter: [landmark ids]} — each drawn landmark's map goes in the chapter that names it most
    (the introduction only when nothing else names it), ties to the earlier chapter."""
    maps = map_records(project)
    if not maps:
        return {}
    pats = {lid: rx for lid, _, rx in (patterns if patterns is not None else landmark_patterns())}
    out = {}
    for lid in maps:
        rx = pats.get(lid)
        if rx is None:
            continue
        counts = [(len(rx.findall((project.chapter(n) or {}).get("text", ""))), n) for n in nums]
        named = [(c, n) for c, n in counts if c]
        body = [(c, n) for c, n in named if n != 0] or named
        if body:
            best = max(c for c, _ in body)
            out.setdefault(min(n for c, n in body if c == best), []).append(lid)
    return out


def strip_additions(text):
    """A landed chapter back to the prose the gates checked: notes, pictures, maps and links removed."""
    text = TITLE_BLOCK.sub("", strip_notes(text), count=1)
    text = re.sub(r"(?m)^\[!\[[^\n]*\]\([^\n)]*\)\]\([^\n)]*\)[ \t]*\n?", "", text)
    text = re.sub(r"(?m)^!\[[^\n]*\]\([^\n)]*\)[ \t]*\n?", "", text)
    return re.sub(r"\[([^\]\n]+)\]\((https?://[^)\s]+)\)", r"\1", text)


def with_pictures_and_links(project, n, body, used, maps_here=(), placed=None):
    """Insert each placed picture after its paragraph, link landmark mentions, and put each of
    `maps_here` after the paragraph that first names its landmark. `placed` collects the maps."""
    pics = chapter_images(project, n)
    paras = re.split(r"\n\s*\n", body.strip())
    maps = map_records(project)
    pats = {lid: rx for lid, _, rx in landmark_patterns()} if maps_here else {}
    waiting = [lid for lid in maps_here if lid in maps and lid in pats]
    out = []
    for i, p in enumerate(paras):
        out.append(link_landmarks(p, used))
        out.extend(pics.get(i, []))
        for lid in [lid for lid in waiting if pats[lid].search(p)]:
            out.append(map_markdown(project, maps[lid], (used.get(lid) or (None, None, None))[2]))
            waiting.remove(lid)
            if placed is not None:
                placed.append(lid)
    return "\n\n".join(out)


def pictures_and_places(project, used, placed=()):
    """The Sources' last two sections: every picture's credit, and the landmarks linked (with the
    maps' credit when a map was placed)."""
    im = _images()
    lines = []
    recs = sorted(im.index(project), key=lambda r: (int(r.get("chapter", 0)), r.get("id", "")))
    if recs:
        lines += ["Pictures", ""]
        for r in recs:
            bits = [r.get("caption", "").rstrip(".") + ".", im.credit_line(r) + "." if im.credit_line(r) else "",
                    r.get("pageUrl") or r.get("url") or ""]
            lines.append(" ".join(b for b in bits if b))
            lines.append("")
    if used:
        label = (im.config().get("landmarkLinks") or {}).get("label", "Landmarks")
        lines += ["Places", ""]
        for lid, (place, url, shown) in sorted(used.items(), key=lambda kv: kv[1][2]):
            lines.append(f"{shown}, {place.get('address', '')}. {label}: {url}")
            lines.append("")
        credit = (im.config().get("maps") or {}).get("credit")
        if placed and credit:
            lines.append(f"Maps: {credit}, from the basemap of {label}.")
            lines.append("")
    return lines


# ── checks and the book ──────────────────────────────────────────────────────

def check_findings(project, numbers):
    out = []
    for n in numbers:
        _, _, problems = chapter_notes(project, n)
        out += problems
    out += _images().image_findings(project)
    for sid in cited_sources(project, numbers):
        rec = project.sources[sid]
        p = parts(rec)
        if not newspaper_page(rec) and not p["title"]:
            out.append(finding("source_untitled", "soft",
                               f"source {sid} has no title — add \"cite\": {{\"title\": …}} to its record in sources/index.json"))
        elif not newspaper_page(rec) and re.search(r"\s\|\s|back to top|skip to|menu\b|\|", p["title"], re.I):
            out.append(finding("source_title_messy", "soft",
                               f"source {sid}'s title looks like page furniture ({p['title'][:70]!r}) — set \"cite\": {{\"title\": …}}"))
        if not p["url"]:
            out.append(finding("source_no_url", "soft", f"source {sid} has no URL"))
    pats = [x for x in landmark_patterns() if isinstance(x[2], LandmarkMatcher)]
    for n in numbers:
        text = (project.chapter(n) or {}).get("text", "")
        for lid, place, matcher in pats:
            for m in matcher.unconfirmed(text)[:1]:
                out.append(finding("landmark_address_unconfirmed", "soft",
                                   f"chapter {n}: {m.group(0)!r} is the address of the landmark {place.get('name')} today, and "
                                   "its paragraph never names it — not linked or mapped. If the story's building IS that "
                                   "landmark, say so in the prose, from a source"))
    return out


def book_numbers(project):
    """The introduction (chapter 0) when written, then every chapter the plan holds."""
    planned = [int(c.get("n")) for c in project.plan.get("chapters", [])]
    nums = sorted(set(planned) | set(project.chapter_numbers()))
    return nums


def cmd_book(project):
    nums = book_numbers(project)
    problems = [f for f in check_findings(project, nums) if f["severity"] == "hard"]
    if problems:
        return report("book (refused)", problems)
    st = style()
    appendix = notes_style() == "appendix"
    out_dir = project.path("book")
    os.makedirs(out_dir, exist_ok=True)
    for old in os.listdir(out_dir):
        if old.endswith(".txt"):
            os.remove(os.path.join(out_dir, old))          # a style change must not leave the other style's files
    manifest = {"generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
                "style": notes_style(), "chapters": [], "appendices": []}
    used, placed = {}, []
    maps_in = map_chapters(project, nums)
    title = title_block(project)
    manifest["title"] = title.split("\n", 1)[0][2:] if title else None
    for n in nums:
        ch = project.chapter(n)
        if appendix:
            text = with_pictures_and_links(project, n, ch.get("text", ""), used, maps_in.get(n, ()), placed)
        else:
            landed, _ = landed_text(project, n)
            label = st.get("notesHeading", "Notes")
            body, sep, notes = landed.partition("\n\n" + label + "\n\n")
            text = with_pictures_and_links(project, n, body, used, maps_in.get(n, ()), placed) + (sep + notes if sep else "")
        if title and n == nums[0]:
            text = title + "\n\n" + text          # the first page names who the book is about
        name = f"{n:02d}.txt"
        with open(os.path.join(out_dir, name), "w", encoding="utf-8") as fh:
            fh.write(text)
        same = re.sub(r"\s+", " ", strip_additions(text)).strip() == re.sub(r"\s+", " ", ch.get("text", "")).strip()
        manifest["chapters"].append({"n": n, "title": chapter_heading(project, n), "file": f"book/{name}",
                                     "storymaker": ch.get("storymaker"), "stripsToGatedText": same})
        if not same:
            return report("book (refused)", [finding("render_changed_prose", "hard",
                                                     f"chapter {n}: the rendered text minus its notes is not the gated prose")])
    if appendix:
        with open(os.path.join(out_dir, "notes.txt"), "w", encoding="utf-8") as fh:
            fh.write(notes_appendix(project, nums))
        manifest["appendices"].append({"title": st.get("notesHeading", "Notes"), "file": "book/notes.txt"})
        sources = numbered_sources(project, nums)
    else:
        sources = sources_text(project, nums)
    manifest["maps"] = placed
    extra = pictures_and_places(project, used, placed)
    if extra:
        sources = sources.rstrip() + "\n\n" + "\n".join(extra).rstrip() + "\n"
    with open(os.path.join(out_dir, "sources.txt"), "w", encoding="utf-8") as fh:
        fh.write(sources)
    count = len(source_numbers(project, nums)) if appendix else len(cited_sources(project, nums))
    manifest["appendices"].append({"title": st.get("sourcesHeading", "Sources"), "file": "book/sources.txt", "count": count})
    save_json(os.path.join(out_dir, "manifest.json"), manifest)
    print(f"book/ ({manifest['style']} notes): {len(nums)} chapter(s), {count} sources. Land them in this order:")
    for c in manifest["chapters"]:
        print(f"  {c['n']:>2}  {c['title']}  ({c['file']})")
    for a in manifest["appendices"]:
        print(f"  --  {a['title']}  ({a['file']})")
    return 0


# ── landing the book in StoryMaker (PLAYBOOK §5 step 4) ─────────────────────

def find_shim(project):
    """The workdir's `mchatai` shim (the tunnel to the app), found by walking up from the story."""
    d = os.path.abspath(project.root)
    while d != os.path.dirname(d):
        cand = os.path.join(d, "mchatai")
        if os.path.isfile(cand) and os.access(cand, os.X_OK):
            return cand
        d = os.path.dirname(d)
    return None


def storymaker(shim, verb, wait=40, **args):
    """One StoryMaker verb through the shim. The JSON goes as an argument, never through a
    shell, so no apostrophe or quote in a chapter can break it."""
    import subprocess
    payload = json.dumps({"command": "applet", "applet": "storymaker", "verb": verb, "args": args})
    try:
        out = subprocess.run([shim, "raw", payload, "--wait", str(wait)], capture_output=True, text=True, timeout=wait + 30)
    except Exception as e:                         # a hung or missing tunnel is an answer too
        return {"status": "error", "error": str(e)}
    try:
        return json.loads(out.stdout)
    except ValueError:
        return {"status": "error", "error": (out.stdout or out.stderr or "no reply")[:300]}


def intro_summary(project, meta=None):
    meta = meta if meta is not None else (load_json(project.path("project.json"), {}) or {})
    name = meta.get("subject") or meta.get("name") or (load_json(project.path("dossier.json"), {}) or {}).get("subject")
    return f"Who {name} was, and why the story is worth telling." if name else "Who this story is about, and why it is worth telling."


def current_outline_summaries(shim, pid):
    """{chapter id or title: summary} for the outline StoryMaker holds now, so a plan with no
    summaries never blanks the author's outline."""
    r = storymaker(shim, "getOutline", project=pid)
    rows = ((r.get("result") or r.get("entity") or {}).get("chapters") or []) if r.get("status") == "ok" else []
    out = {}
    for x in rows:
        if x.get("summary") and x["summary"] != "Who he or she was, and why the story is worth telling.":   # the old placeholder
            for k in (x.get("linkedChapterID"), x.get("title")):
                if k:
                    out[k] = x["summary"]
    return out


def cmd_outline(project):
    """The plan's chapters as StoryMaker's outline, through ./mchatai with no shell in between: a
    planning thread that typed setOutline's JSON into a shell string lost every apostrophe to
    the quoting (William Grose's plan, 2026-10-05). Titles come from the chapter files once they
    exist, summaries from plan.json (`summary`); a chapter with none keeps the summary StoryMaker
    holds. Rows already linked to a landed chapter stay linked."""
    meta = load_json(project.path("project.json"), {}) or {}
    pid = meta.get("storymakerProject")
    if not pid:
        print("no storymakerProject in project.json: storymaker.createProject first, and record its id")
        return 2
    man = load_json(project.path("book", "manifest.json"), None) or {}
    if any((c.get("storymaker") or {}).get("chapterID") for c in man.get("chapters", [])):
        print("the book is landed: `cite.py land` sets its outline, with the introduction, Notes and Sources rows")
        return 2
    shim = find_shim(project)
    if not shim:
        print("no ./mchatai shim above the story folder")
        return 2
    held = current_outline_summaries(shim, pid)
    rows, missing = [], []
    for c in project.plan.get("chapters", []):
        ch = project.chapter(c.get("n")) or {}
        cid = (ch.get("storymaker") or {}).get("chapterID") or ""
        title = ch.get("title") or c.get("title")
        summary = c.get("summary") or held.get(cid) or held.get(title) or ""
        if not c.get("summary"):
            missing.append(str(c.get("n")))
        rows.append({"title": title, "summary": summary, "linkedChapterID": cid})
    r = storymaker(shim, "setOutline", project=pid, chapters=rows)
    if r.get("status") != "ok":
        print(f"outline: NOT SET — {(r.get('error') or r.get('output') or '')[:300]}")
        return 1
    print(f"outline: set, {len(rows)} rows")
    if missing:
        print(f"  note: plan.json has no `summary` for chapter(s) {', '.join(missing)} — add one per chapter, so a "
              "landing never has to guess")
    return 0


def cmd_land(project, dry=False):
    """Land book/ in StoryMaker: the second story pasted 5,235 words through its own thread, each
    chapter one shell argument, and apostrophes broke the quoting (2026-10-04). This makes the
    calls itself. A chapter StoryMaker already holds is replaced only when its text differs, and
    only if nobody edited it (StoryMaker refuses otherwise: then it is the author's, and a change
    goes as storymaker.proposeSuggestion). A new one is created: the introduction before the first
    chapter, the Notes and Sources after the last. Every chapter is read back afterwards."""
    man = load_json(project.path("book", "manifest.json"), None)
    if not man:
        print("no book/manifest.json: run cite.py book first")
        return 2
    meta = load_json(project.path("project.json"), {}) or {}
    pid = meta.get("storymakerProject")
    shim = find_shim(project)
    if not pid or not shim:
        print("project.json needs storymakerProject (PLAYBOOK §2), and a ./mchatai shim must be above the story folder")
        return 2
    got = storymaker(shim, "getProject", projectID=pid)
    if got.get("status") != "ok":
        print(f"getProject: {got.get('error')}")
        return 1
    live = (got.get("result") or {}).get("chapters", [])
    held = [c["id"] for c in live]
    keys = {"Notes": "notesChapterID", "Sources": "sourcesChapterID"}
    rows = [(c, (c.get("storymaker") or {}).get("chapterID") or (meta.get("introChapterID") if c["n"] == 0 else None))
            for c in man.get("chapters", [])]
    rows += [(a, meta.get(keys.get(a.get("title"), ""), None)) for a in man.get("appendices", [])]
    # A part landed by hand has no recorded id (the second story's introduction, Notes and Sources,
    # 2026-10-04). Take the StoryMaker chapter with its title, if no other part has it, rather than
    # creating a second copy.
    claimed = {cid for _, cid in rows if cid in held}
    by_title = {}
    for c in live:
        by_title.setdefault((c.get("title") or "").strip().lower(), []).append(c["id"])
    for i, (c, cid) in enumerate(rows):
        if cid in held:
            continue
        free = [x for x in by_title.get((c.get("title") or "").strip().lower(), []) if x not in claimed]
        if len(free) == 1:
            rows[i] = (c, free[0])
            claimed.add(free[0])
    first_body = next((cid for c, cid in rows if c.get("n", 0) and cid in held), None)
    report_rows, problems = [], 0
    for c, cid in rows:
        path = project.path(c["file"])
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        title = c.get("title")
        if cid in held:
            if "n" in c and not (c.get("storymaker") or {}).get("chapterID"):
                c["storymaker"] = {"project": pid, "chapterID": cid}       # record what was found by title
                ch = project.chapter(c["n"])
                if ch is not None and not (ch.get("storymaker") or {}).get("chapterID"):
                    ch["storymaker"] = c["storymaker"]
                    save_json(project.chapter_path(c["n"]), ch)
                if c["n"] == 0:
                    meta["introChapterID"] = cid
            elif title in keys and not meta.get(keys[title]):
                meta[keys[title]] = cid
            cur = storymaker(shim, "getChapter", projectID=pid, chapterID=cid)
            if ((cur.get("result") or {}).get("text") or "").strip() == text.strip():
                report_rows.append((title, "unchanged"))
                continue
            if dry:
                report_rows.append((title, "would replace"))
                continue
            r = storymaker(shim, "replaceChapter", project=pid, chapter=cid, text=text, reason="cite.py land: the book rebuilt")
            if r.get("status") != "ok":
                problems += 1
                report_rows.append((title, f"REFUSED: {(r.get('error') or '')[:160]} — the author's now; propose with storymaker.proposeSuggestion"))
                continue
            report_rows.append((title, "replaced"))
        else:
            if dry:
                report_rows.append((title, "would create"))
                continue
            args = {"project": pid, "title": title, "text": text}
            if c.get("n") == 0 and first_body:
                args["before"] = first_body
            elif held:
                args["after"] = held[-1]
            r = storymaker(shim, "createChapter", **args)
            cid = (r.get("result") or {}).get("chapterID")
            if r.get("status") != "ok" or not cid:
                problems += 1
                report_rows.append((title, f"NOT CREATED: {(r.get('error') or '')[:160]}"))
                continue
            held.insert(held.index(first_body), cid) if args.get("before") else held.append(cid)
            stamp = {"project": pid, "chapterID": cid,
                     "landedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")}
            if "n" in c:
                ch = project.chapter(c["n"])
                if ch is not None:
                    ch["storymaker"] = stamp
                    save_json(project.chapter_path(c["n"]), ch)
                c["storymaker"] = stamp
                if c["n"] == 0:
                    meta["introChapterID"] = cid
            elif title in keys:
                meta[keys[title]] = cid
            report_rows.append((title, "created"))
        back = storymaker(shim, "getChapter", projectID=pid, chapterID=cid)
        if ((back.get("result") or {}).get("text") or "").strip() != text.strip():
            problems += 1
            report_rows[-1] = (title, report_rows[-1][1] + " — READ-BACK DIFFERS from " + c["file"])
    if not dry:
        save_json(project.path("project.json"), meta)
        save_json(project.path("book", "manifest.json"), man)
    for title, what in report_rows:
        print(f"  {title}: {what}")
    if not dry and not problems:
        # The outline, each row linked to its chapter (setOutline keeps linkedChapterID since
        # 2026-10-04). The plan's summaries for the chapters; the book's own parts named plainly.
        plan = {int(c.get("n")): c for c in project.plan.get("chapters", []) if c.get("n") is not None}
        held = current_outline_summaries(shim, pid)
        outline = []
        for c, cid in rows:
            n = c.get("n")
            cid = (c.get("storymaker") or {}).get("chapterID") or cid or meta.get(keys.get(c.get("title"), ""))
            # The plan's summary; else the one StoryMaker already holds (a plan that never stored its
            # summaries once blanked Horace Cayton's outline on landing, 2026-10-05); else a plain line.
            summary = (plan.get(n) or {}).get("summary") or held.get(cid or "") or held.get(c.get("title") or "") \
                or {0: intro_summary(project, meta)}.get(n) \
                or {"Notes": "The notes, keyed to each paragraph's opening words.", "Sources": "Every source, numbered, with its link."}.get(c.get("title"), "")
            outline.append({"title": c.get("title"), "summary": summary, "linkedChapterID": cid or ""})
        r = storymaker(shim, "setOutline", project=pid, chapters=outline)
        if r.get("status") != "ok":
            print(f"  outline: NOT SET — {(r.get('error') or '')[:200]}")
        else:
            linked = (r.get("result") or {}).get("linked")
            print(f"  outline: set, {len(outline)} rows" + (f", {linked} linked to their chapters" if linked is not None else ""))
    print(f"land: {len(report_rows)} chapter(s) checked, {problems} problem(s)")
    return 1 if problems else 0


# ── after the author's review (PLAYBOOK §4) ─────────────────────────────────

FACT_RULES = {"number_unsourced", "quote_unverified", "quote_too_short", "verbatim_copy", "dialogue_unsourced",
              "correction_failed", "ocr_in_quote"}
LENGTH_RULES = {"over_ceiling", "under_floor", "starved", "growth_unshown", "growth_none"}
PICTURE = re.compile(r"!\[[^\]\n]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")   # a size word may follow: ![c](url "small")


def cmd_adopt(project):
    """The author's reviewed text becomes the story's text, and the apparatus follows it.

    Lawrence's editor read (2026-10-04) ended: "After you've accepted the ones you want, the Notes
    need rebuilding before the book is final." Save each chapter as the author left it in
    StoryMaker (storymaker.getChapter) to review/NN.txt, then run this. For each chapter that
    changed, the prose under the apparatus replaces chapters/NN.json's text (the old text is kept
    in `revisions`), every anchor that still points at one sentence stays, the certain ones move,
    and the rest are listed: set the anchor by hand, or retire the claim if the author cut its
    fact. The gates then run on the author's text. A fact problem is a question for the author;
    length, growth and voice are the author's call and are only reported. Their text is never
    changed. Then `cite.py book` rebuilds the Notes and Sources."""
    import gate
    t = style()
    lo, margin = t.get("anchorMinScore", 0.55), t.get("anchorMinMargin", 0.15)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    adopted, open_claims, questions = 0, 0, 0
    for n in book_numbers(project):
        path = project.path("review", f"{n:02d}.txt")
        ch = project.chapter(n)
        if ch is None or not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fh:
            reviewed = fh.read()
        prose, old = strip_additions(reviewed).strip(), ch.get("text", "").strip()
        landed = project.path("book", f"{n:02d}.txt")
        if os.path.exists(landed):
            with open(landed, encoding="utf-8") as fh:
                gone = [u for u in PICTURE.findall(fh.read()) if u not in reviewed]
            for u in gone:
                print(f"chapter {n}: the author removed the picture or map {u[:90]} — take it out of images/ if they meant it")
        if re.sub(r"\s+", " ", prose) == re.sub(r"\s+", " ", old):
            print(f"chapter {n}: unchanged")
            continue
        ch.setdefault("revisions", []).append({"at": now, "by": "author", "before": old})
        ch["text"] = prose
        sents = flat_sentences(prose)
        moved, todo = 0, []
        for c in live_claims(ch):
            if c.get("anchor") and len(resolve(c["anchor"], sents)) == 1:
                continue
            i, score, gap = propose(c, sents)
            if i is not None and score >= lo and gap >= margin:
                c["anchor"] = anchor_for(i, sents)
                moved += 1
            else:
                c["anchor"] = None
                todo.append((c, i, score))
        save_json(project.chapter_path(n), ch)
        adopted += 1
        print(f"chapter {n}: the author's text adopted; {moved} anchor(s) moved, {len(todo)} claim(s) to settle")
        for c, i, score in todo:
            open_claims += 1
            guess = sents[i][2][:140] if i is not None else "—"
            print(f"  {c.get('id')}: {c.get('text', '')[:110]!r}\n      best guess ({score:.2f}): {guess!r}\n"
                  "      set its `anchor`, or `\"retired\": \"cut by the author\"` if the fact is gone")
        found = [f for f in gate.chapter_findings(project, n) if f["severity"] == "hard"]
        for f in found:
            if f["rule"] in FACT_RULES:
                questions += 1
                print(f"  ? {f['rule']}: {f['message'][:200]} — ask the author; never change their text")
        style_hits = [f["rule"] for f in found if f["rule"] not in FACT_RULES | LENGTH_RULES and not f["rule"].startswith(("anchor", "claim_"))]
        if style_hits:
            print(f"  voice rules flag {len(style_hits)} passage(s) the author wrote ({', '.join(sorted(set(style_hits)))}): "
                  "evidence for §4.3, never a correction")
        length = sorted({f["rule"] for f in found if f["rule"] in LENGTH_RULES})
        if length:
            print(f"  length and growth now read {', '.join(length)}: the author's call")
    print(f"\nadopt: {adopted} chapter(s) took the author's text; {open_claims} claim(s) to settle; {questions} question(s) for the author")
    if not open_claims:
        print("next: cite.py book, then land book/notes.txt and book/sources.txt (only those) with storymaker.replaceChapter")
    return 1 if open_claims else 0


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    cmd = argv[1]
    if cmd == "strip":
        with open(argv[2], encoding="utf-8") as fh:
            sys.stdout.write(strip_notes(fh.read()))
        return 0
    project = Project(argv[2])
    nums = [int(a) for a in argv[3:] if a.isdigit()] or book_numbers(project)
    if cmd == "anchors" and "--list" in argv:
        return cmd_anchor_list(project, nums)
    if cmd == "anchors":
        return cmd_anchors(project, nums, "--write" in argv)
    if cmd == "check":
        return report("citations", check_findings(project, nums))
    if cmd == "render" and len(argv) >= 4:
        text, problems = landed_text(project, int(argv[3]))
        if problems:
            return report("render", problems)
        print(text)
        return 0
    if cmd == "sources":
        print(sources_text(project, nums))
        return 0
    if cmd == "book":
        return cmd_book(project)
    if cmd == "adopt":
        return cmd_adopt(project)
    if cmd == "land":
        return cmd_land(project, dry="--dry" in argv)
    if cmd == "outline":
        return cmd_outline(project)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
