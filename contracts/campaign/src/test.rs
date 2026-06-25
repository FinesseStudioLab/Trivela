//! Tests for the Trivela campaign contract.

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::testutils::{Address as _, Events as _, Ledger};
use soroban_sdk::{vec, Address, Bytes, BytesN, IntoVal, Vec};

/// Generate a deterministic ed25519 keypair for multisig tests, keyed by a
/// single seed byte so each co-admin gets a distinct key.
fn gen_keypair(seed: u8) -> SigningKey {
    let bytes = [seed; 32];
    SigningKey::from_bytes(&bytes)
}

fn sign_op(
    env: &Env,
    signing_key: &SigningKey,
    op: u32,
    nonce: u64,
    args_hash: &BytesN<32>,
) -> BytesN<64> {
    let mut buf = [0u8; 44];
    buf[0..4].copy_from_slice(&op.to_be_bytes());
    buf[4..12].copy_from_slice(&nonce.to_be_bytes());
    buf[12..44].copy_from_slice(&args_hash.to_array());
    let sig = signing_key.sign(&buf);
    BytesN::from_array(env, &sig.to_bytes())
}

// ── helpers ──────────────────────────────────────────────────────────────────

fn setup() -> (Env, Address, CampaignContractClient<'static>) {
    let env = Env::default();
    let contract_id = env.register_contract(None, CampaignContract);
    let client = CampaignContractClient::new(&env, &contract_id);
    (env, contract_id, client)
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
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    assert!(client.is_active());
}

#[test]
fn test_register_participant() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);
    let registered = client.register(&participant, &leaf, &proof, &None, &None);
    assert!(registered);
    assert!(client.is_participant(&participant));
}

#[test]
fn test_time_window_validation() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    client.set_window(&admin, &0, &100, &200);

    let (leaf, proof) = no_proof_args(&env);

    // Too early — exact error and no participant recorded.
    env.ledger().with_mut(|li| li.timestamp = 50);
    assert_eq!(
        client.try_register(&participant, &leaf, &proof, &None, &None),
        Err(Ok(Error::OutsideTimeWindow))
    );
    assert!(!client.is_participant(&participant));
    assert_eq!(client.get_participant_count(), 0);

    // Within window — succeeds.
    env.ledger().with_mut(|li| li.timestamp = 150);
    assert!(client.register(&participant, &leaf, &proof, &None, &None));
    assert_eq!(client.get_participant_count(), 1);

    // Too late — exact error and count unchanged.
    let p2 = Address::generate(&env);
    env.ledger().with_mut(|li| li.timestamp = 250);
    assert_eq!(
        client.try_register(&p2, &leaf, &proof, &None, &None),
        Err(Ok(Error::OutsideTimeWindow))
    );
    assert!(!client.is_participant(&p2));
    assert_eq!(client.get_participant_count(), 1);
}

#[test]
fn test_register_participant_twice_returns_false() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);
    assert!(client.register(&participant, &leaf, &proof, &None, &None));
    assert!(!client.register(&participant, &leaf, &proof, &None, &None));
}

#[test]
fn test_set_active_only_by_admin() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let other = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();

    // Non-admin cannot toggle active flag and the flag stays unchanged.
    assert!(client.is_active());
    assert_eq!(
        client.try_set_active(&other, &0, &false),
        Err(Ok(Error::Unauthorized))
    );
    assert!(client.is_active());
    // Admin nonce is not consumed when the call fails authorization.
    assert_eq!(client.admin_nonce(), 0);

    // Admin succeeds and flips the flag.
    client.set_active(&admin, &0, &false);
    assert!(!client.is_active());
}

#[test]
fn test_register_when_inactive() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    client.set_active(&admin, &0, &false);

    let (leaf, proof) = no_proof_args(&env);
    assert_eq!(
        client.try_register(&participant, &leaf, &proof, &None, &None),
        Err(Ok(Error::CampaignInactive))
    );
    // No participant was recorded and counter did not move.
    assert!(!client.is_participant(&participant));
    assert_eq!(client.get_participant_count(), 0);

    // Re-activating allows the same participant to register normally.
    client.set_active(&admin, &1, &true);
    assert!(client.register(&participant, &leaf, &proof, &None, &None));
    assert!(client.is_participant(&participant));
    assert_eq!(client.get_participant_count(), 1);
}

#[test]
fn test_is_participant_for_unknown_address() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let unknown_a = Address::generate(&env);
    let unknown_b = Address::generate(&env);
    client.initialize(&admin);

    // Multiple unrelated addresses all return false on a fresh contract.
    assert!(!client.is_participant(&unknown_a));
    assert!(!client.is_participant(&unknown_b));

    // Registering one address does not affect the membership of the other.
    let registered = Address::generate(&env);
    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);
    assert!(client.register(&registered, &leaf, &proof, &None, &None));

    assert!(client.is_participant(&registered));
    assert!(!client.is_participant(&unknown_a));
    assert!(!client.is_participant(&unknown_b));
}

