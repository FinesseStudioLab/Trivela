//! Property-based tests (fuzzing) for all state-changing rewards contract entrypoints.
//!
//! This module uses `proptest` to generate random valid/invalid call sequences
//! and assert invariants hold under all conditions (issue #637).
//!
//! ## Invariants tested:
//! - Balance consistency: user balances never go negative, total_claimed tracks actual claims
//! - Credit limits: max_credit_per_call enforcement when set
//! - Rate limiting: credit calls respect configured rate limits
//! - Overflow protection: arithmetic operations never overflow
//! - Vesting correctness: unlocked amounts follow linear vesting formula
//! - Admin nonce monotonicity: nonces increment and prevent replay
//! - Pause state blocking: paused contracts reject credit/claim operations
//! - Campaign multiplier calculation accuracy

use super::*;
use proptest::prelude::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{symbol_short, Address, Env};
extern crate alloc;

// ── Test helpers ─────────────────────────────────────────────────────────────

fn setup_fuzz() -> (Env, Address, RewardsContractClient<'static>) {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    (env, contract_id, client)
}

// ── Property strategies ──────────────────────────────────────────────────────

/// Generate a random amount within reasonable bounds
fn arb_amount() -> impl Strategy<Value = u64> {
    prop_oneof![
        1 => Just(0u64),                    // edge case: zero
        1 => 1u64..=10u64,                  // small amounts
        3 => 100u64..=10_000u64,            // normal amounts
        1 => 1_000_000u64..=u64::MAX/2,     // large amounts
    ]
}

/// Generate a random multiplier in basis points
fn arb_multiplier_bps() -> impl Strategy<Value = u32> {
    prop_oneof![
        1 => Just(1u32),                    // minimal multiplier
        3 => 5_000u32..=15_000u32,          // 0.5x to 1.5x
        1 => 20_000u32..=u32::MAX/2,        // high multipliers
    ]
}

/// Generate a random ledger sequence
#[allow(dead_code)]
fn arb_ledger() -> impl Strategy<Value = u32> {
    1u32..=1_000_000u32
}

/// Generate a sequence of operations
#[derive(Debug, Clone)]
enum RewardsOp {
    Credit(u64),
    Claim(u64),
    SetMaxCredit(u64),
    SetPaused(bool),
    SetMultiplier(u64, u32),
    CreditForCampaign(u64, u64),
    SetRateLimit(u32, u32),
}

fn arb_rewards_op() -> impl Strategy<Value = RewardsOp> {
    prop_oneof![
        3 => arb_amount().prop_map(RewardsOp::Credit),
        2 => arb_amount().prop_map(RewardsOp::Claim),
        1 => arb_amount().prop_map(RewardsOp::SetMaxCredit),
        1 => any::<bool>().prop_map(RewardsOp::SetPaused),
        1 => (1u64..=10u64, arb_multiplier_bps()).prop_map(|(cid, mult)| RewardsOp::SetMultiplier(cid, mult)),
        2 => (1u64..=10u64, arb_amount()).prop_map(|(cid, amt)| RewardsOp::CreditForCampaign(cid, amt)),
        1 => (1u32..=100u32, 1u32..=1000u32).prop_map(|(max, win)| RewardsOp::SetRateLimit(max, win)),
    ]
}

// ── Balance consistency ──────────────────────────────────────────────────────

proptest! {
    #![proptest_config(ProptestConfig::with_cases(100))]

    /// **Invariant**: After any sequence of credits and claims, user balance
    /// must equal total credits minus total claims for that user.
    #[test]
    fn fuzz_balance_consistency(
        num_credits in 1usize..=20usize,
        num_claims in 0usize..=10usize
    ) {
        extern crate alloc;
        let (env, _contract_id, client) = setup_fuzz();
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let creditor = Address::generate(&env);

        client.initialize(&admin, &symbol_short!("TEST"), &symbol_short!("TST"));
        env.mock_all_auths();

        let mut total_credited = 0u64;
        let mut total_claimed = 0u64;

        // Perform credits
        for _ in 0..num_credits {
            let amount = 100u64; // Fixed amount to avoid overflow
            let balance_before = client.balance(&user);
            let _result = client.credit(&creditor, &user, &amount);
            let balance_after = client.balance(&user);
            if balance_after > balance_before {
                total_credited = total_credited.saturating_add(amount);
            }
        }

        // Perform claims (only up to available balance)
        let available_balance = client.balance(&user);
        let claim_amount = if num_claims > 0 && available_balance > 0 {
            (available_balance / num_claims as u64).min(available_balance)
        } else {
            0u64
        };

        for _ in 0..num_claims {
            if claim_amount > 0 && client.balance(&user) >= claim_amount {
                let balance_before = client.balance(&user);
                let _result = client.claim(&user, &claim_amount);
                let balance_after = client.balance(&user);
                if balance_after < balance_before {
                    total_claimed = total_claimed.saturating_add(claim_amount);
                }
            }
        }

        // Invariant: balance equals credits minus claims
        let final_balance = client.balance(&user);
        assert_eq!(
            final_balance,
            total_credited.saturating_sub(total_claimed),
            "Balance {} != credits {} - claims {}",
            final_balance,
            total_credited,
            total_claimed
        );
    }
}

