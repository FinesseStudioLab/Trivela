# Threat Model (STRIDE)

## Overview
This document applies the STRIDE threat modeling methodology to Trivela's contracts, backend API, and bridge/indexer components. It catalogs assets, actors, trust boundaries, and threats, and links each identified threat to its mitigation strategy or tracking issue.

## Assets

1. **Campaign funds** — XLM/tokens held in campaign contracts
2. **Referral rewards** — XLM/tokens allocated for referral bonuses
3. **User credentials & sessions** — JWT tokens, OAuth credentials
4. **Admin keys** — Contract admin keys, backend service keys
5. **Contract state** — Campaign configurations, eligibility proofs, vote tallies
6. **User PII** — Email addresses, wallet addresses, activity logs
7. **Indexer data** — Event logs, balance snapshots, leaderboard state

## Actors

- **Campaign creators** — Deploy and fund campaigns
- **Campaign participants** — Claim rewards, vote, refer others
- **Referrers** — Earn bonuses for bringing participants
- **Contract admins** — Upgrade contracts, manage parameters
- **Backend operators** — Deploy and maintain backend/indexer
- **Auditors** — Review code and on-chain activity
- **Attackers** — External actors attempting to exploit vulnerabilities

## Trust Boundaries

1. **On-chain ↔ off-chain** — Contract events → indexer ingestion
2. **Frontend ↔ backend API** — User requests → authenticated endpoints
3. **Backend ↔ Soroban RPC** — Event polling, transaction submission
4. **Admin keys ↔ contract functions** — Privileged contract operations
5. **User wallets ↔ contract calls** — Participant-initiated transactions

---

## STRIDE Analysis

### 1. Spoofing

#### Threat: Impersonation of campaign participants
**Component:** Contracts  
**Description:** Attacker claims rewards meant for another user by forging wallet signatures or eligibility proofs.  
**Mitigation:** All contract calls require valid Stellar signatures. Eligibility proofs (Merkle/ZK) are cryptographically bound to participant addresses.  
**Status:** ✅ Mitigated by design  
**References:** `contracts/campaign/`, `contracts/nullifiers/`

