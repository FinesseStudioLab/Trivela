//! End-to-end integration tests for the Trivela Soroban contracts.
//!
//! Scenarios:
//!  A – Happy path: register → credit → claim
//!  B – Paused rewards: credit blocked, unpause, claim succeeds
//!  C – Cap reached: CapReached on 3rd registration when cap=2
//!  D – Merkle allowlist: valid proof succeeds, invalid proof rejected
//!  E – Admin upgrade flow: deploy → migrate → verify schema_version

use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{symbol_short, vec, Address, Bytes, BytesN, Env, Vec as SdkVec};
use trivela_campaign_contract::{CampaignContract, CampaignContractClient, Error as CampaignError};
use trivela_rewards_contract::{Error as RewardsError, RewardsContract, RewardsContractClient};

fn seed_users(env: &Env, count: usize) -> std::vec::Vec<Address> {
    (0..count).map(|_| Address::generate(env)).collect()
}

fn empty_proof(env: &Env) -> (BytesN<32>, SdkVec<BytesN<32>>) {
    (BytesN::from_array(env, &[0u8; 32]), SdkVec::new(env))
}

/// Build a two-leaf Merkle tree. Returns (root, proof_for_a, proof_for_b).
fn build_two_leaf_tree(
    env: &Env,
    leaf_a: BytesN<32>,
    leaf_b: BytesN<32>,
) -> (BytesN<32>, SdkVec<BytesN<32>>, SdkVec<BytesN<32>>) {
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
    (root, vec![env, leaf_b], vec![env, leaf_a])
}

// ── Scenario A: Happy Path ────────────────────────────────────────────────────

/// Full happy-path flow across campaign (registry) and rewards contracts:
/// register 5 users → credit each → all claim → verify final balances.
#[test]
fn scenario_a_happy_path() {
    let env = Env::default();
    let campaign_id = env.register_contract(None, CampaignContract);
    let campaign = CampaignContractClient::new(&env, &campaign_id);
    let rewards_id = env.register_contract(None, RewardsContract);
    let rewards = RewardsContractClient::new(&env, &rewards_id);

    let admin = Address::generate(&env);
    let users = seed_users(&env, 5);

    campaign.initialize(&admin);
    rewards.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();

    let (leaf, proof) = empty_proof(&env);

    // Register all 5 users in the campaign registry.
    for user in &users {
        assert!(campaign.register(user, &leaf, &proof, &None));
    }
    assert_eq!(campaign.get_participant_count(), 5);

    // Credit each user 100 points.
    for user in &users {
        rewards.credit(&admin, user, &100u64);
    }
    for user in &users {
        assert_eq!(rewards.balance(user), 100);
    }

    // Each user claims 40 points.
    for user in &users {
        rewards.claim(user, &40u64);
    }
    for user in &users {
        assert_eq!(rewards.balance(user), 60);
    }

    assert_eq!(rewards.total_claimed(), 200); // 5 users × 40
}

// ── Scenario B: Paused Rewards ────────────────────────────────────────────────

/// Pause the rewards contract → credit and claim return ContractPaused →
/// unpause → claim succeeds.
#[test]
fn scenario_b_paused_rewards() {
    let env = Env::default();
    let campaign_id = env.register_contract(None, CampaignContract);
    let campaign = CampaignContractClient::new(&env, &campaign_id);
    let rewards_id = env.register_contract(None, RewardsContract);
    let rewards = RewardsContractClient::new(&env, &rewards_id);

    let admin = Address::generate(&env);
    let users = seed_users(&env, 5);

    campaign.initialize(&admin);
    rewards.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();

    let (leaf, proof) = empty_proof(&env);
    for user in &users {
        campaign.register(user, &leaf, &proof, &None);
    }

    // Pre-credit before pausing.
    for user in &users {
        rewards.credit(&admin, user, &100u64);
    }

    // Pause rewards.
    rewards.set_paused(&admin, &true);
    assert!(rewards.is_paused());

    // Credit and claim are both blocked.
    for user in &users {
        assert_eq!(
            rewards.try_credit(&admin, user, &10u64),
            Err(Ok(RewardsError::ContractPaused))
        );
        assert_eq!(
            rewards.try_claim(user, &10u64),
            Err(Ok(RewardsError::ContractPaused))
        );
    }

    // Unpause and verify claims now succeed.
    rewards.set_paused(&admin, &false);
    assert!(!rewards.is_paused());
    for user in &users {
        rewards.claim(user, &50u64);
        assert_eq!(rewards.balance(user), 50);
    }
}

