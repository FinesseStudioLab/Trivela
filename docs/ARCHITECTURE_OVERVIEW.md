# Trivela Architecture Overview

> 🔤 Unfamiliar with Soroban, XDR, instance storage, or persistent storage? See the
> **[Glossary](GLOSSARY.md)**.

This document gives contributors a quick map of the Trivela system, the trust boundaries, and how
data moves across contracts, backend, and frontend.

## System Diagram

```mermaid
flowchart LR
    U[User Wallet / Browser] --> F[Frontend React + Vite]
    F -->|REST /api/v1| B[Backend Express API]
    F -->|Soroban RPC calls| R[(Soroban RPC)]
    B -->|Health + config checks| R
    R --> C1[Rewards Contract]
    R --> C2[Campaign Contract]
    B --> D[(Campaign DB / in-memory store)]
    R -->|Soroban events SSE / poll| I[Event Indexer]
    I -->|upsert indexed_events| D
```

## Component Responsibilities

- `frontend/`
  - Renders campaigns, wallet UX, and claim/register actions.
  - Handles client-side loading/error states and route-level rendering recovery.
  - Reads API and contract configuration from `VITE_*` env values.

- `backend/`
  - Serves campaign CRUD endpoints under `/api/v1`.
  - Exposes health/config/metrics endpoints for operations and integrations.
  - Applies request logging, optional API-key auth for writes, and rate limiting.

- `contracts/rewards`
  - Tracks user points, credit events, and claims.
  - Enforces contract-level authorization and reward accounting.

- `contracts/campaign`
  - Tracks campaign lifecycle and participant registration.
  - Stores campaign-level constraints enforced on-chain.

- `backend/src/jobs/eventIndexer.js` *(Event Indexer)*
  - Subscribes to Soroban contract events via Horizon SSE, falling back to cursor-based polling.
  - Persists raw events to `indexed_events` and applies per-type projection handlers to derived
    tables (balances, participant records, vesting rows).
  - Durable cursor stored in `indexer_cursors`; resumes from last-seen event after restart.
  - Exactly-once ingestion via `UNIQUE(tx_hash, event_index)` deduplication.
  - Reorg-safe: events stay `tentative` until buried under `confirmationDepth` ledgers; a detected
    fork rewinds ingestion to the last confirmed watermark.
  - Bounded concurrency semaphore provides backpressure so the fetch loop never accumulates
    unbounded in-flight work.
  - Backfill script: `backend/scripts/indexer-backfill.mjs` replays a ledger range offline.

## Trust Model

- **User wallet signatures** are the source of truth for user-authorized contract actions.
- **Smart contracts** are authoritative for on-chain balances, claims, and campaign participation.
- **Backend API** is authoritative for off-chain campaign metadata served to the UI.
- **Frontend** is untrusted for business logic enforcement; it should only orchestrate and display
  state.

## Data Flows

### 1) Campaign browsing

1. Frontend calls `GET /api/v1/campaigns`.
2. Backend reads from campaign store and returns paginated data.
3. Frontend renders cards/details with loading and retry behavior.

### 2) Register in campaign

1. User connects wallet in frontend.
2. Frontend constructs/registers transaction via Soroban RPC.
3. Campaign contract validates rules and persists participant state.

### 3) Claim rewards

1. Frontend reads wallet points from rewards contract.
2. User submits claim action.
3. Rewards contract validates and updates on-chain balances/events.

### 4) Operational observability

1. Health checks: `/health`, `/health/rpc`.
2. Metrics scrape: `/metrics` (request totals, errors, route hit counters, uptime gauge).
3. Distributed traces via OpenTelemetry — see below.

### 5) Event indexing

1. The indexer opens an SSE stream to Horizon for new Soroban events (falls back to cursor-based
   polling when SSE is unavailable).
2. Each raw event is written to `indexed_events` with an idempotency key
   `(tx_hash, event_index)` so replaying a ledger range is safe.
3. A per-type projection handler updates derived tables — balances, participant counts, vesting
   rows — once the event reaches `confirmationDepth` ledgers of burial.
4. The last-seen cursor is persisted to `indexer_cursors`; on restart the indexer resumes from
   exactly that point, skipping nothing and duplicating nothing.
5. If a chain reorg is detected (ledger hash mismatch or replaced tx at a known slot), all events
   at or above the fork ledger are marked `reverted`, derived state is rolled back, and ingestion
   restarts from the last confirmed watermark.

## Event Indexer

