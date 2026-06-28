#!/usr/bin/env bash
#
# devnet-bootstrap.sh — Deploy contracts to a local Stellar quickstart network,
# write .env files, and seed demo campaigns via the backend REST API.
#
# This script is idempotent: re-running it skips steps that have already been
# completed (contracts already deployed, .env already written, seed data present).
#
# Environment (all optional — defaults target the local quickstart network):
#   STELLAR_RPC_URL   Soroban RPC URL     (default: http://localhost:8001)
#   HORIZON_URL       Horizon URL         (default: http://localhost:8000)
#   STELLAR_SOURCE    Account identity    (default: devnet-root)
#   BACKEND_API_URL   Backend API         (default: http://localhost:3001)
#   DEVNET_ENV_FILE   .env output path    (default: .env.devnet)

set -euo pipefail

STELLAR_RPC_URL="${STELLAR_RPC_URL:-http://localhost:8001}"
HORIZON_URL="${HORIZON_URL:-http://localhost:8000}"
SOURCE="${STELLAR_SOURCE:-devnet-root}"
BACKEND_API_URL="${BACKEND_API_URL:-http://localhost:3001}"
ENV_FILE="${DEVNET_ENV_FILE:-.env.devnet}"
NETWORK="local"

REWARDS_WASM="target/wasm32-unknown-unknown/release/trivela_rewards_contract.wasm"
CAMPAIGN_WASM="target/wasm32-unknown-unknown/release/trivela_campaign_contract.wasm"

log() { echo "[devnet-bootstrap] $*"; }
err() { echo "[devnet-bootstrap] ERROR: $*" >&2; exit 1; }

wait_for_horizon() {
  log "Waiting for Horizon at $HORIZON_URL ..."
  local attempts=0
  until curl -sf "$HORIZON_URL/health" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    [ $attempts -gt 60 ] && err "Horizon did not become healthy in time."
    sleep 2
  done
  log "Horizon is ready."
}

fund_account() {
  log "Funding devnet account via friendbot ..."
  curl -sf "$HORIZON_URL/friendbot?addr=$(stellar keys address "$SOURCE" 2>/dev/null || echo "$SOURCE")" \
    -o /dev/null || true
}

build_contracts() {
  if [ -f "$REWARDS_WASM" ] && [ -f "$CAMPAIGN_WASM" ]; then
    log "WASM artefacts already present — skipping build."
    return
  fi
  log "Building contracts ..."
  cargo build --target wasm32-unknown-unknown --release \
    -p trivela-rewards-contract \
    -p trivela-campaign-contract
}

deploy_contracts() {
  if [ -f "$ENV_FILE" ] && grep -q "REWARDS_CONTRACT_ID" "$ENV_FILE"; then
    log ".env.devnet already contains contract IDs — skipping deploy."
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    return
  fi

  log "Deploying rewards contract ..."
  REWARDS_CONTRACT_ID="$(stellar contract deploy \
    --wasm "$REWARDS_WASM" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    --rpc-url "$STELLAR_RPC_URL" \
    --network-passphrase "Standalone Network ; February 2017" \
    2>&1 | tail -1)"

  log "Deploying campaign contract ..."
  CAMPAIGN_CONTRACT_ID="$(stellar contract deploy \
    --wasm "$CAMPAIGN_WASM" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    --rpc-url "$STELLAR_RPC_URL" \
    --network-passphrase "Standalone Network ; February 2017" \
    2>&1 | tail -1)"

  cat > "$ENV_FILE" <<EOF
STELLAR_NETWORK=$NETWORK
SOROBAN_RPC_URL=$STELLAR_RPC_URL
HORIZON_URL=$HORIZON_URL
REWARDS_CONTRACT_ID=$REWARDS_CONTRACT_ID
CAMPAIGN_CONTRACT_ID=$CAMPAIGN_CONTRACT_ID
VITE_STELLAR_NETWORK=$NETWORK
VITE_REWARDS_CONTRACT_ID=$REWARDS_CONTRACT_ID
VITE_CAMPAIGN_CONTRACT_ID=$CAMPAIGN_CONTRACT_ID
EOF

  log "Contract IDs written to $ENV_FILE"
  log "  rewards : $REWARDS_CONTRACT_ID"
  log "  campaign: $CAMPAIGN_CONTRACT_ID"
}

wait_for_backend() {
  log "Waiting for backend at $BACKEND_API_URL ..."
  local attempts=0
  until curl -sf "$BACKEND_API_URL/health" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    [ $attempts -gt 30 ] && log "Backend not yet ready — skipping seed." && return 1
    sleep 2
  done
  return 0
}

seed_demo_data() {
  log "Seeding demo campaigns ..."

  # Idempotent — skip if demo data already exists
  existing=$(curl -sf "$BACKEND_API_URL/api/v1/campaigns?search=DevNet+Demo" | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('pagination',{}).get('total',0))" 2>/dev/null || echo 0)
  if [ "$existing" -gt "0" ]; then
    log "Demo data already present — skipping seed."
    return
  fi

  for i in 1 2 3; do
    curl -sf -X POST "$BACKEND_API_URL/api/v1/campaigns" \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"DevNet Demo $i\",\"rewardPerAction\":$((i * 5)),\"description\":\"Seeded demo campaign #$i\",\"active\":true}" \
      -o /dev/null || true
    log "  Seeded demo campaign $i"
  done
  log "Demo data seeded."
}

# ── Main ────────────────────────────────────────────────────────────────────
wait_for_horizon
fund_account
build_contracts
deploy_contracts

if wait_for_backend; then
  seed_demo_data
fi

log "Devnet bootstrap complete."
log "  Horizon  : $HORIZON_URL"
log "  RPC      : $STELLAR_RPC_URL"
log "  Backend  : $BACKEND_API_URL"
log "  Frontend : http://localhost:5173"
