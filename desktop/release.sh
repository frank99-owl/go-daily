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

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

# The release tag must name the commit the dmg is built from. desktop-v1.3.0
# was created without --target, so GitHub tagged whatever main pointed to
# there — eea5d3a, from before the desktop shell existed — while the dmg came
# from local commits that were pushed afterwards. Every check below runs
# before the build, so a refused release costs nothing.
[ -z "$(git status --porcelain)" ] || fail "the working tree has changes; commit them so the dmg matches a commit"

git fetch --quiet origin main
COMMIT=$(git rev-parse HEAD)
git merge-base --is-ancestor "$COMMIT" origin/main ||
  fail "HEAD ${COMMIT:0:7} is not on origin/main; push it first so the tag points at a commit GitHub has"

PERMISSION=$(gh repo view --json viewerPermission --jq .viewerPermission)
case "$PERMISSION" in
  ADMIN | MAINTAIN | WRITE) ;;
  *) fail "gh is signed in as $(gh api user --jq .login), which has $PERMISSION access; switch to the repo owner (e.g. GH_TOKEN=\"\$(gh auth token --user <owner>)\")" ;;
esac

if gh release view "$TAG" > /dev/null 2>&1; then
  TAGGED=$(git ls-remote origin "refs/tags/${TAG}^{}" | cut -f1)
  [ -n "$TAGGED" ] || TAGGED=$(git ls-remote origin "refs/tags/${TAG}" | cut -f1)
  [ "$TAGGED" = "$COMMIT" ] ||
    fail "$TAG already points at ${TAGGED:0:7}, not HEAD ${COMMIT:0:7}; bump the version in tauri.conf.json instead of replacing its asset"
fi

echo "==> Building Go Daily desktop v${VERSION} from ${COMMIT:0:7}"
# --locked: build exactly the committed Cargo.lock, never a re-resolved one.
cargo tauri build -- --locked

[ -f "$DMG" ] || fail "dmg not found at $DMG"
cp "$DMG" "$STAGED"

if gh release view "$TAG" > /dev/null 2>&1; then
  echo "==> Release $TAG exists at this commit — replacing asset"
  gh release upload "$TAG" "$STAGED" --clobber
else
  echo "==> Creating release $TAG at ${COMMIT:0:7}"
  gh release create "$TAG" "$STAGED" \
    --target "$COMMIT" \
    --title "Go Daily Desktop v${VERSION}" \
    --notes "macOS desktop app (Apple Silicon, unsigned — right-click → Open on first launch). Wraps the production site at go-daily.app. Built from ${COMMIT}."
fi

echo "==> Done. Download URL:"
echo "    https://github.com/frank99-owl/go-daily/releases/latest/download/${ASSET}"
