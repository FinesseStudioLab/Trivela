# Trivela — Proposed Issues (Review Draft)

> **Status:** DRAFT for review. Nothing has been filed on GitHub yet. Once approved, these will be
> created on `FinesseStudioLab/Trivela` (authored as **joelpeace**), and the "Recommended Closures"
> at the bottom will be closed with the cited evidence.
>
> Each issue is scoped against the **actual codebase state** (audited 2026-06) so it represents
> real, not-yet-implemented work. Items that overlap an existing open issue are cross-referenced
> ("complements #NNN") and intentionally scoped to a distinct slice.
>
> Every issue uses the repo's existing label taxonomy and includes **Acceptance Criteria** plus a
> **Verification** section so reviewers can confirm completion by independent means (tests, on-chain
> calls, CI checks, docs review).

---

## Index

- **Epic A — ZK & Privacy** (NEW-001 … NEW-008)
- **Epic B — Token Standards & Payouts (SEP)** (NEW-009 … NEW-018)
- **Epic C — Account Abstraction & Gasless UX** (NEW-019 … NEW-023)
- **Epic D — On-chain Indexer & Data Pipeline** (NEW-024 … NEW-030)
- **Epic E — Backend Scale & Reliability** (NEW-031 … NEW-042)
- **Epic F — SRE, Observability & DR** (NEW-043 … NEW-052)
- **Epic G — Security Hardening** (NEW-053 … NEW-064)
- **Epic H — Anti-Sybil & Abuse Prevention** (NEW-065 … NEW-070)
- **Epic I — Gamification & Growth** (NEW-071 … NEW-078)
- **Epic J — Multi-Tenancy & Access Control** (NEW-079 … NEW-084)
- **Epic K — SDKs, CLI & Developer Experience** (NEW-085 … NEW-091)
- **Epic L — Mobile & Notifications** (NEW-092 … NEW-098)
- **Epic M — Analytics, BI & Experimentation** (NEW-099 … NEW-104)
- **Epic N — Frontend Robustness** (NEW-105 … NEW-112)
- **Epic O — Testing & QA Depth** (NEW-113 … NEW-120)
- **Epic P — Documentation** (NEW-121 … NEW-130)

**Total proposed: 130 new issues** (incl. 10 documentation issues). **Recommended closures: see
final section.**

---

## Epic A — ZK & Privacy

### NEW-001 · ZK membership proof for private allowlists (prove eligibility without revealing address)

- **Labels:** `enhancement`, `area: smart-contract`, `difficulty: hard`, `security`, `stellar`
- Complements existing Merkle allowlist (`contracts/campaign`,
  `backend/src/lib/allowlist/merkle.js`).

**Problem** Today eligibility uses a Merkle proof where the leaf (the participant address) is
revealed on-chain at registration. For privacy-sensitive campaigns (airdrops, grants, sensitive
cohorts) participants should be able to prove they belong to the allowlist **without** publishing
which leaf is theirs.

**Scope**

- [ ] Research Soroban-compatible ZK scheme (Groth16/PLONK verifier feasibility within
      CPU/instruction limits, or BLS12-381 host functions already in `soroban-env`).
- [ ] Add a circuit (Circom/Noir) proving "I know a preimage in the committed Merkle root" →
      nullifier.
- [ ] Add an on-chain verifier entrypoint `register_private(proof, public_inputs, nullifier)`.
- [ ] Store spent nullifiers to prevent re-use (see NEW-004).
- [ ] Backend endpoint to fetch proving inputs; frontend proof generation in a web worker.

**Acceptance Criteria**

- [ ] A participant can register proving membership without their G-address appearing in the tx
      args.
- [ ] Re-using the same proof/nullifier is rejected on-chain.
- [ ] Gas/instruction cost documented and within testnet limits.

**Verification**

- Contract unit + integration tests with valid/invalid/replayed proofs.
- Manual testnet registration where the explorer shows no participant address in call args.

### NEW-002 · zk proof-of-uniqueness (anti-sybil) for one-person-one-entry campaigns

- **Labels:** `enhancement`, `area: smart-contract`, `area: backend`, `difficulty: hard`, `security`
- Pairs with Epic H.

**Problem** Reward campaigns are sybil-magnets. We need a privacy-preserving way to enforce "one
entry per unique human/identity" without storing PII.

**Scope**

- [ ] Integrate a proof-of-personhood/uniqueness provider (e.g., semaphore-style identity group)
      behind an adapter interface.
- [ ] On-chain nullifier set keyed per campaign so the same identity can't enter twice.
- [ ] Adapter must be optional/per-campaign (flag in campaign config).

**Acceptance Criteria**

- [ ] Enabling uniqueness on a campaign blocks a second entry from the same identity nullifier.
- [ ] Disabled by default; existing campaigns unaffected.

**Verification**

- Integration test: two registrations, same identity → second reverts with a typed error.

### NEW-003 · Confidential reward balances via Pedersen commitments

- **Labels:** `enhancement`, `area: smart-contract`, `difficulty: hard`, `security`
- Complements rewards contract balance model.

**Problem** Point balances are public. Some operators want balances hidden while still being
provably correct.

**Scope**

- [ ] Represent balances as commitments; credits/claims update commitments with range proofs to
      prevent negatives/overflow.
- [ ] Provide an owner-only `reveal()` view (off-chain decommit).
- [ ] Feature-flagged contract variant to avoid regressing the public-points default.

**Acceptance Criteria**

- [ ] Balances are not readable from storage without the blinding factor.
- [ ] Range proofs reject invalid (negative/overflow) updates.

**Verification**

- Property tests over random credit/claim sequences asserting commitment soundness.

### NEW-004 · Nullifier registry contract for anonymous double-action prevention

- **Labels:** `enhancement`, `area: smart-contract`, `difficulty: medium`, `security`

**Problem** ZK flows (NEW-001/002) need a shared, audited nullifier store with TTL-aware storage to
avoid unbounded rent.

**Scope**

- [ ] Standalone `nullifiers` contract: `spend(nullifier)`, `is_spent(nullifier)`, namespaced per
      consumer contract.
- [ ] Authorization so only registered consumer contracts can spend.
- [ ] TTL/extension strategy documented (ties into `docs/TTL_STRATEGY.md`).

**Acceptance Criteria**

- [ ] Double-spend of a nullifier reverts.
- [ ] Only authorized consumers can write.

**Verification**

- Unit tests; cross-contract integration test from the campaign contract.

### NEW-005 · Private campaign voting / quadratic weighting (commit-reveal)

- **Labels:** `enhancement`, `area: smart-contract`, `difficulty: hard`

**Problem** Some campaigns want participants to vote/allocate (e.g., grant rounds) without early
signaling.

**Scope**

- [ ] Commit-reveal voting module: `commit(hash)`, `reveal(value, salt)`, tally after window.
- [ ] Optional quadratic weighting by points balance snapshot.

**Acceptance Criteria**

- [ ] Votes are hidden until the reveal window; late/invalid reveals rejected.

**Verification**

- Contract tests covering commit/reveal/tally and edge timings.

### NEW-006 · ZK proving service (backend) + browser proof generation

- **Labels:** `enhancement`, `area: backend`, `area: frontend`, `difficulty: hard`, `performance`

**Problem** Proof generation is heavy; we need a clean split between server-provided public inputs
and client-side proving.

**Scope**

- [ ] Backend endpoint serving Merkle path / public signals for a campaign.
- [ ] Frontend WASM prover in a web worker with progress UI.
- [ ] Caching of proving keys; bundle-size budget.

**Acceptance Criteria**

- [ ] Proof generated client-side without blocking the main thread.
- [ ] Public inputs never leak the user's private leaf to the server.

**Verification**

- E2E test generating a proof and submitting registration on testnet.

### NEW-007 · ZK feature flagging & graceful fallback to Merkle

- **Labels:** `enhancement`, `area: smart-contract`, `area: frontend`, `difficulty: medium`

**Problem** ZK must be opt-in per campaign and degrade to standard Merkle registration when disabled
or unsupported.

**Scope**

- [ ] Per-campaign `privacy_mode` enum (`none` | `merkle` | `zk`).
- [ ] UI auto-selects the right registration path; clear messaging when ZK unsupported in a browser.

**Acceptance Criteria**

- [ ] Switching modes does not corrupt existing participant state.

**Verification**

- Tests across all three modes; UI snapshot per mode.

### NEW-008 · Threat model & cryptographic review doc for ZK subsystem

- **Labels:** `documentation`, `area: documentation`, `security`, `difficulty: medium`

**Problem** ZK code needs a written trust model (trusted setup, soundness assumptions, nullifier
domain separation).

**Scope**

- [ ] `docs/ZK_DESIGN.md` covering circuits, public/private inputs, trusted setup, and known
      limitations.

**Acceptance Criteria**

- [ ] Doc reviewed by ≥2 maintainers; linked from README and `docs/ARCHITECTURE_OVERVIEW.md`.

**Verification**

- PR review; markdown lint + link check in CI.

---

## Epic B — Token Standards & Payouts (SEP)

