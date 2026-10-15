#!/usr/bin/env python3
"""vf-build.py — build the versus-fighter bundle into dist/.

    python3 tools/vf-build.py

  dist/vf.js              the runtime (runtime/vf-runtime.js)
  dist/vf-base-<b>.js     one per sprites/<b>/: atlas (with its recolor "palette" and "feel", both
                          from map.json) + sprite sheet (data URI), registered with
                          VersusFighter.registerBase(...)

The sprite sheet travels as a data URI so the canvas stays untainted when a mini-app runs from
file:// (WKWebView), which recoloring needs (getImageData).
"""
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

def main() -> None:
    DIST.mkdir(exist_ok=True)
    (DIST / "vf.js").write_text((ROOT / "runtime" / "vf-runtime.js").read_text())
    for base_dir in sorted((ROOT / "sprites").iterdir()):
        atlas = base_dir / "atlas.json"
        if not atlas.exists():
            continue
        data = json.loads(atlas.read_text())
        png = base64.b64encode((base_dir / "atlas.png").read_bytes()).decode()
        data["image"] = "data:image/png;base64," + png
        out = DIST / f"vf-base-{data['base']}.js"
        out.write_text("VersusFighter.registerBase(" + json.dumps(data, separators=(",", ":")) + ");\n")
        print(f"{out.name}: {out.stat().st_size // 1024} KB")
    print(f"vf.js: {(DIST / 'vf.js').stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
