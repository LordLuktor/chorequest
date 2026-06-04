#!/bin/bash
# Check for the latest completed EAS Android build, download its APK under a
# VERSION-STAMPED filename, point version.json + the landing page at it, prune
# old APKs, then rebuild and redeploy the frontend.
#
# Why the version in the filename:
#   Phones treat each URL as a distinct download, so a leftover/partial
#   `chorequest.apk` in the Downloads folder can no longer collide with a new
#   release and cause Android's "There was a problem parsing the package" error.
#   The in-app UpdateBanner reads version.json -> apkUrl, so a versioned apkUrl
#   means every update is a fresh file.
#
# Usage: ./scripts/deploy-apk.sh ["release notes shown in the update banner"]
set -uo pipefail

ROOT=/home/scottstein/workspace/chorequest
cd "$ROOT" || exit 1

RELEASE_NOTES="${1:-}"
KEEP_APKS=2  # how many recent versioned APKs to retain (current + 1 for rollback)

# Version is the single source of truth in app/app.json.
VERSION=$(python3 -c "import json;print(json.load(open('app/app.json'))['expo']['version'])" 2>/dev/null)
if [ -z "$VERSION" ]; then
  echo "$(date): Could not read version from app/app.json"
  exit 1
fi
# Constrain the version to a safe semver so it can never inject metacharacters
# into the filename, the sed replacement, or version.json.
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z]+)*$ ]]; then
  echo "$(date): Refusing to deploy — version '$VERSION' is not a safe semver"
  exit 1
fi
APK_NAME="chorequest-${VERSION}.apk"
APK_PATH="$ROOT/downloads/$APK_NAME"

# Get the latest finished Android build (eas needs the project dir for build:list).
BUILD_INFO=$(cd app && eas build:list --platform android --status finished --limit 1 --non-interactive --json 2>/dev/null)
if [ $? -ne 0 ]; then
  echo "$(date): Failed to fetch build list"
  exit 1
fi

APK_URL=$(echo "$BUILD_INFO" | python3 -c "import sys,json; b=json.load(sys.stdin); print(b[0]['artifacts']['buildUrl'])" 2>/dev/null)
BUILD_ID=$(echo "$BUILD_INFO" | python3 -c "import sys,json; b=json.load(sys.stdin); print(b[0]['id'])" 2>/dev/null)

if [ -z "$APK_URL" ]; then
  echo "$(date): No APK URL found"
  exit 1
fi

# Skip if this exact build is already deployed.
LAST_DEPLOYED="$ROOT/downloads/.last-build-id"
if [ -f "$LAST_DEPLOYED" ] && [ "$(cat "$LAST_DEPLOYED")" = "$BUILD_ID" ]; then
  echo "$(date): Build $BUILD_ID already deployed, skipping"
  exit 0
fi

echo "$(date): Downloading v$VERSION APK from $APK_URL -> $APK_NAME"
curl -fL -o "$APK_PATH" "$APK_URL"
if [ $? -ne 0 ] || [ ! -s "$APK_PATH" ]; then
  echo "$(date): APK download failed"
  rm -f "$APK_PATH"
  exit 1
fi

# Sanity-check: the downloaded file must be a valid zip/APK, not an HTML error
# page. (A truncated/HTML download is precisely what triggers parsing errors.)
if ! unzip -l "$APK_PATH" >/dev/null 2>&1; then
  echo "$(date): Downloaded file is not a valid APK — aborting"
  rm -f "$APK_PATH"
  exit 1
fi

echo "$BUILD_ID" > "$LAST_DEPLOYED"

# Point version.json at the versioned file. Preserve previous release notes
# unless new ones are supplied on the command line.
python3 - "$VERSION" "$APK_NAME" "$RELEASE_NOTES" <<'PY'
import json, sys, os
version, apk_name, notes = sys.argv[1], sys.argv[2], sys.argv[3]
path = os.path.join("landing", "version.json")
data = {}
if os.path.exists(path):
    try:
        data = json.load(open(path))
    except Exception:
        data = {}
data["version"] = version
data["runtimeVersion"] = version
data["apkUrl"] = f"/downloads/{apk_name}"
if notes:
    data["releaseNotes"] = notes
elif "releaseNotes" not in data:
    data["releaseNotes"] = f"ChoreQuest v{version}"
json.dump(data, open(path, "w"), indent=2)
open(path, "a").write("\n")
print(f"version.json -> /downloads/{apk_name}")
PY

# Point the landing page's download buttons at the versioned file too, so fresh
# installs always grab the current build (any chorequest*.apk href is rewritten).
sed -i -E "s#/downloads/chorequest(-[0-9.]+)?\.apk#/downloads/${APK_NAME}#g" landing/index.html
echo "$(date): landing/index.html download links -> $APK_NAME"

# Prune old versioned APKs (and the legacy unversioned one) to keep the image
# small, retaining the newest $KEEP_APKS for rollback.
rm -f "$ROOT/downloads/chorequest.apk"
ls -1t "$ROOT"/downloads/chorequest-*.apk 2>/dev/null | tail -n +$((KEEP_APKS + 1)) | while read -r old; do
  echo "$(date): pruning old APK $(basename "$old")"
  rm -f "$old"
done

echo "$(date): APK ready. Rebuilding frontend..."
docker build -t chorequest-frontend:latest -f "$ROOT/docker/frontend/Dockerfile" "$ROOT"
docker service update --force chorequest_frontend
echo "$(date): Frontend deployed with v$VERSION ($APK_NAME)"