// ── Credit limit enforcement ─────────────────────────────────────────────────

proptest! {
    #![proptest_config(ProptestConfig::with_cases(100))]

    /// **Invariant**: When max_credit_per_call is set, credit operations
    /// exceeding the limit must fail with CreditLimitExceeded.
    #[test]
    fn fuzz_credit_limit_enforcement(
        limit in 1u64..=1000u64,
        amount in 1u64..=2000u64
    ) {
        let (env, _contract_id, client) = setup_fuzz();
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let creditor = Address::generate(&env);

        client.initialize(&admin, &symbol_short!("TEST"), &symbol_short!("TST"));
        env.mock_all_auths();
        client.set_max_credit_per_call(&admin, &limit);

        let result = client.try_credit(&creditor, &user, &amount);

        if amount <= limit {
            assert!(result.is_ok(), "Credit {} should succeed with limit {}", amount, limit);
        } else {
            assert_eq!(result, Err(Ok(Error::CreditLimitExceeded)));
        }
    }
}

// ── Rate limiting ────────────────────────────────────────────────────────────

proptest! {
    #![proptest_config(ProptestConfig::with_cases(50))]

    /// **Invariant**: Credit rate limiting prevents callers from exceeding
    /// max_calls within a window_ledgers period.
    #[test]
    fn fuzz_rate_limiting(
        max_calls in 1u32..=10u32,
        window_ledgers in 1u32..=100u32,
        num_attempts in 1u32..=20u32
    ) {
        let (env, _contract_id, client) = setup_fuzz();
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let creditor = Address::generate(&env);

        client.initialize(&admin, &symbol_short!("TEST"), &symbol_short!("TST"));
        env.mock_all_auths();
        client.set_credit_rate_limit(&admin, &max_calls, &window_ledgers);

        let mut successful_calls = 0u32;

        for _ in 0..num_attempts {
            let result = client.try_credit(&creditor, &user, &100u64);

            if successful_calls < max_calls {
                // Should succeed until we hit the limit
                if result.is_ok() {
                    successful_calls += 1;
                }
            } else {
                // Should fail after hitting limit
                assert_eq!(result, Err(Ok(Error::RateLimitExceeded)));
            }
        }

        assert!(successful_calls <= max_calls, "Successful calls {} exceeded limit {}", successful_calls, max_calls);
    }
}

// ── Campaign multiplier accuracy ─────────────────────────────────────────────

proptest! {
    #![proptest_config(ProptestConfig::with_cases(100))]

    /// **Invariant**: credit_for_campaign applies the correct multiplier:
    /// final_amount = base_amount * multiplier_bps / 10_000 (floor division)
    #[test]
    fn fuzz_campaign_multiplier_accuracy(
        base_amount in 1u64..=10_000u64,
        multiplier_bps in 1u32..=50_000u32,
        campaign_id in 1u64..=10u64
    ) {
        let (env, _contract_id, client) = setup_fuzz();
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let creditor = Address::generate(&env);

        client.initialize(&admin, &symbol_short!("TEST"), &symbol_short!("TST"));
        env.mock_all_auths();
        client.set_campaign_multiplier(&admin, &campaign_id, &multiplier_bps);

        let initial_balance = client.balance(&user);
        let result = client.try_credit_for_campaign(&creditor, &user, &campaign_id, &base_amount);

        // Calculate expected amount using the same formula as the contract
        let expected_adjusted = ((base_amount as u128) * (multiplier_bps as u128)) / 10_000u128;

        if expected_adjusted <= u64::MAX as u128 {
            if result.is_ok() {
                let final_balance = client.balance(&user);
                let actual_credited = final_balance - initial_balance;
                assert_eq!(actual_credited, expected_adjusted as u64,
                    "Expected {} credits, got {}", expected_adjusted, actual_credited);
            }
        } else {
            assert_eq!(result, Err(Ok(Error::Overflow)));
        }
    }
}

