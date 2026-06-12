#!/usr/bin/env bash
# One-click desktop release: builds the ad-hoc-signed dmg and uploads it to a
# GitHub release so the About page download button serves the latest build.
#
# Requires: rust toolchain, tauri CLI, gh CLI authenticated with repo access.
# Publishing is an external action — run only with Frank's approval.
set -euo pipefail

cd "$(dirname "$0")"

VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
TAG="desktop-v${VERSION}"
DMG="src-tauri/target/release/bundle/dmg/Go Daily_${VERSION}_aarch64.dmg"
ASSET="GoDaily-macOS-AppleSilicon.dmg"
STAGED="$(mktemp -d)/${ASSET}"

echo "==> Building Go Daily desktop v${VERSION}"
cargo tauri build

[ -f "$DMG" ] || { echo "ERROR: dmg not found at $DMG" >&2; exit 1; }
cp "$DMG" "$STAGED"

if gh release view "$TAG" > /dev/null 2>&1; then
  echo "==> Release $TAG exists — replacing asset"
  gh release upload "$TAG" "$STAGED" --clobber
else
  echo "==> Creating release $TAG"
  gh release create "$TAG" "$STAGED" \
    --title "Go Daily Desktop v${VERSION}" \
    --notes "macOS desktop app (Apple Silicon, unsigned — right-click → Open on first launch). Wraps the production site at go-daily.app."
fi

echo "==> Done. Download URL:"
echo "    https://github.com/frank99-owl/go-daily/releases/latest/download/${ASSET}"
