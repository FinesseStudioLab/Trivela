//! Tests for the Trivela campaign contract.

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{vec, Address, Bytes, BytesN, Vec};

// ── helpers ──────────────────────────────────────────────────────────────────

fn setup() -> (Env, CampaignContractClient<'static>) {
    let env = Env::default();
    let contract_id = env.register_contract(None, CampaignContract);
    let client = CampaignContractClient::new(&env, &contract_id);
    (env, client)
}

/// Empty proof + dummy leaf – used when no Merkle root is configured.
fn no_proof_args(env: &Env) -> (BytesN<32>, Vec<BytesN<32>>) {
    (BytesN::from_array(env, &[0u8; 32]), Vec::new(env))
}

/// Build a two-leaf Merkle tree and return `(root, proof_for_a, proof_for_b)`.
///
/// Tree:
/// ```text
///        root
///       /    \
///   leaf_a  leaf_b
/// ```
/// Pairs are hashed in sorted order (same as `hash_pair` in lib.rs).
fn build_two_leaf_tree(
    env: &Env,
    leaf_a: BytesN<32>,
    leaf_b: BytesN<32>,
) -> (BytesN<32>, Vec<BytesN<32>>, Vec<BytesN<32>>) {
    let (left, right) = if leaf_a <= leaf_b {
        (leaf_a.clone(), leaf_b.clone())
    } else {
        (leaf_b.clone(), leaf_a.clone())
    };
    let mut combined = [0u8; 64];
    combined[..32].copy_from_slice(&left.to_array());
    combined[32..].copy_from_slice(&right.to_array());
    let root: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_slice(env, &combined))
        .into();

    // Proof for leaf_a is [leaf_b], proof for leaf_b is [leaf_a].
    (root, vec![env, leaf_b], vec![env, leaf_a])
}

// ── original tests (updated for new `leaf` + `proof` parameters) ─────────────

#[test]
fn test_initialize_and_active() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    assert!(client.is_active());
}

#[test]
fn test_register_participant() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);
    let registered = client.register(&participant, &leaf, &proof);
    assert!(registered);
    assert!(client.is_participant(&participant));
}

#[test]
fn test_time_window_validation() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    client.set_window(&admin, &0, &100, &200);

    let (leaf, proof) = no_proof_args(&env);

    // Too early
    env.ledger().with_mut(|li| li.timestamp = 50);
    assert!(client.try_register(&participant, &leaf, &proof).is_err());

    // Within window
    env.ledger().with_mut(|li| li.timestamp = 150);
    assert!(client.register(&participant, &leaf, &proof));

    // Too late
    let p2 = Address::generate(&env);
    env.ledger().with_mut(|li| li.timestamp = 250);
    assert!(client.try_register(&p2, &leaf, &proof).is_err());
}

#[test]
fn test_register_participant_twice_returns_false() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);
    assert!(client.register(&participant, &leaf, &proof));
    assert!(!client.register(&participant, &leaf, &proof));
}

#[test]
fn test_set_active_only_by_admin() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let other = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    let result = client.try_set_active(&other, &0, &false);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

#[test]
fn test_register_when_inactive() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    client.set_active(&admin, &0, &false);

    let (leaf, proof) = no_proof_args(&env);
    let result = client.try_register(&participant, &leaf, &proof);
    assert_eq!(result, Err(Ok(Error::CampaignInactive)));
}

#[test]
fn test_is_participant_for_unknown_address() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let unknown = Address::generate(&env);
    client.initialize(&admin);
    assert!(!client.is_participant(&unknown));
}

#[test]
fn test_capacity_reached() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    client.set_max_cap(&admin, &0, &1);

    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    let (leaf, proof) = no_proof_args(&env);
    assert!(client.register(&p1, &leaf, &proof));
    let result = client.try_register(&p2, &leaf, &proof);
    assert_eq!(result, Err(Ok(Error::CapacityReached)));
}

// ── Merkle tests ──────────────────────────────────────────────────────────────

#[test]
fn test_merkle_root_not_set_by_default() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    assert!(client.get_merkle_root().is_none());
}

#[test]
fn test_set_merkle_root_only_by_admin() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let other = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    let dummy: BytesN<32> = BytesN::from_array(&env, &[1u8; 32]);
    let result = client.try_set_merkle_root(&other, &0, &dummy);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

