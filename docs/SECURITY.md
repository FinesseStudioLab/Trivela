# Security Guide

Operational security procedures for Trivela mainnet deployments: key management, rotation, compromise
response, and on-chain admin transfers.

For the full mainnet deployment walkthrough, see [MAINNET_DEPLOY.md](MAINNET_DEPLOY.md).

---

## Key types and scope

| Key / secret | Where used | Impact if compromised |
| ------------ | ---------- | --------------------- |
| Contract admin keypair (`G...` / `S...`) | Soroban `propose_admin`, `credit`, campaign config | Full on-chain control of rewards and campaign contracts |
| `TRIVELA_API_KEYS` / `TRIVELA_MASTER_KEY` | Backend REST API write/admin routes | Off-chain campaign metadata, credits via backend, API key management |
| `JWT_SECRET` | Session/token signing (if enabled) | Forged auth tokens |
| `DATABASE_URL` credentials | PostgreSQL | Read/write all campaign and user metadata |
| Deploy identity (`STELLAR_SOURCE`) | WASM upload and contract deploy | Deploy malicious contracts, drain XLM for fees |

**Principle of least privilege:** use separate keys for contract admin, API admin, and deployment.
Never store secrets in git, CI logs, or plaintext tickets.

---

## Key generation best practices

1. Generate contract admin keys on a **hardware wallet** or air-gapped machine.
2. Use cryptographically random API keys (≥ 32 bytes, base64 or hex encoded).
3. Store production secrets in a dedicated secret manager (Kubernetes Secrets + ESO, AWS SSM, Vault).
4. Restrict production secret access to on-call engineers and CI deploy roles only.

---

## API key rotation (backend)

Trivela supports multiple API keys via `TRIVELA_API_KEYS` (comma-separated). Rotation without
downtime:

1. **Generate** a new key: `sk_prod_<random>`.
2. **Add** the new key to `TRIVELA_API_KEYS` alongside the old key:
   ```
   TRIVELA_API_KEYS=sk_prod_old,sk_prod_new
   ```
3. **Deploy** the backend with the updated env (blue/green recommended — see [DEPLOYMENT.md](DEPLOYMENT.md)).
4. **Update** all clients, CI jobs, and admin tools to use `sk_prod_new`.
5. **Remove** the old key from `TRIVELA_API_KEYS` and redeploy.
6. **Revoke** the old key in your internal access log / secret manager.

For the master admin key (`TRIVELA_MASTER_KEY`), schedule rotation during a maintenance window —
there is no multi-key grace period for master key operations.

### JWT secret rotation

1. Generate a new `JWT_SECRET`.
2. Deploy with the new secret during low traffic.
3. Existing tokens signed with the old secret become invalid immediately — plan for user re-auth if
   JWT sessions are in use.

---

## Contract admin rotation (two-step)

Both `trivela-rewards-contract` and `trivela-campaign-contract` use a **propose-then-accept**
pattern. A one-step transfer is not supported — this prevents bricking the contract if the wrong
address is entered.

### Read current state

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <admin-identity> \
  --network mainnet \
  -- propose_admin --help   # inspect available functions

# Or use stellar contract read for view functions:
# admin() -> Address
# pending_admin() -> Option<Address>
```

### Rotation procedure

Perform these steps on **both** the rewards and campaign contracts.

| Step | Actor | Action |
| ---- | ----- | ------ |
| 1 | Operator | Generate new admin keypair on target signer (hardware wallet). Verify it can sign on mainnet. |
| 2 | Current admin | Call `propose_admin(current_admin, new_admin)` |
| 3 | Operator | Confirm `pending_admin()` returns the new address; verify `aproposed` event on-chain |
| 4 | New admin | Call `accept_admin(new_admin)` — **must** sign from the new keypair (`require_auth`) |
| 5 | Operator | Verify `admin()` returns new address and `pending_admin()` is `None` |

To cancel a mistaken proposal before acceptance:

```bash
# Current admin only
cancel_admin_transfer(current_admin)
```

### Operator checklist

- [ ] New keypair generated and tested on the correct network
- [ ] `propose_admin` called on **rewards** contract
- [ ] `propose_admin` called on **campaign** contract
- [ ] `accept_admin` called on **rewards** contract from new keypair
- [ ] `accept_admin` called on **campaign** contract from new keypair
- [ ] Old admin key material securely destroyed or archived offline
- [ ] Deployment runbook and secret manager updated with new admin public key

> Complete `accept_admin` within the contract instance-storage TTL window (see contract TTL
> constants). If the pending proposal expires, repeat from step 2.

---

## Compromised admin keypair (on-chain)

If the **contract admin secret key** is suspected compromised:

### Immediate actions (first 30 minutes)

1. **Assess exposure** — check recent on-chain transactions for the admin address on
   [Stellar Expert](https://stellar.expert/explorer/public).
2. If the attacker has **not** yet called `propose_admin` to take over:
   - Generate a new secure admin keypair immediately.
   - From the **current uncompromised admin**, call `propose_admin` then `accept_admin` from the new
     keypair on both contracts (see rotation procedure above).
3. If the attacker **has** proposed themselves as admin:
   - Call `cancel_admin_transfer` from the current admin if still in control.
   - If admin slot is already lost, escalate to contract upgrade/migration (see below).

### If admin control is lost

1. Halt public announcements and disable new campaign creation via backend (`TRIVELA_API_KEYS`
   rotation + maintenance mode if available).
2. Document all malicious transactions (tx hashes, timestamps, affected accounts).
3. Evaluate `migrate()` / contract upgrade path if implemented (see [MAINNET_CHECKLIST.md](MAINNET_CHECKLIST.md)
   item on `upgrade()` entrypoint).
4. Deploy new contracts with a secure admin if migration is not available; update
   `REWARDS_CONTRACT_ID` / `CAMPAIGN_CONTRACT_ID` in production env.
5. Publish a transparent incident summary to stakeholders.

---

## Compromised API keys (off-chain)

If `TRIVELA_API_KEYS` or `TRIVELA_MASTER_KEY` is leaked:

1. **Immediately remove** the compromised key from `TRIVELA_API_KEYS` and redeploy the backend.
2. Rotate `TRIVELA_MASTER_KEY` if it was exposed.
3. Audit `audit_log` / application logs for unauthorized `POST`/`PUT`/`DELETE` requests during the
   exposure window.
4. Invalidate any CI/CD or third-party integrations still using the old key.
5. File an internal incident report; rotate adjacent secrets (database password, `JWT_SECRET`) if
   the leak vector could have exposed broader env access.

---

## Compromised deploy identity

If `STELLAR_SOURCE` secret is leaked:

1. Transfer remaining XLM out of the deploy account to a new secure account.
2. Remove the identity from CI/CD and local `stellar keys` stores.
3. Audit recent contract deployments — verify no unauthorized WASM was deployed from this identity.
4. Create a new deploy identity for future releases.

---

## Reporting security issues

Do **not** open public GitHub issues for undisclosed vulnerabilities. Contact maintainers via
[GitHub Security Advisories](https://github.com/FinesseStudioLab/Trivela/security/advisories/new)
or the channel listed in the repository security policy.

---

## Related docs

- [MAINNET_DEPLOY.md](MAINNET_DEPLOY.md) — production deployment walkthrough
- [DEPLOYMENT.md](DEPLOYMENT.md) — admin rotation overview and blue/green deploys
- [MAINNET_CHECKLIST.md](MAINNET_CHECKLIST.md) — launch readiness including audit and `SECURITY.md`
- [RUNBOOK.md](RUNBOOK.md) — incident response and rollback
