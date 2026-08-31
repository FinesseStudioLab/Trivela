# ADR-001: Use SQLite for campaign database

**Status:** Accepted  
**Date:** 2024-12-01

## Context

The Trivela backend needs a persistent store for off-chain campaign metadata (title, description,
image, timestamps, participant counts).  
Options considered: PostgreSQL, MySQL, SQLite, in-memory store.

The initial deployment target is a single-node server running alongside the backend process. The
data model is append-mostly (campaigns are created and updated infrequently) and the read load is
modest (paginated list + single campaign endpoints).

## Decision

Use **SQLite** as the campaign database, embedded directly in the backend process via
`better-sqlite3`.

## Reasons

1. **Zero-ops setup** — no separate DB server, no Docker service to manage for local dev or the
   initial staging deploy.
2. **Single-file backup** — `cp campaign.db campaign.db.bak` is the full backup procedure.
3. **Sufficient throughput** — SQLite handles thousands of concurrent readers and serialised writes
   well within the expected load profile.
4. **Smaller attack surface** — no database network port, no separate authentication layer.

## Consequences

- **Positive:** Contributors can run the full stack with `npm install && npm start` — no Docker
  required.
- **Positive:** E2E tests use an in-memory SQLite instance; no external service needed in CI.
- **Negative:** Horizontal scaling (multiple backend replicas writing to the same DB) is not
  possible without switching to a client/server database. A future ADR should address this when
  Trivela outgrows a single node.
- **Negative:** Large binary blobs (if ever needed) are less efficient in SQLite than in a dedicated
  store.

## Superseded by

Nothing yet. If concurrent write throughput becomes the bottleneck, evaluate PostgreSQL with `pg` +
connection pooling. Update this ADR at that time.
