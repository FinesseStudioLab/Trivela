# Service Level Objectives (SLOs), Error Budgets & Status Page

> Trivela backend — mainnet readiness definition

## 1. SLIs (Service Level Indicators)

The raw signals we measure to evaluate service health:

| SLI                  | Measurement                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------ |
| **Availability**     | % of non-5xx HTTP responses over a rolling 30-day window                                   |
| **Latency (p99)**    | 99th-percentile response time for `POST /api/v1/campaigns` and `GET /api/v1/campaigns/:id` |
| **Error rate**       | % of requests returning 5xx over a rolling 1-hour window                                   |
| **RPC proxy health** | % of `/health/rpc` checks returning `status: ok` in a 5-minute window                      |

## 2. SLOs (Service Level Objectives)

| SLO                           | Target         | Window           |
| ----------------------------- | -------------- | ---------------- |
| API availability              | **99.5 %**     | Rolling 30 days  |
| p99 latency — read endpoints  | **≤ 500 ms**   | Rolling 7 days   |
| p99 latency — write endpoints | **≤ 1 000 ms** | Rolling 7 days   |
| Error rate                    | **< 0.5 %**    | Rolling 1 hour   |
| RPC proxy availability        | **99 %**       | Rolling 24 hours |

> These targets are intentionally achievable at mainnet launch. They will be tightened to 99.9 %
> availability after 90 days of stable operation.

## 3. Error Budgets

An error budget is the maximum allowable unreliability before the SLO is breached.

| SLO                 | Monthly budget (30 days)                |
| ------------------- | --------------------------------------- |
| 99.5 % availability | **3 h 36 min** of downtime              |
| < 0.5 % error rate  | **0.5 %** of requests may fail per hour |

**Policy:**

- When 50 % of the monthly error budget is consumed, a Slack alert fires and the on-call engineer
  investigates.
- When 100 % is consumed, all non-critical feature work is paused until the incident is resolved and
  a post-mortem is completed.

## 4. Burn-Rate Alerting

Burn rate = (error rate observed) / (error rate budget threshold).  
A burn rate > 1 means we are consuming the budget faster than it replenishes.

| Alert                | Burn rate | Window        | Severity            |
| -------------------- | --------- | ------------- | ------------------- |
| Fast burn — page     | > 14×     | 1 hour        | PagerDuty P1        |
| Slow burn — ticket   | > 6×      | 6 hours       | GitHub issue, Slack |
| Budget 50 % consumed | —         | Month-to-date | Slack warning       |

Configure these alerts in your observability platform (Grafana / Datadog / CloudWatch) using the SLI
measurements above.

## 5. Status Page

Publish a public status page so that integrators can check service health without contacting
support.

**Recommended setup:**

1. Use [Upptime](https://upptime.js.org/) (GitHub-native, zero cost) or Statuspage.io.
2. Monitor the following endpoints:
   - `GET /health` — overall API health
   - `GET /health/rpc` — Stellar RPC proxy
3. Add a link from `README.md` → `docs/GOVERNANCE/SLOs.md` → the status page URL.

**Current status page:** _to be configured_ — update this file with the URL once live.

## 6. Incident Response

| Step | Action                                                         |
| ---- | -------------------------------------------------------------- |
| 1    | On-call engineer acknowledges PagerDuty alert within 15 min    |
| 2    | Incident channel opened in Slack (`#incidents`)                |
| 3    | Status page updated within 30 min of confirmed outage          |
| 4    | Post-mortem written within 5 business days                     |
| 5    | Action items tracked as GitHub issues with `post-mortem` label |

## 7. Review Cadence

SLOs are reviewed quarterly. Any proposed change goes through the RFC process (see
[RFC_INDEX.md](RFC_INDEX.md)).
