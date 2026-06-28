# Formal Verification — Contract Invariants

This document describes the formally verified invariants for the Trivela Soroban
contracts using the [Kani Rust Verifier](https://model-checking.github.io/kani/)
and property-based testing with `proptest`.

## Overview

| Contract | Tool | Invariants | Status |
|----------|------|------------|--------|
| Rewards | Kani | 4 arithmetic safety properties | ✅ Verified |
| Rewards | proptest | 7 behavioral invariants | ✅ Passing |
| Campaign | proptest | 7 behavioral invariants | ✅ Passing |

## Kani-Verified Invariants (Rewards Contract)

### 1. Vesting Linear Interpolation Safety (`compute_unlocked_safety`)

**Invariant**: For any `VestingRecord { total, start_ledger, end_ledger }` and
any `now`:

- `compute_unlocked(now, record) <= record.total` (never exceeds total)
- `now <= start_ledger ⟹ result = 0` (nothing before start)
- `now >= end_ledger ⟹ result = total` (everything after end)
- `start_ledger < now < end_ledger ∧ total > 0 ⟹ result > 0` (some vesting during period)

**Property**: The linear interpolation formula `total * (now - start) / (end - start)`
never overflows u128 intermediate computation and produces correct results.

### 2. Multiplier Calculation Safety (`multiplier_calculation_safety`)

**Invariant**: For any `base_amount: u64` and `multiplier_bps: u32`:

- `(base_amount as u128) * (multiplier_bps as u128)` never overflows u128
- `product / 10_000` fits in u64 when the intermediate multiplication fits in u128

**Property**: The formula `base_amount * multiplier_bps / BPS_DENOMINATOR` is safe
for all valid input ranges (`base_amount <= MAX/2`, `multiplier_bps <= 100,000`).

### 3. Referral Bonus Calculation Safety (`referral_bonus_safety`)

**Invariant**: For any `qualifying_amount: u64` and `rate_bps: u32`:

- `(qualifying_amount as u128) * (rate_bps as u128)` never overflows u128
- `product / 10_000` fits in u64
- Result is always > 0 when both inputs are > 0

**Property**: The referral bonus formula is safe from overflow for all
configurations where `rate_bps <= MAX_REFERRAL_RATE_BPS (100,000)`.

### 4. Balance Overflow Safety (`balance_overflow_safety`)

**Invariant**: For any `current: u64` and `amount: u64`:

- `current.checked_add(amount)` returns `Some` if and only if no overflow occurs
- When `Some(new_balance)`: `new_balance >= current` and `new_balance >= amount`
- When `None`: overflow was correctly detected

**Property**: Balance additions using `checked_add` prevent silent wrapping
and correctly propagate `Error::Overflow`.

## proptest Behavioral Invariants

### Rewards Contract

| Invariant | Property | Test |
|-----------|----------|------|
| Balance consistency | `balance = Σcredits - Σclaims` | `fuzz_balance_consistency` |
| Credit limit enforcement | Amounts exceeding `max_credit_per_call` fail | `fuzz_credit_limit_enforcement` |
| Rate limiting | Calls exceeding `max_calls` per window fail | `fuzz_rate_limiting` |
| Campaign multiplier | `actual = base * multiplier_bps / 10_000` | `fuzz_campaign_multiplier_accuracy` |
| Pause blocking | Paused contract rejects credit/claim | `fuzz_pause_state_blocking` |
| Vesting linearity | Unlocked amount follows linear formula | `fuzz_vesting_linear_interpolation` |
| Overflow protection | Large amounts trigger `Error::Overflow` | `fuzz_overflow_protection` |

### Campaign Contract

| Invariant | Property | Test |
|-----------|----------|------|
| Count consistency | `stored_count = \|registered_set\|` | `fuzz_participant_count_matches_registered_set` |
| Cap enforcement | Registrations fail when count >= max_cap | `fuzz_max_cap_enforcement` |
| Time window | Registrations outside window fail | `fuzz_time_window_enforcement` |
| Nonce monotonicity | Nonce increments by 1 per admin op | `fuzz_admin_nonce_monotonicity` |
| Referral integrity | `referral_count = \|referred_participants\|` | `fuzz_referral_count_integrity` |
| Inactive blocking | Inactive campaign rejects registrations | `fuzz_inactive_campaign_blocks_registration` |
| Deregister consistency | `is_participant = false` after deregister | `fuzz_deregister_consistency` |

## Negative Tests

The `negative_tests.rs` module proves the verification harnesses are sound:

| Test | Injected Bug | Expected Detection |
|------|-------------|-------------------|
| `negative_test_vesting_returns_too_much` | Formula returns total at midpoint | Invariant: `result <= total` |
| `negative_test_multiplier_overflow_detection` | Wrapping vs checked arithmetic | Overflow detection correctness |
| `negative_test_referral_bonus_denominator` | Wrong denominator (1000 vs 10000) | Result mismatch |
| `negative_test_balance_overflow_wrapping` | `wrapping_add` instead of `checked_add` | Silent overflow detected |

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

## References

- [Kani Rust Verifier](https://model-checking.github.io/kani/)
- [proptest: Property-based testing](https://altsysrq.github.io/proptest-book/)
- [Soroban contract security](https://soroban.stellar.org/docs)
- Issue #535: Formal verification of contract invariants
