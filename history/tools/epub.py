#!/usr/bin/env python3
"""A private EPUB 3 of a History Writer project, to read in Apple Books (or any EPUB reader).

  epub.py build <project> [--out file.epub]   the introduction and every chapter in plan order
                                              (cite.book_numbers), each as cite.py render lands it;
                                              default out: <project>/book/<Title>.epub

What goes in, all from the project itself:
  - project.json: `title` (else `subject`, else the slug), `author` (dc:creator; left out when the
    project names none), `language` (default en) and `cover`, a JPEG or PNG path relative to the
    project (a cover page and the cover-image when it exists).
  - Each chapter's render (cite.chapter_notes): its note markers link to that chapter's notes at the
    end of the chapter, and each note links to its sources' pages.
  - The boxes: a paragraph that is one of plan.json `boxes` (`required`, or any list of names there)
    or a short heading-like line (six words or fewer, no closing punctuation) opens a box, which runs
    to the next box. The chapter's last box ends before the chapter's last paragraph when it holds
    more than one (that paragraph is the chapter's turn to the next). In a box, a paragraph ending in
    "?" is a question (Check yourself).
  - Pictures, when images/index.json exists: each one placed in a chapter of the book follows the
    paragraph its `after` names (images.placed_at; `at: "start"` opens the chapter), with its caption
    and credit. A picture whose `after` matches no single paragraph goes at the chapter's end, with
    a warning. Declared illustrations the author rejected and portrait-only records are left out.
  - Diagrams, when diagrams/index.json exists: a list (or {"diagrams": [...]}) of {"chapter",
    "file" (SVG or PNG, relative to the project), "after" or "at": "start", "caption", "credit"},
    placed the same way.

Standard library only (zipfile, xml): the file is a zip whose first entry is the uncompressed
`mimetype`, and every XHTML file is parsed as XML before it is written. The identifier is stable
for a project (a UUID from its slug), so a rebuilt book replaces the old one in a reader's library.
Nothing here publishes anything. Exit codes: 0 written, 1 refused, 2 usage.
"""
import datetime
import html
import json
import os
import re
import sys
import urllib.parse
import uuid
import zipfile
from xml.etree import ElementTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cite  # noqa: E402
from _hw import Project, load_json  # noqa: E402

MEDIA = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
         ".svg": "image/svg+xml", ".webp": "image/webp"}
SUPERSCRIPT = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")
CSS = """\
body { font-family: Georgia, "Iowan Old Style", serif; line-height: 1.5; margin: 0 4%; }
p { margin: 0 0 0.9em 0; text-indent: 0; }
.label { font-variant: small-caps; letter-spacing: 0.08em; margin: 2.5em 0 0.2em 0; opacity: 0.75; }
h1 { font-size: 1.6em; line-height: 1.25; margin: 0 0 1.4em 0; }
h2 { font-size: 1.05em; margin: 0 0 0.6em 0; }
a { color: inherit; }
sup { font-size: 0.7em; line-height: 0; }
a[role="doc-noteref"] { text-decoration: none; }
.box { border: 1px solid rgba(128, 128, 128, 0.55); border-radius: 0.5em; background: rgba(128, 128, 128, 0.09);
       padding: 0.9em 1.1em 0.2em 1.1em; margin: 1.6em 0; }
.box h2 { font-variant: small-caps; letter-spacing: 0.06em; }
.box p.q { font-weight: bold; margin-bottom: 0.3em; }
figure { margin: 1.6em 0; text-align: center; }
figure img { max-width: 100%; height: auto; }
figcaption { font-size: 0.85em; margin-top: 0.4em; opacity: 0.85; text-align: left; }
figcaption .credit { font-style: italic; }
.notes { margin-top: 2.5em; font-size: 0.85em; border-top: 1px solid rgba(128, 128, 128, 0.55); padding-top: 0.6em; }
.notes ol { padding-left: 1.6em; }
.notes li { margin-bottom: 0.4em; }
.cover { text-align: center; margin: 0; padding: 0; }
.cover img { max-width: 100%; max-height: 100%; }
.titlepage { text-align: center; margin-top: 30%; }
"""
XHTML_HEAD = ('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n'
              '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" '
              'lang="{lang}" xml:lang="{lang}">\n<head>\n<meta charset="UTF-8"/>\n<title>{title}</title>\n'
              '<link rel="stylesheet" type="text/css" href="style.css"/>\n</head>\n')


