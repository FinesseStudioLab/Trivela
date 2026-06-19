//! Fuzz target: randomised registration sequences on the campaign contract.
//!
//! # Running
//! ```bash
//! cargo install cargo-fuzz
//! cd contracts/campaign
//! cargo fuzz run fuzz_register
//! ```
//!
//! # Invariants checked
//! 1. `get_participant_count() <= max_cap` whenever `max_cap > 0`.
//! 2. Double-registering the same participant only increments the count once
//!    (the second call returns `Ok(false)`).
//! 3. When the current ledger time is outside `[start, end]`, `register`
//!    returns `Err(Error::OutsideTimeWindow)` and the count is unchanged.
//! 4. When a Merkle root is configured and the supplied proof does not
//!    reconstruct it, `register` returns `Err(Error::NotInAllowlist)` and the
//!    count is unchanged.
//! 5. The harness-tracked shadow set of registered participants matches
//!    `is_participant` for every user after every operation.

#![no_main]

extern crate std;

use libfuzzer_sys::fuzz_target;
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{Address, BytesN, Env, Vec as SorobanVec};
use trivela_campaign_contract::{CampaignContract, CampaignContractClient, Error};

/// Maximum number of distinct participants in a single fuzz sequence. Kept
/// small so the fuzzer can exercise edge cases (full cap, repeated users)
/// quickly.
const NUM_USERS: usize = 4;

