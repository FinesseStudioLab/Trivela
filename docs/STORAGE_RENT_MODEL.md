# Soroban Storage Rent Model — Trivela Contract Analysis (#799)

This document describes how Soroban's rent mechanism applies to the Trivela campaign and rewards
contracts, the cost projections for a 10,000-participant campaign, and the TTL strategy used to keep
rent predictable.

---

## 1. Background: Soroban storage types

| Type         | Rent behaviour                                                                                                               | When used in Trivela                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `instance`   | One TTL for the entire contract instance (all instance keys together). Rent is charged once per ledger the instance is live. | Admin, config, counters, multipliers    |
| `persistent` | Each key has its own independent TTL. Rent charged per key.                                                                  | Per-participant flags, referral records |
| `temporary`  | Not included in ledger snapshots; disappears after TTL without a fee.                                                        | (not used in Trivela)                   |

Rent on Soroban is denominated in **stroops per ledger per byte of entry size** (the exact rate is a
network-level parameter). The key insight is:

- **Instance storage** is cheap in write operations but its TTL covers _all_ instance keys jointly,
  so one missed renewal can evict the whole contract.
- **Persistent storage** pays per-key per-ledger but survives indefinitely as long as it is renewed
  before its TTL expires.

---

## 2. TTL constants in Trivela

```
# contracts/campaign/src/lib.rs
TTL_THRESHOLD  = 100_000 ledgers  (~6 days at 5 s/ledger)
TTL_EXTEND_TO  = 518_400 ledgers  (~30 days)

PARTICIPANT_TTL_THRESHOLD = 100 ledgers  (test placeholder; see note)
PARTICIPANT_TTL_EXTEND_TO = 500 ledgers  (test placeholder; see note)
```

> **Note** — The `PARTICIPANT_TTL_*` constants are intentionally modest pending real traffic data.
> Deployers should raise them to match the full campaign window once `max_cap` and `end_time` are
> public (see `do_register` comment in the source for the rationale).

---

## 3. Cost model — 10,000-participant campaign

The storage entry sizes below are estimates based on the XDR encoding of each key-value pair:

| Entry                             | Key size (B) | Value size (B) | Total per entry (B) | Count (10k) | Total size (KB) |
| --------------------------------- | ------------ | -------------- | ------------------- | ----------- | --------------- |
| `(PARTICIPANT, addr)`             | 36           | 4              | 40                  | 10,000      | 390             |
| `(REFERRAL, addr) -> addr`        | 36           | 32             | 68                  | ≤10,000     | ≤664            |
| `(REFERRAL_COUNT, addr) -> u64`   | 36           | 8              | 44                  | ≤10,000     | ≤430            |
| `(REFERRAL_LOCKED, addr) -> bool` | 36           | 4              | 40                  | ≤10,000     | ≤390            |
| Contract instance (all keys)      | —            | ~4 KB est.     | ~4,096              | 1           | ~4              |
| **Worst-case total**              |              |                |                     |             | **~1,878 KB**   |

At Soroban mainnet rates (varies; approximate as of mid-2025):

- Instance storage: ~0.002 XLM / day for a ~4 KB instance.
- Persistent storage: ~0.001 XLM / key / 30-day TTL window at 40–68 B/key.

**10k participants, worst-case persistent entries (30k keys × ~50 B avg):**

```
30,000 keys × 50 B × (1 stroop/ledger/B × 518,400 ledgers) / 10^7
≈ 30,000 × 50 × 51.84 × 10^-7
≈ 7.78 XLM per 30-day cycle
```

This is a rough upper bound; actual rates depend on the live network fee schedule. Monitor via
`stellar contract inspect --wasm ... --output storage` after each deploy and adjust
`PARTICIPANT_TTL_EXTEND_TO` accordingly.

---

## 4. Renewal strategy

Every state-mutating entry point in the campaign and rewards contracts calls
`extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO)` on the instance at the end of the function. This means:

- **Active campaigns** (frequent registrations) effectively extend the instance indefinitely at no
  extra cost.
- **Inactive campaigns** (no registrations after campaign end) need a manual or scheduled
  `extend_ttl` call to keep the contract live. The admin should set a keeper task (cron job or
  indexer trigger) that calls any read function once every ~25 days to re-extend the TTL before
  `TTL_THRESHOLD` is crossed.

For **persistent per-participant keys**, each `register` call extends only that participant's keys.
Keys for participants who registered and never interacted again will need a sweeper if their
`PARTICIPANT_TTL_EXTEND_TO` is shorter than the campaign lifetime. Set it to at least the campaign
`end_time − now` in ledgers.

---

## 5. Recommendations

1. **Raise `PARTICIPANT_TTL_EXTEND_TO`** to match the campaign window before deploying to mainnet. A
   90-day campaign needs `~1,555,200` ledgers.
2. **Add a keeper** that calls `activity_log()` (a read-only view) periodically so the instance TTL
   never lapses between registrations.
3. **Monitor total rent** with `stellar contract inspect --output ledger-entries` piped into a
   Prometheus exporter (see `deployment/observability/`).
4. **Prune old referral records** via the pruning mechanism (issue #451) after the campaign ends to
   reclaim storage fees for expired participant keys.

---

## 6. Further reading

- [Soroban storage documentation](https://developers.stellar.org/docs/build/smart-contracts/example-contracts/storage)
- `docs/TTL_STRATEGY.md` — internal TTL rationale document
- `contracts/campaign/src/lib.rs` — `TTL_THRESHOLD`, `TTL_EXTEND_TO` constants
