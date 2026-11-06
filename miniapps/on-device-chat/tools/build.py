#!/usr/bin/env python3
"""Inline a persona pack into the on-device chat template.

    python3 tools/build.py <pack-id> <out-dir>

Reads personas/<pack-id>/persona.json and writes <out-dir>/index.html (+ icon.png
if the pack has one). The hub's hosted copy is a single HTML file, so the pack
must be inline; the page still refreshes it from mchatai-source when it can.
"""
import json, os, re, shutil, sys

here = os.path.dirname(os.path.abspath(__file__))
source_root = os.path.abspath(os.path.join(here, "..", "..", ".."))
if len(sys.argv) != 3:
    sys.exit(__doc__)
pack_id, out_dir = sys.argv[1], sys.argv[2]
pack_dir = os.path.join(source_root, "personas", pack_id)
pack = json.load(open(os.path.join(pack_dir, "persona.json")))
if not pack.get("surfaces", {}).get("miniapp", False):
    sys.exit(f"{pack_id}: surfaces.miniapp is false")
# chunks.json rides along inline when present, so the bundle works offline on first open.
chunks_file = os.path.join(pack_dir, "chunks.json")
if os.path.exists(chunks_file) and not (pack.get("knowledge") or {}).get("chunks"):
    pack["knowledge"] = {"chunks": json.load(open(chunks_file))}
html = open(os.path.join(here, "..", "index.html")).read()
block = '<script id="persona-pack" type="application/json">\n' + json.dumps(pack, indent=2, ensure_ascii=False).replace("</", "<\\/") + '\n</script>'
html, n = re.subn(r'<script id="persona-pack" type="application/json">.*?</script>', lambda _: block, html, count=1, flags=re.S)
assert n == 1, "persona-pack block not found"
html = html.replace("<title>On-device chat</title>", f"<title>{pack['name']}</title>", 1)
os.makedirs(out_dir, exist_ok=True)
open(os.path.join(out_dir, "index.html"), "w").write(html)
icon = os.path.join(pack_dir, "icon.png")
if os.path.exists(icon):
    shutil.copy(icon, os.path.join(out_dir, "icon.png"))
print(f"wrote {out_dir}/index.html for {pack['name']} ({len(html)} bytes)")
