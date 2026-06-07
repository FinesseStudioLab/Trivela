#!/bin/bash
#
# Deploy Trivela contracts to Stellar mainnet.
# Wrapper around deploy-testnet.sh that sets required mainnet env vars.
#
# Required env:
#   STELLAR_SOURCE  Stellar account/identity to fund and sign the deploy.
#
# Optional env:
#   TRIVELA_ENV_OUT       Frontend env file (default: .env.mainnet)
#   TRIVELA_BACKEND_ENV   Backend env file (optional)

set -euo pipefail

export STELLAR_NETWORK=mainnet
export TRIVELA_CONFIRM_MAINNET=yes
export TRIVELA_ENV_OUT="${TRIVELA_ENV_OUT:-.env.mainnet}"

exec "$(dirname "$0")/deploy-testnet.sh"
