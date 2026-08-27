# On-chain invariants (issue #840)

Core safety properties the rewards contract must never violate, and where each is enforced/tested.

## 1. Supply conservation

**Invariant:** `TOTAL_SUPPLY == Σ balances` at all times — crediting increases both by the same
amount, redeeming/burning decreases both by the same amount, no path can move one without the other.

- Enforced in `credit()`, `batch_credit()`, `redeem()`, and the SEP-41 `burn`/`burn_from` paths —
  every mutation of a `(BALANCE, user)` entry has a matching `TOTAL_SUPPLY` update in the same
  function (see the "issue #1021" comments at each call site in `contracts/rewards/src/lib.rs`).
- Property-tested: `contracts/rewards/src/fuzz_test.rs`'s proptest suite exercises randomized
  sequences of credit/redeem/burn calls and asserts the sum of balances tracks `total_supply()`
  (`cargo test --release -- fuzz_` in CI).
- Kani-proved (arithmetic-safety layer, not full conservation): `balance_overflow_safety` in
  `contracts/rewards/src/kani_harnesses.rs` proves the underlying `checked_add`/`checked_sub` used
  by every balance/supply mutation can't silently wrap.

## 2. Redemption reserve solvency

**Invariant:** the contract can always honor every outstanding redemption — the tracked reserve
never exceeds what the SAC token contract actually holds, and a redemption never pays out more than
the reserve covers.

- Enforced in `redeem()` (issue #834, this repo's prior fix): every payout is bounded by
  `min(mirrored REDEMPTION_RESERVE counter, token::Client::balance(contract))`, so a desync between
  the mirrored counter and the real SAC balance can never let a redemption over-pay.
- Tested: `contracts/rewards/src/test.rs::test_redeem_conserves_reserve` (the mirrored counter and
  real SAC balance stay in lockstep after a normal redemption) and
  `test_redeem_rejects_when_desynced_above_actual_balance` (an artificially desynced counter is still
  rejected against the real balance).
- Kani-proved: `redemption_reserve_non_negative` in `kani_harnesses.rs` proves the reserve
  subtraction in `redeem()` can never underflow once bounded by `available_reserve`.

## 3. Vesting release monotonicity and bounds

**Invariant:** `compute_unlocked(now, record)` never exceeds `record.total`, is `0` before
`start_ledger`, equals `total` at/after `end_ledger`, and is monotonically non-decreasing in `now`.

- Kani-proved: `compute_unlocked_safety` in `kani_harnesses.rs`.

## 4. Fee-rate / bonus-rate arithmetic never overflows

**Invariant:** `amount * rate_bps / 10_000`-shaped calculations (multiplier application, referral
bonus) never silently overflow `u64`/`u128`, and — for referral bonuses specifically — a non-zero
qualifying amount at a non-zero rate always produces a non-zero bonus (no unintended zero-rounding
that would make a configured bonus a no-op).

- Kani-proved: `multiplier_calculation_safety`, `referral_bonus_safety` in `kani_harnesses.rs`.

## Running the proofs

```bash
cd contracts/rewards
cargo kani --harness compute_unlocked_safety --enable-unwind 0
cargo kani --harness multiplier_calculation_safety --enable-unwind 0
cargo kani --harness referral_bonus_safety --enable-unwind 0
cargo kani --harness balance_overflow_safety --enable-unwind 0
cargo kani --harness redemption_reserve_non_negative --enable-unwind 0
```

All five are wired into `contracts-ci.yml`'s "Run Kani formal verification — rewards contract" step
(PR-only, `continue-on-error`, since Kani installation is best-effort in CI).

## Not yet covered (follow-up)

- A full end-to-end Kani/property proof of supply conservation across *all* public entrypoints in
  one harness (today it's proptest-covered for randomized sequences, plus per-function manual
  invariant comments — a single formal harness covering every entrypoint's effect on
  `TOTAL_SUPPLY`/`BALANCE` together would be stronger but is a larger undertaking than this pass).
- Sanctifier `verify` dogfooding (referenced in the issue) — not run here; needs the external tool
  set up separately.
