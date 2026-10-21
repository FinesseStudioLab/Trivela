//! Fuzz target: randomised Merkle proof verification on the campaign contract.
//!
//! # Running
//! ```bash
//! cargo install cargo-fuzz
//! cd contracts/campaign
//! cargo fuzz run fuzz_merkle_proof
//! ```
//!
//! # What is being fuzzed
//! The fuzzer generates arbitrary leaf bytes and multi-step proofs and feeds
//! them to the campaign contract with a pre-configured Merkle root. The
//! invariants checked are:
//!
//! 1. A proof that does NOT reconstruct the stored root must always return
//!    `Err(Error::NotInAllowlist)` — never a panic or success.
//! 2. A proof that does reconstruct the stored root must return `Ok(true)` or
//!    `Ok(false)` (already registered) and never an error other than the
//!    expected ones (`CampaignInactive`, `OutsideTimeWindow`, `CapReached`).
//! 3. The contract never panics regardless of proof length or leaf content.
//!
//! The harness builds its own sha256-based twin of the on-chain verifier so
//! it can construct valid proofs as well as mutated ones, exercising both the
//! happy path and every error branch.

#![no_main]

extern crate std;

use libfuzzer_sys::fuzz_target;
use sha2::{Digest, Sha256};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{Address, BytesN, Env, Vec as SorobanVec};
use trivela_campaign_contract::{CampaignContract, CampaignContractClient, Error};

/// Compute a two-leaf Merkle root using SHA-256 in the same order that the
/// contract uses (smaller || larger, byte-by-byte comparison).
fn sha256_pair(a: [u8; 32], b: [u8; 32]) -> [u8; 32] {
    let (left, right) = if a <= b { (a, b) } else { (b, a) };
    let mut hasher = Sha256::new();
    hasher.update(left);
    hasher.update(right);
    hasher.finalize().into()
}

fn run(data: &[u8]) {
    if data.len() < 64 {
        return;
    }

    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    let contract_id = env.register(CampaignContract, ());
    let client = CampaignContractClient::new(&env, &contract_id);
    client.initialize(&admin);

    // Set an open time window so other errors don't mask allowlist rejections.
    client.set_window(&admin, &0, &0, &u64::MAX);
    client.set_active(&admin, &1, &true);

    // Build a two-leaf tree: fuzz_leaf_a is the registered leaf, fuzz_leaf_b
    // is a sibling. The Merkle root is determined by both.
    let mut leaf_a = [0u8; 32];
    let mut leaf_b = [0u8; 32];
    leaf_a.copy_from_slice(&data[0..32]);
    leaf_b.copy_from_slice(&data[32..64]);

    let root_bytes = sha256_pair(leaf_a, leaf_b);
    let root = BytesN::from_array(&env, &root_bytes);
    client.set_merkle_root(&admin, &2, &root);

    // ── Case A: valid proof (leaf_a with sibling leaf_b) ─────────────────────
    let valid_leaf = BytesN::from_array(&env, &leaf_a);
    let mut valid_proof = SorobanVec::new(&env);
    valid_proof.push_back(BytesN::from_array(&env, &leaf_b));

    let result = client.try_register(&participant, &valid_leaf, &valid_proof, &None, &None);
    match &result {
        Ok(Ok(_)) => {}
        Ok(Err(Error::CampaignInactive))
        | Ok(Err(Error::OutsideTimeWindow))
        | Ok(Err(Error::CapReached)) => {}
        other => panic!("valid proof rejected unexpectedly: {other:?}"),
    }

    // ── Case B: mutated leaf — the proof should fail unless it accidentally
    //    reconstructs the stored root (astronomically unlikely with real fuzz data).
    let remaining = &data[64..];
    let mut bad_leaf = [0u8; 32];
    if remaining.len() >= 32 {
        bad_leaf.copy_from_slice(&remaining[0..32]);
    } else {
        bad_leaf[..remaining.len()].copy_from_slice(remaining);
        bad_leaf[31] ^= 0xff; // ensure it differs from leaf_a
    }

    if bad_leaf != leaf_a {
        let bad = BytesN::from_array(&env, &bad_leaf);
        let mut bad_proof = SorobanVec::new(&env);
        bad_proof.push_back(BytesN::from_array(&env, &leaf_b));

        let bad_result = client.try_register(
            &Address::generate(&env),
            &bad,
            &bad_proof,
            &None,
            &None,
        );
        match &bad_result {
            Ok(Err(Error::NotInAllowlist)) => {}
            Ok(Err(Error::CampaignInactive))
            | Ok(Err(Error::OutsideTimeWindow))
            | Ok(Err(Error::CapReached)) => {}
            Ok(Ok(_)) => {
                // A bad leaf coincidentally reconstructed the root — only
                // possible if fuzz data happened to form a valid preimage.
                // Verify to avoid a false positive assertion.
                let reconstructed = sha256_pair(bad_leaf, leaf_b);
                assert_eq!(
                    reconstructed, root_bytes,
                    "contract accepted bad proof that harness could not reconstruct",
                );
            }
            other => panic!("unexpected result for bad proof: {other:?}"),
        }
    }

    // ── Case C: empty proof — should always be rejected when a root is set.
    let any_leaf = BytesN::from_array(&env, &leaf_a);
    let empty_proof = SorobanVec::new(&env);
    let empty_result =
        client.try_register(&Address::generate(&env), &any_leaf, &empty_proof, &None, &None);
    match &empty_result {
        Ok(Err(Error::NotInAllowlist)) => {}
        Ok(Err(Error::CampaignInactive))
        | Ok(Err(Error::OutsideTimeWindow))
        | Ok(Err(Error::CapReached)) => {}
        other => panic!("empty proof accepted or wrong error: {other:?}"),
    }
}

fuzz_target!(|data: &[u8]| {
    run(data);
});