#[test]
fn test_register_with_valid_merkle_proof() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    client.initialize(&admin);

    // Build a two-leaf tree; each participant is associated with one leaf.
    let leaf1: BytesN<32> = BytesN::from_array(&env, &[0xAAu8; 32]);
    let leaf2: BytesN<32> = BytesN::from_array(&env, &[0xBBu8; 32]);
    let (root, proof1, proof2) = build_two_leaf_tree(&env, leaf1.clone(), leaf2.clone());

    env.mock_all_auths();
    client.set_merkle_root(&admin, &0, &root);
    assert_eq!(client.get_merkle_root(), Some(root));

    // Both allowlisted participants can register with their correct leaf + proof.
    assert!(client.register(&p1, &leaf1, &proof1));
    assert!(client.register(&p2, &leaf2, &proof2));
    assert!(client.is_participant(&p1));
    assert!(client.is_participant(&p2));
}

#[test]
fn test_register_rejected_with_invalid_proof() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    client.initialize(&admin);

    let leaf1: BytesN<32> = BytesN::from_array(&env, &[0xAAu8; 32]);
    let leaf2: BytesN<32> = BytesN::from_array(&env, &[0xBBu8; 32]);
    let (root, _proof1, _proof2) = build_two_leaf_tree(&env, leaf1.clone(), leaf2.clone());

    env.mock_all_auths();
    client.set_merkle_root(&admin, &0, &root);

    // p2 supplies leaf2 but with a totally wrong proof sibling.
    let wrong_sibling: BytesN<32> = BytesN::from_array(&env, &[0xFFu8; 32]);
    let bad_proof = vec![&env, wrong_sibling];
    let result = client.try_register(&p2, &leaf2, &bad_proof);
    assert_eq!(result, Err(Ok(Error::NotInAllowlist)));
}

#[test]
fn test_register_rejected_with_leaf_not_in_tree() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let p3 = Address::generate(&env);
    client.initialize(&admin);

    let leaf1: BytesN<32> = BytesN::from_array(&env, &[0xAAu8; 32]);
    let leaf2: BytesN<32> = BytesN::from_array(&env, &[0xBBu8; 32]);
    let (root, _proof1, proof2) = build_two_leaf_tree(&env, leaf1.clone(), leaf2.clone());

    env.mock_all_auths();
    client.set_merkle_root(&admin, &0, &root);

    // p3 supplies a leaf that is not in the tree at all.
    let unknown_leaf: BytesN<32> = BytesN::from_array(&env, &[0xCCu8; 32]);
    let result = client.try_register(&p3, &unknown_leaf, &proof2);
    assert_eq!(result, Err(Ok(Error::NotInAllowlist)));
}

#[test]
fn test_register_rejected_with_empty_proof_when_root_set() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let p1 = Address::generate(&env);
    client.initialize(&admin);

    let leaf1: BytesN<32> = BytesN::from_array(&env, &[0xAAu8; 32]);
    let leaf2: BytesN<32> = BytesN::from_array(&env, &[0xBBu8; 32]);
    let (root, _proof1, _proof2) = build_two_leaf_tree(&env, leaf1.clone(), leaf2.clone());

    env.mock_all_auths();
    client.set_merkle_root(&admin, &0, &root);

    // Empty proof should fail when root is set – a leaf alone does not equal the root.
    let result = client.try_register(&p1, &leaf1, &Vec::new(&env));
    assert_eq!(result, Err(Ok(Error::NotInAllowlist)));
}

#[test]
fn test_open_registration_when_no_root() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);

    // No root set – any leaf/proof is accepted.
    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);
    assert!(client.register(&participant, &leaf, &proof));
}

#[test]
fn test_schema_version_and_migrate_entrypoint() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let other = Address::generate(&env);
    client.initialize(&admin);
    assert_eq!(client.schema_version(), 1);

    env.mock_all_auths();
    let migrated = client.migrate(&admin, &1);
    assert_eq!(migrated, 1);
    assert_eq!(client.schema_version(), 1);

    let unsupported = client.try_migrate(&admin, &2);
    assert_eq!(unsupported, Err(Ok(Error::UnsupportedMigration)));

    let unauthorized = client.try_migrate(&other, &1);
    assert_eq!(unauthorized, Err(Ok(Error::Unauthorized)));
}

#[test]
fn test_participant_count_increments_on_new_register_only() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    let p1 = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    let (leaf, proof) = no_proof_args(&env);
    assert_eq!(client.get_participant_count(), 0);
    assert!(client.register(&p1, &leaf, &proof));
    assert_eq!(client.get_participant_count(), 1);
    assert!(!client.register(&p1, &leaf, &proof));
    assert_eq!(client.get_participant_count(), 1);
}

#[test]
fn test_admin_nonce_replay_protection() {
    let (env, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    assert_eq!(client.admin_nonce(), 0);
    client.set_active(&admin, &0, &false);
    assert_eq!(client.admin_nonce(), 1);

    let replay = client.try_set_active(&admin, &0, &true);
    assert_eq!(replay, Err(Ok(Error::InvalidAdminNonce)));

    client.set_active(&admin, &1, &true);
    assert_eq!(client.admin_nonce(), 2);
}
