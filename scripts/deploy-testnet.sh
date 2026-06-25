#!/bin/bash
#
# Build and deploy the Trivela rewards and campaign contracts to a Stellar
# network (testnet by default), printing the resulting contract IDs and
# writing them to a frontend env file (and optionally a backend env file).
#
# Required env:
#   STELLAR_SOURCE      Stellar account/identity to fund and sign the deploy.
#
# Optional env:
#   STELLAR_NETWORK     Defaults to "testnet". Pass "mainnet" or a configured
#                       stellar CLI network alias to deploy elsewhere.
#   TRIVELA_ENV_OUT     Frontend env file path. Defaults to ".env.testnet".
#   TRIVELA_BACKEND_ENV Optional backend env file. When set, the script also
#                       writes REWARDS_CONTRACT_ID/CAMPAIGN_CONTRACT_ID there.

set -euo pipefail

cd "$(dirname "$0")/.."

NETWORK="${STELLAR_NETWORK:-testnet}"
SOURCE="${STELLAR_SOURCE:-}"
ENV_OUT="${TRIVELA_ENV_OUT:-.env.testnet}"
BACKEND_ENV_OUT="${TRIVELA_BACKEND_ENV:-}"
REWARDS_WASM="target/wasm32-unknown-unknown/release/trivela_rewards_contract.wasm"
CAMPAIGN_WASM="target/wasm32-unknown-unknown/release/trivela_campaign_contract.wasm"

err() {
  echo "error: $*" >&2
  exit 1
}

if [ -z "$SOURCE" ]; then
  err "STELLAR_SOURCE is required (set it to a funded Stellar identity or secret key)"
fi

# Mainnet guard — require explicit opt-in to prevent accidental production deploys.
if [ "$NETWORK" = "mainnet" ] || [ "$NETWORK" = "public" ]; then
  if [ "${MAINNET_CONFIRMED:-}" != "true" ]; then
    err "Deploying to mainnet requires MAINNET_CONFIRMED=true. Set this variable only after reviewing docs/MAINNET_DEPLOY.md."
  fi
  echo "WARNING: Deploying to MAINNET. This action is irreversible." >&2
fi

if ! command -v cargo >/dev/null 2>&1; then
  err "cargo is required but not found in PATH"
fi

if ! command -v stellar >/dev/null 2>&1; then
  err "stellar CLI is required but not found in PATH (https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup)"
fi

echo "Building rewards and campaign contracts..."
cargo build --target wasm32-unknown-unknown --release \
  -p trivela-rewards-contract \
  -p trivela-campaign-contract

if [ ! -f "$REWARDS_WASM" ]; then
  err "expected rewards WASM at $REWARDS_WASM after build (build did not produce artifact)"
fi
if [ ! -f "$CAMPAIGN_WASM" ]; then
  err "expected campaign WASM at $CAMPAIGN_WASM after build (build did not produce artifact)"
fi

echo "Deploying rewards contract to ${NETWORK}..."
REWARDS_CONTRACT_ID="$(stellar contract deploy --wasm "$REWARDS_WASM" --source "$SOURCE" --network "$NETWORK")"

echo "Deploying campaign contract to ${NETWORK}..."
CAMPAIGN_CONTRACT_ID="$(stellar contract deploy --wasm "$CAMPAIGN_WASM" --source "$SOURCE" --network "$NETWORK")"

cat > "$ENV_OUT" <<EOF
VITE_STELLAR_NETWORK=$NETWORK
VITE_REWARDS_CONTRACT_ID=$REWARDS_CONTRACT_ID
VITE_CAMPAIGN_CONTRACT_ID=$CAMPAIGN_CONTRACT_ID
EOF

if [ -n "$BACKEND_ENV_OUT" ]; then
  cat > "$BACKEND_ENV_OUT" <<EOF
STELLAR_NETWORK=$NETWORK
REWARDS_CONTRACT_ID=$REWARDS_CONTRACT_ID
CAMPAIGN_CONTRACT_ID=$CAMPAIGN_CONTRACT_ID
EOF
fi

echo
echo "Deployment complete on ${NETWORK}:"
echo "  rewards  contract: $REWARDS_CONTRACT_ID"
echo "  campaign contract: $CAMPAIGN_CONTRACT_ID"
echo "  frontend env  -> $ENV_OUT"
if [ -n "$BACKEND_ENV_OUT" ]; then
  echo "  backend env   -> $BACKEND_ENV_OUT"
fi