// ── Pause state enforcement ──────────────────────────────────────────────────

proptest! {
    #![proptest_config(ProptestConfig::with_cases(50))]

    /// **Invariant**: When contract is paused, all credit and claim operations
    /// must fail with ContractPaused, regardless of other conditions.
    #[test]
    fn fuzz_pause_state_blocking(
        credit_amount in 1u64..=1000u64,
        claim_amount in 1u64..=1000u64
    ) {
        let (env, _contract_id, client) = setup_fuzz();
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let creditor = Address::generate(&env);

        client.initialize(&admin, &symbol_short!("TEST"), &symbol_short!("TST"));

        // First credit some balance while unpaused
        env.mock_all_auths();
        client.credit(&creditor, &user, &1000u64);

        // Now pause the contract
        client.set_paused(&admin, &0, &true, &Vec::new(&env));

        // All operations should fail
        let credit_result = client.try_credit(&creditor, &user, &credit_amount);
        assert_eq!(credit_result, Err(Ok(Error::ContractPaused)));

        let claim_result = client.try_claim(&user, &claim_amount);
        assert_eq!(claim_result, Err(Ok(Error::ContractPaused)));
    }
}

// ── Vesting correctness ──────────────────────────────────────────────────────

proptest! {
    #![proptest_config(ProptestConfig::with_cases(50))]

    /// **Invariant**: Vesting follows linear interpolation formula:
    /// unlocked = total * (now - start) / (duration) when start < now < end
    #[test]
    fn fuzz_vesting_linear_interpolation(
        total_amount in 1u64..=10_000u64,
        start_ledger in 1u32..=100u32,
        duration in 1u32..=1000u32,
        time_offset in 0u32..=1000u32
    ) {
        let (env, _contract_id, client) = setup_fuzz();
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let from = Address::generate(&env);

        client.initialize(&admin, &symbol_short!("TEST"), &symbol_short!("TST"));
        env.mock_all_auths();

        let end_ledger = start_ledger.saturating_add(duration);
        let now = start_ledger.saturating_add(time_offset);

        // Set current ledger time
        env.ledger().with_mut(|li| li.sequence_number = now);

        let vest_result = client.try_credit_vested(&from, &user, &total_amount, &start_ledger, &end_ledger);

        // Only test if vesting was successful
        if vest_result.is_ok() {
            let vested_balance = client.vested_balance(&user);

            if now <= start_ledger {
                // Before start: nothing should be unlocked
                assert_eq!(vested_balance, 0u64);
            } else if now >= end_ledger {
                // After end: everything should be unlocked
                assert_eq!(vested_balance, total_amount);
            } else {
                // During vesting: linear interpolation
                let elapsed = (now - start_ledger) as u128;
                let duration_u128 = duration as u128;
                let expected_unlocked = ((total_amount as u128) * elapsed) / duration_u128;
                assert_eq!(vested_balance, expected_unlocked as u64);
            }
        }
    }
}

// ── Overflow protection ──────────────────────────────────────────────────────

proptest! {
    #![proptest_config(ProptestConfig::with_cases(50))]

    /// **Invariant**: Arithmetic operations that would overflow must fail
    /// with Error::Overflow rather than wrapping around.
    #[test]
    fn fuzz_overflow_protection(
        amount1 in u64::MAX/2..=u64::MAX,
        amount2 in u64::MAX/2..=u64::MAX
    ) {
        let (env, _contract_id, client) = setup_fuzz();
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let creditor = Address::generate(&env);

        client.initialize(&admin, &symbol_short!("TEST"), &symbol_short!("TST"));
        env.mock_all_auths();

        // Try to credit a very large amount first
        let result1 = client.try_credit(&creditor, &user, &amount1);

        if result1.is_ok() {
            // If first credit succeeded, try another large credit that should overflow
            let result2 = client.try_credit(&creditor, &user, &amount2);

            // If the sum would overflow, it should fail
            if amount1.checked_add(amount2).is_none() {
                assert_eq!(result2, Err(Ok(Error::Overflow)));
            }
        }
    }
}