#[test]
fn test_capacity_reached() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    client.set_max_cap(&admin, &0, &1);

    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    let (leaf, proof) = no_proof_args(&env);
    assert!(client.register(&p1, &leaf, &proof, &None, &None));
    let result = client.try_register(&p2, &leaf, &proof, &None, &None);
    assert_eq!(result, Err(Ok(Error::CapReached)));
}

// ── Merkle tests ──────────────────────────────────────────────────────────────

#[test]
fn test_merkle_root_not_set_by_default() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    assert!(client.get_merkle_root().is_none());
}

#[test]
fn test_set_merkle_root_only_by_admin() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let other = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    let dummy: BytesN<32> = BytesN::from_array(&env, &[1u8; 32]);
    let result = client.try_set_merkle_root(&other, &0, &dummy, &Vec::new(&env));
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

#[test]
fn test_register_with_valid_merkle_proof() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    client.initialize(&admin);

    // Build a two-leaf tree; each participant is associated with one leaf.
    let leaf1: BytesN<32> = BytesN::from_array(&env, &[0xAAu8; 32]);
    let leaf2: BytesN<32> = BytesN::from_array(&env, &[0xBBu8; 32]);
    let (root, proof1, proof2) = build_two_leaf_tree(&env, leaf1.clone(), leaf2.clone());

    env.mock_all_auths();
    client.set_merkle_root(&admin, &0, &root, &Vec::new(&env));
    assert_eq!(client.get_merkle_root(), Some(root));

    // Both allowlisted participants can register with their correct leaf + proof.
    assert!(client.register(&p1, &leaf1, &proof1, &None, &None));
    assert!(client.register(&p2, &leaf2, &proof2, &None, &None));
    assert!(client.is_participant(&p1));
    assert!(client.is_participant(&p2));
}

#[test]
fn test_register_rejected_with_invalid_proof() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let p2 = Address::generate(&env);
    client.initialize(&admin);

    let leaf1: BytesN<32> = BytesN::from_array(&env, &[0xAAu8; 32]);
    let leaf2: BytesN<32> = BytesN::from_array(&env, &[0xBBu8; 32]);
    let (root, _proof1, _proof2) = build_two_leaf_tree(&env, leaf1.clone(), leaf2.clone());

    env.mock_all_auths();
    client.set_merkle_root(&admin, &0, &root, &Vec::new(&env));

    // p2 supplies leaf2 but with a totally wrong proof sibling.
    let wrong_sibling: BytesN<32> = BytesN::from_array(&env, &[0xFFu8; 32]);
    let bad_proof = vec![&env, wrong_sibling];
    let result = client.try_register(&p2, &leaf2, &bad_proof, &None, &None);
    assert_eq!(result, Err(Ok(Error::NotInAllowlist)));
}

#[test]
fn test_register_rejected_with_leaf_not_in_tree() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let p3 = Address::generate(&env);
    client.initialize(&admin);

    let leaf1: BytesN<32> = BytesN::from_array(&env, &[0xAAu8; 32]);
    let leaf2: BytesN<32> = BytesN::from_array(&env, &[0xBBu8; 32]);
    let (root, _proof1, proof2) = build_two_leaf_tree(&env, leaf1.clone(), leaf2.clone());

    env.mock_all_auths();
    client.set_merkle_root(&admin, &0, &root, &Vec::new(&env));

    // p3 supplies a leaf that is not in the tree at all.
    let unknown_leaf: BytesN<32> = BytesN::from_array(&env, &[0xCCu8; 32]);
    let result = client.try_register(&p3, &unknown_leaf, &proof2, &None, &None);
    assert_eq!(result, Err(Ok(Error::NotInAllowlist)));
}

#[test]
fn test_register_rejected_with_empty_proof_when_root_set() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let p1 = Address::generate(&env);
    client.initialize(&admin);

    let leaf1: BytesN<32> = BytesN::from_array(&env, &[0xAAu8; 32]);
    let leaf2: BytesN<32> = BytesN::from_array(&env, &[0xBBu8; 32]);
    let (root, _proof1, _proof2) = build_two_leaf_tree(&env, leaf1.clone(), leaf2.clone());

    env.mock_all_auths();
    client.set_merkle_root(&admin, &0, &root, &Vec::new(&env));

    // Empty proof should fail when root is set – a leaf alone does not equal the root.
    let result = client.try_register(&p1, &leaf1, &Vec::new(&env), &None, &None);
    assert_eq!(result, Err(Ok(Error::NotInAllowlist)));
}

#[test]
fn test_open_registration_when_no_root() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);

    // No root set – any leaf/proof is accepted.
    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);
    assert!(client.register(&participant, &leaf, &proof, &None, &None));
}

#[test]
fn test_schema_version_and_migrate_entrypoint() {
    let (env, _contract_id, client) = setup();
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
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let p1 = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    let (leaf, proof) = no_proof_args(&env);
    assert_eq!(client.get_participant_count(), 0);
    assert!(client.register(&p1, &leaf, &proof, &None, &None));
    assert_eq!(client.get_participant_count(), 1);
    assert!(!client.register(&p1, &leaf, &proof, &None, &None));
    assert_eq!(client.get_participant_count(), 1);
}

