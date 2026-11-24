# Mainnet Launch Readiness Checklist

This checklist must be completed and reviewed before Trivela launches on mainnet. Each item should
be checked off by a responsible contributor and linked to evidence (PR, audit report, deployment tx,
etc.) before the launch is approved.

**Sign-off workflow:** open a *Mainnet Sign-off* issue using the
[issue template](.github/ISSUE_TEMPLATE/mainnet_signoff.yml) for the item you are approving, then
update the **Approver** and **Approval date** columns below with your GitHub handle and the date.
All items must have an approver entry before the launch gate is opened.

---

## Smart Contracts

| Item | Evidence | Approver | Approval date |
| ---- | -------- | -------- | ------------- |
| `upgrade()` entrypoint implemented and tested | [#278] | — | — |
| TTL values set for mainnet timing | [#279] | — | — |
| Participant storage migrated to persistent storage | [#280] | — | — |
| 2-step admin transfer implemented | [#281] | — | — |
| All fuzz targets passing | [#282] | — | — |
| Formal security audit completed (external auditor, report linked) | | — | — |
| Contracts deployed and verified on mainnet | | — | — |

---

## Backend

| Item | Evidence | Approver | Approval date |
| ---- | -------- | -------- | ------------- |
| Event indexer running against mainnet RPC | [#283] | — | — |
| PostgreSQL or hardened SQLite configured | [#284] | — | — |
| Database migration system in place | [#286] | — | — |
| Redis caching configured for multi-instance | [#288] | — | — |
| Rate limits tuned for expected traffic | | — | — |
| All secrets rotated from testnet values | | — | — |
| Monitoring and alerting configured | [#290] | — | — |

---

## Frontend

| Item | Evidence | Approver | Approval date |
| ---- | -------- | -------- | ------------- |
| Mainnet contract IDs set in `VITE_*` env variables | | — | — |
| All Freighter/wallet errors surface clear user messages | | — | — |
| No hardcoded testnet references remain | | — | — |
| Performance targets met: LCP < 2.5s, CLS < 0.1 | | — | — |

---

## Infrastructure

| Item | Evidence | Approver | Approval date |
| ---- | -------- | -------- | ------------- |
| Mainnet deploy pipeline with approval gates configured | [#289] | — | — |
| Backup strategy for campaign DB documented and tested | | — | — |
| Incident response runbook documented | [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md) | — | — |
| `SECURITY.md` published | [#292] | — | — |

---

## References

- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md) - Deploy, verify, monitor, rollback procedures
- [Mainnet Sign-off issue template](.github/ISSUE_TEMPLATE/mainnet_signoff.yml)
- Issues: #278, #279, #280, #281, #282, #283, #284, #286, #288, #289, #290, #292

- Upgrade authority and Wasm verification: see [upgradeability.md](upgradeability.md).
