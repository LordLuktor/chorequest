#!/usr/bin/env bash
# ChoreQuest PostgreSQL Backup Script
# Runs pg_dump against the chorequest_db Docker container
# Compresses with gzip, retains last 30 days

set -euo pipefail

BACKUP_DIR="/home/scottstein/workspace/chorequest/backups"
RETENTION_DAYS=30
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/chorequest_${TIMESTAMP}.sql.gz"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

# Find the running chorequest_db container
CONTAINER_ID="$(docker ps -q -f name=chorequest_db 2>/dev/null)"

if [ -z "${CONTAINER_ID}" ]; then
    echo "${LOG_PREFIX} FAIL: chorequest_db container not found or not running"
    exit 1
fi

# Run pg_dump and compress
if docker exec "${CONTAINER_ID}" pg_dump -U chorequest chorequest 2>/dev/null | gzip > "${BACKUP_FILE}"; then
    # Verify the backup is not empty (gzip header is at least 20 bytes)
    FILESIZE="$(stat -c%s "${BACKUP_FILE}" 2>/dev/null || echo 0)"
    if [ "${FILESIZE}" -lt 100 ]; then
        echo "${LOG_PREFIX} FAIL: Backup file is suspiciously small (${FILESIZE} bytes) -- pg_dump may have failed"
        rm -f "${BACKUP_FILE}"
        exit 1
    fi
    echo "${LOG_PREFIX} OK: Backup created ${BACKUP_FILE} ($(numfmt --to=iec "${FILESIZE}"))"
else
    echo "${LOG_PREFIX} FAIL: pg_dump command failed"
    rm -f "${BACKUP_FILE}"
    exit 1
fi

# Prune backups older than retention period
DELETED=0
while IFS= read -r old_file; do
    rm -f "${old_file}"
    DELETED=$((DELETED + 1))
done < <(find "${BACKUP_DIR}" -name "chorequest_*.sql.gz" -type f -mtime +${RETENTION_DAYS} 2>/dev/null)

if [ "${DELETED}" -gt 0 ]; then
    echo "${LOG_PREFIX} INFO: Pruned ${DELETED} backup(s) older than ${RETENTION_DAYS} days"
fi