// ── window: getters, validation, boundaries (issue #89) ─────────────────────

#[test]
fn test_get_window_default_is_open() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    // After initialize, the window is "open": [0, u64::MAX].
    assert_eq!(client.get_window(), (0, u64::MAX));
    assert!(client.is_within_window());
}

#[test]
fn test_get_window_after_set() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    client.set_window(&admin, &0, &1_000, &2_000);
    assert_eq!(client.get_window(), (1_000, 2_000));
}

#[test]
fn test_set_window_rejects_start_after_end() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    let nonce_before = client.admin_nonce();
    assert_eq!(
        client.try_set_window(&admin, &nonce_before, &500, &100),
        Err(Ok(Error::InvalidWindow))
    );

    // Window stays at default. The nonce increment performed inside
    // `require_admin_with_nonce` is rolled back together with all other
    // writes when the function returns `Err`, so the same nonce can be
    // re-used for a corrected call.
    assert_eq!(client.get_window(), (0, u64::MAX));
    assert_eq!(client.admin_nonce(), nonce_before);

    // Same nonce now succeeds with a valid window.
    client.set_window(&admin, &nonce_before, &100, &500);
    assert_eq!(client.get_window(), (100, 500));
    assert_eq!(client.admin_nonce(), nonce_before + 1);
}

#[test]
fn test_set_window_allows_equal_start_and_end() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    client.set_window(&admin, &0, &500, &500);
    assert_eq!(client.get_window(), (500, 500));

    // Single-instant window: register works exactly at the boundary.
    let (leaf, proof) = no_proof_args(&env);
    env.ledger().with_mut(|li| li.timestamp = 500);
    assert!(client.is_within_window());
    assert!(client.register(&participant, &leaf, &proof, &None, &None));
}

#[test]
fn test_register_at_window_boundaries() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    client.set_window(&admin, &0, &100, &200);
    let (leaf, proof) = no_proof_args(&env);

    // timestamp == start: inclusive lower bound.
    let p_start = Address::generate(&env);
    env.ledger().with_mut(|li| li.timestamp = 100);
    assert!(client.is_within_window());
    assert!(client.register(&p_start, &leaf, &proof, &None, &None));

    // timestamp == end: inclusive upper bound.
    let p_end = Address::generate(&env);
    env.ledger().with_mut(|li| li.timestamp = 200);
    assert!(client.is_within_window());
    assert!(client.register(&p_end, &leaf, &proof, &None, &None));

    // One past end: rejected.
    let p_after = Address::generate(&env);
    env.ledger().with_mut(|li| li.timestamp = 201);
    assert!(!client.is_within_window());
    assert_eq!(
        client.try_register(&p_after, &leaf, &proof, &None, &None),
        Err(Ok(Error::OutsideTimeWindow))
    );
}

#[test]
fn test_set_window_emits_event() {
    let (env, contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    client.set_window(&admin, &0, &100, &200);

    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                contract_id.clone(),
                vec![&env, SET_WINDOW_EVENT.into_val(&env)],
                (100u64, 200u64).into_val(&env)
            )
        ]
    );
}

// ── extra coverage for #91 ───────────────────────────────────────────────────

#[test]
fn test_set_active_emits_event_and_is_idempotent() {
    let (env, contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();

    // Toggle off — flag flips and a single event is emitted.
    // (`env.events().all()` reflects events from the most recent invocation,
    // so we assert it before any further client calls.)
    client.set_active(&admin, &0, &false);
    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                contract_id.clone(),
                vec![&env, SET_ACTIVE_EVENT.into_val(&env)],
                false.into_val(&env)
            )
        ]
    );

    // Setting to the same value is allowed (idempotent) and still emits.
    client.set_active(&admin, &1, &false);
    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                contract_id,
                vec![&env, SET_ACTIVE_EVENT.into_val(&env)],
                false.into_val(&env)
            )
        ]
    );
    assert!(!client.is_active());
}

#[test]
fn test_register_unauthorized_other_address_does_not_persist() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);
    assert!(client.register(&participant, &leaf, &proof, &None, &None));

    // Sanity: a brand-new address is not silently registered as a side
    // effect of someone else's register call.
    let bystander = Address::generate(&env);
    assert!(!client.is_participant(&bystander));
    assert_eq!(client.get_participant_count(), 1);
}

#[test]
fn test_admin_nonce_replay_protection() {
    let (env, _contract_id, client) = setup();
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

#[test]
fn test_deregister_success_and_re_register() {
    let (env, contract_id, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);

    // Register participant
    assert!(client.register(&participant, &leaf, &proof, &None, &None));
    assert!(client.is_participant(&participant));
    assert_eq!(client.get_participant_count(), 1);

    // Deregister participant.
    // `env.events().all()` reflects events from the most recent invocation,
    // so we assert it right after `deregister` (before any further client calls).
    assert!(client.deregister(&participant));
    let deregister_event = Symbol::new(&env, "deregister");
    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                contract_id.clone(),
                vec![
                    &env,
                    deregister_event.into_val(&env),
                    participant.clone().into_val(&env)
                ],
                ().into_val(&env)
            )
        ]
    );

    assert!(!client.is_participant(&participant));
    assert_eq!(client.get_participant_count(), 0);

    // Re-register works
    assert!(client.register(&participant, &leaf, &proof, &None, &None));
    assert!(client.is_participant(&participant));
    assert_eq!(client.get_participant_count(), 1);
}