### NEW-009 · SEP-41 compliant reward token interface

- **Labels:** `enhancement`, `area: smart-contract`, `difficulty: hard`, `stellar`, `mainnet`

**Problem** The rewards contract tracks internal "points" but is not a standard token. SEP-41
compliance lets points interoperate with wallets, DEXes, and tooling.

**Scope**

- [ ] Implement SEP-41 token interface (`transfer`, `balance`, `allowance`, `approve`, `decimals`,
      `name`, `symbol`) as an optional token-backed mode.
- [ ] Map existing point credits/claims onto token mint/burn semantics.

**Acceptance Criteria**

- [ ] Contract passes a SEP-41 conformance test suite.
- [ ] Wallets can display the reward token balance.

**Verification**

- Conformance tests; testnet display in Freighter.

### NEW-010 · Real asset payout on claim (XLM/USDC) via Stellar Asset Contract

- **Labels:** `enhancement`, `area: smart-contract`, `area: backend`, `difficulty: hard`, `mainnet`

**Problem** Claims currently settle internal points only. High-value campaigns need to pay out a
real asset.

**Scope**

- [ ] Allow a campaign to fund a reserve in a chosen SAC asset and pay it out on `claim` at a
      configured rate (extends existing `redeem`/`redemption_rate`).
- [ ] Reserve accounting, insufficient-reserve handling, and admin top-up flow.

**Acceptance Criteria**

- [ ] A user claiming receives the configured asset to their wallet.
- [ ] Reserve underflow reverts cleanly with a typed error.

**Verification**

- Testnet claim paying USDC test asset; reserve balance assertions.

### NEW-011 · SEP-10 web auth (wallet sign-in) for backend sessions

- **Labels:** `enhancement`, `area: backend`, `area: frontend`, `difficulty: medium`, `security`,
  `stellar`

**Problem** Backend admin/user actions rely on API keys; there's no cryptographic wallet login.

**Scope**

- [ ] Implement SEP-10 challenge/response; issue short-lived JWT bound to the G-address.
- [ ] Frontend "Sign in with Stellar" using the wallet provider abstraction.

**Acceptance Criteria**

- [ ] A user authenticates by signing a SEP-10 challenge; protected routes accept the resulting
      token.

**Verification**

- Integration tests for challenge issuance, signature verification, expiry, and replay rejection.

### NEW-012 · Claimable balances for unclaimed/expired rewards

- **Labels:** `enhancement`, `area: smart-contract`, `difficulty: medium`, `stellar`

**Problem** When a user never claims, value is stuck. Stellar claimable balances allow time-boxed,
recoverable payouts.

**Scope**

- [ ] On campaign end, mint claimable balances for eligible-but-unclaimed users with a claw-back
      predicate to the operator after a grace window.

**Acceptance Criteria**

- [ ] Unclaimed rewards become claimable balances; operator can reclaim after grace.

**Verification**

- Testnet flow creating and clawing back a claimable balance.

### NEW-013 · Path payment support for multi-asset claims

- **Labels:** `enhancement`, `area: backend`, `difficulty: medium`, `stellar`

**Problem** Users may want to receive a different asset than the reserve holds.

**Scope**

- [ ] Backend builds a path payment (strict-receive) so a user can claim in their preferred asset
      when liquidity exists.

**Acceptance Criteria**

- [ ] Claim in asset B succeeds when a path from reserve asset A exists; clear error when no path.

**Verification**

- Integration test against testnet DEX with a seeded path.

### NEW-014 · SEP-41 allowance/approve flows in rewards contract

- **Labels:** `enhancement`, `area: smart-contract`, `difficulty: medium`

