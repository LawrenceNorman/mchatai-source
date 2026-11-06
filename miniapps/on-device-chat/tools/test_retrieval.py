#!/usr/bin/env python3
"""Run personas/_tests/retrieval-fixture.json against the page's own JavaScript.

    python3 tools/test_retrieval.py            # prints OK or the failing cases

Extracts STOP/terms/termMatcher/pickChunks/noteProgress from index.html and
runs them in JavaScriptCore (osascript -l JavaScript), so the rules the page
ships are the ones tested — the iOS port (PersonaNotesTests) runs the same
fixture, which is how the two stay in step. macOS only (osascript).
"""
import json, os, re, subprocess, sys, tempfile

here = os.path.dirname(os.path.abspath(__file__))
source_root = os.path.abspath(os.path.join(here, "..", "..", ".."))
html = open(os.path.join(here, "..", "index.html"), encoding="utf-8").read()
script = re.findall(r"<script>(.*?)</script>", html, flags=re.S)[-1]

def block(name_pattern):
    """The source of one top-level declaration (ends at the next blank line or declaration)."""
    m = re.search(r"^(?:const|let|function)\s+" + name_pattern + r"\b.*?(?=^\s*$|^(?:const|let|function|async function|els\.|if\s*\(|window\.|document\.)\s)", script, flags=re.M | re.S)
    if not m: sys.exit(f"could not find {name_pattern} in the template")
    return m.group(0)

pieces = [block("STOP"), block("terms"), block("progress"), block("noteProgress"), block("progressNote"), block("termMatcher"), block("pickChunks")]
fixture = json.load(open(os.path.join(source_root, "personas", "_tests", "retrieval-fixture.json")))
packs = {}
for case in fixture["cases"]:
    pid = case["pack"]
    if pid not in packs:
        packs[pid] = {
            "pack": json.load(open(os.path.join(source_root, "personas", pid, "persona.json"))),
            "chunks": json.load(open(os.path.join(source_root, "personas", pid, "chunks.json"))),
        }

js = "\n".join(pieces) + """
var PACKS = %s; var CASES = %s; var results = [];
CASES.forEach(function (c) {
  var p = PACKS[c.pack]; CONFIG = { knowledge: p.pack.knowledge || null }; chunks = p.chunks; progress = (c.progressBefore == null) ? null : c.progressBefore;
  noteProgress(c.query);
  var texts = pickChunks(c.query, 1500);
  var ids = texts.map(function (t) { var hit = chunks.filter(function (x) { return x.text === t; })[0]; return hit ? hit.id : "?"; });
  var groups = texts.map(function (t) { var hit = chunks.filter(function (x) { return x.text === t; })[0]; return hit ? (hit.group || hit.story || hit.page || null) : null; });
  results.push({ ids: ids, groups: groups, progress: progress });
});
JSON.stringify(results);
""" % (json.dumps(packs), json.dumps(fixture["cases"]))
# `var CONFIG`/`chunks`/`progress` are the page's globals; declare them before the page code runs.
js = "var CONFIG = {}; var chunks = null;\n" + js.replace("let progress = null;", "progress = null;")

with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
    f.write(js); path = f.name
try:
    out = subprocess.run(["osascript", "-l", "JavaScript", path], capture_output=True, text=True)
finally:
    os.unlink(path)
if out.returncode != 0:
    sys.exit("JavaScript failed:\n" + out.stderr)
results = json.loads(out.stdout.strip())

failures = []
for case, r in zip(fixture["cases"], results):
    ids, groups = r["ids"], r["groups"]
    def fail(msg): failures.append(f"{case['pack']} | {case['query']!r}: {msg} (picked {ids})")
    if "expectFirst" in case and (not ids or ids[0] != case["expectFirst"]): fail(f"first should be {case['expectFirst']}")
    for want in case.get("expectAll", []):
        if want not in ids: fail(f"{want} should be picked")
    if "expectWithinTop" in case:
        w = case["expectWithinTop"]
        if w["id"] not in ids[:w["n"]]: fail(f"{w['id']} should be within the top {w['n']}")
    if "expectGroup" in case and any(g != case["expectGroup"] for g in groups): fail(f"every pick should be from {case['expectGroup']} (got {groups})")
    for bad in case.get("expectExcludes", []):
        if bad in ids: fail(f"{bad} must not be picked")
    if "expectProgress" in case and r["progress"] != case["expectProgress"]: fail(f"progress should be {case['expectProgress']}, got {r['progress']}")
if failures:
    print("\n".join(failures)); sys.exit(1)
print(f"OK — {len(results)} cases against the page's JavaScript")
