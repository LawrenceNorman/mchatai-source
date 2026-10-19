"""Shared helpers for the History Writer's deterministic tools.

Standard library only, so a CLI session can run every tool with the system python3.

A story PROJECT is one folder (the Workbench working folder, or any folder you choose):

    project.json          {"slug", "subject", "series", "storymakerProject"?, "domain"?}
                          (domain: history/domains/<id>/, an overlay of thresholds and lint rules)
    dossier.json          what the record holds  (schemas/dossier.schema.json)
    sources/index.json    one record per fetched source
    sources/<id>.txt      the fetched text — a source counts only when this exists
    plan.json             chapters, allotted events, ledger rows (schemas/plan.schema.json)
    chapters/<NN>.json    one chapter: text + claims (schemas/chapter.schema.json)
    corrections.json      the author's fact corrections, enforced on every regeneration

Content (thresholds, lint rules) is read from the history/ folder this file sits in, so the
tools work from the app's source cache, a checkout, or a copy — wherever history/ is whole.
"""
import json
import os
import re

TOOLS = os.path.dirname(os.path.abspath(__file__))
HISTORY = os.path.dirname(TOOLS)


def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def save_json(path, data):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".part"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    os.replace(tmp, path)


DOMAINS = os.path.join(HISTORY, "domains")


def domain_of(project=None):
    """The project's domain (`project.json` `domain`), or None for a History Writer story.

    A domain (history/domains/<id>/) is a content overlay for a new kind of history: its
    thresholds.json replaces the base keys it names, and its lint-rules.json adds rules. Nothing
    of the base is removed, and a project with no `domain` reads exactly the base files. A domain
    that does not exist is an error, never a silent fall-back to the base."""
    if project is None:
        return None
    meta = load_json(project.path("project.json"), {}) or {}
    dom = meta.get("domain")
    if not dom:
        return None
    if not os.path.isdir(os.path.join(DOMAINS, dom)):
        raise SystemExit(f"project.json names domain {dom!r}, which history/domains/ does not have")
    return dom


def domain_path(domain, *parts):
    return os.path.join(DOMAINS, domain, *parts)


def thresholds(project=None):
    base = load_json(os.path.join(HISTORY, "thresholds.json"))
    dom = domain_of(project)
    if dom:
        over = load_json(domain_path(dom, "thresholds.json"), {}) or {}
        base = {**base, **{k: v for k, v in over.items() if not k.startswith("_")}}
    return base


def series_entry(series_id):
    """(series, place) for a series id: history/series.json first, then each domain's series.json
    (history/domains/<id>/series.json), so a domain's series has a title and a book like any other.
    A domain's file has no top-level place; its stories name their own (dossier `place`)."""
    base = load_json(os.path.join(HISTORY, "series.json"), {}) or {}
    for s in base.get("series", []):
        if s.get("id") == series_id:
            return s, base.get("place") or ""
    if os.path.isdir(DOMAINS):
        for dom in sorted(os.listdir(DOMAINS)):
            data = load_json(os.path.join(DOMAINS, dom, "series.json"), {}) or {}
            for s in data.get("series", []):
                if s.get("id") == series_id:
                    return s, data.get("place") or ""
    return None, base.get("place") or ""


def lint_rules(project=None):
    rules = list(load_json(os.path.join(HISTORY, "lint-rules.json"))["rules"])
    dom = domain_of(project)
    if dom:
        rules += (load_json(domain_path(dom, "lint-rules.json"), {}) or {}).get("rules", [])
    return rules


# ── text ─────────────────────────────────────────────────────────────────────

_DASHES = str.maketrans({"–": "-", "—": "-", "‒": "-", "−": "-"})
_QUOTES = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"'})


_INVISIBLE = dict.fromkeys(map(ord, "\u00ad\u200b\u200c\u200d\u2060\ufeff"))

