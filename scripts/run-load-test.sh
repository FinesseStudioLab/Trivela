#!/usr/bin/env bash
# Wrapper that picks the correct k6 scenario via LOAD_SCENARIO and forwards
# extra args (e.g. --vus, --duration) to `k6 run`.
#
# Usage:
#   npm run load-test                                   # read-campaigns
#   LOAD_SCENARIO=write-campaigns npm run load-test
#   LOAD_SCENARIO=mixed-read-write API_KEY=sk_dev_local npm run load-test

set -euo pipefail

SCENARIO="${LOAD_SCENARIO:-read-campaigns}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCENARIO_PATH="${SCRIPT_DIR}/../load-tests/scenarios/${SCENARIO}.js"

if [ ! -f "${SCENARIO_PATH}" ]; then
  echo "load-test: unknown scenario '${SCENARIO}' (expected file at ${SCENARIO_PATH})" >&2
  echo "Available scenarios:" >&2
  ls "${SCRIPT_DIR}/../load-tests/scenarios" | sed 's/\.js$//; s/^/  - /' >&2
  exit 2
fi

if ! command -v k6 >/dev/null 2>&1; then
  echo "load-test: k6 is not installed (https://grafana.com/docs/k6/latest/set-up/install-k6/)" >&2
  exit 127
fi

exec k6 run "${SCENARIO_PATH}" "$@"