#### Threat: Fake indexer events
**Component:** Indexer  
**Description:** Attacker injects fabricated events into the indexer database, manipulating leaderboards or balances.  
**Mitigation:** Indexer verifies event authenticity via Soroban RPC ledger proofs. Direct database write access is restricted to the indexer service only.  
**Status:** ⚠️ Requires hardening  
**References:** [Issue #856](https://github.com/FinesseStudioLab/Trivela/issues/856)

#### Threat: Session hijacking
**Component:** Backend API  
**Description:** Attacker steals JWT tokens to impersonate authenticated users.  
**Mitigation:** JWTs are short-lived (configurable TTL), signed with HS256/RS256, and transmitted over HTTPS only. Refresh tokens stored securely.  
**Status:** ✅ Mitigated  
**References:** `backend/src/auth/`

---

### 2. Tampering

#### Threat: Contract state manipulation
**Component:** Contracts  
**Description:** Attacker alters campaign parameters (e.g., reward amounts, eligibility) via unauthorized contract calls.  
**Mitigation:** Admin-only functions protected by `require_auth()` checks. Upgradeability controlled by multisig or DAO.  
**Status:** ⚠️ Admin key custody critical  
**References:** `contracts/campaign/src/admin.rs`, [GOVERNANCE.md](./GOVERNANCE.md)

#### Threat: Replay attacks on transactions
**Component:** Contracts  
**Description:** Attacker resubmits a valid transaction (e.g., claim) to drain funds.  
**Mitigation:** Soroban's native sequence numbers prevent replay. Idempotency keys used in backend API for duplicate submissions.  
**Status:** ✅ Mitigated  
**References:** `backend/src/middleware/idempotency.js`

#### Threat: Man-in-the-middle attacks
**Component:** Backend API ↔ Frontend  
**Description:** Attacker intercepts and modifies API requests/responses.  
**Mitigation:** All API traffic over HTTPS (TLS 1.2+). Certificate pinning recommended for production apps.  
**Status:** ✅ Mitigated  
**References:** `nginx/default.conf`, [DEPLOYMENT.md](./DEPLOYMENT.md)

---

### 3. Repudiation

#### Threat: Denial of referral attribution
**Component:** Contracts  
**Description:** Referrer claims they didn't receive credit; participant claims they were never referred.  
**Mitigation:** All referral events emitted on-chain with (referrer, referee, timestamp). Immutable audit trail via Stellar ledger.  
**Status:** ✅ Mitigated  
**References:** `contracts/campaign/src/referral.rs`

#### Threat: Backend logs tampering
**Component:** Backend  
**Description:** Operator alters logs to hide malicious activity or errors.  
**Mitigation:** Logs shipped to external observability platform (e.g., Datadog, CloudWatch) with write-only access. Audit logs for privileged operations.  
**Status:** ⚠️ Requires external log sink setup  
**References:** `backend/src/logger/`, [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md)

---

### 4. Information Disclosure

#### Threat: Exposure of private votes
**Component:** Contracts (Voting)  
**Description:** Individual ballots leaked before tally, compromising voter privacy.  
**Mitigation:** Commit-reveal or homomorphic encryption. Ballots stored encrypted on-chain; only tally revealed.  
**Status:** 🚧 In progress  
**References:** [Issue #846](https://github.com/FinesseStudioLab/Trivela/issues/846), `contracts/voting/`

#### Threat: PII leakage via API responses
**Component:** Backend API  
**Description:** API returns more user data than necessary (e.g., emails, wallet addresses in public leaderboards).  
**Mitigation:** DTOs filter sensitive fields. Leaderboard endpoints return anonymized pseudonyms unless user opts in.  
**Status:** ✅ Mitigated  
**References:** `backend/src/dto/`, [API_MIGRATION.md](./API_MIGRATION.md)

#### Threat: Indexer database exposure
**Component:** Indexer  
**Description:** Unauthorized access to Postgres exposes all event history, balances, and derived analytics.  
**Mitigation:** Database credentials rotated regularly, accessible only via backend service account. Network-level isolation (VPC/firewall).  
**Status:** ✅ Mitigated  
**References:** `compose.yaml`, [DEPLOYMENT.md](./DEPLOYMENT.md)

---

### 5. Denial of Service

#### Threat: Contract resource exhaustion
**Component:** Contracts  
**Description:** Attacker floods contract with high-gas operations (e.g., massive Merkle proofs) to block legitimate users.  
**Mitigation:** Soroban resource limits (CPU, memory, storage) enforced per-transaction. Rate limiting at frontend/backend.  
**Status:** ✅ Mitigated by Soroban runtime  
**References:** [STORAGE_RENT_MODEL.md](./STORAGE_RENT_MODEL.md)

#### Threat: Backend API overload
**Component:** Backend  
**Description:** Attacker sends high-volume requests to exhaust backend capacity.  
**Mitigation:** Rate limiting per IP/user (express-rate-limit). Horizontal scaling with load balancer. DDoS protection at CDN/edge.  
**Status:** ⚠️ Production load testing required  
**References:** `backend/src/middleware/rate-limit.js`, [SLO.md](./SLO.md)

#### Threat: Websocket connection exhaustion
**Component:** Backend (Websocket)  
**Description:** Attacker opens thousands of websocket connections to starve resources.  
**Mitigation:** Per-IP connection limits. Heartbeat/timeout enforcement to close stale connections. Backpressure handling.  
**Status:** 🚧 In progress  
**References:** [Issue #859](https://github.com/FinesseStudioLab/Trivela/issues/859), `backend/src/websocket/`

---

### 6. Elevation of Privilege

#### Threat: Unauthorized admin access
**Component:** Contracts  
**Description:** Attacker gains control of admin keys to upgrade contracts maliciously or drain funds.  
**Mitigation:** Admin keys held in hardware wallets or multisig. Timelock on upgrades. Governance voting for parameter changes.  
**Status:** ⚠️ Critical dependency on key custody practices  
**References:** [GOVERNANCE.md](./GOVERNANCE.md), `contracts/governance/`

#### Threat: Backend privilege escalation
**Component:** Backend API  
**Description:** Low-privilege user exploits API bug to gain admin/operator access.  
**Mitigation:** Role-based access control (RBAC) enforced at middleware layer. Audit logs for all privileged operations. Regular penetration testing.  
**Status:** ✅ Mitigated (requires ongoing testing)  
**References:** `backend/src/middleware/rbac.js`

#### Threat: SQL injection
**Component:** Backend/Indexer  
**Description:** Attacker injects SQL to bypass authorization or exfiltrate data.  
**Mitigation:** Parameterized queries only (no string concatenation). ORM (Sequelize/Drizzle) provides escaping. Input validation on all endpoints.  
**Status:** ✅ Mitigated  
**References:** `backend/src/db/`, `backend/src/middleware/validation.js`

---

## Bridge & Cross-Chain (if applicable)

#### Threat: Bridge oracle manipulation
**Component:** Bridge (future)  
**Description:** Attacker compromises bridge validators to mint unbacked tokens on destination chain.  
**Mitigation:** Multi-oracle consensus required. Collateralized validators. Fraud proofs with slashing.  
**Status:** 🔮 Not yet implemented  
**References:** TBD (bridge is out of scope for current mainnet release)

---

## Residual Risks

1. **Admin key compromise** — If multisig threshold is breached, attacker can upgrade contracts or drain reserves. **Mitigation:** Hardware wallets, geographic distribution of signers, social recovery.

2. **Soroban runtime bugs** — Vulnerabilities in Stellar's smart contract VM could affect all contracts. **Mitigation:** Stay updated with Stellar security advisories. Formal verification of critical contracts.

3. **Off-chain dependency failures** — RPC node downtime, indexer lag, or backend outages degrade UX but don't compromise on-chain funds. **Mitigation:** Multi-region deployment, failover RPC endpoints, circuit breakers.

4. **Social engineering** — Users tricked into signing malicious transactions or revealing private keys. **Mitigation:** Wallet warnings, transaction simulation, user education.

---

## Mitigation Tracking

| Threat ID | Status | Issue/PR | Owner |
|-----------|--------|----------|-------|
| Fake indexer events | ⚠️ Needs hardening | [#856](https://github.com/FinesseStudioLab/Trivela/issues/856) | Backend team |
| Admin key custody | ⚠️ Process required | [GOVERNANCE.md](./GOVERNANCE.md) | Ops team |
| Backend logs tampering | ⚠️ External sink setup | [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md) | Ops team |
| Private votes | 🚧 In progress | [#846](https://github.com/FinesseStudioLab/Trivela/issues/846) | Contracts team |
| API overload testing | ⚠️ Load testing needed | [SLO.md](./SLO.md) | Backend team |
| Websocket DoS | 🚧 In progress | [#859](https://github.com/FinesseStudioLab/Trivela/issues/859) | Backend team |

---

## Review & Updates

This threat model should be reviewed:
- Before each mainnet release
- After adding new features (especially cross-chain or privacy features)
- Following security audits or incident postmortems

**Last Updated:** 2026-08-25  
**Next Review:** Before mainnet launch (see [MAINNET_READINESS.md](./MAINNET_READINESS.md))
