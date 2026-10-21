# Storage model & size budget (issue #835)

This complements [`STORAGE_RENT_MODEL.md`](STORAGE_RENT_MODEL.md) (rent/TTL cost projections) and
[`TTL_STRATEGY.md`](TTL_STRATEGY.md) (TTL constants) with the specific question issue #835 raises:
**can any contract code path push a single ledger entry, or the instance entry as a whole, past
Soroban's per-entry size cap as usage grows?**

## Per-entry size budget

Soroban ledger entries are capped in size at the network level (`max_entry_size` in the current
network config; low hundreds of KB on Stellar mainnet as of writing). The entries below are the ones
whose size scales with usage rather than being fixed at a handful of bytes:

| Key                                | Storage type | Grows with                          | Bytes / element (approx.) | Budgeted max elements | Approx. max size |
| ----------------------------------- | ------------ | ------------------------------------ | -------------------------- | ---------------------- | ----------------- |
| `(PARTICIPANT, addr)` (campaign)     | persistent   | one entry per participant            | ~40 B (fixed, one per key) | unbounded (one key each) | 40 B / entry      |
| `PARTICIPANT_COUNT` (campaign)       | instance     | a single `u64` counter               | 8 B                        | n/a                    | 8 B                |
| `MULTISIG_PROP` proposals (rewards)  | instance     | `approvals: Vec<Address>` per proposal | ~36 B × signers          | signers ≤ `threshold` cap, single-digit in practice | low hundreds of B |
| `GOV_PROP` proposals (rewards)       | instance     | `votes_for: Vec<Address>` per proposal | ~36 B × voters           | bounded by quorum config | low hundreds of B  |
| `TIMELOCK_ENTRY` entries (rewards, issue #838) | persistent | one entry per queued op hash, `eta_ledger: u32` | 32 B key + 4 B value | one per distinct `op_hash` in flight | 36 B / entry |

Because `(PARTICIPANT, addr)` and `TIMELOCK_ENTRY` are keyed **per address / per op-hash** in
**persistent** storage, each individual entry stays small and fixed-size regardless of how many
participants or queued ops exist — growth adds more small entries rather than growing one entry. The
bug class this document (and the new stress test) guards against is the other shape: an
**instance**-storage `Vec`/map that accumulates one element per user/action inside a *single* entry
(e.g. a naive "all participants" list stored as one `Vec<Address>` instance key), which does grow
one entry without bound and can eventually exceed the size cap on its own.

Auditing the current contracts: no instance-storage key in `rewards` or `campaign` holds a
per-user/per-action-unbounded collection. The multisig and governance proposal `Vec`s are the
closest candidates, but both are bounded by their own configuration (signer threshold / quorum),
not by total usage over time.

## Stress test coverage

`contracts/campaign/src/test.rs::test_high_volume_registration_stress` registers 3,000 distinct
participants in a single test run and asserts every registration succeeds and is recorded. This is
the class of test the issue asks for: tiny-N unit tests can't catch a regression that reintroduces
an unbounded per-entry collection, because the collection would still be small at N=2 or N=3. At
N=3,000 a regression of that shape either fails on a real ledger-entry-size limit (in a sandboxed
Soroban host, this typically manifests as a budget/memory failure) or at minimum becomes visible in
wall-clock test time, giving a concrete regression signal.

## Growing this budget

If a future feature adds a genuinely unbounded per-instance collection (as opposed to per-key
persistent entries), it must either:

1. Move to a per-key persistent entry (like `PARTICIPANT`), so growth is spread across many small
   entries instead of one large one; or
2. Cap the collection size explicitly (as the multisig/governance proposals already do via
   `threshold`/`quorum`) and document the cap and its worst-case entry size here.