#[test]
fn test_admin_deregister() {
    let (env, contract_id, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);

    // Register participant
    assert!(client.register(&participant, &leaf, &proof, &None, &None));
    assert!(client.is_participant(&participant));
    assert_eq!(client.get_participant_count(), 1);

    // Admin deregister.
    // `env.events().all()` reflects events from the most recent invocation,
    // so we assert it right after `admin_deregister` (before any further client calls).
    assert!(client.admin_deregister(&admin, &0, &participant));
    let deregister_event = Symbol::new(&env, "deregister");
    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                contract_id.clone(),
                vec![
                    &env,
                    deregister_event.into_val(&env),
                    participant.clone().into_val(&env)
                ],
                ().into_val(&env)
            )
        ]
    );

    assert!(!client.is_participant(&participant));
    assert_eq!(client.get_participant_count(), 0);

    // Call admin deregister again for same participant (should return false and not panic)
    assert!(!client.admin_deregister(&admin, &1, &participant));
    assert_eq!(client.get_participant_count(), 0);
}

#[test]
fn test_deregister_liveness_checks() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);

    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);

    // Register
    client.register(&participant, &leaf, &proof, &None, &None);

    // Case 1: end_time != u64::MAX and now > end_time
    client.set_window(&admin, &0, &100, &200);
    env.ledger().with_mut(|li| li.timestamp = 250);
    assert_eq!(
        client.try_deregister(&participant),
        Err(Ok(Error::OutsideTimeWindow))
    );

    // Reset window to u64::MAX but campaign inactive
    client.set_window(&admin, &1, &100, &u64::MAX);
    client.set_active(&admin, &2, &false);
    env.ledger().with_mut(|li| li.timestamp = 250);
    assert_eq!(
        client.try_deregister(&participant),
        Err(Ok(Error::CampaignInactive))
    );

    // Admin deregister bypasses all these checks
    assert!(client.admin_deregister(&admin, &3, &participant));
    assert!(!client.is_participant(&participant));
}

// ── storage pruning (#451) ────────────────────────────────────────────────────

#[test]
fn test_prune_expired_participants_empty_is_noop() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    assert_eq!(client.prune_expired_participants(&10), 0);
}

#[test]
fn test_prune_expired_participants_removes_expired_entries() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    let (leaf, proof) = no_proof_args(&env);
    assert!(client.register(&p1, &leaf, &proof, &None, &None));
    assert!(client.register(&p2, &leaf, &proof, &None, &None));
    assert_eq!(client.get_participant_count(), 2);

    // Deregistering frees the persistent record but leaves a stale
    // reference in the registry index until pruned — the same shape as a
    // participant whose persistent TTL lapsed and was archived by the
    // network without an explicit deregister call.
    assert!(client.admin_deregister(&admin, &0, &p1));
    assert!(client.admin_deregister(&admin, &1, &p2));
    assert_eq!(client.get_participant_count(), 0);

    let pruned = client.prune_expired_participants(&10);
    assert_eq!(pruned, 2);

    // Pruning again finds nothing left to remove.
    assert_eq!(client.prune_expired_participants(&10), 0);
}

#[test]
fn test_prune_expired_participants_respects_max_entries_cap() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    let (leaf, proof) = no_proof_args(&env);
    let mut participants: Vec<Address> = Vec::new(&env);
    for _ in 0..5 {
        let p = Address::generate(&env);
        assert!(client.register(&p, &leaf, &proof, &None, &None));
        participants.push_back(p);
    }
    assert_eq!(client.get_participant_count(), 5);

    for (i, p) in participants.iter().enumerate() {
        assert!(client.admin_deregister(&admin, &(i as u64), &p));
    }
    assert_eq!(client.get_participant_count(), 0);

    // Capped: only 2 stale entries removed per call even though 5 are gone.
    assert_eq!(client.prune_expired_participants(&2), 2);
    assert_eq!(client.prune_expired_participants(&2), 2);
    assert_eq!(client.prune_expired_participants(&2), 1);
    assert_eq!(client.prune_expired_participants(&2), 0);
}

#[test]
fn test_storage_stats_tracks_participants_and_expired_estimate() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let p1 = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    let (leaf, proof) = no_proof_args(&env);
    assert!(client.register(&p1, &leaf, &proof, &None, &None));

    let (participant_count, _nonce_count, expired) = client.storage_stats();
    assert_eq!(participant_count, 1);
    assert_eq!(expired, 0);

    assert!(client.admin_deregister(&admin, &0, &p1));

    let (participant_count, _nonce_count, expired) = client.storage_stats();
    assert_eq!(participant_count, 0);
    assert_eq!(expired, 1);
}

// ── invite-only registration (#452) ───────────────────────────────────────────

