# Analytics exports, fraud detection and deposit watching

Backend features for the growth engine and analytics area. All of them ship with unit and
integration tests under `backend/src`.

## Interactive API reference — `/docs/api`

`GET /docs/api` serves Swagger UI and `GET /docs/api/openapi.json` serves the underlying OpenAPI
document. The document is generated at startup from three sources (`services/openapiGenerator.js`):

1. `backend/openapi.yaml` — the hand-written spec. It always wins.
2. Component schemas derived from the Zod request schemas in `backend/src/schemas.js`, so the
   documented request bodies match runtime validation. Generated schemas carry an `x-generated-from`
   marker.
3. Path items for router-mounted endpoints not yet in `openapi.yaml` (`services/openapiRoutes.js`).

The checked-in `openapi.yaml` (and the SDK generated from it) is not modified by this.

## Asynchronous campaign exports

Large exports no longer have to finish inside one HTTP request. The synchronous
`GET /api/v1/campaigns/:id/export` endpoint is unchanged; these endpoints queue the work on the
durable job queue (SQLite-backed, retried with backoff, dead-lettered when exhausted):

| Method | Path                                   | Purpose                          |
| ------ | -------------------------------------- | -------------------------------- |
| POST   | `/api/v1/campaigns/:id/exports`        | Queue an export (`202 Accepted`) |
| GET    | `/api/v1/campaigns/:id/exports`        | Recent exports for the campaign  |
| GET    | `/api/v1/campaigns/:id/exports/:jobId` | Status and, once done, the URL   |

```bash
curl -X POST "$API/api/v1/campaigns/42/exports" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"format":"csv","from":"2026-01-01"}'
# -> 202 { "jobId": "…", "status": "queued", "statusUrl": "/api/v1/campaigns/42/exports/…" }

curl "$API/api/v1/campaigns/42/exports/$JOB_ID" -H "X-API-Key: $KEY"
# -> { "status": "completed", "rowCount": 1280, "downloadUrl": "https://…/exports/campaigns/42/….csv" }
```

Status moves `queued → running → completed`, or `failed` (with `error`) when an attempt throws; the
queue retries up to three times and a retry moves the job back to `running`. The file is written
through the configured storage adapter (local, S3 or IPFS).

## Fraud detection for multi-account signups

Each referral signup records the network prefix of the request IP (`/24` IPv4, `/64` IPv6; only the
prefix is stored). When the number of **distinct accounts** from one prefix inside the window
reaches `FRAUD_SUBNET_THRESHOLD`, or accounts share an address on the `FRAUD_PROXY_EXIT_LIST`, a
flag is raised. Detection is advisory: it never blocks a signup.

| Method | Path                            | Purpose                                     |
| ------ | ------------------------------- | ------------------------------------------- |
| GET    | `/api/v1/admin/fraud/flags`     | List flags (`status`, `campaignId`, paging) |
| PATCH  | `/api/v1/admin/fraud/flags/:id` | Set `open`, `dismissed` or `confirmed`      |

Both require the master key. A dismissed flag reopens automatically if the cluster grows. The
address seen by the server is Express's `req.ip`, so set `trust proxy` appropriately when running
behind a load balancer.

## Horizon deposit watcher

When `OPERATOR_DEPOSIT_ACCOUNTS` is set, the server streams payments for each account from Horizon
and records incoming deposits of the reward asset (`REWARD_TOKEN_CODE` / `REWARD_TOKEN_ISSUER`,
default XLM). Deposits are idempotent (keyed by Horizon paging token), stream cursors are persisted
so restarts resume where they stopped, and dropped streams reconnect with exponential backoff.

| Method | Path                                | Purpose                                    |
| ------ | ----------------------------------- | ------------------------------------------ |
| GET    | `/api/v1/operator/deposits`         | Recent deposits (`account`, `limit`)       |
| GET    | `/api/v1/operator/deposits/:txHash` | Verify that a transaction's deposit landed |
| GET    | `/api/v1/operator/watcher/status`   | Stream health, cursors and counters        |

These require the master key.