class Refused(Exception):
    pass


def esc(text):
    return html.escape(text or "", quote=True)


def page(title, body, lang):
    doc = XHTML_HEAD.format(lang=esc(lang), title=esc(title)) + body + "\n</html>\n"
    ElementTree.fromstring(doc.encode("utf-8"))   # every page must parse as XML; refuse rather than ship a broken one
    return doc


def metadata(project):
    meta = load_json(project.path("project.json"), {}) or {}
    slug = meta.get("slug") or os.path.basename(project.root.rstrip("/"))
    title = (meta.get("title") or meta.get("subject") or slug).strip()
    cover = meta.get("cover")
    cover = project.path(cover) if cover and os.path.isfile(project.path(cover)) else None
    if cover and os.path.splitext(cover)[1].lower() not in (".jpg", ".jpeg", ".png"):
        cover = None
    return {"slug": slug, "title": title, "author": (meta.get("author") or "").strip(),
            "language": meta.get("language") or "en", "cover": cover,
            "id": "urn:uuid:" + str(uuid.uuid5(uuid.NAMESPACE_URL, f"mchatai-history-book:{slug}"))}


def box_names(project):
    boxes = (project.plan or {}).get("boxes") or {}
    names = set()
    for v in (boxes.values() if isinstance(boxes, dict) else [boxes]):
        if isinstance(v, list):
            names |= {x for x in v if isinstance(x, str)}
        elif isinstance(v, str):
            names.add(v)
    return names


def is_box_title(paragraph, names):
    words = paragraph.split()
    return paragraph in names or (0 < len(words) <= 6 and not re.search(r"[.?!:;,\"”’)\]]$", paragraph))


def chapter_title(project, n):
    plan = project.plan or {}
    planned = (plan.get("intro") or {}).get("title") if int(n) == 0 else next(
        (c.get("title") for c in plan.get("chapters", []) if int(c.get("n", -1)) == int(n)), None)
    return (project.chapter(n) or {}).get("title") or planned or ("Introduction" if int(n) == 0 else f"Chapter {n}")


# ── notes ────────────────────────────────────────────────────────────────────

def note_urls(project, n, notes):
    """[[url, …] per note]: each note is the "; "-joined note forms of its sources (cite.chapter_notes)."""
    forms = {}
    plain = {}
    for sid in cite.cited_sources(project, [n]):
        rec = project.sources[sid]
        url = cite.parts(rec)["url"]
        if not re.match(r"https?://", url or ""):   # a local measurement's path is not a page a reader can open
            continue
        forms[cite.short_cite(rec, detail=True)] = url
        plain.setdefault(cite.short_cite(rec), set()).add(url)
    for form, urls in plain.items():
        if len(urls) == 1:
            forms.setdefault(form, next(iter(urls)))
    out = []
    for line in notes:
        body = re.sub(r"^\d+\.\s+", "", line)
        body = body[:-1] if body.endswith(".") else body
        urls = []
        for seg in body.split("; "):
            url = forms.get(seg) or forms.get(seg.rstrip("."))
            if url and url not in urls:
                urls.append(url)
        out.append(urls)
    return out


def link_text(url):
    host = urllib.parse.urlparse(url).netloc
    return host[4:] if host.startswith("www.") else (host or url)


def inline(text, refs_seen):
    """A paragraph's text as XHTML: note markers become links to the chapter's notes."""
    out, last = [], 0
    for m in cite.MARK.finditer(text):
        out.append(esc(text[last:m.start()]))
        k = int(m.group(0).translate(SUPERSCRIPT))
        rid = "" if k in refs_seen else f' id="r{k}"'
        refs_seen.add(k)
        out.append(f'<a epub:type="noteref" role="doc-noteref" href="#n{k}"{rid}><sup>{k}</sup></a>')
        last = m.end()
    out.append(esc(text[last:]))
    return "".join(out).replace("\n", "<br/>")


