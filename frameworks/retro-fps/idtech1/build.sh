#!/usr/bin/env bash
# Rebuild the Woof! engine for the browser from the source archive beside this
# script, then regenerate ../dist/. Needs Emscripten 6.0.12 on PATH:
#   git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
#   ~/emsdk/emsdk install 6.0.12 && ~/emsdk/emsdk activate 6.0.12 && source ~/emsdk/emsdk_env.sh
# Usage: build.sh [work-dir]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${1:-$(mktemp -d)}"
COMMIT=d419d3167a3e1bfb345f8d71dbc76ef3f2806189

tar -xJf "$HERE/source/woof-d419d31-web-src.tar.xz" -C "$WORK"
mkdir -p "$WORK/woof/build-web"
cd "$WORK/woof/build-web"
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release \
  -DWITH_SNDFILE=OFF -DWITH_FLUIDSYNTH=OFF -DWITH_XMP=OFF -DWITH_DISCORD_RPC=OFF
emmake make -j"$(sysctl -n hw.ncpu 2>/dev/null || nproc)" woof woof-base
python3 "$HERE/../tools/build_dist.py" --engine-dir "$WORK/woof/build-web/src" \
  --woof-commit "$COMMIT" --emscripten "$(emcc -dumpversion)"