#[test]
fn test_register_without_code_in_invite_only_mode_fails() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    client.set_invite_only(&admin, &0, &true);
    assert!(client.is_invite_only());

    let (leaf, proof) = no_proof_args(&env);
    assert_eq!(
        client.try_register(&participant, &leaf, &proof, &None, &None),
        Err(Ok(Error::InviteCodeRequired))
    );
    assert!(!client.is_participant(&participant));
}

#[test]
fn test_register_with_invalid_code_fails() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    client.set_invite_only(&admin, &0, &true);

    let real_code = Bytes::from_slice(&env, b"correct-code");
    let real_hash: BytesN<32> = env.crypto().sha256(&real_code).into();
    client.issue_invite(&admin, &1, &real_hash);

    let wrong_code = Bytes::from_slice(&env, b"wrong-code");
    let (leaf, proof) = no_proof_args(&env);
    assert_eq!(
        client.try_register(&participant, &leaf, &proof, &Some(wrong_code), &None),
        Err(Ok(Error::InvalidInviteCode))
    );
    assert!(!client.is_participant(&participant));
}

#[test]
fn test_register_with_valid_code_succeeds_then_second_use_fails() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    client.set_invite_only(&admin, &0, &true);

    let code = Bytes::from_slice(&env, b"my-invite-code");
    let hash: BytesN<32> = env.crypto().sha256(&code).into();
    client.issue_invite(&admin, &1, &hash);
    assert!(!client.invite_used(&hash));

    let (leaf, proof) = no_proof_args(&env);
    assert!(client.register(&p1, &leaf, &proof, &Some(code.clone()), &None));
    assert!(client.is_participant(&p1));
    assert!(client.invite_used(&hash));

    // Second redemption of the same single-use code fails.
    assert_eq!(
        client.try_register(&p2, &leaf, &proof, &Some(code), &None),
        Err(Ok(Error::InviteAlreadyUsed))
    );
    assert!(!client.is_participant(&p2));
}

#[test]
fn test_revoke_invite_removes_it() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    client.set_invite_only(&admin, &0, &true);
    let code = Bytes::from_slice(&env, b"revoke-me");
    let hash: BytesN<32> = env.crypto().sha256(&code).into();
    client.issue_invite(&admin, &1, &hash);
    client.revoke_invite(&admin, &2, &hash);

    let (leaf, proof) = no_proof_args(&env);
    assert_eq!(
        client.try_register(&participant, &leaf, &proof, &Some(code), &None),
        Err(Ok(Error::InvalidInviteCode))
    );
}

// ── co-admin multisig for set_merkle_root (#454) ──────────────────────────────

#[test]
fn test_multisig_2_of_3_one_signature_fails() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    let co1 = Address::generate(&env);
    let co2 = Address::generate(&env);
    let co3 = Address::generate(&env);
    let key1 = gen_keypair(1);
    let key2 = gen_keypair(2);
    let key3 = gen_keypair(3);
    let pub1 = BytesN::from_array(&env, &key1.verifying_key().to_bytes());
    let pub2 = BytesN::from_array(&env, &key2.verifying_key().to_bytes());
    let pub3 = BytesN::from_array(&env, &key3.verifying_key().to_bytes());

    client.add_co_admin(&admin, &0, &co1, &pub1);
    client.add_co_admin(&admin, &1, &co2, &pub2);
    client.add_co_admin(&admin, &2, &co3, &pub3);
    client.set_multisig_threshold(&admin, &3, &2);
    assert_eq!(client.multisig_threshold(), 2);

    let root: BytesN<32> = BytesN::from_array(&env, &[7u8; 32]);
    let args_hash: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_slice(&env, &root.to_array()))
        .into();
    let nonce = 42u64;
    let sig1 = sign_op(&env, &key1, OP_SET_MERKLE_ROOT, nonce, &args_hash);

    let signatures = vec![&env, (co1.clone(), sig1)];
    let result = client.try_set_merkle_root(&admin, &nonce, &root, &signatures);
    assert_eq!(result, Err(Ok(Error::InsufficientSignatures)));
    assert!(client.get_merkle_root().is_none());
}

