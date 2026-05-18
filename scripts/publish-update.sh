#!/bin/bash
# Publish an EAS Update (OTA) to the production channel.
# Usage: ./scripts/publish-update.sh "Your update message"
#
# Phones running the May-2 (or later) APK will fetch the new JS bundle on next
# launch via Updates.checkForUpdateAsync() in app/_layout.tsx.
#
# Pre-reqs: eas-cli installed, logged in (`eas whoami`).
set -euo pipefail

MESSAGE="${1:-}"
if [ -z "$MESSAGE" ]; then
  echo "Usage: $0 \"update message\""
  exit 1
fi

cd "$(dirname "$0")/../app"
echo "Publishing OTA update to channel: production"
eas update --channel production --message "$MESSAGE" --non-interactive