# ── pictures and diagrams ────────────────────────────────────────────────────

def picture_records(project):
    """[(chapter, record, kind)] from images/index.json and diagrams/index.json, when they exist."""
    out = []
    if os.path.isfile(project.path("images", "index.json")):
        for rec in load_json(project.path("images", "index.json"), []) or []:
            if rec.get("portraitOnly") or rec.get("status") == "rejected":
                continue
            out.append((rec, "picture"))
    if os.path.isfile(project.path("diagrams", "index.json")):
        rows = load_json(project.path("diagrams", "index.json"), []) or []
        if isinstance(rows, dict):
            rows = rows.get("diagrams") or rows.get("items") or []
        out += [(rec, "diagram") for rec in rows if isinstance(rec, dict)]
    return out


def place(project, rec):
    """The paragraph index a picture follows (-1: the chapter's start), or None."""
    import images
    if rec.get("at") == "start":
        return -1
    return images.paragraph_index(project, rec.get("chapter"), rec.get("after", ""))


def credit_of(rec, kind):
    if kind == "picture":
        import images
        return images.credit_line(rec)
    return (rec.get("credit") or "").strip()


def figures_for(project, n, records, media, warnings):
    """{paragraph index or "end": [figure XHTML]} for chapter n; media gains (zip name, source path, type)."""
    out = {}
    for rec, kind in records:
        try:
            if int(rec.get("chapter", -99)) != int(n):
                continue
        except (TypeError, ValueError):
            continue
        src = project.path(rec["file"]) if rec.get("file") else None
        ext = os.path.splitext(src or "")[1].lower()
        if not src or not os.path.isfile(src) or ext not in MEDIA:
            warnings.append(f"ch{n}: {kind} {rec.get('id') or rec.get('file')!r} has no usable file, left out")
            continue
        name = next((m[0] for m in media if m[1] == src), None)
        if name is None:
            names = {m[0] for m in media}
            stem = re.sub(r"[^A-Za-z0-9._-]+", "-", os.path.basename(src))
            name, k = f"{kind}s/{stem}", 1
            while name in names:
                k += 1
                name = f"{kind}s/{k}-{stem}"
            media.append((name, src, MEDIA[ext]))
        caption = (rec.get("caption") or "").strip()
        credit = credit_of(rec, kind)
        cap = (esc(caption.rstrip(".") + ".") if caption else "") + (
            f' <span class="credit">{esc(credit.rstrip(".") + ".")}</span>' if credit else "")
        fig = (f'<figure class="{kind}"><img src="{esc(name)}" alt="{esc(caption or kind)}"/>'
               + (f"<figcaption>{cap.strip()}</figcaption>" if cap else "") + "</figure>")
        at = place(project, rec)
        if at is None:
            warnings.append(f"ch{n}: {kind} {rec.get('id') or rec.get('file')!r}: its `after` is in no single "
                            "paragraph, placed at the chapter's end")
            at = "end"
        out.setdefault(at, []).append(fig)
    return out


# ── a chapter ────────────────────────────────────────────────────────────────

