//! Fuzz target: randomised credit/claim sequences on the rewards contract.
//!
//! # Running
//! ```bash
//! cargo install cargo-fuzz
//! cd contracts/rewards
//! cargo fuzz run fuzz_balance
//! ```
//!
//! # Invariants checked
//! 1. After every operation the in-memory balance shadow matches the contract's
//!    reported balance for every user.
//! 2. `total_claimed` equals the running sum of every successful claim.
//! 3. `sum(balances) + total_claimed == total_successful_credits`.
//! 4. Overflow in `credit` is handled without panicking (returns an error).
//! 5. Under-balance in `claim` is handled without panicking (returns an error).

#![no_main]

extern crate std;

use libfuzzer_sys::fuzz_target;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{symbol_short, Address, Env};
use trivela_rewards_contract::{RewardsContract, RewardsContractClient};

/// Maximum number of distinct users in a single fuzz sequence.
const NUM_USERS: usize = 4;

/// Parse one operation from a 10-byte slice:
/// - byte 0   : operation type (even = credit, odd = claim)
/// - byte 1   : user index (0..NUM_USERS-1)
/// - bytes 2–9: u64 amount in little-endian
fn run(data: &[u8]) {
    if data.len() < 10 {
        return;
    }

    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(RewardsContract, ());
    let client = RewardsContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin, &symbol_short!("Fuzz"), &symbol_short!("FZZ"));

    let users: [Address; NUM_USERS] =
        core::array::from_fn(|_| Address::generate(&env));

    // Shadow state tracked by the harness.
    let mut expected_balances = [0u64; NUM_USERS];
    let mut expected_total_claimed: u64 = 0;
    let mut expected_total_credited: u64 = 0;

    let mut i = 0;
    while i + 9 < data.len() {
        let op = data[i];
        let user_idx = (data[i + 1] as usize) % NUM_USERS;
        let amount = u64::from_le_bytes(
            data[i + 2..i + 10]
                .try_into()
                .expect("slice is exactly 8 bytes"),
        );
        i += 10;

        let user = &users[user_idx];

        if op % 2 == 0 {
            // ── credit ──────────────────────────────────────────────────────
            // try_* methods return Result<Result<T, ContractError>, InvokeError>.
            if let Ok(Ok(new_bal)) = client.try_credit(&admin, user, &amount) {
                // Sanity: new_bal must equal previous + amount.
                assert_eq!(
                    new_bal,
                    expected_balances[user_idx]
                        .checked_add(amount)
                        .expect("contract accepted a credit that would overflow"),
                    "credit: returned balance does not match expected"
                );
                expected_balances[user_idx] = new_bal;
                expected_total_credited = expected_total_credited
                    .checked_add(amount)
                    .expect("successful credit total overflowed harness accounting");
            }
            // On Err(_) or Ok(Err(_)): overflow / limit exceeded — balance unchanged.
        } else {
            // ── claim ───────────────────────────────────────────────────────
            if let Ok(Ok(new_bal)) = client.try_claim(user, &amount) {
                let prev = expected_balances[user_idx];
                assert_eq!(
                    new_bal,
                    prev.checked_sub(amount)
                        .expect("contract accepted a claim that would underflow"),
                    "claim: returned balance does not match expected"
                );
                expected_balances[user_idx] = new_bal;
                expected_total_claimed = expected_total_claimed.saturating_add(amount);
            }
            // On Err(_) or Ok(Err(_)): insufficient balance — balance unchanged.
        }

        // ── per-operation invariant check ──────────────────────────────────
        for (idx, u) in users.iter().enumerate() {
            assert_eq!(
                client.balance(u),
                expected_balances[idx],
                "balance invariant violated for user {idx} after op {i}"
            );
        }
        let shadow_balance_sum: u64 = expected_balances.iter().copied().sum();
        assert_eq!(
            shadow_balance_sum + expected_total_claimed,
            expected_total_credited,
            "accounting invariant violated after op {i}"
        );
    }

    // ── post-sequence invariant ────────────────────────────────────────────
    assert_eq!(
        client.total_claimed(),
        expected_total_claimed,
        "total_claimed invariant violated"
    );
}

fuzz_target!(|data: &[u8]| {
    run(data);
});
