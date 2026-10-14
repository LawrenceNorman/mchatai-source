#!/usr/bin/env python3
"""
Assemble dist/ for the retro-fps track: the two files a game page loads.

  dist/rfps.js         the Woof! engine glue + runtime/rfps-runtime.js
  dist/rfps-data.js    window.RetroFPSData: engine wasm, woof.pk3 and the
                       Freedoom base art (each gzip + base64), plus the
                       texture/flat/music names the runtime checks levels with
  dist/rfps-names.json those names alone, for tools/rfps-check.js
  dist/VERSION.json    versions, sizes and sha256 of everything above

Usage:
  build_dist.py                              re-embed the runtime; reuse the
                                             engine and base art already in dist/
  build_dist.py --engine-dir <dir>           take woof.js, woof.wasm, woof.pk3
                                             from a fresh engine build
  build_dist.py --freedoom <freedoom2.wad>   rebuild the base art from Freedoom
"""
import argparse
import base64
import gzip
import hashlib
import json
import pathlib
import re
import struct
import sys

HERE = pathlib.Path(__file__).resolve().parent
TRACK = HERE.parent
DIST = TRACK / "dist"
RUNTIME = TRACK / "runtime" / "rfps-runtime.js"
GLUE_BEGIN = "/* ==== Woof! engine glue (Emscripten output): begin ==== */"
GLUE_END = "/* ==== Woof! engine glue: end ==== */"
MAP_RE = re.compile(r"(E\dM\d|MAP\d\d)$")
MAP_LUMPS = {"THINGS", "LINEDEFS", "SIDEDEFS", "VERTEXES", "SEGS", "SSECTORS", "NODES", "SECTORS",
             "REJECT", "BLOCKMAP", "BEHAVIOR", "TEXTMAP", "ZNODES", "DIALOGUE", "ENDMAP"}
PLACEHOLDER_MAP = ["MAP01", "THINGS", "LINEDEFS", "SIDEDEFS", "VERTEXES", "SEGS", "SSECTORS",
                   "NODES", "SECTORS", "REJECT", "BLOCKMAP"]


def read_wad(data):
    magic, n, ofs = struct.unpack_from("<4sii", data, 0)
    lumps = []
    for i in range(n):
        pos, size, name = struct.unpack_from("<ii8s", data, ofs + 16 * i)
        lumps.append((name.rstrip(b"\0").decode("ascii", "replace").upper(), pos, size))
    return magic, lumps


def write_wad(magic, lumps):
    body, directory, offset = b"", b"", 12
    for name, payload in lumps:
        directory += struct.pack("<ii8s", offset, len(payload), name.encode("ascii")[:8].ljust(8, b"\0"))
        body += payload
        offset += len(payload)
    return magic + struct.pack("<ii", len(lumps), 12 + len(body)) + body + directory


def trim_base(freedoom):
    """Drop every map (games bring their own) and the title demos that replay them.
    Keep an empty MAP01 so the engine still identifies a Doom II-style game."""
    magic, lumps = read_wad(freedoom)
    kept, in_map = [], False
    for name, pos, size in lumps:
        if MAP_RE.fullmatch(name):
            in_map = True
            continue
        if in_map and name in MAP_LUMPS:
            continue
        in_map = False
        if re.fullmatch(r"DEMO\d", name):
            continue
        kept.append((name, freedoom[pos:pos + size]))
    return write_wad(magic, [(n, b"") for n in PLACEHOLDER_MAP] + kept)


def names_in(base):
    _, lumps = read_wad(base)
    textures, flats, music, in_flats = set(), set(), set(), False
    for name, pos, size in lumps:
        if name in ("F_START", "FF_START"):
            in_flats = True
        elif name in ("F_END", "FF_END"):
            in_flats = False
        elif in_flats and size:
            flats.add(name)
        if name.startswith("D_") and size:
            music.add(name)
        if name in ("TEXTURE1", "TEXTURE2"):
            (count,) = struct.unpack_from("<i", base, pos)
            for i in range(count):
                (o,) = struct.unpack_from("<i", base, pos + 4 + 4 * i)
                textures.add(base[pos + o:pos + o + 8].rstrip(b"\0").decode("ascii", "replace").upper())
    return {"textures": sorted(textures), "flats": sorted(flats), "music": sorted(music)}


def packed(raw):
    return base64.b64encode(gzip.compress(raw, compresslevel=9, mtime=0)).decode("ascii")