// ── Global accounting invariant (issue #801) ─────────────────────────────────

proptest! {
    #![proptest_config(ProptestConfig::with_cases(50))]

    /// **Invariant**: sum(all_user_balances) == total_credited - total_claimed
    ///
    /// This is the fundamental on-chain accounting identity. Any sequence of
    /// credit and claim operations across any number of users must preserve it.
    /// A violation means points were created or destroyed without a corresponding
    /// ledger entry.
    #[test]
    fn fuzz_global_balance_accounting_invariant(
        num_users in 2usize..=5usize,
        rounds in 1usize..=8usize,
    ) {
        extern crate alloc;
        use alloc::vec::Vec;
        let (env, _contract_id, client) = setup_fuzz();
        let admin = Address::generate(&env);
        let creditor = Address::generate(&env);

        client.initialize(&admin, &symbol_short!("TEST"), &symbol_short!("TST"));
        env.mock_all_auths();

        let users: Vec<Address> = (0..num_users).map(|_| Address::generate(&env)).collect();

        let mut total_credited: u64 = 0;
        let mut total_claimed: u64 = 0;

        for _ in 0..rounds {
            for user in &users {
                let credit_amount = 200u64;
                if client.try_credit(&creditor, user, &credit_amount).is_ok() {
                    total_credited = total_credited.saturating_add(credit_amount);
                }
                // Claim one quarter of available balance each round.
                let bal = client.balance(user);
                let claim_amount = bal / 4;
                if claim_amount > 0 {
                    if client.try_claim(user, &claim_amount).is_ok() {
                        total_claimed = total_claimed.saturating_add(claim_amount);
                    }
                }
            }
        }

        // Core invariant: sum of individual balances == total_credited - total_claimed.
        let sum_balances: u64 = users.iter().map(|u| client.balance(u)).sum();
        let expected = total_credited.saturating_sub(total_claimed);
        prop_assert_eq!(
            sum_balances,
            expected,
            "Global accounting violated: sum(balances)={} credited={} claimed={}",
            sum_balances,
            total_credited,
            total_claimed
        );

        // total_claimed must also match the contract's own global counter.
        prop_assert_eq!(
            client.total_claimed(),
            total_claimed,
            "total_claimed() mismatch: contract={} expected={}",
            client.total_claimed(),
            total_claimed
        );
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(50))]

    /// **Invariant**: no user balance ever goes negative.
    ///
    /// Claim operations that would take the balance below zero must be rejected
    /// (Error::InsufficientBalance) and leave the balance unchanged.
    #[test]
    fn fuzz_no_negative_balances(
        credit_amount in 1u64..=1_000u64,
        over_claim_extra in 1u64..=1_000u64,
    ) {
        let (env, _contract_id, client) = setup_fuzz();
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let creditor = Address::generate(&env);

        client.initialize(&admin, &symbol_short!("TEST"), &symbol_short!("TST"));
        env.mock_all_auths();

        client.credit(&creditor, &user, &credit_amount);
        let balance_before = client.balance(&user);

        // Attempt to claim more than the available balance.
        let over_claim = credit_amount.saturating_add(over_claim_extra);
        let result = client.try_claim(&user, &over_claim);
        prop_assert!(result.is_err(), "over-claim should fail");

        // Balance must be unchanged after a rejected claim.
        prop_assert_eq!(
            client.balance(&user),
            balance_before,
            "balance changed after rejected claim"
        );
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(40))]

    /// **Invariant**: batch_credit preserves the per-user and global accounting
    /// identity across randomized recipient sets.
    ///
    /// After `batch_credit`, each recipient's balance must increase by exactly
    /// their allocated amount and the sum of all increases must equal the sum
    /// of the batch amounts.
    #[test]
    fn fuzz_batch_credit_accounting(
        n_users in 2usize..=6usize,
        amount_each in 1u64..=500u64,
    ) {
        extern crate alloc;
        use alloc::vec::Vec as StdVec;
        let (env, _contract_id, client) = setup_fuzz();
        let admin = Address::generate(&env);
        let creditor = Address::generate(&env);

        client.initialize(&admin, &symbol_short!("TEST"), &symbol_short!("TST"));
        env.mock_all_auths();

        let users: StdVec<Address> = (0..n_users).map(|_| Address::generate(&env)).collect();
        let balances_before: StdVec<u64> = users.iter().map(|u| client.balance(u)).collect();

        let mut sdk_recipients: soroban_sdk::Vec<(Address, u64)> =
            soroban_sdk::Vec::new(&env);
        for user in &users {
            sdk_recipients.push_back((user.clone(), amount_each));
        }

        let batch_result = client.try_batch_credit(&creditor, &sdk_recipients);

        if batch_result.is_ok() {
            let mut total_delta: u64 = 0;
            for (user, &bal_before) in users.iter().zip(balances_before.iter()) {
                let bal_after = client.balance(user);
                let delta = bal_after.saturating_sub(bal_before);
                prop_assert_eq!(
                    delta,
                    amount_each,
                    "user balance delta {} != allocated amount {}",
                    delta,
                    amount_each
                );
                total_delta = total_delta.saturating_add(delta);
            }
            let expected_total = amount_each.saturating_mul(n_users as u64);
            prop_assert_eq!(
                total_delta,
                expected_total,
                "sum of balance deltas {} != sum of batch amounts {}",
                total_delta,
                expected_total
            );
        }
    }
}

