#!/usr/bin/env python3
"""Build every flavor of a Godot project: the mini-app page and the native downloads.

  python3 build_all.py <project-dir> <out-dir> [web,macos,windows] [--blurb "the premise in a sentence"]

  <out-dir>/index.html, <out-dir>/libs/   the mini-app (tools/pack_web.py): always built
  <out-dir>/builds/mac/<Name>-mac.zip      the Mac app (the project's "macOS" preset), if asked and present
  <out-dir>/builds/windows/<Name>-windows.zip   the Windows game (the "Windows" preset), if asked and present
  <out-dir>/builds/build.json              what was built: sizes, sha256s, and flavors skipped and why

Flavors come from ../manifest.json; each one needs its preset in the project's export_presets.cfg
(the template has all three). Signing and notarizing are not done here: a signing identity never
lives in content, and notarizing uploads to Apple, which is the owner's call. Standard library only.

The page opens on a start screen (the game's name, the premise, a loading bar, then Play): the premise is
--blurb, else the project's application/config/description, else none.
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
MANIFEST = json.loads((HERE.parent / "manifest.json").read_text())


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        sys.stderr.write(p.stdout[-2000:] + p.stderr[-2000:])
        sys.exit(f"failed ({p.returncode}): {' '.join(cmd[:6])}")
    return p


def presets(project: Path) -> dict[str, str]:
    """{preset name: platform} from export_presets.cfg."""
    cfg = (project / "export_presets.cfg").read_text() if (project / "export_presets.cfg").exists() else ""
    return dict(re.findall(r'^name="([^"]+)"\s*\nplatform="([^"]+)"', cfg, flags=re.M))


def game_name(project: Path) -> str:
    m = re.search(r'^config/name="([^"]*)"', (project / "project.godot").read_text(), flags=re.M)
    return (m.group(1) if m else project.name) or project.name


def game_blurb(project: Path) -> str:
    m = re.search(r'^config/description="((?:[^"\\]|\\.)*)"', (project / "project.godot").read_text(), flags=re.M)
    return m.group(1).replace('\\"', '"').replace("\\n", " ") if m else ""


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> int:
    argv = sys.argv[1:]
    blurb = None
    if "--blurb" in argv:
        i = argv.index("--blurb")
        if i + 1 >= len(argv):
            sys.exit("--blurb needs the premise after it")
        blurb = argv[i + 1]
        del argv[i:i + 2]
    if len(argv) < 2:
        sys.exit(__doc__)
    project, out = Path(argv[0]).resolve(), Path(argv[1]).resolve()
    asked = argv[2].split(",") if len(argv) > 2 and argv[2] else [f["id"] for f in MANIFEST["flavors"]]
    if not (project / "project.godot").exists():
        sys.exit(f"no project.godot in {project}")
    tool = MANIFEST["tool"]
    ver = run(tool["versionCommand"].split()).stdout.strip()
    if not ver.startswith(tool["expectPrefix"]):
        sys.exit(f"Godot {ver or '(not found)'} found; this profile needs {tool['expectPrefix']}. {tool['installHint']}")

    have = presets(project)
    name = game_name(project)
    slug = re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-") or "game"
    godot = tool["command"]
    report: dict = {"engine": MANIFEST["engine"]["version"], "name": name, "built": {}, "skipped": {}}
    (out / "builds").mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="godot-build-") as tmp:
        tmp = Path(tmp)
        for f in MANIFEST["flavors"]:
            if f["id"] not in asked and not f.get("always"):
                continue
            if f["preset"] not in have:
                report["skipped"][f["id"]] = f'no "{f["preset"]}" preset in export_presets.cfg'
                if f.get("always"):
                    sys.exit(f'the project needs a "{f["preset"]}" export preset (see frameworks/godot/template/export_presets.cfg)')
                continue
            if f["id"] == "web":
                (tmp / "web").mkdir()
                run([godot, "--headless", "--path", str(project), "--export-release", f["preset"], str(tmp / "web" / "index.html")])
                run([sys.executable, str(HERE / "pack_web.py"), str(tmp / "web"), str(out), "--engine",
                     MANIFEST["engine"]["version"], "--title", name,
                     "--blurb", blurb if blurb is not None else game_blurb(project)])
                page = out / "index.html"
                report["built"]["web"] = {"file": "index.html", "bytes": page.stat().st_size}
            elif f["id"] == "macos":
                dest = out / "builds" / "mac"
                dest.mkdir(parents=True, exist_ok=True)
                z = dest / f"{slug}-mac.zip"
                run([godot, "--headless", "--path", str(project), "--export-release", f["preset"], str(z)])
                report["built"]["macos"] = {"file": str(z.relative_to(out)), "bytes": z.stat().st_size, "sha256": sha(z),
                                            "note": "unsigned unless the preset signs; notarizing is the owner's call"}
            elif f["id"] == "windows":
                (tmp / "win").mkdir()
                exe = tmp / "win" / f"{slug}.exe"
                run([godot, "--headless", "--path", str(project), "--export-release", f["preset"], str(exe)])
                dest = out / "builds" / "windows"
                dest.mkdir(parents=True, exist_ok=True)
                z = dest / f"{slug}-windows.zip"
                with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
                    for p in sorted((tmp / "win").iterdir()):
                        zf.write(p, p.name)
                report["built"]["windows"] = {"file": str(z.relative_to(out)), "bytes": z.stat().st_size, "sha256": sha(z),
                                              "note": "unsigned: Windows SmartScreen warns until it is code-signed"}
    (out / "builds" / "build.json").write_text(json.dumps(report, indent=1) + "\n")
    print(json.dumps(report, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