def chapter_xhtml(project, n, meta, records, media, warnings):
    body, notes, problems = cite.chapter_notes(project, n)
    hard = [p for p in problems if p.get("severity") == "hard"]
    if body is None or hard:
        raise Refused("; ".join(p["message"] for p in (hard or problems)) or f"chapter {n} is missing")
    title = chapter_title(project, n)
    label = "Introduction" if int(n) == 0 else f"Chapter {n}"
    paras = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    names = box_names(project)
    heads = [i for i, p in enumerate(paras) if is_box_title(cite.MARK.sub("", p), names)]
    box_end = {}
    for k, i in enumerate(heads):
        end = heads[k + 1] if k + 1 < len(heads) else len(paras)
        if k + 1 == len(heads) and end - i - 1 > 1:
            end -= 1
        box_end[i] = end
    figs = figures_for(project, n, records, media, warnings)
    refs = set()
    html_ = [f'<body>\n<section epub:type="chapter" role="doc-chapter" aria-labelledby="title">',
             f'<p class="label">{esc(label)}</p>', f'<h1 id="title">{esc(title)}</h1>']
    html_ += figs.get(-1, [])
    i, words = 0, 0
    while i < len(paras):
        if i in box_end:
            name = cite.MARK.sub("", paras[i])
            cls = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
            html_.append(f'<section class="box box-{cls}" aria-label="{esc(name)}">')
            html_.append(f"<h2>{inline(paras[i], refs)}</h2>")
            html_ += figs.get(i, [])
            for j in range(i + 1, box_end[i]):
                q = ' class="q"' if cite.MARK.sub("", paras[j]).endswith("?") else ""
                html_.append(f"<p{q}>{inline(paras[j], refs)}</p>")
                html_ += figs.get(j, [])
                words += len(cite.MARK.sub("", paras[j]).split())
            html_.append("</section>")
            words += len(name.split())
            i = box_end[i]
            continue
        html_.append(f"<p>{inline(paras[i], refs)}</p>")
        html_ += figs.get(i, [])
        words += len(cite.MARK.sub("", paras[i]).split())
        i += 1
    html_ += figs.get("end", [])
    if notes:
        urls = note_urls(project, n, notes)
        html_.append('<section class="notes" epub:type="endnotes" role="doc-endnotes">\n<h2>Notes</h2>\n<ol>')
        for k, (line, links) in enumerate(zip(notes, urls), 1):
            text = re.sub(r"^\d+\.\s+", "", line)
            more = "".join(f' <a href="{esc(u)}">{esc(link_text(u))}</a>' for u in links)
            back = f' <a href="#r{k}" role="doc-backlink">↩︎</a>' if k in refs else ""
            html_.append(f'<li id="n{k}" epub:type="endnote" role="doc-endnote"><p>{esc(text)}{more}{back}</p></li>')
        html_.append("</ol>\n</section>")
    html_.append("</section>\n</body>")
    return title, label, page(f"{label}: {title}", "\n".join(html_), meta["language"]), words


# ── the package ──────────────────────────────────────────────────────────────

def opf(meta, items, spine, cover_id):
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    md = [f'<dc:identifier id="bookid">{esc(meta["id"])}</dc:identifier>',
          f"<dc:title>{esc(meta['title'])}</dc:title>",
          f"<dc:language>{esc(meta['language'])}</dc:language>",
          f'<meta property="dcterms:modified">{now}</meta>']
    if meta["author"]:
        md.append(f"<dc:creator>{esc(meta['author'])}</dc:creator>")
    if cover_id:
        md.append(f'<meta name="cover" content="{cover_id}"/>')
    manifest = "\n    ".join(
        f'<item id="{i}" href="{esc(h)}" media-type="{t}"' + (f' properties="{p}"' if p else "") + "/>"
        for i, h, t, p in items)
    spine_xml = "\n    ".join(f'<itemref idref="{i}"/>' for i in spine)
    doc = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" '
           f'xml:lang="{esc(meta["language"])}">\n'
           '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n    ' + "\n    ".join(md) + "\n  </metadata>\n"
           f"  <manifest>\n    {manifest}\n  </manifest>\n  <spine>\n    {spine_xml}\n  </spine>\n</package>\n")
    ElementTree.fromstring(doc.encode("utf-8"))
    return doc


CONTAINER = ('<?xml version="1.0" encoding="UTF-8"?>\n'
             '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
             '  <rootfiles>\n    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n'
             '  </rootfiles>\n</container>\n')