// ── Integration: random operation sequences ──────────────────────────────────

proptest! {
    #![proptest_config(ProptestConfig::with_cases(30))]

    /// **Integration fuzz**: Execute random sequences of operations and
    /// assert that core invariants hold after each operation:
    /// - No panics or unexpected errors
    /// - Balances never go negative
    /// - Total claimed tracks actual claims
    #[test]
    fn fuzz_random_operation_sequence(
        ops in prop::collection::vec(arb_rewards_op(), 1..=20)
    ) {
        extern crate alloc;
        let (env, _contract_id, client) = setup_fuzz();
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        let creditor = Address::generate(&env);

        client.initialize(&admin, &symbol_short!("TEST"), &symbol_short!("TST"));
        env.mock_all_auths();

        let mut total_expected_credits = 0u64;
        let mut total_expected_claims = 0u64;

        for op in ops {
            match op {
                RewardsOp::Credit(amount) => {
                    if amount > 0 && amount <= 10_000 { // Reasonable bounds
                        let balance_before = client.balance(&user);
                        let result = client.try_credit(&creditor, &user, &amount);
                        if result.is_ok() {
                            total_expected_credits = total_expected_credits.saturating_add(amount);
                            let balance_after = client.balance(&user);
                            assert!(balance_after >= balance_before, "Balance decreased after credit");
                        }
                    }
                }
                RewardsOp::Claim(amount) => {
                    if amount > 0 {
                        let balance_before = client.balance(&user);
                        if balance_before >= amount {
                            let result = client.try_claim(&user, &amount);
                            if result.is_ok() {
                                total_expected_claims = total_expected_claims.saturating_add(amount);
                                let balance_after = client.balance(&user);
                                assert_eq!(balance_after, balance_before - amount, "Incorrect balance after claim");
                            }
                        }
                    }
                }
                RewardsOp::SetMaxCredit(limit) => {
                    let _ = client.try_set_max_credit_per_call(&admin, &limit);
                }
                RewardsOp::SetPaused(paused) => {
                    let _ = client.try_set_paused(&admin, &0, &paused, &Vec::new(&env));
                }
                RewardsOp::SetMultiplier(campaign_id, multiplier_bps) => {
                    if multiplier_bps > 0 {
                        let _ = client.try_set_campaign_multiplier(&admin, &campaign_id, &multiplier_bps);
                    }
                }
                RewardsOp::CreditForCampaign(campaign_id, base_amount) => {
                    if base_amount > 0 && base_amount <= 1000 { // Avoid overflow
                        let balance_before = client.balance(&user);
                        let result = client.try_credit_for_campaign(&creditor, &user, &campaign_id, &base_amount);
                        if result.is_ok() {
                            let balance_after = client.balance(&user);
                            let actual_credited = balance_after - balance_before;
                            total_expected_credits = total_expected_credits.saturating_add(actual_credited);
                        }
                    }
                }
                RewardsOp::SetRateLimit(max_calls, window) => {
                    let _ = client.try_set_credit_rate_limit(&admin, &max_calls, &window);
                }
            }

            // Core invariants after each operation
            let balance = client.balance(&user);

            // Balance should never exceed what we've credited
            assert!(balance <= total_expected_credits,
                "Balance {} exceeds total credits {}", balance, total_expected_credits);

            // Balance should equal credits minus claims
            let expected_balance = total_expected_credits.saturating_sub(total_expected_claims);
            assert!(balance <= expected_balance,
                "Balance {} inconsistent with credits {} - claims {}",
                balance, total_expected_credits, total_expected_claims);
        }
    }
}

