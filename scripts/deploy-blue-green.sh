#!/usr/bin/env bash
set -euo pipefail

# deploy-blue-green.sh
# Blue/green deployment script for the Trivela backend.
#
# Usage:
#   ./scripts/deploy-blue-green.sh [--image <image:tag>]
#
# Assumes:
#   - Docker Compose is available.
#   - nginx is running and its config is generated from nginx/trivela.conf.template.
#   - The current production environment is "blue" (port 3001).
#   - The new environment will be "green" (port 3002).
#   - The TRIVELA_BACKEND_HOST and TRIVELA_BACKEND_PORT env vars control the
#     upstream that envsubst writes into the nginx config.

BLUE_HOST="blue"
BLUE_PORT="3001"
GREEN_HOST="green"
GREEN_PORT="3002"
HEALTH_TIMEOUT=60
VERIFY_WAIT=30
NGINX_CONF_TEMPLATE="nginx/trivela.conf.template"
NGINX_CONF_DEST="/etc/nginx/conf.d/trivela.conf"
IMAGE_TAG="${DEPLOY_IMAGE_TAG:-trivela-backend:latest}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
err() { log "ERROR: $*" >&2; }

# Write nginx upstream config and reload
switch_upstream() {
  local host="$1"
  local port="$2"
  log "Switching nginx upstream to ${host}:${port}"
  TRIVELA_BACKEND_HOST="$host" TRIVELA_BACKEND_PORT="$port" \
    envsubst '${TRIVELA_BACKEND_HOST} ${TRIVELA_BACKEND_PORT}' \
    < "$NGINX_CONF_TEMPLATE" \
    > "$NGINX_CONF_DEST"
  nginx -s reload || docker compose exec nginx nginx -s reload
  log "nginx reloaded — upstream is now ${host}:${port}"
}

rollback() {
  err "Deployment failed — rolling back to blue"
  switch_upstream "$BLUE_HOST" "$BLUE_PORT"
  log "Stopping green container"
  docker compose --profile green stop backend-green 2>/dev/null || true
  docker compose --profile green rm -f backend-green 2>/dev/null || true
  err "Rollback complete. Blue is serving traffic."
  exit 1
}

trap rollback ERR

# 1. Start the green container on a different port
log "Starting green container (${IMAGE_TAG}) on port ${GREEN_PORT}"
DEPLOY_IMAGE_TAG="$IMAGE_TAG" docker compose --profile green up -d backend-green

# 2. Poll /health on green until healthy or timeout
log "Polling green /health (timeout ${HEALTH_TIMEOUT}s)"
elapsed=0
until curl -sf "http://localhost:${GREEN_PORT}/health" > /dev/null 2>&1; do
  if [ "$elapsed" -ge "$HEALTH_TIMEOUT" ]; then
    err "Green container did not become healthy within ${HEALTH_TIMEOUT}s"
    rollback
  fi
  sleep 2
  elapsed=$((elapsed + 2))
  log "  waiting... ${elapsed}s elapsed"
done
log "Green is healthy"

# 3. Switch nginx upstream to green
switch_upstream "$GREEN_HOST" "$GREEN_PORT"

# 4. Verify green for VERIFY_WAIT seconds — check for error log lines
log "Verifying green for ${VERIFY_WAIT}s"
sleep "$VERIFY_WAIT"

error_count=$(docker compose --profile green logs backend-green --since "${VERIFY_WAIT}s" 2>&1 \
  | grep -ciE '"level":"error"|"level":50|ERROR|FATAL' || true)

if [ "$error_count" -gt 0 ]; then
  err "Found ${error_count} error(s) in green logs during verification window"
  rollback
fi
log "Verification passed (0 errors in last ${VERIFY_WAIT}s)"

# 5. Stop blue
log "Stopping blue container"
docker compose stop backend 2>/dev/null || true
log "Blue stopped"

log "Deployment complete. Green is now serving production traffic on port ${GREEN_PORT}."
log "To promote green to blue for the next cycle, retag the image as blue and update compose.yaml."