```mermaid
flowchart TD
    RPC[(Soroban RPC / Horizon)]
    RPC -->|SSE stream or cursor poll| F[Fetch loop]
    F -->|raw event| S{Semaphore\nbackpressure}
    S -->|slot free| D[Dedup check\nUNIQUE tx_hash + event_index]
    D -->|new event| W[Write indexed_events\ntentative]
    W --> C{confirmationDepth\nreached?}
    C -->|yes| P[Projection handler\nupdate balances · participants · vesting]
    C -->|no| WAIT[Wait for more ledgers]
    D -->|duplicate| DROP[Skip]
    F -->|fork detected| REV[Revert tentative rows\nrewind cursor]
    P --> CURSOR[Persist cursor\nindexer_cursors]
```

### Key source files

| File | Purpose |
|------|---------|
| [`backend/src/jobs/eventIndexer.js`](../backend/src/jobs/eventIndexer.js) | Core indexer: SSE/poll loop, dedup, projections, reorg handling |
| [`backend/src/db/migrations/013_event_indexer_cursor.js`](../backend/src/db/migrations/013_event_indexer_cursor.js) | Schema for `indexer_cursors` |
| [`backend/src/db/migrations/024_indexer_events.js`](../backend/src/db/migrations/024_indexer_events.js) | Schema for `indexed_events` |
| [`backend/src/db/migrations/030_indexer_gap_detection.js`](../backend/src/db/migrations/030_indexer_gap_detection.js) | Gap detection and alerting |
| [`backend/src/db/migrations/032_indexer_reorg_safety.js`](../backend/src/db/migrations/032_indexer_reorg_safety.js) | Reorg audit trail in `indexer_reorgs` |
| [`backend/scripts/indexer-backfill.mjs`](../backend/scripts/indexer-backfill.mjs) | Offline replay of a past ledger range |

### Configuration

Set in `backend/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `INDEXER_CONFIRMATION_DEPTH` | `0` | Ledgers to wait before projecting an event. `0` projects on arrival; reorgs are still detected. |
| `INDEXER_CONCURRENCY` | `4` | Maximum events processed concurrently (semaphore limit). |
| `INDEXER_POLL_INTERVAL_MS` | `5000` | Polling interval when SSE is not available. |
| `INDEXER_SSE_ENABLED` | `true` | Set to `false` to force cursor polling regardless of SSE availability. |

## Observability stack

The backend ships three independent observability channels so SRE can pick whichever lens fits the
question:

| Lens    | Surface                            | Why                                                    |
| ------- | ---------------------------------- | ------------------------------------------------------ |
| Health  | `/health`, `/health/rpc`           | Boolean liveness + RPC reachability — page-able.       |
| Metrics | Prometheus scrape at `/metrics`    | Aggregate rates / errors / latencies — dashboard-able. |
| Traces  | OpenTelemetry → OTLP/HTTP exporter | Per-request causality — debug-able.                    |

### Distributed tracing (#288)

- Bootstrap lives in [`backend/src/tracing.js`](../backend/src/tracing.js). `initTracing()` runs
  once at process start (called from `index.js` BEFORE any other import that loads `http` /
  `express`).
- Auto-instrumentation: incoming Express requests + outbound `fetch` / `http` calls.
- Manual spans for DB queries, Soroban RPC calls, and the job runner — wrapped via the exported
  `withSpan(name, attrs, fn)` helper.
- Trace context is propagated to the frontend via the `traceparent` response header (added to
  `Access-Control-Expose-Headers`).
- `/health` and `/metrics` are excluded from tracing so the trace stream isn't drowned by
  healthchecks.

#### Configuration

Set in `backend/.env`:

- `OTEL_SERVICE_NAME` — defaults to `trivela-backend`.
- `OTEL_EXPORTER_OTLP_ENDPOINT` — e.g. `http://jaeger:4318`. **Unset = no export**, but `withSpan`
  still works as a no-op.
- `OTEL_EXPORTER_OTLP_HEADERS` — comma-separated `key=value` pairs for vendors that need auth
  (Honeycomb, Lightstep, etc.).

#### Local-dev quickstart

```bash
docker compose --profile tracing up jaeger
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 npm --prefix backend run dev
open http://localhost:16686
```

## Future: upgradeability

- Keep contract IDs stable while evolving logic by using Soroban Wasm upgrades plus explicit schema
  migrations.
- Move toward a deployer/governance-controlled upgrade authority instead of relying on a single
  long-lived admin key.
- Maintain a repeatable rollout sequence: install Wasm -> upgrade -> migrate -> verify
  `schema_version`.
- Full migration details and runbook: see `docs/upgradeability.md`.