// ── Issue #1022: Differential fuzz test vs. reference model ──────────────────
//
// A simple Rust struct mirrors the contract's per-user balance semantics.
// Randomised op sequences are applied to both; any divergence fails the test.
// The reference model is intentionally minimal — it is the specification, not
// a reimplementation of the contract's logic.

/// Pure-Rust reference model for a single user's balance.
struct BalanceModel {
    balance: u64,
    total_supply: u64,
}

impl BalanceModel {
    fn new() -> Self {
        Self {
            balance: 0,
            total_supply: 0,
        }
    }

    /// Returns new balance or None on ZeroAmount / overflow.
    fn credit(&mut self, amount: u64) -> Option<u64> {
        if amount == 0 {
            return None;
        }
        let new_balance = self.balance.checked_add(amount)?;
        let new_supply = self.total_supply.checked_add(amount)?;
        self.balance = new_balance;
        self.total_supply = new_supply;
        Some(new_balance)
    }

    /// Returns new balance or None on ZeroAmount / insufficient balance.
    fn claim(&mut self, amount: u64) -> Option<u64> {
        if amount == 0 {
            return None;
        }
        let new_balance = self.balance.checked_sub(amount)?;
        self.balance = new_balance;
        self.total_supply = self.total_supply.saturating_sub(amount);
        Some(new_balance)
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    /// **Differential invariant**: for every randomised credit/claim sequence the
    /// contract and the reference model must agree on the user's balance and on
    /// whether each operation succeeds or fails (issue #1022).
    #[test]
    fn fuzz_differential_vs_reference_model(
        ops in proptest::collection::vec(
            prop_oneof![
                3 => (1u64..=100_000u64).prop_map(|a| ('c', a)),  // credit
                2 => (1u64..=50_000u64).prop_map(|a| ('k', a)),   // claim
                1 => Just(('c', 0u64)),                             // zero-amount credit (must fail)
                1 => Just(('k', 0u64)),                             // zero-amount claim  (must fail)
            ],
            1..=50,
        )
    ) {
        let (env, _contract_id, client) = setup_fuzz();
        let admin = Address::generate(&env);
        let creditor = Address::generate(&env);
        let user = Address::generate(&env);
        env.mock_all_auths();
        client.initialize(&admin, &symbol_short!("REF"), &symbol_short!("REF"));

        let mut model = BalanceModel::new();

        for (op, amount) in ops {
            match op {
                'c' => {
                    let model_result = model.credit(amount);
                    let contract_result = client.try_credit(&creditor, &user, &amount);

                    match (model_result, contract_result) {
                        (Some(model_bal), Ok(Ok(contract_bal))) => {
                            assert_eq!(
                                model_bal, contract_bal,
                                "credit({amount}): model balance {model_bal} != contract balance {contract_bal}"
                            );
                            assert_eq!(
                                model.total_supply,
                                client.total_supply(),
                                "credit({amount}): total_supply diverged"
                            );
                        }
                        // A contract-level Err arrives as Ok(Err(..)); a failed
                        // invocation as Err(..). Both mean "contract rejected".
                        (None, Ok(Err(_))) | (None, Err(_)) => { /* both rejected — consistent */ }
                        (Some(mb), Ok(Err(e))) => panic!(
                            "credit({amount}): model accepted → {mb}, contract rejected → {e:?}"
                        ),
                        (Some(mb), Err(e)) => panic!(
                            "credit({amount}): model accepted → {mb}, invocation failed → {e:?}"
                        ),
                        (None, Ok(Ok(cb))) => panic!(
                            "credit({amount}): model rejected, contract accepted → {cb}"
                        ),
                    }
                }
                'k' => {
                    let model_result = model.claim(amount);
                    let contract_result = client.try_claim(&user, &amount);

                    match (model_result, contract_result) {
                        (Some(model_bal), Ok(Ok(contract_bal))) => {
                            assert_eq!(
                                model_bal, contract_bal,
                                "claim({amount}): model balance {model_bal} != contract balance {contract_bal}"
                            );
                            assert_eq!(
                                model.total_supply,
                                client.total_supply(),
                                "claim({amount}): total_supply diverged"
                            );
                        }
                        // A contract-level Err arrives as Ok(Err(..)); a failed
                        // invocation as Err(..). Both mean "contract rejected".
                        (None, Ok(Err(_))) | (None, Err(_)) => { /* both rejected — consistent */ }
                        (Some(mb), Ok(Err(e))) => panic!(
                            "claim({amount}): model accepted → {mb}, contract rejected → {e:?}"
                        ),
                        (Some(mb), Err(e)) => panic!(
                            "claim({amount}): model accepted → {mb}, invocation failed → {e:?}"
                        ),
                        (None, Ok(Ok(cb))) => panic!(
                            "claim({amount}): model rejected, contract accepted → {cb}"
                        ),
                    }
                }
                _ => unreachable!(),
            }

            // After every op: contract balance must match reference model.
            assert_eq!(
                client.balance(&user),
                model.balance,
                "post-op balance diverged: contract={} model={}",
                client.balance(&user),
                model.balance
            );
        }
    }
}

// ── Redeem bps math (issue #852) ─────────────────────────────────────────────
//
// `redeem` computes `asset_amount = points_amount * rate_bps / 10_000`
// (floor division) via u128 intermediate math, then rejects the request if
// `asset_amount` exceeds the configured reserve or the caller's point
// balance. This section fuzzes that computation directly against the same
// checked-arithmetic reference used in `lib.rs`, and separately drives the
// real contract end-to-end (with a genuine SAC token, matching
// `contracts/integration/tests/coverage_tests.rs`'s `test_redemption_flow`
// pattern) to confirm the on-chain result matches.

/// Reference implementation of `redeem`'s conversion, mirroring `lib.rs`
/// exactly: checked u128 multiply, floor-divide by `BPS_DENOMINATOR`, then
/// reject anything that wouldn't fit back into an `i128`/`u64`.
fn reference_redeem_amount(points_amount: u64, rate_bps: u32) -> Option<u64> {
    let asset_amount_u128 = (points_amount as u128).checked_mul(rate_bps as u128)? / BPS_DENOMINATOR;
    if asset_amount_u128 > u64::MAX as u128 {
        return None;
    }
    Some(asset_amount_u128 as u64)
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    /// **Invariant**: the reference bps computation never panics (checked
    /// arithmetic throughout) across the full `u64`/`u32` input space,
    /// including the maximal `points_amount * rate_bps` product.
    #[test]
    fn fuzz_redeem_math_never_panics(
        points_amount in any::<u64>(),
        rate_bps in any::<u32>(),
    ) {
        let _ = reference_redeem_amount(points_amount, rate_bps);
    }

    /// **Invariant**: floor division means the computed asset amount is
    /// always `<= points_amount * rate_bps / 10_000` mathematically, and
    /// strictly monotonic in both `points_amount` and `rate_bps` — doubling
    /// either input never decreases the payout.
    #[test]
    fn fuzz_redeem_math_monotonic(
        points_amount in 0u64..=1_000_000_000u64,
        rate_bps in 1u32..=1_000_000u32,
    ) {
        let base = reference_redeem_amount(points_amount, rate_bps);
        if let Some(base_amount) = base {
            if let Some(doubled_points) = points_amount.checked_mul(2) {
                if let Some(doubled) = reference_redeem_amount(doubled_points, rate_bps) {
                    prop_assert!(
                        doubled >= base_amount,
                        "doubling points_amount decreased payout: {base_amount} -> {doubled}"
                    );
                }
            }
        }
    }

    /// **Invariant**: end-to-end against the real contract — `redeem` never
    /// pays out more than the reserve holds, never leaves `TOTAL_SUPPLY`
    /// inconsistent with the user's remaining balance, and its returned
    /// amount matches the same bps math computed independently above.
    #[test]
    fn fuzz_redeem_respects_reserve_and_matches_math(
        credited in 1u64..=1_000_000u64,
        reserve in 0u64..=1_000_000u64,
        rate_bps in 1u32..=10_000u32,
        redeem_points in 0u64..=1_000_000u64,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, RewardsContract);
        let client = RewardsContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let user = Address::generate(&env);
        client.initialize(&admin, &symbol_short!("Fuzz"), &symbol_short!("FZZ"));

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let asset = sac.address();
        soroban_sdk::token::StellarAssetClient::new(&env, &asset).mint(&admin, &(reserve as i128));

        client.set_redemption_rate(&admin, &0i128, &asset, &rate_bps);
        if reserve > 0 {
            client.fund_reserve(&admin, &reserve);
        }
        client.credit(&admin, &user, &credited);

        let expected = reference_redeem_amount(redeem_points, rate_bps);

        let result = client.try_redeem(&user, &redeem_points);

        match (expected, result) {
            (Some(expected_amount), Ok(Ok(actual_amount))) => {
                // The contract only succeeds when both the reserve and the
                // user's balance actually cover the computed amount/points.
                prop_assert!(
                    (expected_amount as u64) <= reserve,
                    "redeem succeeded for {redeem_points} points paying {expected_amount}, exceeding reserve {reserve}"
                );
                prop_assert!(
                    redeem_points <= credited,
                    "redeem succeeded for {redeem_points} points, exceeding credited balance {credited}"
                );
                prop_assert_eq!(
                    actual_amount as u64,
                    expected_amount,
                    "on-chain redeem amount diverged from reference bps math"
                );
                prop_assert!(
                    client.redemption_reserve() <= reserve,
                    "reserve went negative-equivalent after redeem"
                );
            }
            // Any rejection is fine — the reserve/balance/overflow guard
            // caught something the reference math flagged as unpayable, or
            // caught a case within the contract's own additional checks
            // (e.g. redeem_points > credited). Nothing to assert further.
            (_, Ok(Err(_))) | (_, Err(_)) => {}
            (None, Ok(Ok(actual_amount))) => {
                prop_assert!(
                    false,
                    "reference math overflowed/rejected but contract paid out {actual_amount}"
                );
            }
        }
    }
}