#[test]
fn test_multisig_2_of_3_two_signatures_succeed_and_nonce_replay_fails() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    let co1 = Address::generate(&env);
    let co2 = Address::generate(&env);
    let co3 = Address::generate(&env);
    let key1 = gen_keypair(1);
    let key2 = gen_keypair(2);
    let key3 = gen_keypair(3);
    let pub1 = BytesN::from_array(&env, &key1.verifying_key().to_bytes());
    let pub2 = BytesN::from_array(&env, &key2.verifying_key().to_bytes());
    let pub3 = BytesN::from_array(&env, &key3.verifying_key().to_bytes());

    client.add_co_admin(&admin, &0, &co1, &pub1);
    client.add_co_admin(&admin, &1, &co2, &pub2);
    client.add_co_admin(&admin, &2, &co3, &pub3);
    client.set_multisig_threshold(&admin, &3, &2);

    let root: BytesN<32> = BytesN::from_array(&env, &[7u8; 32]);
    let args_hash: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_slice(&env, &root.to_array()))
        .into();
    let nonce = 42u64;
    let sig1 = sign_op(&env, &key1, OP_SET_MERKLE_ROOT, nonce, &args_hash);
    let sig2 = sign_op(&env, &key2, OP_SET_MERKLE_ROOT, nonce, &args_hash);

    let signatures = vec![&env, (co1.clone(), sig1), (co2.clone(), sig2)];
    client.set_merkle_root(&admin, &nonce, &root, &signatures);
    assert_eq!(client.get_merkle_root(), Some(root.clone()));

    // Replaying the same nonce (even with valid signatures) fails.
    let root2: BytesN<32> = BytesN::from_array(&env, &[9u8; 32]);
    let args_hash2: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_slice(&env, &root2.to_array()))
        .into();
    let sig1b = sign_op(&env, &key1, OP_SET_MERKLE_ROOT, nonce, &args_hash2);
    let sig2b = sign_op(&env, &key2, OP_SET_MERKLE_ROOT, nonce, &args_hash2);
    let signatures2 = vec![&env, (co1, sig1b), (co2, sig2b)];
    let result = client.try_set_merkle_root(&admin, &nonce, &root2, &signatures2);
    assert_eq!(result, Err(Ok(Error::NonceReused)));
    assert_eq!(client.get_merkle_root(), Some(root));
}
// ── #280: persistent participant storage ─────────────────────────────────────
//
// The migration of per-user records from instance storage (~64KB cap)
// to persistent storage is verified by:
//   - registering > 100 distinct participants and asserting they all
//     stick (would have failed against the instance cap path),
//   - re-asserting the round-trip through is_participant() reads
//     from the new tier,
//   - confirming deregister() flips state in persistent and the
//     instance-tier PARTICIPANT_COUNT aggregate still tracks the
//     net number.

#[test]
fn test_register_writes_to_persistent_and_is_participant_reads_it() {
    let (env, contract_id, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    let (leaf, proof) = no_proof_args(&env);
    assert!(client.register(&participant, &leaf, &proof, &None, &None));

    // The contract is the storage owner, so the test reads through
    // the contract's view function rather than poking storage
    // directly — which is exactly the surface external callers use.
    assert!(client.is_participant(&participant));

    // Cross-check via env: persistent storage holds the entry,
    // instance storage does NOT (post-migration).
    env.as_contract(&contract_id, || {
        let key = (PARTICIPANT, participant.clone());
        assert_eq!(
            env.storage().persistent().get::<_, bool>(&key),
            Some(true),
            "participant record must live in persistent storage",
        );
        assert_eq!(
            env.storage().instance().get::<_, bool>(&key),
            None,
            "participant record must NOT live in instance storage",
        );
    });
}

#[test]
fn test_register_one_hundred_plus_participants_no_size_cap() {
    // The point of this test: under the old instance-storage layout,
    // a high-traffic campaign would silently brick around ~1.8k
    // participants (Address ≈ 35 bytes × N < 64KB). With persistent
    // storage every key owns its own slot, so 250 registrations are
    // boring instead of catastrophic.
    extern crate std;
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    let (leaf, proof) = no_proof_args(&env);
    let mut participants: std::vec::Vec<Address> = std::vec::Vec::new();
    for _ in 0..250 {
        let p = Address::generate(&env);
        assert!(
            client.register(&p, &leaf, &proof, &None, &None),
            "registration must succeed for every participant",
        );
        participants.push(p);
    }

    assert_eq!(client.get_participant_count(), 250);
    for p in &participants {
        assert!(client.is_participant(p), "participant must be retrievable");
    }
}

#[test]
fn test_deregister_clears_persistent_and_keeps_aggregate_count_consistent() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let p_keep = Address::generate(&env);
    let p_drop = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    let (leaf, proof) = no_proof_args(&env);
    assert!(client.register(&p_keep, &leaf, &proof, &None, &None));
    assert!(client.register(&p_drop, &leaf, &proof, &None, &None));
    assert_eq!(client.get_participant_count(), 2);

    // admin_deregister exercises do_deregister via the admin path
    // (no need to honour the time-window check).
    assert!(client.admin_deregister(&admin, &0, &p_drop));

    assert!(!client.is_participant(&p_drop));
    assert!(client.is_participant(&p_keep));
    // PARTICIPANT_COUNT is kept in instance storage on purpose — it's
    // a single aggregate, not per-user — and must decrement.
    assert_eq!(client.get_participant_count(), 1);
}

// ── 2-step admin transfer (issue #281) ───────────────────────────────────────

fn setup_admin_rotation_campaign() -> (Env, CampaignContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, CampaignContract);
    let client = CampaignContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    client.initialize(&admin);
    (env, client, admin, new_admin)
}

#[test]
fn test_campaign_propose_and_accept_admin_happy_path() {
    let (_env, client, admin, new_admin) = setup_admin_rotation_campaign();
    assert_eq!(client.admin(), admin);
    assert_eq!(client.pending_admin(), None);

    client.propose_admin(&admin, &new_admin);
    assert_eq!(client.pending_admin(), Some(new_admin.clone()));
    assert_eq!(client.admin(), admin);

    client.accept_admin(&new_admin);
    assert_eq!(client.admin(), new_admin);
    assert_eq!(client.pending_admin(), None);
}

