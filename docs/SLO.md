# Trivela Service Level Objectives (SLOs)

This document defines the availability, latency, and indexer-freshness SLIs + SLOs, and the error
budget that the alerting rules in `monitoring/alerting/alerting_rules.yml` derive from.

> **Mainnet target.** These SLOs apply to the production Trivela API and testnet canary. Pre-mainnet
> development environments are exempt.

---

## 1. Availability SLO

| Signal                    | SLI                                                                               | SLO target | Error budget (30 d)       |
| ------------------------- | --------------------------------------------------------------------------------- | ---------- | ------------------------- |
| API availability          | `1 - (rate(trivela_request_errors_total[5m]) / rate(trivela_requests_total[5m]))` | ≥ 99.5%    | 3 h 36 min downtime/month |
| Backend reachability      | `up{job="trivela-backend"} == 1` (averaged over the window)                       | ≥ 99.9%    | 43 min downtime/month     |
| RPC endpoint reachability | At least 1 healthy endpoint in the pool                                           | ≥ 99.0%    | 7 h 12 min/month          |

**Burn-rate alert thresholds:**

- Fast burn (1 h window): 5× budget rate → fires `HighBackendErrorRate` (critical, 5 min).
- Slow burn (6 h window): 1× budget rate → fires `HighBackendErrorRate` (warning).

---

## 2. Latency SLO

| Signal                  | SLI                                                                           | SLO target     | Notes                                        |
| ----------------------- | ----------------------------------------------------------------------------- | -------------- | -------------------------------------------- |
| p50 request latency     | `histogram_quantile(0.50, rate(trivela_http_request_duration_ms_bucket[5m]))` | ≤ 200 ms       |                                              |
| **p95 request latency** | `histogram_quantile(0.95, rate(trivela_http_request_duration_ms_bucket[5m]))` | ≤ **1 000 ms** | Primary latency SLO — fires `HighP95Latency` |
| p99 request latency     | `histogram_quantile(0.99, rate(trivela_http_request_duration_ms_bucket[5m]))` | ≤ 5 000 ms     | Advisory only                                |

**Alert:** `HighP95Latency` fires when p95 > 1 000 ms for 5 continuous minutes.

**Request deadline:** every route is protected by a 30 s hard timeout (`REQUEST_TIMEOUT_MS`,
configurable). Deadline breaches return `504` with code `REQUEST_TIMEOUT`.

---

## 3. Indexer-freshness SLO

| Signal                 | SLI                                                                                             | SLO target                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Event indexer currency | `increase(trivela_indexer_events_processed_total[10m]) > 0` when `trivela_indexer_running == 1` | Cursor must advance at least once per 10 minutes |

**Alert:** `IndexerLag` fires when the cursor is stalled for 10 consecutive minutes while the
indexer is reported running.

---

## 4. Pool saturation SLO

| Signal                   | SLI                         | SLO target                          |
| ------------------------ | --------------------------- | ----------------------------------- |
| RPC pool waiting callers | `trivela_rpc_pool_waiting`  | 0 waiting callers under normal load |
| RPC pool availability    | `trivela_rpc_pool_idle > 0` | At least 1 idle slot at all times   |

**Alert:** `RpcPoolSaturated` fires when callers are queued for > 2 minutes. Callers that wait
beyond `ACQUIRE_TIMEOUT_MS` (default 5 s) receive a typed `503 POOL_SATURATED` response instead of
hanging indefinitely.

---

## 5. Synthetic canary SLO

| Signal                  | SLI                               | SLO target                      |
| ----------------------- | --------------------------------- | ------------------------------- |
| Canary success          | `trivela_canary_success == 1`     | Must succeed every 5-minute run |
| Canary journey duration | `trivela_canary_duration_seconds` | ≤ 30 s end-to-end               |

**Alert:** `CanaryJourneyFailed` fires when the canary fails for 5 consecutive minutes;
`CanarySlowJourney` fires when duration exceeds 30 s.

---

## 6. Operator balance SLO

| Signal               | SLI                                    | SLO target                     |
| -------------------- | -------------------------------------- | ------------------------------ |
| Operator XLM balance | `trivela_operator_xlm_balance_stroops` | ≥ 50 000 000 stroops (≥ 5 XLM) |

**Alert:** `OperatorLowBalance` fires when the balance drops below 5 XLM.

---

## 7. Error budget policy

| Remaining budget | Action                                                |
| ---------------- | ----------------------------------------------------- |
| > 50%            | No action required. Normal velocity.                  |
| 25–50%           | Engineering review. Slow down risky releases.         |
| 10–25%           | Freeze feature releases. Prioritise reliability work. |
| < 10%            | Incident declared. All hands reliability.             |

Budget resets at the start of each calendar month.

---

## 8. Measurement & reporting

- **Dashboard:** Grafana → Trivela API (`monitoring/dashboards/trivela-api.json`).
- **Alert rules:** `monitoring/alerting/alerting_rules.yml`.
- **Alertmanager:** `monitoring/alertmanager.yml` (routes to `#trivela-alerts`, `#trivela-critical`,
  PagerDuty for critical journeys).
- **promtool tests:** `monitoring/alerting/alerting_rules_test.yml` — run in CI via
  `promtool test rules`.
- **Monthly review:** on-call rotation should review error budget consumption and publish a brief
  summary.
