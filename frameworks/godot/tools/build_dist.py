#!/usr/bin/env python3
"""Rebuild dist/ (the shared engine every Godot mini-app loads from ./libs/) from Godot's official
single-threaded web template.

  python3 tools/build_dist.py [--engine 4.7.2] [--templates <dir with web_nothreads_release.zip>]

Writes dist/godot-<v>.js (Godot's engine JavaScript, unchanged), dist/godot-<v>-files.js (the wasm,
gzip+base64, and the two audio worklets) and dist/VERSION.json (sizes and sha256s). The same two
files are what tools/pack_web.py writes into a game's libs/, byte for byte. Standard library only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pack_web import engine_files_js  # noqa: E402

HERE = Path(__file__).resolve().parent.parent


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", default=json.loads((HERE / "manifest.json").read_text())["engine"]["version"])
    ap.add_argument("--templates", default=str(Path.home() / "Library/Application Support/Godot/export_templates"))
    a = ap.parse_args()
    v = a.engine
    z = Path(a.templates) / f"{v}.stable" / "web_nothreads_release.zip"
    if not z.exists():
        sys.exit(f"no template at {z}: install Godot {v}'s export templates")
    with zipfile.ZipFile(z) as zf:
        js, wasm = zf.read("godot.js"), zf.read("godot.wasm")
        worklet, position = zf.read("godot.audio.worklet.js").decode(), zf.read("godot.audio.position.worklet.js").decode()
    out = HERE / "dist"
    out.mkdir(exist_ok=True)
    (out / f"godot-{v}.js").write_bytes(js)
    (out / f"godot-{v}-files.js").write_text(engine_files_js(v, wasm, worklet, position))
    meta = {"engine": v, "template": z.name,
            "template_sha256": {"godot.js": hashlib.sha256(js).hexdigest(), "godot.wasm": hashlib.sha256(wasm).hexdigest()},
            "files": {p.name: {"bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
                      for p in sorted(out.glob(f"godot-{v}*.js"))}}
    (out / "VERSION.json").write_text(json.dumps(meta, indent=1) + "\n")
    print(json.dumps(meta, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
