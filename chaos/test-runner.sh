#!/usr/bin/env bash
# chaos/test-runner.sh — Run integration tests under various failure scenarios (#877)
#
# Usage: bash chaos/test-runner.sh [scenario]
# Without args, runs all scenarios.

set -euo pipefail

BACKEND_CONTAINER="${BACKEND_CONTAINER:-trivela-backend-1}"
CHAOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INJECT="${CHAOS_DIR}/inject.sh"
TEST_CMD="npm run test:integration"

run_test_scenario() {
  local scenario=$1
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Testing under: $scenario"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Inject failure
  bash "$INJECT" "$scenario" || true

  # Wait for failure to propagate
  sleep 2

  # Run tests (don't fail on test errors yet)
  if eval "$TEST_CMD"; then
    echo "✓ Tests passed under $scenario"
  else
    echo "✗ Tests failed under $scenario (may indicate missing resilience)"
  fi

  # Restore
  bash "$INJECT" restore

  # Wait for recovery
  sleep 2

  echo ""
}

if [[ $# -eq 0 ]]; then
  # Run all scenarios
  run_test_scenario "network-partition-backend"
  run_test_scenario "db-latency"
  run_test_scenario "stellar-rpc-timeout"
else
  # Run specified scenario
  run_test_scenario "$1"
fi

echo "✓ Chaos testing complete"