# Windows-1252's quotes and dashes mis-decoded into the C1 control range, as a PDF's text layer can
# carry them: Sam Smith's oral history reads "weren" + chr(0x92) + "t" (2026-10-04).
_C1 = {}
for _c in range(0x80, 0xA0):
    try:
        _C1[_c] = bytes([_c]).decode("cp1252")
    except UnicodeDecodeError:
        pass

# A printed page's furniture at a page break: the page number and the running head ("PROLOGUE",
# "CHAPTER 1") land in the middle of sentences in a PDF's text layer.
_PAGE_FURNITURE = re.compile(r"\f(?:[ \t]*(?:\d{1,4}|[A-Z0-9][A-Z0-9 ,.'’&:;()-]{1,58})[ \t]*(?:\n[ \t]*)+){0,3}")


def clean_source_text(text):
    """A fetched source as a reader reads it: Windows-1252 quotes and dashes restored, and a PDF's
    page numbers and running heads taken out where a page break falls. Every reader of a source
    (`Project.source_text`) and `fetch.py` use it, so a quote copied from `mentions` verifies."""
    return _PAGE_FURNITURE.sub("\n", (text or "").translate(_C1))


# Old translations print ligatures ("Cæsar", "Œdipus"); a quote retyped with "ae" is the same words
# (a Syracuse scout's evidence failed on it, 2026-10-16).
_LIGATURES = str.maketrans({"æ": "ae", "Æ": "Ae", "œ": "oe", "Œ": "Oe", "ﬁ": "fi", "ﬂ": "fl"})


_FOOTNOTE = re.compile(r"\[(?:\d{1,3}|[a-z]|note \d{1,3}|citation needed)\]")   # never a bracketed year


def norm(text):
    """Comparison form: dashes and curly quotes unified, ligatures spelled out, invisible
    characters (soft hyphens, zero-width spaces) dropped, whitespace collapsed, lowercased. The
    landmark quote check's normalisation plus quote marks — retyping a quote with curly marks
    changes no word of it."""
    text = (text or "").translate(_C1).translate(_INVISIBLE).translate(_DASHES).translate(_QUOTES)
    # An encyclopedia's footnote markers ("Dauntlesses,[156] while") are not words of the sentence:
    # a quote copied around one is the same words (Midway's planning, 2026-10-18).
    text = _FOOTNOTE.sub("", text)
    return re.sub(r"\s+", " ", text.translate(_LIGATURES)).strip().lower()


def words(text):
    return len((text or "").split())


# A quotation: straight or curly double quotes around at least one non-quote character.
_QUOTED = re.compile(r"“([^”]+)”|\"([^\"]+)\"")


def quoted_spans(text):
    """[(start, end, inner)] for every double-quoted span in `text`."""
    out = []
    for m in _QUOTED.finditer(text or ""):
        inner = m.group(1) if m.group(1) is not None else m.group(2)
        out.append((m.start(), m.end(), inner))
    return out


def strip_quoted(text):
    """`text` with quoted spans blanked out (same length, so offsets stay valid). Phrase rules
    run on this: a 1910 speaker saying "today" is not the narrator saying it."""
    chars = list(text or "")
    for start, end, _ in quoted_spans(text):
        for i in range(start, end):
            chars[i] = " "
    return "".join(chars)


_NUMBER = re.compile(r"\b\d[\d,]*(?:\.\d+)?\b")


def numbers(text):
    """Every number token: years, counts, money, as written. A comma that is not a thousands
    separator splits the token: OCR's "May 19,1894" is 19 and 1894, not 191,894."""
    out = []
    for m in _NUMBER.finditer((text or "").translate(_DASHES)):
        tok = m.group(0).rstrip(",")
        groups = tok.split(",")
        if len(groups) > 1 and any(len(g.split(".")[0]) != 3 for g in groups[1:]):
            out.extend(g for g in groups if g)
        else:
            out.append(tok)
    return out


_UNITS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
          "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
          "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19}
