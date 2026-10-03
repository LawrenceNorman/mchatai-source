"""Shared helpers for the History Writer's deterministic tools.

Standard library only, so a CLI session can run every tool with the system python3.

A story PROJECT is one folder (the Workbench working folder, or any folder you choose):

    project.json          {"slug", "subject", "series", "storymakerProject"?}
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


def thresholds():
    return load_json(os.path.join(HISTORY, "thresholds.json"))


def lint_rules():
    return load_json(os.path.join(HISTORY, "lint-rules.json"))["rules"]


# ── text ─────────────────────────────────────────────────────────────────────

_DASHES = str.maketrans({"–": "-", "—": "-", "‒": "-", "−": "-"})
_QUOTES = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"'})


_INVISIBLE = dict.fromkeys(map(ord, "\u00ad\u200b\u200c\u200d\u2060\ufeff"))


def norm(text):
    """Comparison form: dashes and curly quotes unified, invisible characters (soft hyphens,
    zero-width spaces) dropped, whitespace collapsed, lowercased. The landmark quote check's
    normalisation plus quote marks — retyping a quote with curly marks changes no word of it."""
    text = (text or "").translate(_INVISIBLE).translate(_DASHES).translate(_QUOTES)
    return re.sub(r"\s+", " ", text).strip().lower()


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
    """Every number token: years, counts, money, as written."""
    return [m.group(0).rstrip(",") for m in _NUMBER.finditer((text or "").translate(_DASHES))]


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
            return fh.read()

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
