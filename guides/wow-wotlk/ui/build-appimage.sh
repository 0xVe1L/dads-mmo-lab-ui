#!/usr/bin/env bash
#
# build-appimage.sh — Build TheLab and emit a STABLE, version-less
# AppImage filename for distribution.
#
# Why: Steam non-Steam shortcuts (and the in-app OTA updater) reference
# the AppImage by PATH. Tauri names its artifact
# `TheLab_<version>_amd64.AppImage`, so the name changes every release —
# which would orphan the user's Steam shortcut on every update. We keep
# Tauri's versioned artifact (needed later for the OTA release manifest)
# and copy it to a fixed `TheLab.AppImage` that never changes.
#
# Usage:  bash build-appimage.sh
#
set -o pipefail

# On SteamOS the AppImage bundler (linuxdeploy) needs extract-and-run, and
# NO_STRIP keeps the matched WebKit/GL libs intact (stripping them is what
# caused the original EGL crash). Bake them in so every build is the same.
export APPIMAGE_EXTRACT_AND_RUN=1
export NO_STRIP=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# Updater signing — sign the .AppImage.tar.gz so OTA updates verify against
# the pubkey baked into tauri.conf. The private key is gitignored under
# src-tauri/.secrets/. Without it, `createUpdaterArtifacts` fails the build.
KEY_FILE="$SCRIPT_DIR/src-tauri/.secrets/updater.key"
if [ -f "$KEY_FILE" ]; then
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_FILE")"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
  echo "==> Updater signing key loaded from src-tauri/.secrets/updater.key"
else
  echo "!! WARNING: $KEY_FILE not found — the signed-artifact build will fail."
  echo "   Restore the key (or generate a new one) before releasing."
fi

BUNDLE_DIR="src-tauri/target/release/bundle/appimage"
STABLE_NAME="TheLab.AppImage"

echo "==> Building TheLab AppImage…"
bun run tauri build
rc=$?
if [ "$rc" -ne 0 ]; then
  echo "!! Build failed (exit $rc)"
  exit "$rc"
fi

# Newest versioned artifact (the `_<ver>_amd64` pattern won't match our
# stable copy, so re-runs stay clean).
versioned="$(ls -t "$BUNDLE_DIR"/TheLab_*_amd64.AppImage 2>/dev/null | head -1)"
if [ -z "$versioned" ]; then
  echo "!! Could not find a built TheLab_*_amd64.AppImage in $BUNDLE_DIR"
  exit 1
fi

stable="$BUNDLE_DIR/$STABLE_NAME"
cp -f "$versioned" "$stable"
chmod +x "$stable"

echo ""
echo "==> Versioned artifact  : $versioned"
echo "==> Stable distributable: $stable"
echo ""
echo "Point Steam + teammates at the STABLE file ($STABLE_NAME)."
echo "Its name never changes between versions, so the Steam shortcut and"
echo "the OTA updater keep working across releases."