#[test]
fn test_campaign_propose_without_accept_keeps_old_admin() {
    let (_env, client, admin, new_admin) = setup_admin_rotation_campaign();
    client.propose_admin(&admin, &new_admin);
    assert_eq!(client.admin(), admin);
    assert_eq!(client.pending_admin(), Some(new_admin));
}

#[test]
fn test_campaign_non_admin_cannot_propose() {
    let (env, client, _admin, new_admin) = setup_admin_rotation_campaign();
    let imposter = Address::generate(&env);
    let result = client.try_propose_admin(&imposter, &new_admin);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

#[test]
fn test_campaign_only_pending_can_accept() {
    let (env, client, admin, new_admin) = setup_admin_rotation_campaign();
    let third_party = Address::generate(&env);
    client.propose_admin(&admin, &new_admin);
    let result = client.try_accept_admin(&third_party);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
    assert_eq!(client.admin(), admin);
}

#[test]
fn test_campaign_accept_without_proposal_fails() {
    let (_env, client, _admin, new_admin) = setup_admin_rotation_campaign();
    let result = client.try_accept_admin(&new_admin);
    assert_eq!(result, Err(Ok(Error::NoPendingAdmin)));
}

#[test]
fn test_campaign_cancel_admin_transfer_clears_pending() {
    let (_env, client, admin, new_admin) = setup_admin_rotation_campaign();
    client.propose_admin(&admin, &new_admin);
    client.cancel_admin_transfer(&admin);
    assert_eq!(client.pending_admin(), None);
    let result = client.try_accept_admin(&new_admin);
    assert_eq!(result, Err(Ok(Error::NoPendingAdmin)));
}

#[test]
fn test_campaign_new_admin_can_call_admin_operations() {
    // Once accepted, the new admin's signature is enough to perform admin-only ops.
    let (_env, client, admin, new_admin) = setup_admin_rotation_campaign();
    client.propose_admin(&admin, &new_admin);
    client.accept_admin(&new_admin);

    // set_active is admin-only — was previously rejected for `admin`'s replacement
    // until the rotation completed.
    let nonce = client.admin_nonce();
    client.set_active(&new_admin, &nonce, &true);
    assert!(client.is_active());

    // Old admin can no longer perform admin-only ops.
    let nonce = client.admin_nonce();
    let result = client.try_set_active(&admin, &nonce, &false);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

// ── On-chain referral tracking (issue #455) ──────────────────────────────────

#[test]
fn test_register_with_valid_referrer_records_edge_and_emits_event() {
    let (env, contract_id, client) = setup();
    let admin = Address::generate(&env);
    let referrer = Address::generate(&env);
    let referee = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);

    // Referrer must be registered before they can refer anyone.
    assert!(client.register(&referrer, &leaf, &proof, &None, &None));
    // Referee registers citing the referrer.
    assert!(client.register(&referee, &leaf, &proof, &None, &Some(referrer.clone())));

    // `env.events().all()` reflects the most recent contract invocation, so we
    // assert it right after the referee's registration (before any view call).
    // That invocation emits a `register` for the referee followed by the
    // `referred` event with topics (referred, participant, referrer).
    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                contract_id.clone(),
                vec![
                    &env,
                    REGISTER_EVENT.into_val(&env),
                    referee.clone().into_val(&env)
                ],
                ().into_val(&env)
            ),
            (
                contract_id.clone(),
                vec![
                    &env,
                    REFERRED_EVENT.into_val(&env),
                    referee.clone().into_val(&env),
                    referrer.clone().into_val(&env)
                ],
                ().into_val(&env)
            ),
        ]
    );

    // The referral edge and tally are stored on-chain.
    assert_eq!(client.referrer_of(&referee), Some(referrer.clone()));
    assert_eq!(client.referral_count(&referrer), 1);
}

#[test]
fn test_self_referral_rejected() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);

    // Registering with yourself as referrer is rejected with SelfReferral and
    // leaves no participant record behind.
    assert_eq!(
        client.try_register(
            &participant,
            &leaf,
            &proof,
            &None,
            &Some(participant.clone())
        ),
        Err(Ok(Error::SelfReferral))
    );
    assert!(!client.is_participant(&participant));
    assert_eq!(client.get_participant_count(), 0);
    assert_eq!(client.referrer_of(&participant), None);
}

#[test]
fn test_referrer_must_already_be_registered() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let referrer = Address::generate(&env);
    let referee = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);

    // The referrer has never registered, so the referral is rejected and the
    // referee is NOT registered (atomic abort).
    assert_eq!(
        client.try_register(&referee, &leaf, &proof, &None, &Some(referrer.clone())),
        Err(Ok(Error::ReferrerNotRegistered))
    );
    assert!(!client.is_participant(&referee));
    assert_eq!(client.get_participant_count(), 0);
}

