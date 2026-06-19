# Trivela load tests

[k6](https://k6.io/) scripts that exercise the Trivela backend API under synthetic traffic. The
scripts are designed to run against a locally deployed backend (`http://localhost:3001` by default)
but can target any environment via the `BASE_URL` env variable.

## Scenarios

| File                              | Profile             | What it covers                            |
| --------------------------------- | ------------------- | ----------------------------------------- |
| `scenarios/read-campaigns.js`     | 100 VUs · 30s       | `GET /api/v1/campaigns` (read heavy)      |
| `scenarios/write-campaigns.js`    | 10 VUs · 30s        | `POST /api/v1/campaigns` (writes)         |
| `scenarios/mixed-read-write.js`   | 80R + 20W VUs · 60s | Combined read/write traffic               |
| `scenarios/burst-registration.js` | 0→200 VUs · 70s     | User registration spike (ramping burst)   |
| `scenarios/claim-storm.js`        | 0→150 VUs · 75s     | Concurrent reward claims (storm scenario) |

Most scenarios apply the project pass/fail thresholds:
`http_req_duration{expected_response:true} p(95) < 200ms` and `http_req_failed rate < 0.01`.
Burst/storm scenarios use more lenient thresholds (500-800ms p95, 3-5% error rate) to account for
traffic spikes. Set `LATENCY_P95_MS` and `ERROR_RATE_THRESHOLD` to override.

## Prerequisites

- [Install k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) (Homebrew: `brew install k6`).
- A running backend that listens on `BASE_URL` (defaults to `http://localhost:3001`).
- For write scenarios, an API key with permission to call `POST /api/v1/campaigns` exposed as
  `API_KEY`.

## Running locally

```bash
# 1. start the backend (writes need an API key)
TRIVELA_API_KEY=sk_dev_local npm run dev:backend

# 2. run the scenarios from the repo root
npm run load-test                                      # default: read-campaigns
LOAD_SCENARIO=write-campaigns API_KEY=sk_dev_local npm run load-test
LOAD_SCENARIO=mixed-read-write API_KEY=sk_dev_local npm run load-test
LOAD_SCENARIO=burst-registration npm run load-test    # registration spike
LOAD_SCENARIO=claim-storm API_KEY=sk_dev_local npm run load-test  # claim surge
```

`npm run load-test` is a thin wrapper around `k6 run`. To run a scenario directly:

```bash
BASE_URL=http://localhost:3001 \
API_KEY=sk_dev_local \
k6 run load-tests/scenarios/mixed-read-write.js
```

## Interpreting results

After each run k6 prints a summary block. The two metrics that gate the suite:

- `http_req_duration{expected_response:true}: p(95) < 200ms` — 95th percentile of successful
  responses. A regression here usually means SQLite write contention or rate limiter saturation.
- `http_req_failed: rate < 0.01` — proportion of non-2xx responses. Spikes typically indicate the
  rate limiter is rejecting traffic too aggressively (defaults are 60 req/min per IP).

When a threshold is exceeded k6 exits non-zero, which is what the CI workflow
(`.github/workflows/load-test.yml`) uses to mark a manual run as red.

## CI

The load suite is deliberately **not** part of PR CI. The workflow is `workflow_dispatch`-triggered
so anyone with write access can run it on-demand from the Actions tab against a staging URL.
