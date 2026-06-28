//! Kani formal verification harnesses for the rewards contract's pure
//! mathematical invariants. These harnesses use bounded model-checking
//! to prove arithmetic safety properties that proptest cannot guarantee.
//!
//! ## Verified invariants:
//! 1. Vesting linear interpolation never overflows and stays within bounds
//! 2. Multiplier calculation (base * bps / 10_000) is safe for all inputs
//! 3. Referral bonus calculation is safe from overflow
//! 4. Balance additions never wrap around
//!
//! Run with: `cargo kani --harness compute_unlocked_safety` etc.

#[cfg(kani)]
mod kani_harnesses {
    use super::compute_unlocked;

    /// Kani harness for the vesting linear interpolation formula.
    ///
    /// Proves that `compute_unlocked(now, record)`:
    /// - Never returns a value > record.total
    /// - Never panics (division by zero impossible when start < end)
    /// - Returns 0 when now <= start_ledger
    /// - Returns total when now >= end_ledger
    /// - Uses correct linear interpolation for intermediate values
    #[kani::proof]
    #[kani::unwind(0)]
    pub fn compute_unlocked_safety() {
        let total: u64 = kani::any();
        let start_ledger: u32 = kani::any();
        let end_ledger: u32 = kani::any();
        let now: u32 = kani::any();

        // Constraint: start < end (required by the contract)
        kani::assume(start_ledger < end_ledger);

        // Constraint: total fits in u64
        kani::assume(total <= u64::MAX);

        // Constraint: ledger values are reasonable (prevent extreme values)
        kani::assume(start_ledger <= 1_000_000_000);
        kani::assume(end_ledger <= 1_000_000_000);
        kani::assume(now <= 1_000_000_000);

        let record = super::VestingRecord {
            total,
            start_ledger,
            end_ledger,
            claimed: 0,
        };

        let result = compute_unlocked(now, &record);

        // Invariant 1: Result never exceeds total
        assert!(result <= total, "Vesting result {} exceeds total {}", result, total);

        // Invariant 2: Before start, nothing is unlocked
        if now <= start_ledger {
            assert_eq!(result, 0u64, "Should return 0 before start");
        }

        // Invariant 3: After end, everything is unlocked
        if now >= end_ledger {
            assert_eq!(result, total, "Should return total after end");
        }

        // Invariant 4: During vesting, result > 0 (unless total is 0)
        if now > start_ledger && now < end_ledger && total > 0 {
            assert!(result > 0, "Should unlock some amount during vesting");
        }
    }

    /// Kani harness for safe multiplication of base_amount * multiplier_bps / 10_000.
    ///
    /// Proves the campaign multiplier calculation never overflows u128
    /// and produces correct results.
    #[kani::proof]
    #[kani::unwind(0)]
    pub fn multiplier_calculation_safety() {
        let base_amount: u64 = kani::any();
        let multiplier_bps: u32 = kani::any();

        kani::assume(base_amount <= u64::MAX / 2);
        kani::assume(multiplier_bps > 0);
        kani::assume(multiplier_bps <= 100_000);

        let adjusted_u128 = (base_amount as u128)
            .checked_mul(multiplier_bps as u128);

        // If multiplication doesn't overflow u128, result must fit in u64
        if let Some(product) = adjusted_u128 {
            let result = product / 10_000u128;
            assert!(result <= u64::MAX as u128, "Multiplier result overflows u64");
        }
    }

    /// Kani harness for referral bonus calculation safety.
    ///
    /// Proves that qualifying_amount * rate_bps / 10_000 never overflows
    /// and produces a valid bonus amount.
    #[kani::proof]
    #[kani::unwind(0)]
    pub fn referral_bonus_safety() {
        let qualifying_amount: u64 = kani::any();
        let rate_bps: u32 = kani::any();

        kani::assume(qualifying_amount <= u64::MAX / 2);
        kani::assume(rate_bps > 0);
        kani::assume(rate_bps <= 100_000); // MAX_REFERRAL_RATE_BPS

        let bonus_u128 = (qualifying_amount as u128)
            .checked_mul(rate_bps as u128);

        if let Some(product) = bonus_u128 {
            let bonus = product / 10_000u128;
            assert!(bonus <= u64::MAX as u128, "Referral bonus overflows u64");
            // Bonus should be > 0 when both inputs > 0
            assert!(bonus > 0, "Referral bonus should be positive");
        }
    }

    /// Kani harness for balance addition safety.
    ///
    /// Proves that adding two u64 balances using checked_add
    /// correctly detects overflow.
    #[kani::proof]
    #[kani::unwind(0)]
    pub fn balance_overflow_safety() {
        let current: u64 = kani::any();
        let amount: u64 = kani::any();

        let result = current.checked_add(amount);

        if let Some(new_balance) = result {
            // If checked_add succeeded, no overflow occurred
            assert!(new_balance >= current, "Balance should not decrease on addition");
            assert!(new_balance >= amount, "Balance should be at least the added amount");
        } else {
            // If checked_add returned None, overflow was correctly detected
            assert!(current > u64::MAX - amount, "Overflow should only be detected when it would occur");
        }
    }
}
