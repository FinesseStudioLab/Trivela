# Soroban Storage Rent / TTL Budgeting Model

> Addresses issue #799 — Contract storage rent / TTL budgeting model and alerts.

## Background

Soroban charges **rent** to keep contract storage alive. Every persistent-storage entry has a TTL
(time-to-live) in ledgers. When an entry's TTL reaches zero the network archives it (data is gone
from the live state). Extending TTL costs a fee proportional to the entry size and the number of
ledgers requested.

Mainnet ledgers close every ~5 s, so:

| Period  | Ledgers    |
| ------- | ---------- |
| 1 hour  | ~720       |
| 1 day   | ~17,280    |
| 1 week  | ~120,960   |
| 30 days | ~518,400   |
| 1 year  | ~6,307,200 |

## Storage categories used by Trivela

| Category   | Key pattern                          | TTL constants                                           |
| ---------- | ------------------------------------ | ------------------------------------------------------- |
| Instance   | `(admin, active, maxcap, …)`         | `TTL_THRESHOLD = 100,000 / TTL_EXTEND_TO = 518,400`     |
| Persistent | `(PARTICIPANT, addr)`                | `PARTICIPANT_TTL_THRESHOLD / PARTICIPANT_TTL_EXTEND_TO` |
| Persistent | `(REFERRAL, addr)` + `REFERRAL_LOCK` | same as participant                                     |
| Persistent | `(REFERRAL_COUNT, addr)`             | same as participant                                     |
| Persistent | `(NONCE_USED, nonce)`                | expires after `NONCE_TTL_LEDGERS`                       |

## Cost model

Soroban rent cost formula (approximate):

```
rent_fee = (entry_size_bytes × ledgers_extended) / RENT_FEE_DENOMINATOR
```

`RENT_FEE_DENOMINATOR` is a network-level parameter (~3,543,200 on mainnet as of mid-2025). The
minimum entry size is 104 bytes. Typical Trivela entries are 128–256 bytes.

### Per-entry extension cost (1 year, 256-byte entry)

```
cost = (256 × 6,307,200) / 3,543,200 ≈ 456 stroops ≈ 0.0000456 XLM
```

### Budget projection

| Participants | Entries (×3) | Annual rent (XLM) |
| ------------ | ------------ | ----------------- |
| 1,000        | 3,000        | ~0.137            |
| 10,000       | 30,000       | ~1.37             |
| 100,000      | 300,000      | ~13.7             |
| 1,000,000    | 3,000,000    | ~137              |

> **Rule of thumb**: budget 0.000046 XLM per participant per year for persistent storage rent.
> Instance storage is a flat ~0.024 XLM/year regardless of participant count.

## TTL extension strategy

1. **Bump-on-write** (current): Every write to a persistent entry calls
   `extend_ttl(THRESHOLD, EXTEND_TO)`. This is the cheapest strategy — no extra transaction is
   needed; rent is paid at mutation time.

2. **Periodic sweeper** (future): A backend cron job calls `storage_stats`, identifies entries
   within 20 % of TTL expiry, and submits an `extend_ttl` transaction batched across up to 20
   entries per transaction.

3. **Pruning** (implemented): `prune_expired_participants` and `prune_used_nonces` remove entries
   whose data has already been archived, recovering the bookkeeping index cost.

## Expiry alerts

Run `scripts/check-ttl-rent.js` against mainnet/testnet to flag entries at risk. The script reads
`storage_stats` from the contract and prints a report:

```
$ node scripts/check-ttl-rent.js --network mainnet --contract CABC...

ALERT  participant:GABCDEF… — TTL 1240 ledgers (≈1.7 h) — EXPIRING SOON
OK     participant:GXYZ… — TTL 480320 ledgers (≈27.8 days)
...
Summary: 3 entries below threshold (10,000 ledgers / ~0.7 days)
```

Set `RENT_ALERT_THRESHOLD_LEDGERS` in `.env` (default: 10,000 ≈ 0.7 days) to control the alert
boundary.

## Recommended CI check

Add to `contracts-ci.yml`:

```yaml
- name: Verify TTL constants are within production budget
  run: |
    python3 - <<'EOF'
    # TTL_EXTEND_TO must cover at least 30 days in mainnet ledgers
    MIN_PROD_TTL = 518_400  # 30 days
    TTL_EXTEND_TO = 518_400  # from lib.rs
    assert TTL_EXTEND_TO >= MIN_PROD_TTL, f"TTL_EXTEND_TO {TTL_EXTEND_TO} < {MIN_PROD_TTL}"
    print(f"TTL_EXTEND_TO {TTL_EXTEND_TO} ledgers OK (≥ 30 days)")
    EOF
```