**Problem** Delegated spending (e.g., a dApp spending on a user's behalf) needs allowances.
(Distinct from delegation #323 which is claim-rights.)

**Scope**

- [ ] `approve(spender, amount, expiration_ledger)`, `transfer_from`, allowance read.

**Acceptance Criteria**

- [ ] Spender can move up to approved amount before expiry; over-spend reverts.

**Verification**

- Unit tests including expiry edge cases.

### NEW-015 · Reward token metadata & asset TOML publishing

- **Labels:** `enhancement`, `area: backend`, `difficulty: easy`, `stellar`, `documentation`

**Problem** For wallets/explorers to display the token nicely, publish `stellar.toml` (SEP-1)
metadata.

**Scope**

- [ ] Generate/serve `.well-known/stellar.toml` with currency entries for issued reward tokens.

**Acceptance Criteria**

- [ ] `stellar.toml` validates and resolves the token's name/image/decimals.

**Verification**

- SEP-1 validator; manual wallet display check.

### NEW-016 · Fee reserve & minimum-balance management for operator accounts

- **Labels:** `enhancement`, `area: backend`, `difficulty: medium`, `stellar`, `observability`

**Problem** Operator accounts that sign credits/payouts can run out of XLM for fees/min-balance,
silently breaking flows.

**Scope**

- [ ] Monitor operator account XLM; alert + optional auto-topup hook below threshold.

**Acceptance Criteria**

- [ ] Low-balance condition surfaces an alert before failures occur.

**Verification**

- Unit test of threshold logic; metric exported.

### NEW-017 · Batch payout transaction builder (fee-efficient claims)

- **Labels:** `enhancement`, `area: backend`, `difficulty: medium`, `performance`, `stellar`
- Complements on-chain `batch_credit`.

**Problem** Mass payouts as individual txs are slow/expensive.

**Scope**

- [ ] Server batches multiple payouts into multi-op transactions with size/fee bounds and
      partial-failure handling.

**Acceptance Criteria**

- [ ] N payouts settle in ⌈N/k⌉ transactions; per-op failures reported without failing the batch
      where possible.

**Verification**

- Load test issuing 1k payouts; assert tx count and success accounting.

### NEW-018 · Tokenomics & rewards-economics documentation

- **Labels:** `documentation`, `area: documentation`, `difficulty: medium`

**Problem** There's no written model of how points/tokens/reserves/redemption interact economically.

**Scope**

- [ ] `docs/TOKENOMICS.md`: points→token→asset flow, redemption math, reserve solvency, inflation
      controls.

**Acceptance Criteria**

- [ ] Doc covers every value-moving function with invariants.

**Verification**

- Cross-check against contract functions; maintainer review.

---

## Epic C — Account Abstraction & Gasless UX

### NEW-019 · Passkey (WebAuthn) smart-wallet support

- **Labels:** `enhancement`, `area: frontend`, `area: smart-contract`, `difficulty: hard`, `stellar`

**Problem** Seed-phrase wallets are a major onboarding barrier for "thousands of users." Soroban
smart wallets with passkeys (secp256r1) enable web2-grade onboarding.

**Scope**

- [ ] Integrate a passkey smart-wallet (deploy-on-first-use) as a wallet provider in the existing
      abstraction (`frontend/src/lib/wallet`).
- [ ] Sign Soroban auth entries with the device passkey.

**Acceptance Criteria**

- [ ] A new user creates a wallet with a passkey and registers for a campaign without a seed phrase.

**Verification**

- E2E on testnet using a virtual authenticator.

### NEW-020 · Fee-bump / sponsored transactions (gasless registration & claim)

- **Labels:** `enhancement`, `area: backend`, `difficulty: medium`, `stellar`

**Problem** New users without XLM can't pay fees. Sponsoring fees removes the first-tx friction.

**Scope**

- [ ] Backend fee-sponsor service that wraps user txs in fee-bump transactions with abuse limits
      (per-IP/per-identity quotas, tie into rate limiting).

**Acceptance Criteria**

- [ ] A user with 0 XLM completes registration via a sponsored tx within quota.

**Verification**

- Integration test; quota exhaustion returns 429.

### NEW-021 · Sponsored account creation + reserve sponsorship

- **Labels:** `enhancement`, `area: backend`, `difficulty: medium`, `stellar`

**Problem** Brand-new addresses need account creation + min-balance reserves.

**Scope**

- [ ] Sponsored reserve creation flow so users don't need pre-funding; sponsorship revocation on
      cleanup.

**Acceptance Criteria**

- [ ] Unfunded address becomes usable via sponsorship; sponsor can later reclaim reserves.

**Verification**

- Testnet flow; assert sponsoring/sponsored relationships.

### NEW-022 · Soroban auth-entry batching for multi-step flows

- **Labels:** `enhancement`, `area: frontend`, `difficulty: medium`, `dx`, `stellar`

**Problem** Register→credit→claim can require multiple signatures; batching improves UX.

**Scope**

- [ ] Compose multi-contract auth entries into a single user approval where protocol allows.

**Acceptance Criteria**

- [ ] A multi-step flow requires one signature instead of N.

**Verification**

- E2E measuring signature prompts before/after.

### NEW-023 · Wallet session persistence & auto-reconnect

- **Labels:** `enhancement`, `area: frontend`, `difficulty: easy`, `dx`

**Problem** Users must reconnect their wallet on every reload.

**Scope**

- [ ] Persist the selected provider + address (not keys) and auto-reconnect with a clear disconnect
      control.

**Acceptance Criteria**

- [ ] After reload, the wallet reconnects without re-selecting a provider.

**Verification**

- E2E reload test; security review confirms no key material persisted.

---

## Epic D — On-chain Indexer & Data Pipeline

### NEW-024 · Dedicated event indexer service (all contract events → queryable store)

- **Labels:** `enhancement`, `area: backend`, `indexer`, `difficulty: hard`, `stellar`
- Builds on `backend/src/jobs/eventIndexer.js`.

**Problem** The current indexer job is minimal. A robust, restartable indexer is foundational for
analytics, leaderboards, and APIs at scale.

**Scope**

- [ ] Stream all rewards/campaign events with durable cursor checkpointing and idempotent upserts.
- [ ] Normalize events into typed tables; expose health/lag metrics.

**Acceptance Criteria**

- [ ] Indexer resumes from last cursor after restart with zero duplicates.
- [ ] Lag metric exported and alertable.

**Verification**

- Kill/restart test; assert no gaps/dups; metric present.

### NEW-025 · Indexer reorg / failed-ledger handling

- **Labels:** `enhancement`, `area: backend`, `indexer`, `difficulty: medium`, `stellar`

**Problem** Transient RPC errors or rollbacks can corrupt indexed state.

**Scope**

- [ ] Detect ledger gaps; re-fetch and reconcile; quarantine unparseable events.

**Acceptance Criteria**

- [ ] Injected gap/duplicate is reconciled automatically.

**Verification**

- Fault-injection test.

### NEW-026 · Materialized analytics tables from indexed events

- **Labels:** `enhancement`, `area: backend`, `indexer`, `performance`, `difficulty: medium`

**Problem** Computing analytics on the fly is expensive at scale.

**Scope**

- [ ] Rollups: participants/day, credits/day, claims/day, per-campaign funnels, refreshed
      incrementally.

**Acceptance Criteria**

- [ ] Dashboard queries hit rollups (<50ms) instead of scanning raw events.

**Verification**

- Benchmark before/after.

### NEW-027 · Public read API over indexed data (cursor-paginated)

- **Labels:** `enhancement`, `area: backend`, `indexer`, `difficulty: medium`
- Complements GraphQL #336 (this is REST + indexed source of truth).

**Problem** Third parties need a stable, fast read API for campaign/participant history.

**Scope**

- [ ] `/api/v1/index/*` endpoints sourced from indexed tables with cursor pagination and ETag
      caching.

**Acceptance Criteria**

- [ ] Endpoints documented in `openapi.yaml`; stable under load.

**Verification**

- Contract tests + OpenAPI validation in CI.

### NEW-028 · Indexer backfill tool (historical replay from genesis ledger)

- **Labels:** `enhancement`, `area: backend`, `indexer`, `difficulty: medium`, `dx`

**Problem** New deployments / schema changes require replaying history.

**Scope**

- [ ] CLI to backfill from a start ledger with rate-limiting and progress reporting.

**Acceptance Criteria**

- [ ] Full backfill reproduces identical state to incremental indexing.

**Verification**

- Determinism test comparing backfilled vs live-indexed snapshots.

### NEW-029 · Data export to warehouse (Parquet/CSV → S3) for BI

- **Labels:** `enhancement`, `area: backend`, `indexer`, `difficulty: medium`

**Problem** Operators want their data in BI tools.

**Scope**

- [ ] Scheduled export of indexed tables to object storage (reuse `backend/src/storage`).

**Acceptance Criteria**

- [ ] Daily export lands in storage with a manifest; re-runnable idempotently.

**Verification**

- Job test writing to local/S3 adapter.

### NEW-030 · Indexer observability dashboard (lag, throughput, errors)

- **Labels:** `enhancement`, `area: backend`, `observability`, `indexer`, `difficulty: easy`

**Problem** Indexer health must be visible.

**Scope**

- [ ] Prometheus metrics + a Grafana dashboard JSON committed to the repo.

**Acceptance Criteria**

- [ ] Dashboard shows lag, events/s, error rate.

**Verification**

- Dashboard loads against local Prometheus.

---

## Epic E — Backend Scale & Reliability

### NEW-031 · Idempotency keys for all write endpoints

- **Labels:** `enhancement`, `area: backend`, `difficulty: medium`, `security`, `performance`

**Problem** Network retries can double-create campaigns or double-submit actions.

**Scope**

- [ ] `Idempotency-Key` header; store + replay first response within a TTL window.

**Acceptance Criteria**

- [ ] Replaying a request with the same key returns the original result, no duplicate side effects.

**Verification**

- Integration test issuing duplicate POSTs.

### NEW-032 · Distributed job locking for multi-instance deployments

- **Labels:** `enhancement`, `area: backend`, `infra`, `difficulty: medium`
- Builds on `jobRunner.js`.

**Problem** Running >1 backend pod will double-run scheduled jobs (indexer, auto-deactivation #339).

**Scope**

- [ ] Redis/Postgres advisory-lock-based leader election per job.

**Acceptance Criteria**

- [ ] With N pods, each scheduled job runs exactly once per tick.

**Verification**

- Multi-instance test asserting single execution.

### NEW-033 · Durable job queue with dead-letter & retries (replace ad-hoc runner)

- **Labels:** `enhancement`, `area: backend`, `infra`, `difficulty: hard`
- Builds on `sqliteFailedJobRepository.js`.

**Problem** Failed background work needs durable retry with backoff and a DLQ for inspection.

**Scope**

- [ ] Queue abstraction (Redis-backed in prod, in-memory in dev) with exponential backoff + DLQ +
      admin replay endpoint.

**Acceptance Criteria**

- [ ] A failing job retries with backoff then lands in DLQ; admin can replay it.

**Verification**

- Unit + integration tests covering retry/backoff/DLQ.

### NEW-034 · Read/write DB split & Postgres read replicas

- **Labels:** `enhancement`, `area: backend`, `infra`, `performance`, `difficulty: hard`
- Builds on `dal/pg`.

**Problem** Read-heavy traffic (campaign lists) will saturate the primary.

**Scope**

- [ ] Route reads to replicas with replica-lag awareness and write-after-read consistency for the
      writer's own session.

**Acceptance Criteria**

- [ ] Reads served from replica; a write is immediately visible to the same client.

**Verification**

- Integration test with simulated replica lag.

### NEW-035 · Table partitioning for high-volume participant/event tables

- **Labels:** `enhancement`, `area: backend`, `infra`, `performance`, `difficulty: medium`

**Problem** Participant/event tables grow unbounded across many campaigns.

**Scope**

- [ ] Partition by campaign_id/time; migration + query plan validation.

**Acceptance Criteria**

- [ ] Hot queries use partition pruning (EXPLAIN confirms).

**Verification**

- EXPLAIN ANALYZE in tests; migration round-trip.

### NEW-036 · Redis caching layer for hot reads with explicit invalidation

- **Labels:** `enhancement`, `area: backend`, `performance`, `difficulty: medium`
- Reuses existing Redis option from rate limiting.

**Problem** Campaign detail/list reads repeatedly hit the DB and RPC.

**Scope**

- [ ] Cache-aside for campaign reads; invalidate on write; per-key TTL; stampede protection.

**Acceptance Criteria**

- [ ] Cache hit ratio measurable; writes invalidate within one request.

**Verification**

- Tests for hit/miss/invalidate; metric exported.

### NEW-037 · Circuit breaker & backpressure on Soroban RPC calls

- **Labels:** `enhancement`, `area: backend`, `infra`, `stellar`, `difficulty: medium`
- Complements RPC pool/failover #340.

**Problem** A degraded RPC can cascade into total backend failure.

**Scope**

- [ ] Circuit breaker per upstream; shed load with `503 + Retry-After` when open.

**Acceptance Criteria**

- [ ] Simulated RPC outage trips the breaker; service stays responsive for cached/read paths.

**Verification**

- Fault-injection test.

### NEW-038 · Request timeouts, deadlines & cancellation propagation

- **Labels:** `enhancement`, `area: backend`, `performance`, `difficulty: easy`

**Problem** Long upstream calls can pile up and exhaust the event loop / pool.

**Scope**

- [ ] Per-route timeouts; abort upstream calls when the client disconnects.

**Acceptance Criteria**

- [ ] A slow upstream returns a timely 504 and releases resources.

**Verification**

- Test with an artificially slow upstream.

### NEW-039 · Connection-pool sizing, saturation metrics & safeguards

- **Labels:** `enhancement`, `area: backend`, `observability`, `performance`, `difficulty: easy`

**Problem** Pool exhaustion is a common production outage with no current visibility.

**Scope**

- [ ] Export pool in-use/idle/wait metrics; fail fast with a clear error when saturated.

**Acceptance Criteria**

- [ ] Saturation is observable and returns a typed 503 rather than hanging.

**Verification**

- Load test driving the pool to saturation.

### NEW-040 · Graceful shutdown for in-flight jobs & SSE/WS connections

- **Labels:** `enhancement`, `area: backend`, `infra`, `difficulty: easy`
- Complements #150 (HTTP readiness split).

**Problem** SIGTERM during a deploy can drop in-flight jobs and streams.

**Scope**

- [ ] Drain HTTP, finish/checkpoint jobs, close streams within a grace period.

**Acceptance Criteria**

- [ ] No dropped work on rolling deploy; readiness flips before drain.

**Verification**

- Deploy simulation sending SIGTERM under load.

### NEW-041 · Multi-layer rate limiting (global + per-identity + per-route, sliding window)

- **Labels:** `enhancement`, `area: backend`, `security`, `performance`, `difficulty: medium`
- Extends existing limiter; complements per-route #465.

**Problem** Current limiter is single-tier; abuse patterns need layered, sliding-window limits.

**Scope**

- [ ] Composable limiters (global capacity + per-identity + per-route) with shared Redis store.

**Acceptance Criteria**

- [ ] Each layer enforces independently; headers reflect the binding limit.

**Verification**

- Unit tests per layer + integration.

### NEW-042 · Tenant-aware quota & usage metering

- **Labels:** `enhancement`, `area: backend`, `difficulty: medium`, `performance`
- Pairs with Epic J.

**Problem** For many operators, fair-use quotas and usage metering are needed.

**Scope**

- [ ] Per-tenant quotas + usage counters; soft/hard limits; usage export.

**Acceptance Criteria**

- [ ] Exceeding a tenant quota is enforced and reported.

**Verification**

- Integration tests across tenants.

---

## Epic F — SRE, Observability & DR

### NEW-043 · Define SLOs/SLIs and error budgets

- **Labels:** `documentation`, `observability`, `infra`, `difficulty: medium`

**Problem** No formal reliability targets exist to guide alerting and release decisions.

**Scope**

- [ ] `docs/SLO.md`: availability/latency SLIs, targets, error-budget policy.

**Acceptance Criteria**

- [ ] SLIs map to actual exported metrics.

**Verification**

- Metric names cross-checked against code.

### NEW-044 · Prometheus alert rules (latency, error rate, RPC, indexer lag)

- **Labels:** `enhancement`, `observability`, `infra`, `difficulty: medium`

**Problem** Metrics exist but there are no alerts.

**Scope**

- [ ] Commit alert rules; wire to a notification channel; document thresholds.

**Acceptance Criteria**

- [ ] Synthetic breach fires an alert.

**Verification**

- `promtool` rule tests in CI.

### NEW-045 · Grafana dashboards as code

- **Labels:** `enhancement`, `observability`, `infra`, `difficulty: easy`

**Problem** No committed dashboards for API/DB/RPC/indexer.

**Scope**

- [ ] Provision dashboards via JSON/Grafana provisioning, committed to the repo.

**Acceptance Criteria**

- [ ] Dashboards import cleanly and render against local metrics.

**Verification**

- Local stack import test.

### NEW-046 · Automated database backups + restore runbook

- **Labels:** `enhancement`, `infra`, `security`, `difficulty: medium`
- Extends `docs/RUNBOOK.md`.

**Problem** No automated, tested backup/restore for Postgres.

**Scope**

- [ ] Scheduled encrypted backups to object storage; documented restore procedure.

**Acceptance Criteria**

- [ ] Restore from backup reproduces a working DB.

**Verification**

- Restore drill in CI/staging.

### NEW-047 · Disaster-recovery plan & RTO/RPO targets

- **Labels:** `documentation`, `infra`, `difficulty: medium`

**Problem** No documented DR strategy or recovery objectives.

**Scope**

- [ ] `docs/DR_PLAN.md`: failure scenarios, RTO/RPO, failover steps, contract redeploy plan.

**Acceptance Criteria**

- [ ] Each critical component has a recovery path.

**Verification**

- Tabletop review by maintainers.

### NEW-048 · Synthetic uptime & user-journey monitoring

- **Labels:** `enhancement`, `observability`, `infra`, `difficulty: easy`

**Problem** We only know about outages reactively.

**Scope**

- [ ] Scheduled synthetic checks for health + a register→claim canary on testnet.

**Acceptance Criteria**

- [ ] A broken canary alerts within minutes.

**Verification**

- Force a canary failure.

### NEW-049 · Chaos engineering tests (RPC kill, DB latency, pod kill)

- **Labels:** `enhancement`, `testing`, `infra`, `difficulty: hard`

**Problem** Resilience features (breaker, retries, failover) aren't continuously validated.

**Scope**

- [ ] Chaos scenarios in staging asserting graceful degradation.

**Acceptance Criteria**

- [ ] System meets degraded-mode expectations under each fault.

**Verification**

- Scripted chaos run with pass/fail assertions.

### NEW-050 · Structured audit-log tamper-evidence (hash chaining)

- **Labels:** `enhancement`, `area: backend`, `security`, `difficulty: medium`
- Builds on `auditLogRepository`.

**Problem** Audit logs can be altered without detection.

**Scope**

- [ ] Hash-chain each audit entry (prev-hash) + periodic anchor; verification endpoint.

**Acceptance Criteria**

- [ ] Tampering with any past entry is detectable.

**Verification**

- Test mutating a row and asserting chain-break detection.

### NEW-051 · Horizontal Pod Autoscaling + load/resource tuning

- **Labels:** `enhancement`, `infra`, `performance`, `difficulty: medium`
- Builds on `k8s/` + `helm/`.

**Problem** No autoscaling config; manifests use static replicas.

**Scope**

- [ ] HPA on CPU + custom metrics (RPS/queue depth); resource requests/limits tuned from load tests.

**Acceptance Criteria**

- [ ] Load spike scales pods; scale-down is stable.

**Verification**

- Load test in staging observing replica counts.

### NEW-052 · Incident response playbook & on-call runbook

- **Labels:** `documentation`, `infra`, `difficulty: easy`
- Extends `docs/RUNBOOK.md`.

**Problem** No standardized incident process.

**Scope**

- [ ] Severity levels, comms templates, escalation, postmortem template.

**Acceptance Criteria**

- [ ] A dry-run incident follows the playbook end-to-end.

**Verification**

- Tabletop exercise.

---

## Epic G — Security Hardening

### NEW-053 · Formal verification of contract invariants

- **Labels:** `enhancement`, `area: smart-contract`, `security`, `difficulty: hard`, `mainnet`
- Complements property tests #362 and audit prep #316.

**Problem** Critical invariants (no negative balances, claimed ≤ credited, reserve solvency) deserve
machine-checked proofs.

**Scope**

- [ ] Encode key invariants with a verifier (e.g., Kani) in CI.

**Acceptance Criteria**

- [ ] Invariants proven or counterexamples surfaced; runs in CI.

**Verification**

- CI job; intentionally-broken branch must fail.

### NEW-054 · Bug bounty program + security.txt + disclosure policy

- **Labels:** `documentation`, `security`, `difficulty: easy`, `mainnet`

**Problem** No coordinated vulnerability disclosure path.

**Scope**

- [ ] `SECURITY.md` disclosure policy, `.well-known/security.txt`, scope & rewards.

**Acceptance Criteria**

- [ ] Researchers have a documented, monitored reporting channel.

**Verification**

- Policy review; security.txt validates.

### NEW-055 · SBOM generation + provenance (SLSA) in CI

- **Labels:** `enhancement`, `ci`, `security`, `difficulty: medium`, `mainnet`

**Problem** No software bill of materials or build provenance for releases.

**Scope**

- [ ] Generate SBOM (CycloneDX) for npm + cargo; attach to releases; provenance attestation.

**Acceptance Criteria**

- [ ] Each release ships an SBOM + verifiable provenance.

**Verification**

- CI artifact present; SBOM validates.

### NEW-056 · Container image signing (cosign) + verification at deploy

- **Labels:** `enhancement`, `ci`, `infra`, `security`, `difficulty: medium`

**Problem** Images aren't signed; supply-chain tampering is possible.

**Scope**

- [ ] Sign images with cosign; admission/deploy step verifies signatures.

**Acceptance Criteria**

- [ ] Unsigned/altered images are rejected at deploy.

**Verification**

- Attempt to deploy an unsigned image → blocked.

### NEW-057 · Per-component threat models (STRIDE)

- **Labels:** `documentation`, `security`, `difficulty: medium`
- Extends contract-only #316 to backend/frontend/infra.

**Problem** No systematic threat modeling across the stack.

**Scope**

- [ ] `docs/threat-models/*` per component with mitigations mapped to code/tests.

**Acceptance Criteria**

- [ ] Each component has identified threats + mitigations + owners.

**Verification**

- Maintainer review.

### NEW-058 · Brute-force/lockout protection on auth endpoints

- **Labels:** `enhancement`, `area: backend`, `security`, `difficulty: easy`
- Pairs with SEP-10 #NEW-011 and API key auth.

**Problem** Auth/login endpoints need stricter, separate throttling + temporary lockout.

**Scope**

- [ ] Progressive delays + lockout on repeated failures; alerting on spikes.

**Acceptance Criteria**

- [ ] Repeated failures trigger lockout; legitimate users unaffected.

**Verification**

- Integration test simulating brute force.

### NEW-059 · CSP hardening + Subresource Integrity (SRI) for frontend

- **Labels:** `enhancement`, `area: frontend`, `security`, `difficulty: easy`
- Builds on `securityHeaders.js` and `docs/SECURITY_XSS_PREVENTION.md`.

**Problem** CSP can be tightened and third-party assets pinned with SRI.

**Scope**

- [ ] Strict CSP (nonce-based), SRI hashes for external scripts, report-uri.

**Acceptance Criteria**

- [ ] CSP blocks inline/un-pinned scripts; violations reported.

**Verification**

- Security header scanner (e.g., the existing security-headers CI job) passes the stricter policy.

### NEW-060 · Automated secret rotation + leak response runbook

- **Labels:** `enhancement`, `security`, `infra`, `difficulty: medium`
- Complements secrets scanning #485.

**Problem** No rotation policy for API keys / signing secrets.

**Scope**

- [ ] Rotation tooling + documented response when a secret leaks (revoke, rotate, audit).

**Acceptance Criteria**

- [ ] A simulated leak is contained via the documented steps.

**Verification**

- Dry-run rotation.

### NEW-061 · Dependency pinning + reproducible builds verification

- **Labels:** `enhancement`, `ci`, `security`, `difficulty: easy`

**Problem** Builds should be reproducible and dependencies pinned/verified.

**Scope**

- [ ] Lockfile integrity checks; cargo `--locked`; verify WASM hash reproducibility in CI.

**Acceptance Criteria**

- [ ] Re-building the same commit yields identical WASM hashes.

**Verification**

- CI double-build hash comparison.

### NEW-062 · Input fuzzing for backend API (schema + property fuzz)

- **Labels:** `enhancement`, `area: backend`, `testing`, `security`, `difficulty: medium`

**Problem** API inputs are validated with Zod but not fuzzed.

**Scope**

- [ ] Schema-driven fuzzing of all endpoints; assert no 5xx/crashes on malformed input.

**Acceptance Criteria**

- [ ] Fuzz run finds no unhandled errors.

**Verification**

- CI fuzz job with a seed corpus.

### NEW-063 · Wallet signature / Soroban auth replay protection review

- **Labels:** `enhancement`, `area: smart-contract`, `area: backend`, `security`,
  `difficulty: medium`

**Problem** Need an explicit, tested guarantee that signed actions can't be replayed
(nonces/auth-entry expiry).

**Scope**

- [ ] Audit all signed flows; add/verify nonce or auth-entry expiry coverage; document.

**Acceptance Criteria**

- [ ] Replaying any captured signed action reverts.

**Verification**

- Replay tests per signed entrypoint.

### NEW-064 · Penetration-test checklist + remediation tracking

- **Labels:** `documentation`, `security`, `difficulty: easy`, `mainnet`

**Problem** No structured pre-mainnet pentest process.

**Scope**

- [ ] OWASP ASVS-aligned checklist; findings tracked as issues with severities.

**Acceptance Criteria**

- [ ] Checklist completed before mainnet tag.

**Verification**

- Checklist artifact + linked remediation issues.

---

## Epic H — Anti-Sybil & Abuse Prevention

### NEW-065 · Pluggable proof-of-personhood adapter

- **Labels:** `enhancement`, `area: backend`, `area: smart-contract`, `security`, `difficulty: hard`

**Problem** Operators need optional uniqueness without mandating one vendor.

**Scope**

- [ ] Adapter interface with ≥1 implementation; per-campaign toggle; nullifier integration
      (NEW-004).

**Acceptance Criteria**

- [ ] Enabling it blocks duplicate humans; disabled = no change.

**Verification**

- Integration test with a mock provider.

### NEW-066 · Velocity & device-fingerprint risk scoring on registration

- **Labels:** `enhancement`, `area: backend`, `security`, `difficulty: medium`

**Problem** Sudden bursts from one source indicate abuse.

**Scope**

- [ ] Risk score from IP/device/velocity; soft-block or step-up challenge above threshold.

**Acceptance Criteria**

- [ ] High-risk attempts are challenged/blocked; configurable thresholds.

**Verification**

- Unit tests of scoring; integration of challenge path.

### NEW-067 · CAPTCHA / Turnstile step-up on suspicious registration

- **Labels:** `enhancement`, `area: frontend`, `area: backend`, `security`, `difficulty: easy`

**Problem** Automated registration needs a human check when risk is high.

**Scope**

- [ ] Integrate a privacy-respecting CAPTCHA, only triggered on elevated risk.

**Acceptance Criteria**

- [ ] Low-risk users never see a CAPTCHA; high-risk must pass it.

**Verification**

- E2E for both paths.

### NEW-068 · On-chain reputation score per address

- **Labels:** `enhancement`, `area: smart-contract`, `difficulty: medium`

**Problem** Repeat good actors should be distinguishable from fresh sybils.

**Scope**

- [ ] Reputation accrual from participation/claims; readable by campaigns to gate eligibility.

**Acceptance Criteria**

- [ ] Campaigns can require a minimum reputation.

**Verification**

- Contract tests for accrual + gating.

### NEW-069 · Allowlist anomaly detection (bulk-import sanity checks)

- **Labels:** `enhancement`, `area: backend`, `security`, `difficulty: easy`
- Builds on allowlist CSV import (#514).

**Problem** Malicious/erroneous bulk imports could poison eligibility.

**Scope**

- [ ] Detect duplicates, suspicious patterns, and oversized imports; require confirmation.

**Acceptance Criteria**

- [ ] Anomalous import is flagged before committing the Merkle root.

**Verification**

- Tests with crafted CSVs.

### NEW-070 · Per-campaign abuse dashboard & manual review queue

- **Labels:** `enhancement`, `area: frontend`, `area: backend`, `security`, `difficulty: medium`
- Complements moderation report #355.

**Problem** Operators need to see and act on suspected abuse.

**Scope**

- [ ] Surface risk signals + actions (block/allow) with audit logging.

**Acceptance Criteria**

- [ ] Operator can review and action flagged registrations.

**Verification**

- E2E reviewing and actioning an item.

---

## Epic I — Gamification & Growth

### NEW-071 · NFT achievement badges (Soroban NFT contract)

- **Labels:** `enhancement`, `area: smart-contract`, `difficulty: hard`, `stellar`

**Problem** Badges drive engagement and retention.

**Scope**

- [ ] Minimal NFT contract; mint badges for milestones (first claim, top-rank, streaks).

**Acceptance Criteria**

- [ ] Earning a milestone mints a non-transferable-or-transferable badge per config.

**Verification**

- Contract tests; testnet mint visible in a wallet.

### NEW-072 · Soulbound participation tokens (non-transferable proof)

- **Labels:** `enhancement`, `area: smart-contract`, `difficulty: medium`

**Problem** Proof-of-participation should be bound to the participant.

**Scope**

- [ ] Soulbound token minted on registration/claim; transfer reverts.

**Acceptance Criteria**

- [ ] Transfer attempts revert; balance reflects participation.

**Verification**

- Contract tests.

### NEW-073 · Quest / streak system (multi-step campaign objectives)

- **Labels:** `enhancement`, `area: backend`, `area: smart-contract`, `difficulty: hard`

**Problem** Single-action campaigns limit engagement; quests reward sequences.

**Scope**

- [ ] Define quests (ordered steps) with on-chain completion proofs and bonus payouts.

**Acceptance Criteria**

- [ ] Completing all steps unlocks the bonus exactly once.

**Verification**

- Integration test over a multi-step quest.

### NEW-074 · On-chain referral rewards economy

- **Labels:** `enhancement`, `area: smart-contract`, `difficulty: medium`, `stellar`
- Builds on existing `referrer_of`/`referral_count` + frontend referral link #350.

**Problem** Referrals are tracked but not rewarded on-chain.

**Scope**

- [ ] Configurable referrer bonus paid when a referee completes a qualifying action;
      anti-self-referral.

**Acceptance Criteria**

- [ ] Referrer receives the configured bonus; self-referral blocked.

**Verification**

- Contract tests incl. abuse cases.

### NEW-075 · Recurring / seasonal campaign scheduling

- **Labels:** `enhancement`, `area: backend`, `difficulty: medium`

**Problem** Operators rerun campaigns; manual recreation is tedious.

**Scope**

- [ ] Schedule recurring campaigns (cron-like) that clone config into new windows.

**Acceptance Criteria**

- [ ] A recurring campaign auto-creates the next instance on schedule.

**Verification**

- Job test advancing the clock.

### NEW-076 · Campaign templates library

- **Labels:** `enhancement`, `area: backend`, `area: frontend`, `difficulty: easy`

**Problem** New operators face a blank-page problem.

**Scope**

- [ ] Prebuilt templates (airdrop, quest, leaderboard) selectable in CreateCampaign.

**Acceptance Criteria**

- [ ] Selecting a template prefills a valid campaign config.

**Verification**

- E2E creating from a template.

### NEW-077 · Public participant achievement profile (shareable)

- **Labels:** `enhancement`, `area: frontend`, `difficulty: medium`
- Complements profile page #473.

**Problem** Participants want a shareable record of badges/achievements.

**Scope**

- [ ] Public profile route rendering badges, streaks, and campaign history with OG meta for sharing.

**Acceptance Criteria**

- [ ] Profile is shareable with rich link previews.

**Verification**

- Snapshot + OG meta test.

### NEW-078 · Leaderboard seasons with reset & historical archive

- **Labels:** `enhancement`, `area: backend`, `difficulty: medium`
- Builds on leaderboard #341/#348.

**Problem** Permanent leaderboards stagnate; seasons re-energize competition.

**Scope**

- [ ] Seasonal leaderboards with reset boundaries; archive past seasons.

**Acceptance Criteria**

- [ ] New season resets ranks; past seasons remain queryable.

**Verification**

- Tests across a season boundary.

---

## Epic J — Multi-Tenancy & Access Control

### NEW-079 · Organization / workspace model (multiple operators)

- **Labels:** `enhancement`, `area: backend`, `difficulty: hard`

**Problem** Everything is effectively single-operator; scaling to many operators needs tenant
isolation.

**Scope**

- [ ] Org entity; campaigns/keys/audit scoped to an org; data isolation enforced in the DAL.

**Acceptance Criteria**

- [ ] An org cannot read/modify another org's data.

**Verification**

- Cross-tenant access tests (must fail).

### NEW-080 · Role-based access control (RBAC) beyond single admin

- **Labels:** `enhancement`, `area: backend`, `security`, `difficulty: medium`

**Problem** Only a single admin notion exists; teams need owner/admin/editor/viewer.

**Scope**

- [ ] Roles + permission checks on every privileged route; default-deny.

**Acceptance Criteria**

- [ ] Each role can do exactly its allowed actions.

**Verification**

- Matrix tests of role × action.

### NEW-081 · Team member invitations & management

- **Labels:** `enhancement`, `area: backend`, `area: frontend`, `difficulty: medium`

**Problem** No way to invite collaborators into an org.

**Scope**

- [ ] Invite flow (email/link), accept, role assignment, revoke.

**Acceptance Criteria**

- [ ] Invited user joins with the assigned role; revocation works.

**Verification**

- E2E invite→accept→revoke.

### NEW-082 · Per-org white-label branding (logo, colors, domain)

- **Labels:** `enhancement`, `area: frontend`, `area: backend`, `difficulty: medium`
- Complements design tokens #351.

**Problem** Operators want campaigns to match their brand.

**Scope**

- [ ] Org branding config applied to embed + campaign pages; optional custom domain.

**Acceptance Criteria**

- [ ] An org's pages reflect its branding.

**Verification**

- Snapshot per branding config.

### NEW-083 · Org-scoped API keys with granular scopes

- **Labels:** `enhancement`, `area: backend`, `security`, `difficulty: medium`
- Extends API key mgmt #338.

**Problem** API keys need org scoping + least-privilege scopes (read-only, write, admin).

**Scope**

- [ ] Scoped keys enforced per route; scope shown in key management UI.

**Acceptance Criteria**

- [ ] A read-only key cannot perform writes.

**Verification**

- Per-scope route tests.

### NEW-084 · Org audit log & activity feed

- **Labels:** `enhancement`, `area: backend`, `area: frontend`, `observability`, `difficulty: easy`
- Builds on audit log repository.

**Problem** Orgs need visibility into who did what.

**Scope**

- [ ] Org-scoped audit feed with filters; export.

**Acceptance Criteria**

- [ ] All privileged actions appear in the org feed.

**Verification**

- Integration test asserting feed entries.

---

## Epic K — SDKs, CLI & Developer Experience

### NEW-085 · Official TypeScript SDK (npm package)

- **Labels:** `enhancement`, `dx`, `area: frontend`, `difficulty: medium`

**Problem** Integrators must hand-roll API + contract calls.

**Scope**

- [ ] Published `@trivela/sdk` wrapping REST + contract clients with types from OpenAPI + bindings.

**Acceptance Criteria**

- [ ] A sample app integrates campaigns end-to-end via the SDK.

**Verification**

- SDK unit tests + example app in CI.

### NEW-086 · Python SDK

- **Labels:** `enhancement`, `dx`, `difficulty: medium`

**Problem** Data/ops teams often use Python.

**Scope**

- [ ] Python client for the REST API (typed, paginated).

**Acceptance Criteria**

- [ ] Parity with core SDK read/write flows.

**Verification**

- pytest suite.

### NEW-087 · `trivela` CLI for campaign & contract management

- **Labels:** `enhancement`, `dx`, `difficulty: medium`, `stellar`

**Problem** Operators want scriptable management without the UI.

**Scope**

- [ ] CLI: deploy/init contracts, create/activate campaigns, import allowlists, query stats.

**Acceptance Criteria**

- [ ] Full campaign lifecycle runnable from the CLI.

**Verification**

- CLI integration tests against testnet.

### NEW-088 · OpenAPI client codegen pipeline

- **Labels:** `enhancement`, `dx`, `ci`, `difficulty: easy`
- Builds on `backend/openapi.yaml`.

**Problem** Clients drift from the spec.

**Scope**

- [ ] CI step generating typed clients from `openapi.yaml`; fail on drift.

**Acceptance Criteria**

- [ ] Spec change without regenerated client fails CI.

**Verification**

- CI drift test.

### NEW-089 · Postman / Insomnia collection + environment

- **Labels:** `enhancement`, `dx`, `documentation`, `difficulty: easy`

**Problem** No ready-made API exploration collection.

**Scope**

- [ ] Generated collection committed + kept in sync with OpenAPI.

**Acceptance Criteria**

- [ ] Collection imports and hits a local server.

**Verification**

- Newman smoke run in CI.

### NEW-090 · Local one-command devnet (contracts + backend + frontend + indexer)

- **Labels:** `enhancement`, `dx`, `infra`, `difficulty: medium`
- Complements devcontainer #484.

**Problem** Spinning up the full stack locally is multi-step.

**Scope**

- [ ] `make dev` / compose profile that deploys contracts to a local/quickstart network and wires
      everything.

**Acceptance Criteria**

- [ ] One command yields a working local environment with seeded data.

**Verification**

- Fresh-clone bring-up test in CI.

### NEW-091 · Contract TypeScript bindings auto-publish on release

- **Labels:** `enhancement`, `dx`, `ci`, `stellar`, `difficulty: easy`
- Builds on `scripts/build-bindings.js` + `frontend/src/contracts/*`.

**Problem** Bindings are built locally but not published for external consumers.

**Scope**

- [ ] Publish versioned bindings package on contract release tags.

**Acceptance Criteria**

- [ ] A release publishes consumable bindings matching the deployed ABI.

**Verification**

- Release dry-run produces the package.

---

## Epic L — Mobile & Notifications

### NEW-092 · React Native mobile app (campaign browse + claim)

- **Labels:** `enhancement`, `area: frontend`, `difficulty: hard`, `stellar`

**Problem** Many users are mobile-first; PWA alone may not suffice for wallet UX.

**Scope**

- [ ] RN app reusing the SDK; wallet deep-linking; browse/register/claim.

**Acceptance Criteria**

- [ ] Core flows work on iOS/Android.

**Verification**

- Device/emulator E2E for register+claim.

### NEW-093 · Web push notifications (campaign lifecycle, claim ready)

- **Labels:** `enhancement`, `area: frontend`, `area: backend`, `difficulty: medium`
- Builds on existing PWA (`PwaStatus.jsx`).

**Problem** Users miss time-sensitive events (ending soon, claim available).

**Scope**

- [ ] Web Push (VAPID) subscription + server send on lifecycle events.

**Acceptance Criteria**

- [ ] Subscribed users receive push for key events; unsubscribe works.

**Verification**

- E2E subscribe→trigger→receive.

### NEW-094 · In-app notification center

- **Labels:** `enhancement`, `area: frontend`, `area: backend`, `difficulty: medium`
- Complements toast system #347.

**Problem** No persistent notification history in-app.

**Scope**

- [ ] Notification feed with read/unread state and preferences.

**Acceptance Criteria**

- [ ] Events appear in the center; read state persists.

**Verification**

- Integration test.

### NEW-095 · SMS notifications (optional, Twilio adapter)

- **Labels:** `enhancement`, `area: backend`, `difficulty: easy`
- Complements email #342.

**Problem** Some audiences prefer SMS for high-value alerts.

**Scope**

- [ ] Pluggable SMS adapter behind a notification interface; opt-in only.

**Acceptance Criteria**

- [ ] Opt-in users receive SMS for selected events.

**Verification**

- Adapter test with a mock provider.

### NEW-096 · Unified notification preferences center

- **Labels:** `enhancement`, `area: frontend`, `area: backend`, `difficulty: medium`

**Problem** Channels (email/push/SMS/in-app) need a single, respected preference store.

**Scope**

- [ ] Per-channel, per-event preferences enforced by the notification service.

**Acceptance Criteria**

- [ ] Disabling a channel suppresses delivery on it.

**Verification**

- Matrix test channel × event.

### NEW-097 · Mobile deep links & universal links for campaigns

- **Labels:** `enhancement`, `area: frontend`, `difficulty: easy`

**Problem** Shared campaign links should open the app when installed.

**Scope**

- [ ] iOS Universal Links / Android App Links config + routing.

**Acceptance Criteria**

- [ ] A campaign link opens the app to that campaign.

**Verification**

- Device link test.

### NEW-098 · Notification delivery audit & bounce handling

- **Labels:** `enhancement`, `area: backend`, `observability`, `difficulty: easy`

**Problem** We need delivery records and bounce/complaint handling for email/SMS.

**Scope**

- [ ] Delivery log + webhook handling for bounces/complaints; suppress repeat failures.

**Acceptance Criteria**

- [ ] Bounced addresses are suppressed; delivery is auditable.

**Verification**

- Webhook simulation test.

---

## Epic M — Analytics, BI & Experimentation

### NEW-099 · Operator analytics dashboard (funnel, retention, conversion)

- **Labels:** `enhancement`, `area: frontend`, `area: backend`, `performance`, `difficulty: medium`
- Builds on indexed rollups (NEW-026); complements analytics charts #523.

**Problem** Operators lack a consolidated performance view.

**Scope**

- [ ] Dashboard: registration→claim funnel, retention cohorts, conversion over time.

**Acceptance Criteria**

- [ ] Metrics match indexed source-of-truth within tolerance.

**Verification**

- Reconciliation test vs raw events.

### NEW-100 · Cohort & retention analysis API

- **Labels:** `enhancement`, `area: backend`, `indexer`, `difficulty: medium`

**Problem** No cohort/retention computation exists.

**Scope**

- [ ] Endpoints computing cohort retention from indexed data.

**Acceptance Criteria**

- [ ] Known fixture yields expected cohort curves.

**Verification**

- Deterministic fixture test.

### NEW-101 · A/B testing framework for campaign variants

- **Labels:** `enhancement`, `area: backend`, `area: frontend`, `difficulty: hard`

**Problem** Operators can't experiment on campaign presentation/parameters.

**Scope**

- [ ] Variant assignment (sticky), exposure logging, results readout.

**Acceptance Criteria**

- [ ] Users get a stable variant; results are measurable.

**Verification**

- Assignment stability + stats test.

### NEW-102 · Feature flag system

- **Labels:** `enhancement`, `area: backend`, `area: frontend`, `dx`, `difficulty: medium`

**Problem** Risky features (ZK, payouts) need safe rollout/kill-switches.

**Scope**

- [ ] Flag service (env + runtime) with targeting and a kill-switch; client + server evaluation.

**Acceptance Criteria**

- [ ] Toggling a flag changes behavior without redeploy.

**Verification**

- Tests for on/off/targeted states.

### NEW-103 · Privacy-respecting product analytics events (consent-gated)

- **Labels:** `enhancement`, `area: frontend`, `difficulty: easy`
- Complements Plausible/PostHog #354; here = consent + event taxonomy.

**Problem** Need a consistent, consent-gated event taxonomy across the app.

**Scope**

- [ ] Event schema + consent gate; no PII; documented taxonomy.

**Acceptance Criteria**

- [ ] No events fire pre-consent; taxonomy documented.

**Verification**

- Tests asserting consent gating.

### NEW-104 · Scheduled reporting (operator email/PDF digests)

- **Labels:** `enhancement`, `area: backend`, `difficulty: easy`

**Problem** Operators want periodic performance summaries.

**Scope**

- [ ] Scheduled digest (email/PDF) summarizing campaign KPIs.

**Acceptance Criteria**

- [ ] A scheduled digest is generated and delivered.

**Verification**

- Job test producing a digest artifact.

---

## Epic N — Frontend Robustness

### NEW-105 · Real-time UI updates via WebSocket/SSE subscription (client side)

- **Labels:** `enhancement`, `area: frontend`, `difficulty: medium`, `stellar`
- Consumes backend WS #456 / Horizon SSE #468.

**Problem** The UI polls; live updates would be smoother and cheaper.

**Scope**

- [ ] Subscribe to campaign/participant events; reconcile with cache; reconnect/backoff.

**Acceptance Criteria**

- [ ] Participant count/claims update live without manual refresh.

**Verification**

- E2E observing a live update.

### NEW-106 · Optimistic UI for register/claim with rollback

- **Labels:** `enhancement`, `area: frontend`, `difficulty: medium`

**Problem** Users wait on chain confirmation with no immediate feedback.

**Scope**

- [ ] Optimistic state on submit; rollback + clear error on failure.

**Acceptance Criteria**

- [ ] Failed tx rolls back UI to the correct state.

**Verification**

- E2E forcing a tx failure.

### NEW-107 · Comprehensive skeleton/loading & empty states

- **Labels:** `enhancement`, `area: frontend`, `difficulty: easy`, `good first issue`
- Complements EmptyState component.

**Problem** Several views lack skeletons; perceived performance suffers.

**Scope**

- [ ] Skeletons for list/detail/analytics; consistent empty states.

**Acceptance Criteria**

- [ ] No layout shift between loading and loaded.

**Verification**

- Visual snapshots.

### NEW-108 · Robust transaction error-recovery UX

- **Labels:** `enhancement`, `area: frontend`, `difficulty: medium`, `stellar`
- Builds on `errorMapping.js` + `TransactionStatus.jsx`.

**Problem** Failed/again-needed signatures leave users stuck.

**Scope**

- [ ] Clear, actionable recovery (retry, switch wallet, explorer link) per error class.

**Acceptance Criteria**

- [ ] Each mapped error offers a recovery action.

**Verification**

- Tests across error classes.

### NEW-109 · Virtualized lists for large campaign/participant sets

- **Labels:** `enhancement`, `area: frontend`, `performance`, `difficulty: medium`

**Problem** Rendering thousands of rows will jank.

**Scope**

- [ ] Virtualization for campaign list, leaderboard, participants.

**Acceptance Criteria**

- [ ] 10k rows scroll at 60fps.

**Verification**

- Perf profile in test.

### NEW-110 · URL-synced search, filter & sort state

- **Labels:** `enhancement`, `area: frontend`, `difficulty: easy`
- Builds on `CampaignFilters.jsx`.

**Problem** Filters reset on reload and aren't shareable.

**Scope**

- [ ] Encode filter/sort/search in the URL; restore on load.

**Acceptance Criteria**

- [ ] A filtered view is shareable via URL.

**Verification**

- E2E restore-from-URL.

### NEW-111 · Bundle-size budget & code-splitting enforcement in CI

- **Labels:** `enhancement`, `area: frontend`, `performance`, `ci`, `difficulty: easy`

**Problem** Bundle growth (ZK/proving, charts) can hurt load times.

**Scope**

- [ ] Size budgets + route-level code splitting; CI fails on regression.

**Acceptance Criteria**

- [ ] Exceeding the budget fails CI.

**Verification**

- CI budget check.

### NEW-112 · Visual regression testing (Storybook + Chromatic/Playwright snapshots)

- **Labels:** `enhancement`, `area: frontend`, `testing`, `difficulty: medium`
- Builds on existing Storybook stories.

**Problem** UI regressions slip through without visual diffs.

**Scope**

- [ ] Snapshot key stories/pages; gate PRs on visual diffs.

**Acceptance Criteria**

- [ ] An intentional visual change is flagged for review.

**Verification**

- CI visual-diff job.

---

## Epic O — Testing & QA Depth

### NEW-113 · End-to-end tests against real testnet (not mocks)

- **Labels:** `enhancement`, `testing`, `stellar`, `difficulty: medium`
- Complements existing testnet workflow.

**Problem** E2E uses mocks; real-network drift goes uncaught.

**Scope**

- [ ] Gated CI job running register→credit→claim on testnet with a funded ephemeral key.

**Acceptance Criteria**

- [ ] Job passes against live testnet and uploads artifacts on failure.

**Verification**

- CI run on the workflow.

### NEW-114 · Contract upgrade & state-migration tests

- **Labels:** `enhancement`, `area: smart-contract`, `testing`, `difficulty: medium`
- Relates to upgrade path #518 + `migrate`.

**Problem** `migrate`/`schema_version` exist but upgrades aren't exhaustively tested.

**Scope**

- [ ] Deploy vN, populate state, upgrade to vN+1, assert state preserved + new behavior.

**Acceptance Criteria**

- [ ] Upgrade preserves participant/balance state.

**Verification**

- Integration upgrade test.

### NEW-115 · Load tests for claim/registration storms

- **Labels:** `enhancement`, `testing`, `performance`, `difficulty: medium`
- Builds on `load-tests/`.

**Problem** No scenario models a sudden mass-claim spike.

**Scope**

- [ ] k6 scenarios for burst registration + claim; thresholds on p95/error rate.

**Acceptance Criteria**

- [ ] Documented capacity under burst; thresholds enforced.

**Verification**

- `scripts/run-load-test.sh` scenario run.

### NEW-116 · Soak / endurance tests (memory leak detection)

- **Labels:** `enhancement`, `testing`, `performance`, `difficulty: medium`

**Problem** Long-running leaks (indexer, pools) only show over time.

**Scope**

- [ ] Multi-hour soak with RSS/heap tracking and leak assertions.

**Acceptance Criteria**

- [ ] No unbounded memory growth over the soak window.

**Verification**

- Soak run report.

### NEW-117 · Expanded contract fuzzing (proptest, all entrypoints)

- **Labels:** `enhancement`, `area: smart-contract`, `testing`, `difficulty: medium`
- Extends property testing #362.

**Problem** Fuzzing coverage is partial.

**Scope**

- [ ] Fuzz every state-changing entrypoint; assert invariants hold.

**Acceptance Criteria**

- [ ] Fuzz suite runs in CI with a seed corpus.

**Verification**

- CI fuzz job.

### NEW-118 · Backend contract tests against the OpenAPI spec

- **Labels:** `enhancement`, `area: backend`, `testing`, `ci`, `difficulty: easy`

**Problem** Responses can drift from `openapi.yaml`.

**Scope**

- [ ] Validate live responses against the schema in CI.

**Acceptance Criteria**

- [ ] A response/schema mismatch fails CI.

**Verification**

- CI contract-test job.

### NEW-119 · Coverage gates + trend reporting

- **Labels:** `enhancement`, `testing`, `ci`, `difficulty: easy`

**Problem** No enforced coverage thresholds.

**Scope**

- [ ] Coverage thresholds per package; PR comment with trend.

**Acceptance Criteria**

- [ ] Dropping below threshold fails CI.

**Verification**

- CI coverage gate.

### NEW-120 · Deterministic test data factories & seeders

- **Labels:** `enhancement`, `testing`, `dx`, `difficulty: easy`

**Problem** Tests hand-build fixtures inconsistently.

**Scope**

- [ ] Factory helpers + seed scripts for campaigns/participants/keys.

**Acceptance Criteria**

- [ ] Tests use shared factories; seeding is reproducible.

**Verification**

- Refactor a sample suite onto factories.

---

## Epic P — Documentation (10)

### NEW-121 · Operator onboarding guide (zero → live campaign)

- **Labels:** `documentation`, `area: documentation`, `difficulty: easy`, `good first issue`

**Scope** `docs/OPERATOR_GUIDE.md` walking an operator from signup to a live, funded campaign.
**Acceptance** A new operator can follow it without help. **Verification** Maintainer dry-run.

### NEW-122 · Third-party integration guide (consume contracts/API)

- **Labels:** `documentation`, `area: documentation`, `difficulty: medium`, `dx`

**Scope** `docs/INTEGRATION_GUIDE.md`: SDK usage, auth, webhooks, contract calls. **Acceptance** A
sample integration is reproducible from the doc. **Verification** Code sample runs in CI.

### NEW-123 · API authentication & API key guide

- **Labels:** `documentation`, `area: documentation`, `security`, `difficulty: easy`

**Scope** Document API key creation/rotation/scopes + SEP-10 login (NEW-011). **Acceptance** Covers
every auth path. **Verification** Cross-check vs routes.

### NEW-124 · Scaling & capacity-planning guide

- **Labels:** `documentation`, `area: documentation`, `infra`, `performance`, `difficulty: medium`

**Scope** `docs/SCALING.md`: replicas, DB sizing, cache, RPC throughput, load-test results.
**Acceptance** Recommendations backed by load-test numbers. **Verification** Numbers reference
`load-tests/`.

### NEW-125 · Indexer architecture & operations doc

- **Labels:** `documentation`, `area: documentation`, `indexer`, `difficulty: medium`

**Scope** Document the indexer (Epic D): cursors, reorgs, backfill, rollups, ops. **Acceptance**
Operator can run/recover the indexer from the doc. **Verification** Matches implementation.

### NEW-126 · Notifications architecture & channel setup doc

- **Labels:** `documentation`, `area: documentation`, `difficulty: easy`

**Scope** Configure email/push/SMS/in-app + preferences (Epic L). **Acceptance** Each channel has
setup steps. **Verification** Setup followed in staging.

### NEW-127 · Contract function reference (auto-generated from spec)

- **Labels:** `documentation`, `area: documentation`, `area: smart-contract`, `ci`,
  `difficulty: easy`
- Builds on `docs/CONTRACTS_API.md` + `docs/contract-api`.

**Scope** Auto-generate per-function reference (params, errors, events) from the contract spec in
CI. **Acceptance** Reference regenerates on contract change. **Verification** CI regen + drift
check.

### NEW-128 · Localization / i18n contributor guide

- **Labels:** `documentation`, `area: documentation`, `difficulty: easy`
- Pairs with i18n #319.

**Scope** How to add a language, translation workflow, RTL notes. **Acceptance** A contributor can
add a locale from the doc. **Verification** Add a sample locale.

### NEW-129 · Architecture deep-dive & data-flow diagrams refresh

- **Labels:** `documentation`, `area: documentation`, `difficulty: medium`
- Extends `ARCHITECTURE_OVERVIEW.md` / `FLOWS.md` for new subsystems (indexer, ZK, payouts).

**Scope** Update diagrams to include indexer, ZK, payouts, notifications, multi-tenancy.
**Acceptance** Diagrams match current architecture. **Verification** Review vs code.

### NEW-130 · Public roadmap & RFC index

- **Labels:** `documentation`, `area: documentation`, `difficulty: easy`
- Builds on `docs/rfcs` + `docs/adr`.

**Scope** `ROADMAP.md` linking epics/RFCs/ADRs so contributors see direction and grant reviewers see
vision. **Acceptance** Roadmap reflects these epics + open RFCs. **Verification** Links resolve;
maintainer review.

---

## Recommended Closures (stale / already-implemented)

These existing **open** issues describe functionality that is **already implemented** in the current
codebase. Recommend closing them as completed (with a comment citing the implementation), to keep
the backlog honest. **Each must be independently verified before closing.**

| Issue    | Title (abridged)                               | Evidence in repo                                                                                                          |
| -------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **#326** | Contracts: vesting schedule for rewards        | `rewards/lib.rs`: `credit_vested`, `claim_vested`, `vested_balance`, `total_vested`                                       |
| **#331** | Contracts: reward tiers by rank                | `rewards/lib.rs`: `set_tiers`, `clear_tiers`, `credit_by_rank`, `get_tier_for_rank`                                       |
| **#329** | Contracts: multi-campaign rewards multiplier   | `rewards/lib.rs`: `set_campaign_multiplier`, `campaign_multiplier`, `credit_for_campaign`                                 |
| **#325** | Contracts: snapshot balances at a ledger       | `rewards/lib.rs`: `snapshot`, `get_snapshot`, `list_snapshots`                                                            |
| **#324** | Contracts: contract-level credit rate limiting | `rewards/lib.rs`: `set_credit_rate_limit`, `get_credit_rate_limit`, `credit_call_count`                                   |
| **#330** | Contracts: participant deregistration          | `campaign/lib.rs`: `deregister`, `admin_deregister`                                                                       |
| **#449** | Contracts: admin key rotation 2-step timelock  | `propose_admin`, `accept_admin`, `cancel_admin_transfer`, `pending_admin`, `admin_transfer` _(verify timelock specifics)_ |
| **#335** | Backend: response compression (gzip/brotli)    | `backend/src/index.js` uses compression middleware                                                                        |
| **#333** | Backend: full-text search (SQLite FTS5)        | `backend/src/db/migrations/005_campaigns_fts.js`                                                                          |
| **#318** | Backend: cursor-based pagination               | `backend/src/pagination.js` _(verify cursor mode)_                                                                        |
| **#332** | Backend: image upload (S3/IPFS)                | `storage/s3Storage.js`, `storage/ipfsStorage.js`, `services/imageUpload.js`                                               |
| **#338** | Backend: API key management                    | `dal/apiKeyRepository.js`, migration `006_api_keys.js` _(verify create/rotate/revoke)_                                    |
| **#47**  | Frontend: Claim flow for rewards               | `frontend/src/ClaimRewards.jsx`                                                                                           |

> Items marked _(verify …)_ are partially evidenced — confirm the specific sub-feature before
> closing, or down-scope the issue to the remaining slice instead of closing outright.

---

## Summary for reviewer

- **130 new issues** proposed across 16 epics, each grounded in the current codebase, labelled with
  the existing taxonomy, and carrying acceptance + verification criteria.
- **10 of these are documentation issues** (NEW-121 … NEW-130), plus several more docs embedded in
  epics (NEW-008, NEW-018, NEW-043, NEW-047, NEW-052, NEW-054, NEW-057, NEW-064).
- **ZK** is included as a full epic (A) plus supporting items, since privacy-preserving eligibility,
  anti-sybil, and confidential balances are credible growth/differentiation vectors for the
  platform.
- **13 existing issues** recommended for closure as already-implemented (verify first).

**Nothing will be filed or closed until you approve this draft.**
