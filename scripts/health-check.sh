#!/usr/bin/env bash
# ChoreQuest Health Check Script
# Checks Docker services, API, PostgreSQL, and Redis
# Sends email alert on failure via msmtp

set -uo pipefail

MSMTP_CONFIG="/home/scottstein/homelab-monitor/config/msmtprc"
ALERT_EMAIL="steinmetz.scott@gmail.com"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"
FAILURES=()

# --- Check 1: Docker services (expect 4 services, all 1/1) ---
check_docker_services() {
    local expected_services=("chorequest_api" "chorequest_frontend" "chorequest_db" "chorequest_redis")
    for svc in "${expected_services[@]}"; do
        local replicas
        replicas="$(docker service ls --filter "name=${svc}" --format '{{.Replicas}}' 2>/dev/null)"
        if [ -z "${replicas}" ]; then
            FAILURES+=("Docker service '${svc}' not found")
        elif [ "${replicas}" != "1/1" ]; then
            FAILURES+=("Docker service '${svc}' unhealthy: ${replicas}")
        fi
    done
}

# --- Check 2: API health endpoint ---
check_api_health() {
    local http_code
    http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://localhost:3001/health 2>/dev/null || echo "000")"
    if [ "${http_code}" != "200" ]; then
        # Try the Traefik route as fallback
        http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://chores.steinmetz.ltd/api/health 2>/dev/null || echo "000")"
        if [ "${http_code}" != "200" ]; then
            FAILURES+=("API health check failed (HTTP ${http_code})")
        fi
    fi
}

# --- Check 3: PostgreSQL accepting connections ---
check_postgres() {
    local container_id
    container_id="$(docker ps -q -f name=chorequest_db 2>/dev/null)"
    if [ -z "${container_id}" ]; then
        FAILURES+=("PostgreSQL container not running")
        return
    fi
    if ! docker exec "${container_id}" pg_isready -U chorequest -q 2>/dev/null; then
        FAILURES+=("PostgreSQL not accepting connections")
    fi
}

# --- Check 4: Redis responding to PING ---
check_redis() {
    local container_id
    container_id="$(docker ps -q -f name=chorequest_redis 2>/dev/null)"
    if [ -z "${container_id}" ]; then
        FAILURES+=("Redis container not running")
        return
    fi
    local pong
    pong="$(docker exec "${container_id}" redis-cli PING 2>/dev/null)"
    if [ "${pong}" != "PONG" ]; then
        FAILURES+=("Redis not responding to PING (got: '${pong}')")
    fi
}

# Run all checks
check_docker_services
check_api_health
check_postgres
check_redis

# Report results
if [ ${#FAILURES[@]} -eq 0 ]; then
    echo "${LOG_PREFIX} OK: All health checks passed"
    exit 0
fi

# Build failure report
FAIL_REPORT=""
for f in "${FAILURES[@]}"; do
    FAIL_REPORT="${FAIL_REPORT}  - ${f}\n"
    echo "${LOG_PREFIX} FAIL: ${f}"
done

# Send email alert
if [ -f "${MSMTP_CONFIG}" ]; then
    printf "Subject: ChoreQuest Health Alert - %s failure(s)\nFrom: scott@steinmetz.ltd\nTo: %s\n\nChoreQuest health check detected %s failure(s) at %s:\n\n%b\nServer: %s\n" \
        "${#FAILURES[@]}" \
        "${ALERT_EMAIL}" \
        "${#FAILURES[@]}" \
        "$(date '+%Y-%m-%d %H:%M:%S')" \
        "${FAIL_REPORT}" \
        "$(hostname)" \
    | msmtp -C "${MSMTP_CONFIG}" "${ALERT_EMAIL}" 2>/dev/null

    if [ $? -eq 0 ]; then
        echo "${LOG_PREFIX} INFO: Alert email sent to ${ALERT_EMAIL}"
    else
        echo "${LOG_PREFIX} WARN: Failed to send alert email"
    fi
else
    echo "${LOG_PREFIX} WARN: msmtp config not found at ${MSMTP_CONFIG}, skipping email alert"
fi

exit 1
