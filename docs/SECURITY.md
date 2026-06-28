# Security Policy

This document covers key management, incident response, and the admin transfer procedure for
Trivela's Soroban contracts.

---

## Reporting a Vulnerability

Do **not** open a public GitHub issue for security vulnerabilities. Email
**security@trivela.com** with:

- A description of the vulnerability and the component affected
- Steps to reproduce (or a proof-of-concept)
- Potential impact

You will receive an acknowledgement within 48 hours. We aim to release a fix within 14 days for
critical issues and 30 days for others. Please allow us to coordinate disclosure before publishing.

---

## Key Inventory

| Key / Secret              | Purpose                                           | Storage requirement               |
| ------------------------- | ------------------------------------------------- | --------------------------------- |
| Admin keypair (`G...`)    | Contract admin calls (`propose_admin`, upgrades)  | Hardware wallet or HSM            |
| `STELLAR_SECRET_KEY`      | SEP-10 / sponsored account signing                | Secrets manager (Vault, AWS SM)   |
| `TRIVELA_MASTER_KEY`      | Privileged API operations                         | Secrets manager                   |
| `TRIVELA_API_KEYS`        | Standard API access                               | Secrets manager                   |
| `TRIVELA_JWT_SECRET`      | JWT signing                                       | Secrets manager, min 32 chars     |
| `DATABASE_URL`            | PostgreSQL credentials                            | Secrets manager                   |
| `VAPID_PRIVATE_KEY`       | Web Push signing                                  | Secrets manager                   |

**Rules:**

- Secrets must never be committed to git, logged, or sent over unencrypted channels.
- Production secrets must differ from testnet secrets.
- Rotate all secrets at least annually or immediately after any suspected compromise.

---

## Routine Key Rotation

Follow this procedure to rotate any backend secret (JWT secret, API keys, database password, etc.)
without downtime.

### Backend secrets (zero-downtime rotation)

1. **Generate** the new secret:
   ```bash
   openssl rand -hex 32
   ```
2. **Add** the new value to your secrets manager alongside the old one (if the system supports
   multi-key validation, enable it so both old and new tokens are accepted temporarily).
3. **Update** the environment variable in your deployment platform (Kubernetes secret, Helm values,
   etc.) and roll out the new backend pods:
   ```bash
   kubectl rollout restart deployment/trivela-backend -n trivela-prod
   kubectl rollout status deployment/trivela-backend -n trivela-prod
   ```
4. **Verify** that the new pods are healthy (`/health` returns 200) and that API clients can
   authenticate with the new key.
5. **Revoke** the old secret from the secrets manager.
6. **Document** the rotation in your change log with the date and reason.

### API key rotation (`TRIVELA_API_KEYS`)

`TRIVELA_API_KEYS` accepts a comma-separated list, so you can add the new key before removing the
old one:

```bash
# Phase 1 — add new key (old key still works)
TRIVELA_API_KEYS="old-key,new-key"

# Distribute new key to all consumers and confirm they have switched.

# Phase 2 — remove old key
TRIVELA_API_KEYS="new-key"
```

### `STELLAR_SECRET_KEY` rotation

The `STELLAR_SECRET_KEY` is a Stellar keypair used for server-side signing (SEP-10, sponsored
accounts). It does **not** control any contract admin authority.

1. Generate a new Stellar keypair:
   ```bash
   stellar keys generate trivela-server-new --network mainnet
   stellar keys address trivela-server-new
   ```
2. Fund the new account (minimum 1 XLM base reserve).
3. Update `STELLAR_SECRET_KEY` in the secrets manager with the new secret key.
4. Roll out the backend (step 3 of routine rotation above).
5. Verify SEP-10 challenges are signed by the new key.
6. The old keypair can be decommissioned (it holds no special on-chain authority).

---

## Compromised Admin Keypair — Incident Response

The admin keypair is the highest-privilege credential in the system. If you believe it has been
compromised, act immediately.

### Step 1 — Contain

- Revoke any cloud credentials that may have given access to the secret (rotate AWS/GCP IAM keys,
  Vault tokens, etc.).
- If the key is in a hardware wallet that has been lost or stolen, treat the key as compromised
  regardless of PIN protection.

### Step 2 — Initiate emergency admin transfer

Use a backup admin keypair or a multisig key that was established during initial setup. If no
backup key exists, you will need to coordinate with the Stellar network — a compromised admin with
no backup is a critical situation; contact **security@trivela.com** immediately.

Assuming you have a backup key (`trivela-admin-backup`):

```bash
# 1. Propose the backup key as the new admin (called from the COMPROMISED key if still accessible,
#    or from any key that has been granted emergency authority).
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --network mainnet \
  --source trivela-admin-backup \
  -- propose_admin \
  --current_admin <CURRENT_ADMIN_PUBLIC_KEY> \
  --new_admin <BACKUP_ADMIN_PUBLIC_KEY>

# Repeat for each contract (campaign, badges, nullifiers, voting).
```

