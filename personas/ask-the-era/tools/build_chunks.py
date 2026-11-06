#!/usr/bin/env python3
"""Turn Pivotal Histories dossiers into Ask-the-era knowledge chunks.

    python3 build_chunks.py <stories-root> <out.json> <slug> [<slug> ...]

Every chunk is a sourced fact from a story's dossier.json (the scout's
re-checked record: what happened, when, and which source says so) — never a
line of the written chapters, and nothing the dossier does not say. Chunks
stay under ~110 words so two or three fit the on-device window.
"""
import json, os, re, sys

STOP = set("The A An And Or Of To In On For With By From At As Into Than Then When While After Before Against Between Over Under Near Its His Her Their".split())
MONTHS = "january february march april may june july august september october november december".split()
COMMON = set("against between through before during because without another should across toward towards within itself himself themselves became become became having others nothing something anything everything already perhaps rather however whether either neither several though although".split())

def words(s): return len(s.split())

def keywords(*texts, extra=()):
    out = []
    for t in texts:
        for w in re.findall(r"[A-Z][\w'’-]{2,}", t or ""):
            if w not in STOP: out.append(w.lower())
        for n in re.findall(r"\b\d{2,4}\b", t or ""): out.append(n)
        for m in MONTHS:
            if m in (t or "").lower(): out.append(m)
    out.extend(k.lower() for k in extra if k)
    for t in texts:
        out.extend(w for w in re.findall(r"\b[a-z][a-z-]{5,}\b", (t or "").lower()) if w not in COMMON)
    seen, uniq = set(), []
    for k in out:
        k = k.strip(".,;:()")
        if k and k not in seen: seen.add(k); uniq.append(k)
    return uniq[:28]

def source_labels(story_dir):
    idx = os.path.join(story_dir, "sources", "index.json")
    labels = {}
    if os.path.exists(idx):
        for s in json.load(open(idx)):
            pub = (s.get("publisher") or s.get("title") or "").split(" (")[0].strip()
            labels[s["id"]] = pub or s.get("title", s["id"])
    return labels

def chunks_for(story_dir, slug):
    d = json.load(open(os.path.join(story_dir, "dossier.json")))
    labels = source_labels(story_dir)
    subject = d.get("subject", slug)
    aliases = [a for a in d.get("aliases", []) if isinstance(a, str)] + [p for p in (d.get("place") or []) if isinstance(p, str)]
    events = [e for e in d.get("events", []) if e.get("what")]
    dates = [e.get("date", "") for e in events if e.get("date")]
    span = f" ({dates[0]} – {dates[-1]})" if dates and dates[0] != dates[-1] else (f" ({dates[0]})" if dates else "")
    out = []
    if d.get("edge"):
        out.append({"id": f"{slug}-edge", "story": slug,
                    "keywords": keywords(subject, d["edge"], extra=aliases + ["edge", "why", "decided", "turned", "mattered", "advantage"]),
                    "text": f"{subject}{span}. The edge that decided it: {d['edge']}"})
    quotes = [q for q in (d.get("edgeEvidence") or {}).get("for", []) if q.get("quote")]
    for i in range(0, len(quotes), 2):
        pair = quotes[i:i + 2]
        text = f"What the sources say about the edge at {subject}: " + " ".join(f"\"{q['quote'].strip()}\" [{labels.get(q.get('source'), q.get('source', ''))}]" for q in pair)
        out.append({"id": f"{slug}-evidence-{i // 2 + 1}", "story": slug, "keywords": keywords(subject, text, extra=aliases + ["edge", "evidence", "source", "says", "wrote"]), "text": text})
    people = [p for p in d.get("people", []) if p.get("name")]
    for i in range(0, len(people), 5):
        group = people[i:i + 5]
        out.append({"id": f"{slug}-people-{i // 5 + 1}", "story": slug,
                    "keywords": keywords(" ".join(p["name"] for p in group), extra=aliases + ["who", "people", "commander", "leader"]),
                    "text": f"Who's who in {subject}: " + "; ".join(f"{p['name']} — {p.get('relation', '')}".rstrip(" —") for p in group) + "."})
    buf, n = [], 0
    def flush():
        nonlocal buf, n
        if not buf: return
        n += 1
        text = f"{subject}: " + " ".join(buf)
        out.append({"id": f"{slug}-{n:02d}", "story": slug, "keywords": keywords(subject, text, extra=aliases), "text": text})
        buf = []
    for e in events:
        src = ", ".join(sorted({labels.get(s, s) for s in e.get("sources", [])}))
        line = f"{e.get('date', '').strip()}: {e['what'].strip()}".lstrip(": ") + (f" [{src}]" if src else "")
        if buf and words(" ".join(buf) + " " + line) > 105: flush()
        buf.append(line)
    flush()
    return out

if __name__ == "__main__":
    if len(sys.argv) < 4: sys.exit(__doc__)
    root, out_path, slugs = sys.argv[1], sys.argv[2], sys.argv[3:]
    chunks = []
    for slug in slugs:
        chunks.extend(chunks_for(os.path.join(root, slug), slug))
    json.dump(chunks, open(out_path, "w"), ensure_ascii=False, indent=1)
    print(f"{len(chunks)} chunks, {os.path.getsize(out_path)} bytes, max {max(words(c['text']) for c in chunks)} words")