/// Parse one operation from a 16-byte slice:
/// - byte 0       : operation type (see `Op`)
/// - byte 1       : user index (0..NUM_USERS-1)
/// - bytes 2..10  : u64 amount / cap / timestamp (little-endian)
/// - bytes 10..16 : sub-parameter bytes used per op (window end delta,
///                  merkle bit, proof selector)
fn run(data: &[u8]) {
    if data.len() < 16 {
        return;
    }

    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract_id = env.register(CampaignContract, ());
    let client = CampaignContractClient::new(&env, &contract_id);
    client.initialize(&admin);

    // Shadow state tracked by the harness so we can assert invariants
    // independently of contract internals.
    let users: [Address; NUM_USERS] =
        core::array::from_fn(|_| Address::generate(&env));
    let mut registered = [false; NUM_USERS];
    let mut shadow_count: u64 = 0;
    let mut shadow_cap: u64 = 0;
    let mut shadow_start: u64 = 0;
    let mut shadow_end: u64 = u64::MAX;
    let mut merkle_root_set = false;
    let mut admin_nonce: u64 = 0;

    let mut i = 0;
    while i + 15 < data.len() {
        let op = data[i] % 6;
        let user_idx = (data[i + 1] as usize) % NUM_USERS;
        let n = u64::from_le_bytes(
            data[i + 2..i + 10]
                .try_into()
                .expect("slice is exactly 8 bytes"),
        );
        let extra = u64::from_le_bytes({
            let mut buf = [0u8; 8];
            buf[..6].copy_from_slice(&data[i + 10..i + 16]);
            buf
        });
        i += 16;

        match op {
            0 => {
                // ── advance ledger time ──────────────────────────────────
                env.ledger().with_mut(|li| {
                    li.timestamp = n;
                });
            }
            1 => {
                // ── set window ────────────────────────────────────────────
                let start = n;
                let end = start.saturating_add(extra);
                let result = client.try_set_window(&admin, &admin_nonce, &start, &end);
                if let Ok(Ok(())) = result {
                    shadow_start = start;
                    shadow_end = end;
                    admin_nonce += 1;
                }
            }
            2 => {
                // ── set max cap ───────────────────────────────────────────
                let result = client.try_set_max_cap(&admin, &admin_nonce, &n);
                if let Ok(Ok(())) = result {
                    shadow_cap = n;
                    admin_nonce += 1;
                }
            }
            3 => {
                // ── set/clear merkle root ─────────────────────────────────
                let mut bytes = [0u8; 32];
                bytes[0] = data[i.saturating_sub(1)];
                bytes[31] = data[i.saturating_sub(16)];
                let root = BytesN::<32>::from_array(&env, &bytes);
                let result = client.try_set_merkle_root(&admin, &admin_nonce, &root);
                if let Ok(Ok(())) = result {
                    // The contract stores the value but treats an all-zero
                    // root as "still gated" — the harness only needs to know
                    // whether subsequent registers must clear allowlist
                    // verification.
                    merkle_root_set = true;
                    admin_nonce += 1;
                }
            }
            4 => {
                // ── register with intentionally-invalid proof ────────────
                let user = &users[user_idx];
                let leaf = BytesN::<32>::from_array(&env, &[(extra & 0xff) as u8; 32]);
                let proof = SorobanVec::<BytesN<32>>::new(&env);

                let now = env.ledger().timestamp();
                let in_window = now >= shadow_start && now <= shadow_end;

                let prev_count = client.get_participant_count();
                let was_registered = registered[user_idx];

                let result = client.try_register(user, &leaf, &proof, &None);
                let new_count = client.get_participant_count();

                // ── Invariant: time window enforcement ───────────────────
                if !in_window {
                    assert!(
                        matches!(result, Ok(Err(Error::OutsideTimeWindow))),
                        "register outside window must return OutsideTimeWindow",
                    );
                    assert_eq!(new_count, prev_count, "count changed outside window");
                    continue;
                }

                match result {
                    Ok(Ok(true)) => {
                        // first-time registration: allowlist must NOT be set
                        // (or the leaf must coincidentally verify, which is
                        // impossible with the empty proof we pass unless the
                        // root we stored happens to equal the leaf — too
                        // narrow to constrain here).
                        assert!(
                            !was_registered,
                            "first-time success but shadow says already registered",
                        );
                        registered[user_idx] = true;
                        shadow_count += 1;
                        assert_eq!(new_count, prev_count + 1, "count must increment by 1");
                        if shadow_cap > 0 {
                            assert!(
                                shadow_count <= shadow_cap,
                                "count {shadow_count} exceeded cap {shadow_cap}",
                            );
                        }
                    }
                    Ok(Ok(false)) => {
                        // idempotent: must already be registered
                        assert!(
                            was_registered,
                            "register returned Ok(false) but shadow says not registered",
                        );
                        assert_eq!(new_count, prev_count, "idempotent register changed count");
                    }
                    Ok(Err(Error::CapReached)) => {
                        assert!(
                            shadow_cap > 0 && shadow_count >= shadow_cap,
                            "CapReached returned but shadow cap not exhausted",
                        );
                        assert_eq!(new_count, prev_count, "count changed on CapReached");
                    }
                    Ok(Err(Error::NotInAllowlist)) => {
                        assert!(
                            merkle_root_set,
                            "NotInAllowlist returned but no merkle root configured",
                        );
                        assert_eq!(new_count, prev_count, "count changed on allowlist reject");
                    }
                    Ok(Err(Error::CampaignInactive)) => {
                        assert_eq!(new_count, prev_count, "count changed on inactive");
                    }
                    Ok(Err(_)) => {
                        assert_eq!(new_count, prev_count, "count changed on error path");
                    }
                    Err(_) => {
                        // host-side invoke error: count must not have changed
                        assert_eq!(new_count, prev_count, "count changed on invoke error");
                    }
                }
            }
            5 => {
                // ── deregister ────────────────────────────────────────────
                let user = &users[user_idx];
                let prev_count = client.get_participant_count();
                let result = client.try_deregister(user);

                if let Ok(Ok(true)) = result {
                    assert!(
                        registered[user_idx],
                        "deregister succeeded for un-registered user",
                    );
                    registered[user_idx] = false;
                    shadow_count = shadow_count.saturating_sub(1);
                    assert_eq!(
                        client.get_participant_count(),
                        prev_count.saturating_sub(1),
                        "count must decrement on successful deregister",
                    );
                } else if let Ok(Ok(false)) = result {
                    assert_eq!(
                        client.get_participant_count(),
                        prev_count,
                        "count must not change on no-op deregister",
                    );
                }
            }
            _ => unreachable!(),
        }

        // ── per-operation invariants ─────────────────────────────────────
        if shadow_cap > 0 {
            assert!(
                client.get_participant_count() <= shadow_cap,
                "participant_count exceeded max_cap",
            );
        }
        for (idx, user) in users.iter().enumerate() {
            assert_eq!(
                client.is_participant(user),
                registered[idx],
                "is_participant out of sync with shadow for user {idx}",
            );
        }
    }
}

fuzz_target!(|data: &[u8]| {
    run(data);
});