#[test]
fn test_referrer_of_returns_none_for_unreferenced_participant() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    let never_seen = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);

    // Registered without a referrer → None.
    assert!(client.register(&participant, &leaf, &proof, &None, &None));
    assert_eq!(client.referrer_of(&participant), None);
    // Never registered at all → None, and zero referrals.
    assert_eq!(client.referrer_of(&never_seen), None);
    assert_eq!(client.referral_count(&never_seen), 0);
}

#[test]
fn test_referral_count_tracks_multiple_referees() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let referrer = Address::generate(&env);
    let referee_a = Address::generate(&env);
    let referee_b = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);

    assert!(client.register(&referrer, &leaf, &proof, &None, &None));
    assert!(client.register(&referee_a, &leaf, &proof, &None, &Some(referrer.clone())));
    assert!(client.register(&referee_b, &leaf, &proof, &None, &Some(referrer.clone())));

    assert_eq!(client.referral_count(&referrer), 2);
    assert_eq!(client.referrer_of(&referee_a), Some(referrer.clone()));
    assert_eq!(client.referrer_of(&referee_b), Some(referrer.clone()));
}

#[test]
fn test_repeat_registration_does_not_double_count_referral() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let referrer = Address::generate(&env);
    let other = Address::generate(&env);
    let referee = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);

    assert!(client.register(&referrer, &leaf, &proof, &None, &None));
    assert!(client.register(&other, &leaf, &proof, &None, &None));

    // First registration records the referral edge.
    assert!(client.register(&referee, &leaf, &proof, &None, &Some(referrer.clone())));
    // A repeat registration returns false and must not re-record or move the
    // referral to a different referrer.
    assert!(!client.register(&referee, &leaf, &proof, &None, &Some(other.clone())));

    assert_eq!(client.referrer_of(&referee), Some(referrer.clone()));
    assert_eq!(client.referral_count(&referrer), 1);
    assert_eq!(client.referral_count(&other), 0);
}

// ── Activity log tests (issue #453) ──────────────────────────────────────────

#[test]
fn test_activity_log_records_registrations() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);

    assert!(client.register(&p1, &leaf, &proof, &None, &None));
    assert!(client.register(&p2, &leaf, &proof, &None, &None));

    let log = client.activity_log();
    assert_eq!(log.len(), 2);
    assert_eq!(log.get(0).unwrap().kind, ActivityKind::Register);
    assert_eq!(log.get(0).unwrap().actor, p1);
    assert_eq!(log.get(1).unwrap().kind, ActivityKind::Register);
    assert_eq!(log.get(1).unwrap().actor, p2);
}

#[test]
fn test_activity_log_ring_buffer_evicts_oldest() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    // Set a small buffer size for testing
    client.set_activity_log_size(&admin, &0, &10);
    assert_eq!(client.get_activity_log_size(), 10);

    let (leaf, proof) = no_proof_args(&env);

    // Register 15 participants - should evict first 5
    for _ in 0..15 {
        let participant = Address::generate(&env);
        client.register(&participant, &leaf, &proof, &None, &None);
    }

    let log = client.activity_log();
    assert_eq!(log.len(), 10); // Buffer capped at 10
}

#[test]
fn test_activity_log_chronological_order() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);

    client.initialize(&admin);
    env.mock_all_auths();
    let (leaf, proof) = no_proof_args(&env);

    // Register participants one by one, incrementing ledger
    for i in 0..5 {
        let p = Address::generate(&env);
        env.ledger().with_mut(|li| li.sequence_number = i as u32);
        client.register(&p, &leaf, &proof, &None, &None);
    }

    let log = client.activity_log();
    assert_eq!(log.len(), 5);

    // Verify chronological order (oldest first)
    for i in 0..5 {
        assert_eq!(log.get(i as u32).unwrap().ledger, i as u32);
    }
}

#[test]
fn test_set_activity_log_size_validates_range() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    // Min boundary (10) - should succeed
    client.set_activity_log_size(&admin, &0, &10);

    // Max boundary (200) - should succeed
    client.set_activity_log_size(&admin, &1, &200);

    // Below min (9) - should fail
    assert!(client.try_set_activity_log_size(&admin, &2, &9).is_err());

    // Above max (201) - should fail
    assert!(client.try_set_activity_log_size(&admin, &3, &201).is_err());
}

#[test]
fn test_set_activity_log_size_trims_existing_log() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);
    env.mock_all_auths();

    let (leaf, proof) = no_proof_args(&env);

    // Register 20 participants
    for _ in 0..20 {
        let participant = Address::generate(&env);
        client.register(&participant, &leaf, &proof, &None, &None);
    }

    let log = client.activity_log();
    assert_eq!(log.len(), 20);

    // Reduce size to 10 - should trim oldest 10 entries
    client.set_activity_log_size(&admin, &0, &10);

    let trimmed_log = client.activity_log();
    assert_eq!(trimmed_log.len(), 10);
}

#[test]
fn test_activity_log_view_returns_empty_on_init() {
    let (env, _contract_id, client) = setup();
    let admin = Address::generate(&env);
    client.initialize(&admin);

    let log = client.activity_log();
    assert_eq!(log.len(), 0);
}
