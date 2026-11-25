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

## 4a. Job queue backlog SLO

| Signal                   | SLI                                                     | SLO target                          |
| ------------------------ | ------------------------------------------------------- | ----------------------------------- |
| Durable queue backlog    | `trivela_job_queue_depth{queue="durable"}`              | ≤ 100 pending jobs sustained        |
| Durable queue drain rate | Backlog should trend down between polls (see dashboard) | No sustained growth over 10 min     |
| Dead-letter queue size   | `trivela_dlq_size_total`                                | 0 sustained; investigate any growth |

**Alert:** `JobQueueBacklog` fires when `trivela_job_queue_depth{queue="durable"} > 100` for 10
continuous minutes. `DLQGrowth` fires when the dead-letter store grows by more than 10 jobs over 15
minutes — see [`docs/RUNBOOK.md#dlq-investigation`](RUNBOOK.md#dlq-investigation) and
[`docs/RUNBOOK.md#job-queue-backlog`](RUNBOOK.md#job-queue-backlog).

**Dashboard:** Grafana → Trivela Jobs (`monitoring/dashboards/trivela-jobs.json`) — queue depth,
in-flight jobs, and dead-letter backlog for both the in-memory (`jobRunner`) and persistent
(`durableJobQueue`) queues.

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

- **Dashboards:** Grafana → Trivela API (`monitoring/dashboards/trivela-api.json`), Trivela RPC &
  Pools (`monitoring/dashboards/trivela-rpc-pools.json`), Trivela Jobs
  (`monitoring/dashboards/trivela-jobs.json`).
- **Alert rules:** `monitoring/alerting/alerting_rules.yml`.
- **Alertmanager:** `monitoring/alertmanager.yml` (routes to `#trivela-alerts`, `#trivela-critical`,
  PagerDuty for critical journeys).
- **promtool tests:** `monitoring/alerting/alerting_rules_test.yml` — run in CI via
  `promtool test rules`.
- **Monthly review:** on-call rotation should review error budget consumption and publish a brief
  summary.
- **Load testing:** see [docs/LOAD_TESTING.md](LOAD_TESTING.md) for how to run the k6 suite and
  interpret results against these SLO targets.
# SLOs, error budgets, and burn-rate alerts (issue #779)

`/metrics` (`backend/src/routes/health.js`) already exposes `trivela_requests_total`,
`trivela_request_errors_total`, `trivela_route_hits_total{route}`, and
`trivela_http_request_duration_ms_bucket{le}`. This document defines the SLOs those metrics (and
the ones called out as missing below) should be measured against, plus the multi-window burn-rate
alert rules to page on.

## SLIs / SLOs per critical journey

| Journey | SLI | SLO target | Window |
| --- | --- | --- | --- |
| Campaign read (`GET /campaigns/:id`, `GET /campaigns`) | Availability: `1 - (5xx responses / total responses)` | 99.9% | 30 days |
| Campaign read | Latency: p95 request duration | < 300ms | 30 days |
| Register (`POST /campaigns/:id/register`) | Availability | 99.5% | 30 days |
| Register | Latency: p95 | < 800ms | 30 days |
| Redeem (`POST /rewards/redeem` or contract-level `redeem()` invocation path) | Availability | 99.5% | 30 days |
| Redeem | Latency: p95 | < 1.5s (includes RPC round-trip to the chain) | 30 days |
| Webhook delivery (outbox relay, `webhookService.js`) | Delivery success: `delivered / (delivered + failed)` outbox rows | 99% | 30 days |
| Webhook delivery | Delivery latency: time from `created_at` to `status = 'delivered'`, p95 | < 5 minutes | 30 days |

99.9%/99.5% availability over 30 days gives error budgets of ~43 minutes and ~3.6 hours of
acceptable full-outage-equivalent error time respectively — small enough that a single incident
matters, large enough that routine deploys and transient RPC blips don't page on every occurrence.

## Multi-window burn-rate alerts

Following the [Google SRE workbook's multiwindow, multi-burn-rate
approach](https://sre.google/workbook/alerting-on-slos/): a **fast** window catches a severe outage
quickly without excessive false positives, and a **slow** window catches a sustained, lower-rate
degradation the fast window alone would miss (or would flap on).

For a 99.9% (0.1% error budget) SLO, example fast+slow burn-rate pair:

```yaml
# prometheus/alerts/slo-burn-rate.yml
groups:
  - name: trivela-slo-burn-rate
    rules:
      # Fast burn: 14.4x the budget consumption rate sustained over 1h,
      # confirmed over a 5m window — pages immediately. At this rate the
      # full 30-day budget is exhausted in ~2 days.
      - alert: TrivelaErrorBudgetFastBurn
        expr: |
          (
            sum(rate(trivela_request_errors_total[1h])) / sum(rate(trivela_requests_total[1h]))
          ) > (14.4 * 0.001)
          and
          (
            sum(rate(trivela_request_errors_total[5m])) / sum(rate(trivela_requests_total[5m]))
          ) > (14.4 * 0.001)
        for: 2m
        labels:
          severity: page
        annotations:
          summary: "Error budget burning >14x normal rate — will exhaust 30-day budget in ~2 days"

      # Slow burn: 6x the budget consumption rate sustained over 6h,
      # confirmed over 30m — pages, but with lower urgency. Exhausts the
      # budget in ~5 days if it continues.
      - alert: TrivelaErrorBudgetSlowBurn
        expr: |
          (
            sum(rate(trivela_request_errors_total[6h])) / sum(rate(trivela_requests_total[6h]))
          ) > (6 * 0.001)
          and
          (
            sum(rate(trivela_request_errors_total[30m])) / sum(rate(trivela_requests_total[30m]))
          ) > (6 * 0.001)
        for: 15m
        labels:
          severity: ticket
        annotations:
          summary: "Error budget burning >6x normal rate — will exhaust 30-day budget in ~5 days"

      # Webhook delivery failure rate — same fast/slow pattern, applied to
      # outbox status instead of HTTP status. Requires the `trivela_outbox_*`
      # metrics from the Follow-up section below.
      - alert: TrivelaWebhookDeliveryFastBurn
        expr: |
          (
            sum(rate(trivela_outbox_failed_total[1h])) / sum(rate(trivela_outbox_delivered_total[1h]) + rate(trivela_outbox_failed_total[1h]))
          ) > (14.4 * 0.01)
        for: 5m
        labels:
          severity: page
        annotations:
          summary: "Webhook delivery failure rate far above the 99% SLO"
```

## Dashboards

A Grafana dashboard per journey should show, at minimum: current availability vs. SLO line, error
budget remaining (a burn-down gauge over the 30-day window), and p95/p99 latency vs. target. This
repo doesn't currently commit dashboard JSON — recommend provisioning via Grafana's
`dashboards-as-code` (Jsonnet/grafonnet or the Grafana Terraform provider) so dashboards are
versioned alongside these SLO definitions rather than hand-edited in the UI and drifting from this
document.

## Follow-up (not done in this pass)

The alert rules above for HTTP journeys (campaign read/register/redeem) work today against the
existing global `trivela_requests_total`/`trivela_request_errors_total` counters — but those
counters are **not currently broken down per-route**. `trivela_route_hits_total{route}` exists, but
there's no equivalent per-route error or latency-bucket metric in `backend/src/routes/health.js`
today, so the table above is defined per-journey while the underlying alert can, for now, only fire
on the *aggregate* HTTP error rate across all routes — a spike isolated to `redeem` alone would move
the aggregate rate too, just diluted by traffic on the other routes. Genuinely per-journey alerting
needs `trivela_route_errors_total{route}` and `trivela_route_duration_ms_bucket{route, le}` added to
the metrics collector, which is a real (small) code change, not just a docs one — flagging it here
rather than writing alert rules against metrics that don't exist yet.

Similarly, webhook delivery metrics (`trivela_outbox_delivered_total`,
`trivela_outbox_failed_total`, and a delivery-latency histogram) referenced in the alert rules above
don't exist yet either — they'd need to be added to `outboxService.js`'s `_deliver`/`_markFailed`
paths. Grafana dashboard provisioning (Jsonnet/Terraform) and the actual on-call paging integration
(PagerDuty/Opsgenie webhook target for the `severity: page` rules) are infrastructure setup outside
this repo and are also not done here.