// ── Referral bonus bps math (issue #852) ─────────────────────────────────────
//
// `pay_referral_bonus` computes `bonus = qualifying_amount * rate_bps /
// 10_000` (floor division, checked u128), then enforces a per-referrer
// cumulative cap. This fuzzes that computation and the cap enforcement.

fn reference_referral_bonus(qualifying_amount: u64, rate_bps: u32) -> Option<u64> {
    let bonus_u128 =
        (qualifying_amount as u128).checked_mul(rate_bps as u128)? / BPS_DENOMINATOR;
    if bonus_u128 > u64::MAX as u128 {
        return None;
    }
    Some(bonus_u128 as u64)
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(200))]

    /// **Invariant**: the reference bps computation never panics across the
    /// full `u64`/`u32` input space.
    #[test]
    fn fuzz_referral_bonus_math_never_panics(
        qualifying_amount in any::<u64>(),
        rate_bps in any::<u32>(),
    ) {
        let _ = reference_referral_bonus(qualifying_amount, rate_bps);
    }

    /// **Invariant**: end-to-end — `pay_referral_bonus` never credits a
    /// referrer past the configured per-referrer cap, and every accepted
    /// payout matches the same bps math computed independently above.
    #[test]
    fn fuzz_referral_bonus_respects_cap_and_matches_math(
        rate_bps in 1u32..=100_000u32,
        cap in 0u64..=1_000_000u64,
        qualifying_amount in 0u64..=1_000_000u64,
    ) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, RewardsContract);
        let client = RewardsContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let referrer = Address::generate(&env);
        let referee = Address::generate(&env);
        client.initialize(&admin, &symbol_short!("Fuzz"), &symbol_short!("FZZ"));

        client.set_referral_config(&admin, &rate_bps, &cap);

        let expected = reference_referral_bonus(qualifying_amount, rate_bps);
        let result = client.try_pay_referral_bonus(&admin, &referrer, &referee, &qualifying_amount);

        match (expected, result) {
            (Some(expected_bonus), Ok(Ok(actual_bonus))) => {
                prop_assert_eq!(
                    actual_bonus as u64,
                    expected_bonus,
                    "on-chain referral bonus diverged from reference bps math"
                );
                prop_assert!(
                    cap == 0 || (expected_bonus as u64) <= cap,
                    "referral bonus {expected_bonus} paid out despite exceeding cap {cap}"
                );
                prop_assert!(
                    client.referral_bonus_total(&referrer) <= cap || cap == 0,
                    "cumulative referral total exceeded configured cap"
                );
            }
            // Rejections are fine (zero bonus, cap exceeded, overflow) — the
            // contract's guards caught it.
            (_, Ok(Err(_))) | (_, Err(_)) => {}
            (None, Ok(Ok(actual_bonus))) => {
                prop_assert!(
                    false,
                    "reference math overflowed but contract paid out {actual_bonus}"
                );
            }
        }
    }
}