def build(project_dir, out=None):
    """Write the EPUB; returns (path, {"chapters", "words", "pictures", "warnings"})."""
    project = Project(project_dir)
    meta = metadata(project)
    numbers = cite.book_numbers(project)
    if not numbers:
        raise Refused("the project has no chapters")
    out = out or project.path("book", re.sub(r"[^A-Za-z0-9]+", "-", meta["title"]).strip("-") + ".epub")
    records = picture_records(project)
    media, warnings, pages = [], [], []
    words = 0
    for n in numbers:
        title, label, doc, w = chapter_xhtml(project, n, meta, records, media, warnings)
        pages.append((f"ch{int(n):02d}", f"ch{int(n):02d}.xhtml", title, label, doc))
        words += w
    items, spine, files = [("css", "style.css", "text/css", None)], [], [("OEBPS/style.css", CSS.encode("utf-8"))]
    cover_id = None
    if meta["cover"]:
        ext = os.path.splitext(meta["cover"])[1].lower()
        cover_id = "cover-image"
        items.append((cover_id, f"cover{ext}", MEDIA[ext], "cover-image"))
        files.append((f"OEBPS/cover{ext}", open(meta["cover"], "rb").read()))
        cover_page = page(meta["title"], f'<body class="cover">\n<section epub:type="cover" class="cover">'
                          f'<img src="cover{ext}" alt="{esc(meta["title"])}"/></section>\n</body>', meta["language"])
        items.append(("cover", "cover.xhtml", "application/xhtml+xml", None))
        spine.append("cover")
        files.append(("OEBPS/cover.xhtml", cover_page.encode("utf-8")))
    else:
        by = f'<p>{esc(meta["author"])}</p>' if meta["author"] else ""
        title_page = page(meta["title"], f'<body>\n<section epub:type="titlepage" class="titlepage">'
                          f'<h1>{esc(meta["title"])}</h1>{by}</section>\n</body>', meta["language"])
        items.append(("titlepage", "titlepage.xhtml", "application/xhtml+xml", None))
        spine.append("titlepage")
        files.append(("OEBPS/titlepage.xhtml", title_page.encode("utf-8")))
    toc = "\n".join(f'<li><a href="{href}">{esc(label + ": " + title)}</a></li>' for _, href, title, label, _ in pages)
    marks = ([f'<li><a epub:type="cover" href="cover.xhtml">Cover</a></li>'] if cover_id else []) + [
        f'<li><a epub:type="toc" href="nav.xhtml">Contents</a></li>',
        f'<li><a epub:type="bodymatter" href="{pages[0][1]}">{esc(pages[0][3])}</a></li>']
    nav = page("Contents", '<body>\n<nav epub:type="toc" role="doc-toc" id="toc">\n<h1>Contents</h1>\n<ol>\n'
               + toc + '\n</ol>\n</nav>\n<nav epub:type="landmarks" hidden="hidden">\n<ol>\n' + "\n".join(marks)
               + "\n</ol>\n</nav>\n</body>", meta["language"])
    items.append(("nav", "nav.xhtml", "application/xhtml+xml", "nav"))
    files.append(("OEBPS/nav.xhtml", nav.encode("utf-8")))
    for pid, href, _, _, doc in pages:
        items.append((pid, href, "application/xhtml+xml", None))
        spine.append(pid)
        files.append((f"OEBPS/{href}", doc.encode("utf-8")))
    for k, (name, src, mtype) in enumerate(media, 1):
        items.append((f"media{k}", name, mtype, None))
        with open(src, "rb") as fh:
            files.append((f"OEBPS/{name}", fh.read()))
    files.append(("OEBPS/content.opf", opf(meta, items, spine, cover_id).encode("utf-8")))
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    tmp = out + ".tmp"
    with zipfile.ZipFile(tmp, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), b"application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml", CONTAINER, compress_type=zipfile.ZIP_DEFLATED)
        for name, data in files:
            z.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)
    os.replace(tmp, out)
    return out, {"chapters": len(pages), "words": words, "pictures": len(media), "warnings": warnings}


def main(argv):
    if len(argv) < 3 or argv[1] != "build":
        print(__doc__)
        return 2
    out = argv[argv.index("--out") + 1] if "--out" in argv else None
    try:
        path, info = build(argv[2], out)
    except Refused as e:
        print(f"refused: {e}")
        return 1
    for w in info["warnings"]:
        print(f"warning: {w}")
    print(f"{path}: {info['chapters']} chapters, {info['words']} words, {info['pictures']} pictures, "
          f"{os.path.getsize(path)} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
