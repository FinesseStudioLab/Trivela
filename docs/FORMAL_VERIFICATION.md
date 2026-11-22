# Formal Verification — Contract Invariants

This document describes the formally verified invariants for the Trivela Soroban contracts using the
[Kani Rust Verifier](https://model-checking.github.io/kani/) and property-based testing with
`proptest`.

## Overview

| Contract | Tool     | Invariants                     | Status      |
| -------- | -------- | ------------------------------ | ----------- |
| Rewards  | Kani     | 4 arithmetic safety properties | ✅ Verified |
| Rewards  | Z3 (SMT) | Supply/balance conservation (#1317) | ✅ Proved for credit, batch_credit, claim, admin_transfer |
| Rewards  | proptest | 7 behavioral invariants        | ✅ Passing  |
| Campaign | proptest | 7 behavioral invariants        | ✅ Passing  |

## Kani-Verified Invariants (Rewards Contract)

### 1. Vesting Linear Interpolation Safety (`compute_unlocked_safety`)

**Invariant**: For any `VestingRecord { total, start_ledger, end_ledger }` and any `now`:

- `compute_unlocked(now, record) <= record.total` (never exceeds total)
- `now <= start_ledger ⟹ result = 0` (nothing before start)
- `now >= end_ledger ⟹ result = total` (everything after end)
- `start_ledger < now < end_ledger ∧ total > 0 ⟹ result > 0` (some vesting during period)

**Property**: The linear interpolation formula `total * (now - start) / (end - start)` never
overflows u128 intermediate computation and produces correct results.

### 2. Multiplier Calculation Safety (`multiplier_calculation_safety`)

**Invariant**: For any `base_amount: u64` and `multiplier_bps: u32`:

- `(base_amount as u128) * (multiplier_bps as u128)` never overflows u128
- `product / 10_000` fits in u64 when the intermediate multiplication fits in u128

**Property**: The formula `base_amount * multiplier_bps / BPS_DENOMINATOR` is safe for all valid
input ranges (`base_amount <= MAX/2`, `multiplier_bps <= 100,000`).

### 3. Referral Bonus Calculation Safety (`referral_bonus_safety`)

**Invariant**: For any `qualifying_amount: u64` and `rate_bps: u32`:

- `(qualifying_amount as u128) * (rate_bps as u128)` never overflows u128
- `product / 10_000` fits in u64
- Result is always > 0 when both inputs are > 0

**Property**: The referral bonus formula is safe from overflow for all configurations where
`rate_bps <= MAX_REFERRAL_RATE_BPS (100,000)`.

### 4. Balance Overflow Safety (`balance_overflow_safety`)

**Invariant**: For any `current: u64` and `amount: u64`:

- `current.checked_add(amount)` returns `Some` if and only if no overflow occurs
- When `Some(new_balance)`: `new_balance >= current` and `new_balance >= amount`
- When `None`: overflow was correctly detected

**Property**: Balance additions using `checked_add` prevent silent wrapping and correctly propagate
`Error::Overflow`.

## Reward Accounting Invariant (Z3 / SMT) — #1317

Kani above proves the *arithmetic* is safe. This section proves the *accounting*: the points the
contract has issued and not yet claimed always equal the points users hold.

> **Invariant (I1, #1021):** `TOTAL_SUPPLY = Σ balance(user)` over all users.

Supporting facts used in the proofs: every balance is at most the sum (`x ≤ B`), the sum fits in a
`u64` (`B ≤ 2^64 − 1`), and `CLAIMED` only grows.

### Method

Each state-changing operation is modelled as an exact transformation of three quantities —
`S` (`TOTAL_SUPPLY`), `B` (sum of balances) and the balance `x` of the user it touches — over
unbounded integers constrained to the `u64` range, including the checked arithmetic that makes an
operation fail (and therefore write nothing) on overflow. Z3 is asked for a counter-example: a
pre-state satisfying the invariant, in which the operation succeeds, but the post-state violates it.
`unsat` means no such state exists, so the operation preserves the invariant (inductive step). The
base case is `initialize`. Together these prove the invariant holds in every reachable state of the
modelled operations.

Models live in `contracts/rewards/formal/` (SMT-LIB 2, one property per file; the first line declares
the expected result) and are checked by `scripts/verify-reward-invariants.sh`.

| Model | Operation | Expected | Meaning |
| ----- | --------- | -------- | ------- |
| `01_credit_preserves_conservation` | `credit` | unsat | Proved: `S = B` is preserved. |
| `02_claim_preserves_conservation` | `claim` | unsat | Proved, and the `saturating_sub` on supply **never clamps**. |
| `03_admin_transfer_preserves_conservation` | `admin_transfer` | unsat | Proved: transfers neither create nor destroy points. |
| `04_batch_credit_preserves_conservation` | `batch_credit` (fixed) | unsat | Proved for the version that also updates the supply. |
| `05_batch_credit_without_supply_update_violates_conservation` | `batch_credit` (old) | **sat** | Negative control: the old code breaks `S = B`; Z3 returns the counter-example. |
| `06_claim_cannot_inflate` | `claim` | unsat | A claim never raises a balance or the supply. |
| `07_total_claimed_saturation` | `CLAIMED` | **sat** | Informational: `saturating_add` can pin `total_claimed` at `u64::MAX` (unreachable in practice). |
| `08_initial_state_satisfies_invariant` | `initialize` | unsat | Induction base. |

### What it found

The first run of the model showed that `batch_credit` credited every recipient's balance but never
touched `TOTAL_SUPPLY` (model 05 is satisfiable — for example one batch of two 1-point credits on an
empty contract leaves `S = 0`, `B = 2`). The consequences were a wrong `total_supply()`, and a later
`claim` silently clamping the supply at zero (`saturating_sub`) instead of reducing it. `batch_credit`
now adds the batch total to `TOTAL_SUPPLY` (checked, and before any write so an overflow stays
atomic). While fixing it, a second defect showed up: a recipient listed twice in one batch had only
the *last* amount credited (each entry was staged from the stored balance), which would have made the
supply and the balances disagree again. Duplicates now accumulate. Regression tests:
`test_batch_credit_updates_total_supply`, `test_batch_credit_duplicate_recipient_is_credited_in_full`,
`test_batch_credit_is_atomic_when_total_supply_would_overflow` and
`test_total_supply_equals_sum_of_balances_across_mixed_operations` in `contracts/rewards/src/test.rs`.

### Scope and limits

- **Modelled:** `credit` (and therefore `credit_for_campaign` / `credit_with_distribution`, which
  call it), `batch_credit`, `claim`, `admin_transfer`.
- **Not modelled:** the other balance-changing paths (vesting, staking, redemption, referral and
  airdrop payouts, burn proposals). They should be added as further models; each one needs the same
  `S`/`B` bookkeeping argument.
- The models are hand-written abstractions of the Rust code, not extracted from it, so they must be
  updated when those functions change. The Rust regression tests and the proptest/Kani checks cover
  the implementation itself.
- The proofs assume operations run one at a time and fail atomically, which Soroban guarantees per
  invocation.
- The K Framework was not used; Z3 was enough for these linear-arithmetic properties.

### Running

```bash
brew install z3            # or: sudo apt-get install z3
./scripts/verify-reward-invariants.sh                # all models
./scripts/verify-reward-invariants.sh 04_*.smt2      # one model
z3 contracts/rewards/formal/05_batch_credit_without_supply_update_violates_conservation.smt2   # see the counter-example
```

The script fails if any model's result differs from its `; expect:` line, so a proof that stops
holding **and** a negative control that stops finding its counter-example are both caught. CI runs it
in the `contracts` job of `.github/workflows/contracts-ci.yml`.

## proptest Behavioral Invariants

### Rewards Contract

| Invariant                | Property                                     | Test                                |
| ------------------------ | -------------------------------------------- | ----------------------------------- |
| Balance consistency      | `balance = Σcredits - Σclaims`               | `fuzz_balance_consistency`          |
| Credit limit enforcement | Amounts exceeding `max_credit_per_call` fail | `fuzz_credit_limit_enforcement`     |
| Rate limiting            | Calls exceeding `max_calls` per window fail  | `fuzz_rate_limiting`                |
| Campaign multiplier      | `actual = base * multiplier_bps / 10_000`    | `fuzz_campaign_multiplier_accuracy` |
| Pause blocking           | Paused contract rejects credit/claim         | `fuzz_pause_state_blocking`         |
| Vesting linearity        | Unlocked amount follows linear formula       | `fuzz_vesting_linear_interpolation` |
| Overflow protection      | Large amounts trigger `Error::Overflow`      | `fuzz_overflow_protection`          |

### Campaign Contract

| Invariant              | Property                                     | Test                                            |
| ---------------------- | -------------------------------------------- | ----------------------------------------------- |
| Count consistency      | `stored_count = \|registered_set\|`          | `fuzz_participant_count_matches_registered_set` |
| Cap enforcement        | Registrations fail when count >= max_cap     | `fuzz_max_cap_enforcement`                      |
| Time window            | Registrations outside window fail            | `fuzz_time_window_enforcement`                  |
| Nonce monotonicity     | Nonce increments by 1 per admin op           | `fuzz_admin_nonce_monotonicity`                 |
| Referral integrity     | `referral_count = \|referred_participants\|` | `fuzz_referral_count_integrity`                 |
| Inactive blocking      | Inactive campaign rejects registrations      | `fuzz_inactive_campaign_blocks_registration`    |
| Deregister consistency | `is_participant = false` after deregister    | `fuzz_deregister_consistency`                   |

## Negative Tests

The `negative_tests.rs` module proves the verification harnesses are sound:

| Test                                          | Injected Bug                            | Expected Detection             |
| --------------------------------------------- | --------------------------------------- | ------------------------------ |
| `negative_test_vesting_returns_too_much`      | Formula returns total at midpoint       | Invariant: `result <= total`   |
| `negative_test_multiplier_overflow_detection` | Wrapping vs checked arithmetic          | Overflow detection correctness |
| `negative_test_referral_bonus_denominator`    | Wrong denominator (1000 vs 10000)       | Result mismatch                |
| `negative_test_balance_overflow_wrapping`     | `wrapping_add` instead of `checked_add` | Silent overflow detected       |

## Running Verification Locally

```bash
# Run proptest fuzzing
cargo test --release -- fuzz_ --nocapture -p trivela-rewards-contract
cargo test --release -- fuzz_ --nocapture -p trivela-campaign-contract

# Run negative tests
cargo test negative_test_ -p trivela-rewards-contract

# Run Kani (requires kani-verifier)
cargo install kani-verifier && cargo kani setup
cargo kani --harness compute_unlocked_safety -p trivela-rewards-contract
cargo kani --harness multiplier_calculation_safety -p trivela-rewards-contract
cargo kani --harness referral_bonus_safety -p trivela-rewards-contract
cargo kani --harness balance_overflow_safety -p trivela-rewards-contract
```

## CI Integration

The `contracts-ci.yml` workflow includes:

1. **proptest fuzzing**: Runs on every PR, 100 cases per property
2. **Kani verification**: Runs on PRs (optional, continue-on-error)
3. **Negative tests**: Validates harness correctness
4. **Coverage gate**: ≥60% line coverage for Rust contracts
5. **Z3 reward invariants**: `scripts/verify-reward-invariants.sh` (#1317)

## References

- [Kani Rust Verifier](https://model-checking.github.io/kani/)
- [proptest: Property-based testing](https://altsysrq.github.io/proptest-book/)
- [Soroban contract security](https://soroban.stellar.org/docs)
- Issue #535: Formal verification of contract invariants
