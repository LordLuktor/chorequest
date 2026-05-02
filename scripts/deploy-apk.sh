#!/bin/bash
# Check for completed EAS build, download APK, and deploy
cd /home/scottstein/workspace/chorequest

# Get the latest Android build
BUILD_INFO=$(eas build:list --platform android --status finished --limit 1 --non-interactive --json 2>/dev/null)
if [ $? -ne 0 ]; then
  echo "$(date): Failed to fetch build list"
  exit 1
fi

APK_URL=$(echo "$BUILD_INFO" | python3 -c "import sys,json; builds=json.loads(sys.stdin.read()); print(builds[0]['artifacts']['buildUrl'])" 2>/dev/null)
BUILD_ID=$(echo "$BUILD_INFO" | python3 -c "import sys,json; builds=json.loads(sys.stdin.read()); print(builds[0]['id'])" 2>/dev/null)

if [ -z "$APK_URL" ]; then
  echo "$(date): No APK URL found"
  exit 1
fi

# Check if we already deployed this build
LAST_DEPLOYED="/home/scottstein/workspace/chorequest/downloads/.last-build-id"
if [ -f "$LAST_DEPLOYED" ] && [ "$(cat $LAST_DEPLOYED)" = "$BUILD_ID" ]; then
  echo "$(date): Build $BUILD_ID already deployed, skipping"
  exit 0
fi

echo "$(date): Downloading APK from $APK_URL"
curl -L -o /home/scottstein/workspace/chorequest/downloads/chorequest.apk "$APK_URL"

if [ $? -eq 0 ] && [ -f /home/scottstein/workspace/chorequest/downloads/chorequest.apk ]; then
  echo "$BUILD_ID" > "$LAST_DEPLOYED"
  echo "$(date): APK downloaded. Rebuilding frontend..."

  docker build -t chorequest-frontend:latest -f /home/scottstein/workspace/chorequest/docker/frontend/Dockerfile /home/scottstein/workspace/chorequest
  docker service update --force chorequest_frontend

  echo "$(date): Frontend deployed with new APK"
else
  echo "$(date): APK download failed"
  exit 1
fi
