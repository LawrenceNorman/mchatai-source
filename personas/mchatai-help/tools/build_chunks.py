#!/usr/bin/env python3
"""Turn the mchatai.com user docs into mChatAI Help knowledge chunks.

    python3 build_chunks.py <docs-content dir> <out.json>

Reads <dir>/_index.json (the site's section list) and splits each page at its
## headings, then into ~110-word pieces, so the on-device model answers from
the same text people read at mchatai.com/docs. Markdown is flattened to plain
text; absolute links keep their URL so the answer can hand it over.
"""
import json, os, re, sys

SKIP_HEADINGS = {"drive it from an agent"}
COMMON = set("against between through before during because without another should across toward towards within itself others nothing something anything everything already perhaps rather however whether either neither several though although whenever wherever instead around behind beside inside outside beyond unless until while where which there their these those about after every other under over would could should".split())   # developer-portal notes; not what a person asks Help

def flatten(md):
    md = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", md)                         # images
    md = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r"\1 (\2)", md)      # absolute links keep the URL
    md = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", md)                      # relative links: text only
    md = re.sub(r"\*\*([^*]+)\*\*", r"\1", md)
    md = re.sub(r"`([^`]+)`", r"\1", md)
    md = re.sub(r"^\s*[-*]\s+", "", md, flags=re.M)
    md = re.sub(r"^\s*\d+\.\s+", "", md, flags=re.M)
    return re.sub(r"[ \t]+", " ", md).strip()

def words(s): return len(s.split())

def keywords(title, heading, body):
    ks = re.findall(r"[A-Za-z][\w+-]{2,}", title + " " + heading)
    ks += re.findall(r"\*\*([^*]+)\*\*", body) + re.findall(r"`([^`]+)`", body)
    ks += re.findall(r"\b[A-Z][a-zA-Z]{2,}(?: [A-Z][a-zA-Z]+)?\b", body)  # product and applet names
    # The plain nouns of the text too (persona, keychain, sidebar), so a question in
    # ordinary words ranks the note that answers it above one that merely mentions it.
    ks += [w for w in re.findall(r"\b[a-z][a-z-]{5,}\b", body.lower()) if w not in COMMON]
    out, seen = [], set()
    for k in ks:
        k = k.strip().lower()
        if len(k) >= 3 and k not in seen and k not in {"the", "and", "for", "with", "your", "what", "how", "does", "works", "try", "you", "don", "once", "when", "that", "this", "from", "into", "they", "them", "there", "here", "then", "than", "its"}:
            seen.add(k); out.append(k)
    return out[:28]

def chunk_page(title, md, prefix):
    out, n = [], 0
    parts = re.split(r"^##\s+", md, flags=re.M)
    intro = parts[0]
    intro = re.sub(r"^#\s+.*$", "", intro, flags=re.M)
    sections = [("", intro)] + [(p.split("\n", 1)[0].strip(), p.split("\n", 1)[1] if "\n" in p else "") for p in parts[1:]]
    for heading, body in sections:
        if heading.lower() in SKIP_HEADINGS: continue
        pieces = []
        for p in re.split(r"\n\s*\n|\n(?=[-*] |\d+\. )", body):
            if not p.strip(): continue
            # A long paragraph splits at sentence ends so no piece outgrows the window.
            if words(p) > 110:
                sentences, cur = re.split(r"(?<=[.!?])\s+(?=[A-Z(\"'])", p.strip()), []
                for sen in sentences:
                    if cur and words(" ".join(cur) + " " + sen) > 100: pieces.append(" ".join(cur)); cur = []
                    cur.append(sen)
                if cur: pieces.append(" ".join(cur))
            else:
                pieces.append(p)
        buf = []
        def flush():
            nonlocal buf, n
            if not buf: return
            n += 1
            text = flatten("\n".join(buf))
            if words(text) < 8: buf = []; return
            label = f"{title} — {heading}: " if heading else f"{title}: "
            out.append({"id": f"{prefix}-{n:02d}", "page": prefix, "keywords": keywords(title, heading, "\n".join(buf)), "text": label + text})
            buf = []
        for p in pieces:
            if buf and words(" ".join(buf) + " " + p) > 105: flush()
            buf.append(p.strip())
        flush()
    return out

if __name__ == "__main__":
    if len(sys.argv) != 3: sys.exit(__doc__)
    root, out_path = sys.argv[1], sys.argv[2]
    index = json.load(open(os.path.join(root, "_index.json")))
    chunks = []
    for s in index["sections"]:
        # Feature pages are listed by their site path (/features/<slug>); the text is features/<slug>.md.
        rel = s.get("file") or ("features/" + s["href"].rstrip("/").split("/")[-1] + ".md" if s.get("href", "").startswith("/features/") else None)
        if not rel: continue
        path = os.path.join(root, rel)
        if not os.path.exists(path): continue
        md = open(path, encoding="utf-8").read()
        m = re.search(r"^#\s+(.+)$", md, flags=re.M)
        title = m.group(1).strip() if m else s.get("title", s["id"])
        chunks.extend(chunk_page(title, md, s["id"]))
    json.dump(chunks, open(out_path, "w"), ensure_ascii=False, indent=1)
    print(f"{len(chunks)} chunks from {len(index['sections'])} pages, {os.path.getsize(out_path)} bytes, max {max(words(c['text']) for c in chunks)} words")
