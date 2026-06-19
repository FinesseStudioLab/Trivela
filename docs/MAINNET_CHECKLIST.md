# Mainnet Launch Readiness Checklist

This checklist must be completed and reviewed before Trivela launches on mainnet. Each item should
be checked off by a responsible contributor and linked to evidence (PR, audit report, deployment tx,
etc.) before the launch is approved.

---

## Smart Contracts

- [ ] `upgrade()` entrypoint implemented and tested — [#278]
- [ ] TTL values set for mainnet timing — [#279]
- [ ] Participant storage migrated to persistent storage — [#280]
- [ ] 2-step admin transfer implemented — [#281]
- [ ] All fuzz targets passing — [#282]
- [ ] Formal security audit completed (external auditor, report linked)
- [ ] Contracts deployed and verified on mainnet

---

## Backend

- [ ] Event indexer running against mainnet RPC — [#283]
- [ ] PostgreSQL or hardened SQLite configured — [#284]
- [ ] Database migration system in place — [#286]
- [ ] Redis caching configured for multi-instance — [#288]
- [ ] Rate limits tuned for expected traffic
- [ ] All secrets rotated from testnet values
- [ ] Monitoring and alerting configured — [#290]

---

## Frontend

- [ ] Mainnet contract IDs set in `VITE_*` env variables
- [ ] All Freighter/wallet errors surface clear user messages
- [ ] No hardcoded testnet references remain
- [ ] Performance targets met: LCP < 2.5s, CLS < 0.1

---

## Infrastructure

- [ ] Mainnet deploy pipeline with approval gates configured — [#289]
- [ ] Backup strategy for campaign DB documented and tested
- [ ] Incident response runbook documented
- [ ] `SECURITY.md` published — [#292]

---

## References

- [DEPLOYMENT.md](./DEPLOYMENT.md)
- Issues: #278, #279, #280, #281, #282, #283, #284, #286, #288, #289, #290, #292
