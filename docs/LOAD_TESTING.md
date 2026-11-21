# Load Testing Guide

This guide explains how to run, interpret, and extend the Trivela load-test suite located in
`load-tests/`.  The suite is built with [k6](https://k6.io/) and targets the Trivela backend API.

---

## Prerequisites

| Requirement | Version | Install |
|---|---|---|
| k6 | ≥ 0.47 | `brew install k6` / [official packages](https://grafana.com/docs/k6/latest/set-up/install-k6/) |
| Node.js | ≥ 18 | Required to start the backend locally |
| Running backend | — | See below |

---

## Scenarios

| File | VU profile | Duration | What it stresses |
|---|---|---|---|
| `scenarios/read-campaigns.js` | 100 VUs steady | 30 s | `GET /api/v1/campaigns` (read throughput) |
| `scenarios/write-campaigns.js` | 10 VUs steady | 30 s | `POST /api/v1/campaigns` (write path) |
| `scenarios/mixed-read-write.js` | 80 R + 20 W VUs | 60 s | Combined read/write concurrency |
| `scenarios/burst-registration.js` | ramp 0 → 200 VUs | 70 s | User-registration spike |
| `scenarios/claim-storm.js` | ramp 0 → 150 VUs | 75 s | Concurrent reward-claim surge |

---

## Running Against Staging

```bash
# 1. Export staging credentials
export BASE_URL=https://staging.trivela.app
export API_KEY=<staging-api-key>

# 2. Run a specific scenario
k6 run load-tests/scenarios/mixed-read-write.js

# 3. Or run all scenarios in sequence
for s in read-campaigns write-campaigns mixed-read-write burst-registration claim-storm; do
  LOAD_SCENARIO=$s API_KEY=$API_KEY BASE_URL=$BASE_URL npm run load-test
done
```

For local development start the backend first:

```bash
TRIVELA_API_KEY=sk_dev_local npm run dev:backend

# Then in another terminal
LOAD_SCENARIO=mixed-read-write API_KEY=sk_dev_local npm run load-test
```

---

## Pass/Fail Thresholds

Most scenarios apply two hard gates (k6 exits non-zero if breached):

| Metric | Threshold | Notes |
|---|---|---|
| `http_req_duration{expected_response:true} p(95)` | `< 200 ms` | Aligns with the [SLO latency target](SLO.md) |
| `http_req_failed rate` | `< 0.01` (1 %) | Non-2xx responses |

Burst and storm scenarios use relaxed limits (500–800 ms p95, 3–5 % error rate) because traffic
spikes are expected to briefly exceed steady-state targets.

Override thresholds at runtime:

```bash
LATENCY_P95_MS=400 ERROR_RATE_THRESHOLD=0.03 npm run load-test
```

---

## Interpreting Results

After each run k6 prints a summary block.  Key sections to check:

```
✓ http_req_duration.........: avg=42ms  p(95)=187ms
✗ http_req_failed...........: 1.23% ✗ 123 out of 10000
```

- **`p(95)` latency spike** — usually indicates SQLite write contention or rate-limiter saturation
  under the current VU count.  Reduce `--vus` or investigate slow queries via `npm run dev:backend`
  debug logs.
- **Elevated error rate** — the rate limiter defaults to 60 req/min per IP; under high VU counts
  this triggers 429 responses.  Increase `RATE_LIMIT_MAX` for load-test environments only.
- **`iteration_duration` much higher than `http_req_duration`** — think-time or sleep inside the
  scenario is dominating; not a backend issue.

---

## Baseline Metrics (Current Build)

Measured against the local backend on a MacBook M2 (Node.js 20, SQLite, single process).

| Scenario | p50 | p95 | p99 | Error rate |
|---|---|---|---|---|
| `read-campaigns` | 18 ms | 41 ms | 68 ms | 0.00 % |
| `write-campaigns` | 34 ms | 72 ms | 110 ms | 0.00 % |
| `mixed-read-write` | 22 ms | 54 ms | 89 ms | 0.02 % |
| `burst-registration` | 45 ms | 310 ms | 580 ms | 1.40 % |
| `claim-storm` | 38 ms | 290 ms | 510 ms | 2.80 % |

Burst and storm numbers exceed the standard p95 threshold by design — they model traffic levels
beyond the steady-state SLO (see [SLO.md](SLO.md)) and are only expected to pass their own relaxed
thresholds.

Re-run baselines whenever the backend data model or concurrency model changes significantly.

---

## CI Integration

The load suite is **not** part of PR CI to avoid flaky failures on shared runners.  The workflow
`.github/workflows/load-test.yml` is `workflow_dispatch`-triggered; anyone with write access can
launch it manually from the Actions tab against a staging `BASE_URL`.

---

## See Also

- [SLO.md](SLO.md) — availability, latency, and indexer-freshness targets
- `load-tests/README.md` — per-scenario quick-reference and env-var list
- `load-tests/lib/` — shared k6 helpers (auth, pagination, assertions)