// ── Scenario C: Cap Reached ───────────────────────────────────────────────────

/// Set participant cap=2 → register 2 users → 3rd registration returns CapReached.
#[test]
fn scenario_c_cap_reached() {
    let env = Env::default();
    let campaign_id = env.register_contract(None, CampaignContract);
    let campaign = CampaignContractClient::new(&env, &campaign_id);
    let rewards_id = env.register_contract(None, RewardsContract);
    let rewards = RewardsContractClient::new(&env, &rewards_id);

    let admin = Address::generate(&env);
    let users = seed_users(&env, 5);

    campaign.initialize(&admin);
    rewards.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();

    // Set cap to 2.
    campaign.set_max_cap(&admin, &0u64, &2u64);
    assert_eq!(campaign.get_max_cap(), 2);

    let (leaf, proof) = empty_proof(&env);

    // First two registrations succeed.
    assert!(campaign.register(&users[0], &leaf, &proof, &None));
    assert!(campaign.register(&users[1], &leaf, &proof, &None));
    assert_eq!(campaign.get_participant_count(), 2);

    // Third registration hits the cap.
    assert_eq!(
        campaign.try_register(&users[2], &leaf, &proof, &None),
        Err(Ok(CampaignError::CapReached))
    );
    assert_eq!(campaign.get_participant_count(), 2);

    // Rewards still work for the two registered participants.
    for user in users.iter().take(2) {
        rewards.credit(&admin, user, &100u64);
    }
    assert_eq!(rewards.balance(&users[0]), 100);
    assert_eq!(rewards.balance(&users[1]), 100);
    assert_eq!(rewards.balance(&users[2]), 0);
}

// ── Scenario D: Merkle Allowlist ──────────────────────────────────────────────

/// Set a Merkle root → valid proof succeeds → invalid proof rejected (NotInAllowlist).
#[test]
fn scenario_d_merkle_allowlist() {
    let env = Env::default();
    let campaign_id = env.register_contract(None, CampaignContract);
    let campaign = CampaignContractClient::new(&env, &campaign_id);
    let rewards_id = env.register_contract(None, RewardsContract);
    let rewards = RewardsContractClient::new(&env, &rewards_id);

    let admin = Address::generate(&env);
    let users = seed_users(&env, 5);

    campaign.initialize(&admin);
    rewards.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();

    // Build a two-leaf tree: alice and bob are in the allowlist.
    let leaf_alice: BytesN<32> = BytesN::from_array(&env, &[1u8; 32]);
    let leaf_bob: BytesN<32> = BytesN::from_array(&env, &[2u8; 32]);
    let (root, proof_alice, proof_bob) =
        build_two_leaf_tree(&env, leaf_alice.clone(), leaf_bob.clone());

    campaign.set_merkle_root(&admin, &0u64, &root);

    // Allowlisted users (alice/bob represented by users[0]/users[1]) register successfully.
    assert!(campaign.register(&users[0], &leaf_alice, &proof_alice, &None));
    assert!(campaign.register(&users[1], &leaf_bob, &proof_bob, &None));
    assert_eq!(campaign.get_participant_count(), 2);

    // User with an invalid proof is rejected.
    let bad_leaf: BytesN<32> = BytesN::from_array(&env, &[9u8; 32]);
    let empty_pf: SdkVec<BytesN<32>> = SdkVec::new(&env);
    assert_eq!(
        campaign.try_register(&users[2], &bad_leaf, &empty_pf, &None),
        Err(Ok(CampaignError::NotInAllowlist))
    );

    // Rewards flow works for the two allowlisted users.
    for user in users.iter().take(2) {
        rewards.credit(&admin, user, &50u64);
        rewards.claim(user, &20u64);
        assert_eq!(rewards.balance(user), 30);
    }
}

// ── Scenario E: Admin Upgrade Flow ───────────────────────────────────────────