_TENS = {"twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80,
         "ninety": 90}
_SPELLED = re.compile(
    r"\b(?:(" + "|".join(_TENS) + r")(?:[-\s](" + "|".join(k for k, v in _UNITS.items() if v < 10) + r"))?"
    r"|(" + "|".join(_UNITS) + r"))(?:\s+(hundred|thousand))?\b", re.I)


def spelled_numbers(text):
    """[(as written, value)] for every number written in words: "twenty-three" -> 23, "six" -> 6,
    "four hundred" -> 400. Ordinals ("fourth") are not numbers here. The number gate checked
    digits only, so "six years of teaching" — the writer's own arithmetic — passed it
    (caught by the pilot's writer itself, 2026-10-02)."""
    out = []
    for m in _SPELLED.finditer(text or ""):
        tens, unit, alone, scale = m.group(1), m.group(2), m.group(3), m.group(4)
        v = (_TENS[tens.lower()] + (_UNITS[unit.lower()] if unit else 0)) if tens else _UNITS[alone.lower()]
        if scale:
            v *= 100 if scale.lower() == "hundred" else 1000
        out.append((m.group(0), v))
    return out


def sentence_around(text, start, end):
    s = text.rfind(".", 0, start) + 1
    e = text.find(".", end)
    return text[s:(e + 1 if e != -1 else len(text))].strip()[:200]


# ── project ──────────────────────────────────────────────────────────────────

class Project:
    def __init__(self, root):
        self.root = os.path.abspath(root)

    def path(self, *parts):
        return os.path.join(self.root, *parts)

    @property
    def dossier(self):
        return load_json(self.path("dossier.json"), {})

    @property
    def plan(self):
        return load_json(self.path("plan.json"), {})

    @property
    def sources(self):
        """{id: record} from sources/index.json."""
        rows = load_json(self.path("sources", "index.json"), [])
        if isinstance(rows, dict):
            rows = rows.get("sources", [])
        return {str(r["id"]): r for r in rows}

    def source_text(self, source_id):
        rec = self.sources.get(str(source_id))
        if not rec:
            return None
        p = self.path(rec.get("file") or os.path.join("sources", f"{source_id}.txt"))
        if not os.path.exists(p):
            return None
        with open(p, encoding="utf-8", errors="replace") as fh:
            return clean_source_text(fh.read())

    def chapter_path(self, n):
        return self.path("chapters", f"{int(n):02d}.json")

    def chapter(self, n):
        return load_json(self.chapter_path(n))

    def chapter_numbers(self):
        d = self.path("chapters")
        if not os.path.isdir(d):
            return []
        out = []
        for name in os.listdir(d):
            m = re.fullmatch(r"(\d+)\.json", name)
            if m:
                out.append(int(m.group(1)))
        return sorted(out)

    def plan_chapter(self, n):
        for ch in self.plan.get("chapters", []):
            if int(ch.get("n", -1)) == int(n):
                return ch
        return None

    def ledger_rows(self):
        return {r["id"]: r for r in self.plan.get("ledger", [])}

    def corrections(self):
        return load_json(self.path("corrections.json"), {"corrections": []}).get("corrections", [])


def finding(rule, severity, message, sentence=""):
    return {"rule": rule, "severity": severity, "message": message, "sentence": sentence}


def report(title, findings):
    """Print findings; return the process exit code (1 when any is hard)."""
    hard = [f for f in findings if f["severity"] == "hard"]
    soft = [f for f in findings if f["severity"] != "hard"]
    for f in hard + soft:
        mark = "✗" if f["severity"] == "hard" else "·"
        print(f"  {mark} [{f['rule']}] {f['message']}")
        if f.get("sentence"):
            print(f"      {f['sentence']}")
    note = f" (+{len(soft)} note(s))" if soft else ""
    print(f"{title}: " + ("CLEAN" + note if not hard else f"{len(hard)} violation(s){note}"))
    return 1 if hard else 0