```bash
# 2. Accept from the backup key.
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --network mainnet \
  --source trivela-admin-backup \
  -- accept_admin \
  --new_admin <BACKUP_ADMIN_PUBLIC_KEY>
```

```bash
# 3. Confirm the transfer succeeded.
stellar contract invoke \
  --id <REWARDS_CONTRACT_ID> \
  --network mainnet \
  --source trivela-admin-backup \
  -- admin
# Should return BACKUP_ADMIN_PUBLIC_KEY.
```

### Step 3 — Rotate to a new permanent key

Once the backup key is in control, generate a fresh keypair on a hardware wallet and transfer
admin to it using the normal two-step procedure (see below).

### Step 4 — Post-incident

- Audit contract event logs for any unauthorized calls between the estimated compromise time and
  the transfer.
- Rotate all backend secrets as a precaution (the admin keypair is separate from backend secrets
  but assume full breach).
- Write an incident report covering timeline, root cause, and remediation.

---

## Admin Transfer — Two-Step Procedure

Both the `rewards` and `campaign` contracts (and all other Trivela contracts) implement a
**propose-then-accept** pattern. A one-step transfer to a wrong address cannot brick the contract
because the current admin retains control until the new admin explicitly accepts.

### Functions

| Function                                  | Called by       | Effect                                            |
| ----------------------------------------- | --------------- | ------------------------------------------------- |
| `propose_admin(current_admin, new_admin)` | Current admin   | Writes `new_admin` to `pending_admin`; no change to `admin` slot |
| `cancel_admin_transfer(current_admin)`    | Current admin   | Clears `pending_admin`; no transfer occurs        |
| `accept_admin(new_admin)`                 | New admin       | Moves `new_admin` into `admin` slot; clears `pending_admin` |

### Pre-rotation checklist

- [ ] Generate the new admin keypair on the target hardware wallet. Do not copy the secret over
      the wire.
- [ ] Fund the new account (minimum 1 XLM).
- [ ] Test that the new keypair can sign a no-op transaction on mainnet.
- [ ] Confirm `pending_admin()` returns `None` (no in-flight transfer from a previous attempt).

### Step 1 — Propose

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  --source <CURRENT_ADMIN_IDENTITY> \
  -- propose_admin \
  --current_admin <CURRENT_ADMIN_PUBLIC_KEY> \
  --new_admin <NEW_ADMIN_PUBLIC_KEY>
```

Verify the `aproposed` event appears on-chain with the correct `new_admin` address.

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  --source <CURRENT_ADMIN_IDENTITY> \
  -- pending_admin
# Must return NEW_ADMIN_PUBLIC_KEY
```

If the address is wrong, call `cancel_admin_transfer` and start over. The current admin slot is
unchanged until `accept_admin` is called.

### Step 2 — Accept

The new admin must call `accept_admin` within **30 days** (the instance-storage TTL). After that
window `pending_admin` is cleared automatically by the ledger, and the proposal expires.

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  --source <NEW_ADMIN_IDENTITY> \
  -- accept_admin \
  --new_admin <NEW_ADMIN_PUBLIC_KEY>
```

### Verify

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  --source <NEW_ADMIN_IDENTITY> \
  -- admin
# Must return NEW_ADMIN_PUBLIC_KEY

stellar contract invoke \
  --id <CONTRACT_ID> \
  --network mainnet \
  --source <NEW_ADMIN_IDENTITY> \
  -- pending_admin
# Must return None
```

Repeat steps 1–2 and verify for **each deployed contract** (rewards, campaign, badges, nullifiers,
voting).

---

## Defense-in-Depth Recommendations

- **Multisig**: Consider a multisig signer policy (e.g., 2-of-3) on the admin keypair so that no
  single person can initiate a transfer.
- **Time-lock**: For non-emergency rotations, delay the `accept_admin` call by 24–48 hours to give
  team members time to detect unauthorized proposals.
- **Monitoring**: Alert on any `propose_admin` or `accept_admin` contract events in production.
  These should be rare and always expected.
- **Backup key**: Maintain a cold-storage backup admin key in a separate geographic location.
  Test it annually.

---

## References

- [MAINNET_DEPLOY.md](./MAINNET_DEPLOY.md) — production deployment guide
- [DEPLOYMENT.md](./DEPLOYMENT.md) — admin transfer and blue/green deployment
- [MAINNET_CHECKLIST.md](./MAINNET_CHECKLIST.md) — launch sign-off checklist
- [RUNBOOK.md](./RUNBOOK.md) — incident response and rollback procedures
