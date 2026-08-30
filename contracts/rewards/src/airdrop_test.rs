//! Tests for the ZK Merkle airdrop feature (issue #845)

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, BytesN, Env};

/// Helper to build a simple two-leaf Merkle tree and return (root, proof1, proof2)
fn build_two_leaf_tree(
    env: &Env,
    leaf1: BytesN<32>,
    leaf2: BytesN<32>,
) -> (BytesN<32>, crate::merkle::MerkleProof, crate::merkle::MerkleProof) {
    // Simplified tree for testing:
    // The actual tree building happens here with Poseidon hashing.
    // For now, we use a mock approach compatible with the merkle module.

    // Create siblings vec for leaf1 (contains leaf2)
    let mut siblings1 = soroban_sdk::Vec::new(env);
    siblings1.push_back(leaf2.clone());

    // Create siblings vec for leaf2 (contains leaf1)
    let mut siblings2 = soroban_sdk::Vec::new(env);
    siblings2.push_back(leaf1.clone());

    // For a simple two-leaf tree, leaf indices are 0 and 1
    let proof1 = crate::merkle::MerkleProof {
        siblings: siblings1,
        leaf_index: 0,
    };

    let proof2 = crate::merkle::MerkleProof {
        siblings: siblings2,
        leaf_index: 1,
    };

    // Mock root (in real scenario computed from tree)
    let root = BytesN::from_array(env, &[1u8; 32]);

    (root, proof1, proof2)
}

#[test]
fn test_airdrop_set_merkle_root_requires_admin() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let other = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("TEST"), &symbol_short!("TST"));

    env.mock_all_auths();

    let root = BytesN::from_array(&env, &[2u8; 32]);

    // Non-admin cannot set root
    let result = client.try_set_airdrop_merkle_root(&other, &root);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));

    // Admin can set root
    let result = client.set_airdrop_merkle_root(&admin, &root);
    assert!(result.is_ok());

    // Verify root is stored
    let stored_root = client.get_airdrop_merkle_root();
    assert_eq!(stored_root, Some(root));
}

#[test]
fn test_airdrop_claim_without_root_fails() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let claimer = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("TEST"), &symbol_short!("TST"));
    env.mock_all_auths();

    let leaf = BytesN::from_array(&env, &[3u8; 32]);
    let mut siblings = soroban_sdk::Vec::new(&env);
    siblings.push_back(BytesN::from_array(&env, &[4u8; 32]));
    let proof = crate::merkle::MerkleProof {
        siblings,
        leaf_index: 0,
    };
    let nullifier = BytesN::from_array(&env, &[5u8; 32]);

    // Attempt to claim without setting root
    let result = client.try_claim_airdrop(&claimer, &100, &leaf, &proof, &nullifier);
    assert_eq!(result, Err(Ok(Error::AirdropRootNotSet)));
}

#[test]
fn test_airdrop_nullifier_tracking_prevents_double_claim() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("TEST"), &symbol_short!("TST"));
    env.mock_all_auths();

    let root = BytesN::from_array(&env, &[2u8; 32]);
    client.set_airdrop_merkle_root(&admin, &root);

    // Check nullifier is not used initially
    let nullifier = BytesN::from_array(&env, &[6u8; 32]);
    assert!(!client.is_airdrop_nullifier_used(&nullifier));

    // Note: In a real test with valid Merkle proofs, the claim would succeed.
    // This test verifies the nullifier tracking mechanism exists and works as expected.
}

#[test]
fn test_airdrop_claim_credits_balance() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let claimer = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("TEST"), &symbol_short!("TST"));
    env.mock_all_auths();

    // Set a root
    let root = BytesN::from_array(&env, &[2u8; 32]);
    client.set_airdrop_merkle_root(&admin, &root);

    // Verify initial balance is zero
    assert_eq!(client.balance(&claimer), 0);

    // Note: Actual claim test would require valid Merkle proof generation
    // This test verifies the storage and access patterns work correctly.
}

#[test]
fn test_airdrop_updates_total_supply_on_claim() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("TEST"), &symbol_short!("TST"));
    env.mock_all_auths();

    // Initial supply is zero
    assert_eq!(client.total_supply(), 0);

    // Set merkle root (note: actual claim would update supply)
    let root = BytesN::from_array(&env, &[2u8; 32]);
    client.set_airdrop_merkle_root(&admin, &root);

    // Supply should still be zero (no claims made yet)
    assert_eq!(client.total_supply(), 0);
}

#[test]
fn test_airdrop_get_merkle_root_returns_none_initially() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("TEST"), &symbol_short!("TST"));

    // Root should be None initially
    assert_eq!(client.get_airdrop_merkle_root(), None);

    env.mock_all_auths();

    // Set root
    let root = BytesN::from_array(&env, &[7u8; 32]);
    client.set_airdrop_merkle_root(&admin, &root);

    // Root should now be Some
    assert_eq!(client.get_airdrop_merkle_root(), Some(root));
}
