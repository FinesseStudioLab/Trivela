#!/usr/bin/env bash
# Trivela local dev setup script.
# Run once after cloning to configure git hooks and tooling.

set -euo pipefail

echo "==> Setting up Trivela dev environment"

# ── Node / npm ────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js is required. Install it from https://nodejs.org" >&2
  exit 1
fi

echo "==> Installing npm dependencies"
npm install

# ── git-secrets pre-commit hook ───────────────────────────────────────────────
# Scans staged files for secret patterns before each commit, mirroring the
# gitleaks CI check locally. Requires git-secrets to be installed.
# Install: https://github.com/awslabs/git-secrets#installing-git-secrets
if command -v git-secrets &>/dev/null; then
  echo "==> Configuring git-secrets"
  git secrets --install --force
  git secrets --register-aws
  # Stellar secret key pattern: S[A-Z2-7]{55}
  git secrets --add 'S[A-Z2-7]{55}'
  # Trivela API key pattern
  git secrets --add 'tvl_[a-zA-Z0-9]{32,}'
  # Allow .env.example and fixture paths
  git secrets --add-provider -- echo '.env.example test/fixtures docs/'
  echo "  git-secrets configured. Staged secrets will be blocked pre-commit."
else
  echo "  WARN: git-secrets not found. Install it to enable local secret scanning."
  echo "        https://github.com/awslabs/git-secrets#installing-git-secrets"
fi

echo ""
echo "Dev setup complete. Start the backend with: npm run dev"
