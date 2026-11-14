#!/usr/bin/env python3
"""The hub copy build.py writes keeps the pack's knowledge block intact.

    python3 tools/test_build.py            # prints OK or the failing checks

A chapter-gated pack (knowledge.gate + chunks with `order`) must reach its hub
copy with the gate, the preamble and every chunk's `order`, or an offline first
open puts every chapter's notes in play. Runs build.py on a synthetic gated
pack in a temp tree, then on every gated miniapp pack in personas/. Writes
only to temp dirs; nothing published is rebuilt.
"""
import json, os, re, shutil, subprocess, sys, tempfile

here = os.path.dirname(os.path.abspath(__file__))
source_root = os.path.abspath(os.path.join(here, "..", "..", ".."))
failures = []

def built_pack(build_py, pack_id, out_dir):
    out = subprocess.run([sys.executable, build_py, pack_id, out_dir], capture_output=True, text=True)
    if out.returncode != 0:
        failures.append(f"{pack_id}: build.py failed: {out.stderr.strip() or out.stdout.strip()}")
        return None
    html = open(os.path.join(out_dir, "index.html"), encoding="utf-8").read()
    m = re.search(r'<script id="persona-pack" type="application/json">(.*?)</script>', html, flags=re.S)
    return json.loads(m.group(1).replace("<\\/", "</")) if m else None

def check(pack_id, persona, chunks, built):
    def fail(msg): failures.append(f"{pack_id}: {msg}")
    if built is None: return fail("no persona-pack block in the built page")
    want, got = persona.get("knowledge") or {}, built.get("knowledge") or {}
    for key, value in want.items():
        if key != "chunks" and got.get(key) != value:
            fail(f"knowledge.{key} lost or changed ({value!r} -> {got.get(key)!r})")
    inline = got.get("chunks")
    if not isinstance(inline, list): return fail("knowledge.chunks is not inline")
    by_id = {c.get("id"): c for c in inline}
    for c in chunks:
        hit = by_id.get(c.get("id"))
        if hit is None: fail(f"chunk {c.get('id')} missing"); continue
        if hit.get("order") != c.get("order"): fail(f"chunk {c.get('id')} order {c.get('order')!r} -> {hit.get('order')!r}")
        if hit.get("text") != c.get("text"): fail(f"chunk {c.get('id')} text changed")
    if len(inline) != len(chunks): fail(f"{len(chunks)} chunks in, {len(inline)} out")

# 1. A synthetic gated pack, in a temp copy of the tool's tree.
SYNTH = {
    "id": "test-gated", "name": "Test gated pack", "prompt": "Host.", "surfaces": {"chat": True, "miniapp": True},
    "knowledge": {"path": "personas/test-gated/chunks.json", "retrieval": "keywords",
                  "gate": {"pattern": "chapter\\s*(\\d+)", "note": "Read to chapter {n}."},
                  "preamble": "Notes (chapter {n} and earlier):"},
}
SYNTH_CHUNKS = [{"id": "about", "keywords": ["book"], "text": "About the book."}] + \
    [{"id": f"ch{n}", "order": n, "keywords": ["chapter"], "text": f"Chapter {n} note."} for n in range(1, 4)]
with tempfile.TemporaryDirectory() as tmp:
    tool_dir = os.path.join(tmp, "src", "miniapps", "on-device-chat", "tools")
    os.makedirs(tool_dir)
    shutil.copy(os.path.join(here, "build.py"), tool_dir)
    shutil.copy(os.path.join(here, "..", "index.html"), os.path.dirname(tool_dir))
    pack_dir = os.path.join(tmp, "src", "personas", "test-gated")
    os.makedirs(pack_dir)
    json.dump(SYNTH, open(os.path.join(pack_dir, "persona.json"), "w"))
    json.dump(SYNTH_CHUNKS, open(os.path.join(pack_dir, "chunks.json"), "w"))
    check("test-gated", SYNTH, SYNTH_CHUNKS, built_pack(os.path.join(tool_dir, "build.py"), "test-gated", os.path.join(tmp, "out")))

# 2. Every gated miniapp pack in source (book-club-gatsby among them).
real = 0
personas_dir = os.path.join(source_root, "personas")
for pid in sorted(os.listdir(personas_dir)):
    pj, cj = os.path.join(personas_dir, pid, "persona.json"), os.path.join(personas_dir, pid, "chunks.json")
    if not (os.path.exists(pj) and os.path.exists(cj)): continue
    persona = json.load(open(pj, encoding="utf-8"))
    if not ((persona.get("knowledge") or {}).get("gate") and (persona.get("surfaces") or {}).get("miniapp")): continue
    real += 1
    with tempfile.TemporaryDirectory() as out:
        check(pid, persona, json.load(open(cj, encoding="utf-8")), built_pack(os.path.join(here, "build.py"), pid, out))
if real == 0:
    failures.append("no gated miniapp pack found in personas/ (expected book-club-gatsby)")

if failures:
    print("\n".join(failures)); sys.exit(1)
print(f"OK — the gate survives build.py for the synthetic pack and {real} gated pack(s) in source")
