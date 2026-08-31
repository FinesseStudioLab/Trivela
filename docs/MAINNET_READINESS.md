# Mainnet Launch Readiness & Go/No-Go Gate

> **Status:** In progress — all items must be checked and signed off before any `mainnet` deploy
> workflow is approved.

This document is the single source of truth for Trivela mainnet readiness. Each item must be checked
off by a named owner and linked to verifiable evidence (merged PR, audit report, deploy transaction,
monitoring dashboard) before the go/no-go call is made.

The deploy workflow (`.github/workflows/mainnet-deploy.yml`) is gated on this checklist: a required
status check verifies the file has no unchecked boxes before the job proceeds.

---

## Go/No-Go Criteria

A **Go** decision requires every section below to be fully checked **and** signed off by its
designated owner. Any unchecked item is an automatic **No-Go**.

| Section               | Sign-off Owner         |
| --------------------- | ---------------------- |
| Smart Contracts       | Lead Contract Engineer |
| Security & Compliance | Security Lead          |
| Backend               | Backend Lead           |
| Frontend              | Frontend Lead          |
| Infrastructure & Ops  | Platform Lead          |
| Financial Safety      | Finance / Risk Lead    |

---

## 1 — Smart Contracts

- [ ] `upgrade()` entrypoint implemented and tested — [#278]
- [ ] TTL values set for mainnet timing — [#279]
- [ ] Participant storage migrated to persistent storage — [#280]
- [ ] 2-step admin transfer implemented — [#281]
- [ ] All fuzz targets passing — [#282]
- [ ] Oracle / TWAP-bounded redemption rate in place — [#722]
- [ ] External security audit completed; report linked here: _(link)_
- [ ] Contracts deployed to mainnet and verified via Stellar CLI
- [ ] Admin keys transferred to multisig/cold wallet; testnet keys revoked

---

## 2 — Security & Compliance

- [ ] Sensitive columns encrypted at rest (field-level / envelope encryption) — [#777]
- [ ] IP/device fingerprint data hashed or minimised; raw values not retained — [#777]
- [ ] Data-map document (`docs/DATA_MAP.md`) reviewed and approved
- [ ] `SECURITY.md` published and vulnerability disclosure process active — [#292]
- [ ] No secrets or API keys committed to the repository (secrets-scan CI green)
- [ ] All testnet secrets rotated; production secrets stored in vault (not `.env` files)
- [ ] Dependency audit (`npm audit` / `cargo audit`) at severity ≤ moderate; exceptions documented

---

## 3 — Backend

- [ ] Event indexer running against mainnet RPC — [#283]
- [ ] PostgreSQL or hardened SQLite configured for production — [#284]
- [ ] Database migration system in place and tested on a copy of prod schema — [#286]
- [ ] Redis caching configured for multi-instance / HA — [#288]
- [ ] Rate limits tuned for expected traffic load
- [ ] GDPR data-export and right-to-erasure endpoints live — [#927]
- [ ] Monitoring and alerting configured; on-call rotation documented — [#290]
- [ ] Backup strategy tested with a verified restore

---

## 4 — Frontend

- [ ] Mainnet contract IDs set in `VITE_*` environment variables
- [ ] No hardcoded testnet contract IDs or RPC URLs remain
- [ ] All Freighter/wallet errors surface clear, localised user messages
- [ ] Open Graph / Twitter share cards validated for all campaign pages — [#948]
- [ ] Performance targets met: LCP < 2.5 s, CLS < 0.1 (measured on mainnet domain)
- [ ] Accessibility audit passed (axe / Lighthouse ≥ 90)

---

## 5 — Infrastructure & Operations

- [ ] Mainnet deploy pipeline with required approval gates configured — [#289]
- [ ] Deploy workflow gated on this checklist (no unchecked boxes)
- [ ] Rollback procedure documented and tested — [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md)
- [ ] SLO targets defined; error-budget policy documented — [SLO.md](./SLO.md)
- [ ] Incident response runbook published — [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md)
- [ ] Helm/k8s manifests reviewed; resource limits and replicas set for production load

---

## 6 — Financial Safety

- [ ] Redemption-rate change timelock enforced on-chain — [#722]
- [ ] Maximum single-transaction reward cap configured
- [ ] Emergency pause (`pause()`) tested end-to-end on staging
- [ ] Treasury wallet address confirmed and tested for reward disbursement

---

## Sign-off Log

| Date     | Owner    | Section     | Evidence         |
| -------- | -------- | ----------- | ---------------- |
| _(date)_ | _(name)_ | _(section)_ | _(link or note)_ |

---

## References

- [MAINNET_CHECKLIST.md](./MAINNET_CHECKLIST.md) — legacy per-issue tracking list
- [DEPLOYMENT.md](./DEPLOYMENT.md) — step-by-step deploy guide
- [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md) — deploy, verify, monitor, rollback
- [SLO.md](./SLO.md) — service-level objectives
- [SECURITY.md](./SECURITY.md) — vulnerability disclosure policy
