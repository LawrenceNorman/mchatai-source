#!/usr/bin/env bash
# build_app.sh — build the SwiftPM target then wrap it in a .app bundle that
# mChatAI+ can pick up via FSEventStream and surface as a tappable artifact.
#
# Phase WX-A taught the recovery scanner to detect bundles in `dist/`,
# `build/`, `.build/release/`, and `Build/Products/Release/` (in that
# preference order). This script targets `build/<slug>-v<NNNN>.app` because
# wisdom rule `mac-004` declares it the canonical scheme: 4-digit zero-padded
# version + kebab-case slug, so directory listings sort correctly across
# regenerations.
#
# Generator: replace <TargetName> with the PascalCase target name and <slug>
# with the kebab-case slug. (Both are derivable from the user-facing display
# name — keep them in sync.)

set -euo pipefail

TARGET_NAME="<TargetName>"
SLUG="<slug>"
DISPLAY_NAME="<DisplayName>"

echo "==> swift build -c release"
swift build -c release

BIN_PATH=".build/release/${TARGET_NAME}"
if [ ! -f "$BIN_PATH" ]; then
    # arm64-specific path on Apple Silicon; intel falls through to .build/release/
    BIN_PATH=".build/arm64-apple-macosx/release/${TARGET_NAME}"
fi
if [ ! -f "$BIN_PATH" ]; then
    echo "ERROR: built binary not found in .build/release/ or .build/arm64-apple-macosx/release/"
    exit 1
fi

mkdir -p build

# Pick the next zero-padded version number.
LAST=$(ls build 2>/dev/null | grep -oE 'v[0-9]{4}' | sort | tail -1 | sed 's/v//' || true)
NEXT=$(printf 'v%04d' $((${LAST:-0} + 1)))
APP_DIR="build/${SLUG}-${NEXT}.app"

echo "==> assembling ${APP_DIR}"
mkdir -p "${APP_DIR}/Contents/MacOS"
cp "${BIN_PATH}" "${APP_DIR}/Contents/MacOS/${TARGET_NAME}"

cat > "${APP_DIR}/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>${TARGET_NAME}</string>
  <key>CFBundleIdentifier</key><string>com.mchatai.generated.${SLUG}</string>
  <key>CFBundleName</key><string>${DISPLAY_NAME}</string>
  <key>CFBundleDisplayName</key><string>${DISPLAY_NAME}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
EOF

echo "==> built ${APP_DIR}"
echo "==> open '${APP_DIR}' to launch"
