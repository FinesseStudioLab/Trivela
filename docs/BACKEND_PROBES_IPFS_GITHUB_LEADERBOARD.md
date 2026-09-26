# Readiness probes, IPFS pinning, GitHub verification and live leaderboard

## Health and readiness — `/healthz`, `/readyz`

| Endpoint   | Purpose                                                                        |
| ---------- | ------------------------------------------------------------------------------ |
| `/livez`   | Liveness. Never touches a dependency.                                          |
| `/healthz` | Liveness plus `uptimeSeconds` and the cached RPC pool state.                   |
| `/readyz`  | Readiness. Runs the dependency checks below, in parallel, each with a timeout. |

`/readyz` checks the **database** (`SELECT 1`), **Redis** (`PING`, only when Redis is configured)
and the **Soroban RPC**. It returns `503` when the process is shutting down or a _required_ check
fails. The database and Redis are required. The RPC is optional by default: a failure reports
`"status": "degraded"` with HTTP 200, so an RPC blip does not evict every pod. Set
`READINESS_REQUIRE_RPC=true` to make it required. `READINESS_TIMEOUT_MS` (default 2000) bounds each
check.

```json
{
  "status": "degraded",
  "ready": true,
  "uptimeSeconds": 812,
  "checks": {
    "database": { "status": "ok", "required": true, "latencyMs": 0 },
    "rpc": {
      "status": "fail",
      "required": false,
      "latencyMs": 2001,
      "error": "rpc check timed out after 2000ms"
    }
  }
}
```

## IPFS pinning

With `PINATA_JWT` set, `POST /api/v1/campaigns/:id/ipfs-pins` (API key) pins the campaign's
**image**, **rules** JSON, **badge** JSON and a **metadata** document that links them by `ipfs://`
CID, and `GET` lists the stored pins. New campaigns are also pinned in the background through the
durable job queue.

- Pins are content-addressed and de-duplicated per campaign; unchanged content is not re-pinned.
- Transient provider errors (network, 429, 5xx) are retried with backoff; auth errors are not.
- Images must be public `https` URLs (no private or internal hosts, no redirects), `image/*`, at
  most 5 MiB. DNS-level rebinding is not covered; run the server with egress restrictions if that
  matters.

## GitHub webhook — developer bounty verification

Point a GitHub webhook (content type `application/json`, events **Pull requests** and **Issues**) at
`POST /api/v1/webhooks/github` and set `GITHUB_WEBHOOK_SECRET`. The `X-Hub-Signature-256` header is
verified in constant time over the raw body. A task counts as verified only when GitHub reports a
pull request **merged**, or an issue **closed as completed** (`not_planned` is ignored). Each
delivery is recorded once, so GitHub retries are harmless.

Before crediting a reward, look the task up with the master key:

```bash
curl "$API/api/v1/admin/github-tasks/verify?githubLogin=octo-dev&repo=acme/widgets&number=12" \
  -H "X-API-Key: $MASTER_KEY"
```

## Live leaderboard over WebSocket

Connect to `/ws` and subscribe:

```json
{ "type": "subscribe", "channel": "leaderboard", "campaignId": "42" }
```

The server replies with `leaderboard_snapshot`, then sends `leaderboard_update` (top 10 with
`changes` marking each entry `new`, `up`, `down` or `same`) whenever awarded points change the
ranking. Bursts are coalesced (`LEADERBOARD_DEBOUNCE_MS`) and wallets are masked. Awards currently
trigger on referral credits, the campaign leaderboard the API already exposes.
