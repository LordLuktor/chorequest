#!/bin/bash
# Resume ChoreQuest deployment work
# 1. Deploy APK if build completed
# 2. Push git changes
# 3. Push OTA update

cd /home/scottstein/workspace/chorequest/app

echo "$(date): Checking for completed APK build..."
/home/scottstein/workspace/chorequest/scripts/deploy-apk.sh

echo "$(date): Pushing OTA update..."
eas update --branch production --environment production --message "All fixes: safe native module loading, in-app map, crash fixes" --non-interactive 2>&1

echo "$(date): Pushing to GitHub..."
cd /home/scottstein/workspace/chorequest
git add -A && git commit -m "Fix native module crashes, in-app Leaflet map, safe imports, deploy script

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>" 2>&1
git push origin main 2>&1

echo "$(date): Done. Remove this cron entry."
# Self-remove from crontab
crontab -l | grep -v "resume-work.sh" | crontab -