def unpacked(b64):
    return gzip.decompress(base64.b64decode(b64))


def current_data():
    """The engine and base art already in dist/rfps-data.js, so a runtime-only
    rebuild does not need an engine build or the Freedoom release."""
    text = (DIST / "rfps-data.js").read_text()
    blob = json.loads(text[text.index("{"):text.rindex("}") + 1])
    glue = (DIST / "rfps.js").read_text()
    glue = glue[glue.index(GLUE_BEGIN) + len(GLUE_BEGIN):glue.index(GLUE_END)].strip("\n")
    return glue, unpacked(blob["wasm"]), unpacked(blob["pk3"]), unpacked(blob["base"]), blob.get("sources", {})


def sha(b):
    return hashlib.sha256(b).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine-dir", help="directory with woof.js, woof.wasm, woof.pk3")
    ap.add_argument("--freedoom", help="freedoom2.wad to rebuild the base art from")
    ap.add_argument("--woof-commit", help="Woof! commit the engine was built from")
    ap.add_argument("--emscripten", help="Emscripten version the engine was built with")
    a = ap.parse_args()

    have_dist = (DIST / "rfps-data.js").exists() and (DIST / "rfps.js").exists()
    if not (a.engine_dir and a.freedoom) and not have_dist:
        sys.exit("dist/ is empty: pass --engine-dir and --freedoom for the first build")
    glue = wasm = pk3 = base = None
    sources = {}
    if have_dist:
        glue, wasm, pk3, base, sources = current_data()
    if a.engine_dir:
        d = pathlib.Path(a.engine_dir)
        glue = (d / "woof.js").read_text()
        wasm = (d / "woof.wasm").read_bytes()
        pk3 = (d / "woof.pk3").read_bytes()
        sources["engine"] = {"woofCommit": a.woof_commit or "unrecorded",
                             "emscripten": a.emscripten or "unrecorded"}
    if a.freedoom:
        freedoom = pathlib.Path(a.freedoom).read_bytes()
        base = trim_base(freedoom)
        sources["base"] = {"from": pathlib.Path(a.freedoom).name, "sha256": sha(freedoom)}
    if "</script" in glue.lower():
        sys.exit("engine glue contains </script and cannot be inlined into a page at publish time")

    runtime = RUNTIME.read_text()
    version = re.search(r'var VERSION = "([^"]+)"', runtime).group(1)
    names = names_in(base)
    header = ("/* Retro FPS {v} for mChatAI mini-apps. Engine: Woof! (GPL-2.0-or-later), compiled to\n"
              "   WebAssembly. Art and sound: Freedoom (BSD-3-Clause). Corresponding source and build:\n"
              "   https://github.com/LawrenceNorman/mchatai-source/tree/main/frameworks/retro-fps */\n").format(v=version)

    DIST.mkdir(exist_ok=True)
    rfps_js = header + GLUE_BEGIN + "\n" + glue.strip("\n") + "\n" + GLUE_END + "\n" + runtime
    blob = {"version": version, "sources": sources, "names": names,
            "wasm": packed(wasm), "pk3": packed(pk3), "base": packed(base)}
    data_js = header + "window.RetroFPSData = " + json.dumps(blob, separators=(",", ":")) + ";\n"
    (DIST / "rfps.js").write_text(rfps_js)
    (DIST / "rfps-data.js").write_text(data_js)
    (DIST / "rfps-names.json").write_text(json.dumps(names, indent=0) + "\n")
    info = {
        "runtime": version, "sources": sources,
        "files": {
            "rfps.js": {"bytes": len(rfps_js.encode()), "sha256": sha(rfps_js.encode())},
            "rfps-data.js": {"bytes": len(data_js.encode()), "sha256": sha(data_js.encode())},
        },
        "payloads": {
            "woof.wasm": {"bytes": len(wasm), "sha256": sha(wasm)},
            "woof.pk3": {"bytes": len(pk3), "sha256": sha(pk3)},
            "base.wad": {"bytes": len(base), "sha256": sha(base)},
        },
        "names": {k: len(v) for k, v in names.items()},
    }
    (DIST / "VERSION.json").write_text(json.dumps(info, indent=2) + "\n")
    for f in ("rfps.js", "rfps-data.js"):
        print(f"dist/{f}: {info['files'][f]['bytes'] / 1e6:.2f} MB")
    print(f"names: {info['names']}")


if __name__ == "__main__":
    main()