/// Deploy rewards and campaign → call migrate → verify schema_version remains 1.
/// Also verifies that only the admin can call migrate, and unsupported versions fail.
#[test]
fn scenario_e_admin_upgrade_flow() {
    let env = Env::default();
    let campaign_id = env.register_contract(None, CampaignContract);
    let campaign = CampaignContractClient::new(&env, &campaign_id);
    let rewards_id = env.register_contract(None, RewardsContract);
    let rewards = RewardsContractClient::new(&env, &rewards_id);

    let admin = Address::generate(&env);
    let non_admin = Address::generate(&env);

    campaign.initialize(&admin);
    rewards.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    assert_eq!(rewards.schema_version(), 1);
    assert_eq!(campaign.schema_version(), 1);

    env.mock_all_auths();

    // Migrate to version 1 (idempotent).
    assert_eq!(rewards.migrate(&admin, &1u32), 1);
    assert_eq!(rewards.schema_version(), 1);
    assert_eq!(campaign.migrate(&admin, &1u32), 1);
    assert_eq!(campaign.schema_version(), 1);

    // Unsupported version returns UnsupportedMigration.
    assert_eq!(
        rewards.try_migrate(&admin, &99u32),
        Err(Ok(RewardsError::UnsupportedMigration))
    );
    assert_eq!(
        campaign.try_migrate(&admin, &99u32),
        Err(Ok(CampaignError::UnsupportedMigration))
    );

    // Non-admin cannot migrate.
    assert_eq!(
        rewards.try_migrate(&non_admin, &1u32),
        Err(Ok(RewardsError::Unauthorized))
    );
}

// ── Multi-user bonus scenario ─────────────────────────────────────────────────

/// 5+ users with campaign multiplier, batch credit, vesting, snapshot, and rate limit.
#[test]
fn scenario_f_full_feature_integration() {
    let env = Env::default();
    let campaign_id = env.register_contract(None, CampaignContract);
    let campaign = CampaignContractClient::new(&env, &campaign_id);
    let rewards_id = env.register_contract(None, RewardsContract);
    let rewards = RewardsContractClient::new(&env, &rewards_id);

    let admin = Address::generate(&env);
    let users = seed_users(&env, 6);

    campaign.initialize(&admin);
    rewards.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();
    env.ledger().with_mut(|li| {
        li.sequence_number = 0;
    });

    let (leaf, proof) = empty_proof(&env);
    for user in &users {
        campaign.register(user, &leaf, &proof, &None);
    }
    assert_eq!(campaign.get_participant_count(), 6);

    // Set 1.5x multiplier for campaign 1 and credit all users.
    rewards.set_campaign_multiplier(&admin, &1u64, &15_000u32);
    for user in &users {
        rewards.credit_for_campaign(&admin, user, &1u64, &100u64);
    }
    for user in &users {
        assert_eq!(rewards.balance(user), 150);
    }

    // Batch-credit an additional 50 to all users.
    let recipients: SdkVec<(Address, u64)> = users.iter().fold(SdkVec::new(&env), |mut acc, u| {
        acc.push_back((u.clone(), 50u64));
        acc
    });
    rewards.batch_credit(&admin, &recipients);
    for user in &users {
        assert_eq!(rewards.balance(user), 200);
    }

    // Set up vesting for user[0]: 600 points over ledgers 0 → 100.
    rewards.credit_vested(&admin, &users[0], &600u64, &0u32, &100u32);

    // At ledger 50, user[0] can claim 300 vested points.
    env.ledger().with_mut(|li| li.sequence_number = 50);
    assert_eq!(rewards.vested_balance(&users[0]), 300);
    rewards.claim_vested(&users[0], &0u64, &300u64);
    assert_eq!(rewards.vested_balance(&users[0]), 0);

    // Take a snapshot at ledger 50.
    rewards.snapshot(&admin, &1u64);
    assert_eq!(rewards.get_snapshot(&1u64), Some(50u64));

    // All 6 users claim their regular balance.
    for user in &users {
        rewards.claim(user, &100u64);
    }
    for user in &users {
        assert_eq!(rewards.balance(user), 100);
    }

    // total_claimed tracks only regular claim() calls, not claim_vested().
    assert_eq!(rewards.total_claimed(), 600);
}
