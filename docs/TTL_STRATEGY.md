# Instance-storage TTL strategy

The `rewards` and `campaign` contracts both maintain instance storage that the
host will archive (and stop returning) once its TTL runs out. Every
state-mutating entry point calls `env.storage().instance().extend_ttl(threshold,
extend_to)` so the contract keeps itself alive while it is being used.

## Why this matters

Stellar mainnet closes a ledger every ~5 seconds. The historical literal values
`extend_ttl(50, 100)` would have:

| Param | Meaning | Old literal | Equivalent wall-clock |
| --- | --- | --- | --- |
| `threshold` | extend if remaining life ≤ this many ledgers | 50 | ~4 minutes |
| `extend_to` | target remaining lifetime after extension | 100 | ~8 minutes |

So instance storage — including the admin address, balances, metadata, rate
limits, and merkle roots — would expire roughly 8 minutes after the last
mutation. In production that means losing admin control of the contract and
zeroing balances if the contract is idle through one short outage.

## Mainnet values

We size the lifetime so the contract remains live for ~30 days after the most
recent write, with the extension fired well before that floor is reached:

```rust
#[cfg(not(test))]
pub const TTL_THRESHOLD: u32 = 100_000;   // ≈ 6 days minimum life remaining
#[cfg(not(test))]
pub const TTL_EXTEND_TO: u32 = 518_400;   // ≈ 30 days target lifetime
```

These constants are applied at every `extend_ttl` call site in
[`contracts/rewards/src/lib.rs`](../contracts/rewards/src/lib.rs) and
[`contracts/campaign/src/lib.rs`](../contracts/campaign/src/lib.rs).

## Test overrides

Soroban test environments charge ledger budget for TTL bookkeeping. Using the
mainnet values in tests would either run out of budget or noisily extend
storage that no test depends on. We override via `cfg(test)`:

```rust
#[cfg(test)]
pub const TTL_THRESHOLD: u32 = 50;
#[cfg(test)]
pub const TTL_EXTEND_TO: u32 = 100;
```

No code change is needed in individual tests — `cargo test` picks the test
constants automatically.

## Operator guidance

- A contract that has been idle for more than 30 days should be probed via a
  cheap read entry point (e.g. `schema_version`) before being trusted. If
  reads fail with a "storage entry archived" error, the operator must restore
  instance storage from the host's archival snapshot before resuming usage.
- The campaign contract's per-participant state lives in **persistent** storage
  (not instance) and is therefore subject to its own TTL. This document covers
  instance storage only.
- If campaign metadata exceeds 30 days of inactivity, consider lowering
  `TTL_EXTEND_TO` to balance archival risk against per-write fee cost.

## References

- [Soroban state-archival docs](https://developers.stellar.org/docs/learn/encyclopedia/storage/state-archival)
- Issue [#279](https://github.com/FinesseStudioLab/Trivela/issues/279) — the original report
