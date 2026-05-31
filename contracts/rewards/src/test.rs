//! Tests for the Trivela rewards contract.

extern crate std;

use super::*;
use soroban_sdk::testutils::{Address as _, Events as _, Ledger};
use soroban_sdk::{symbol_short, vec, Address, Env, IntoVal};
use soroban_sdk::{BytesN, Vec as SdkVec};
use std::vec::Vec as StdVec;
use trivela_campaign_contract::{CampaignContract, CampaignContractClient, Error as CampaignError};

fn seed_users(env: &Env, count: usize) -> StdVec<Address> {
    let mut users = StdVec::new();
    for _ in 0..count {
        users.push(Address::generate(env));
    }
    users
}

#[test]
fn test_balance_empty() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    assert_eq!(client.balance(&user), 0);
}

#[test]
fn test_credit_and_balance_emits_event() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();
    let new_balance = client.credit(&admin, &user, &100);

    assert_eq!(new_balance, 100);
    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                contract_id.clone(),
                vec![
                    &env,
                    CREDIT_EVENT.into_val(&env),
                    user.clone().into_val(&env)
                ],
                100u64.into_val(&env)
            )
        ]
    );
    assert_eq!(client.balance(&user), 100);
}

#[test]
fn test_claim_emits_event_and_updates_total_claimed() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();
    client.credit(&admin, &user, &100);
    let new_balance = client.claim(&user, &40);

    assert_eq!(new_balance, 60);
    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                contract_id.clone(),
                vec![&env, CLAIM_EVENT.into_val(&env), user.into_val(&env)],
                40u64.into_val(&env)
            )
        ]
    );
    assert_eq!(client.balance(&user), 60);
    assert_eq!(client.total_claimed(), 40);
}

#[test]
fn test_metadata() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let name = symbol_short!("MyReward");
    let symbol = symbol_short!("REW");

    client.initialize(&admin, &name, &symbol);

    let metadata = client.metadata();
    assert_eq!(metadata.0, name);
    assert_eq!(metadata.1, symbol);
}

#[test]
fn test_claim_more_than_balance_errors() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();
    let result = client.try_claim(&user, &1);
    assert!(result.is_err());
    assert_eq!(client.balance(&user), 0);
}

#[test]
fn test_batch_credit() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();
    let recipients = vec![&env, (user_a.clone(), 50u64), (user_b.clone(), 75u64)];
    client.batch_credit(&admin, &recipients);

    assert_eq!(client.balance(&user_a), 50);
    assert_eq!(client.balance(&user_b), 75);
}

#[test]
fn test_credit_overflow_errors() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();
    client.credit(&admin, &user, &u64::MAX);

    let result = client.try_credit(&admin, &user, &1);
    assert!(result.is_err());
    assert_eq!(client.balance(&user), u64::MAX);
}

#[test]
fn test_admin_settings_emit_events() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();
    client.set_max_credit_per_call(&admin, &500);
    assert_eq!(client.max_credit_per_call(), 500);
    client.set_campaign_multiplier(&admin, &42u64, &12_500u32);

    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                contract_id.clone(),
                vec![
                    &env,
                    CAMPAIGN_MULTIPLIER_EVENT.into_val(&env),
                    42u64.into_val(&env)
                ],
                12_500u32.into_val(&env)
            )
        ]
    );
}

#[test]
fn test_batch_credit_is_atomic_on_overflow() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();
    client.credit(&admin, &user_a, &10);
    client.credit(&admin, &user_b, &u64::MAX);

    let recipients = vec![&env, (user_a.clone(), 15u64), (user_b.clone(), 1u64)];
    let result = client.try_batch_credit(&admin, &recipients);

    assert!(result.is_err());
    assert_eq!(client.balance(&user_a), 10);
    assert_eq!(client.balance(&user_b), u64::MAX);
}

#[test]
fn test_uninitialized_access_returns_defaults() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    assert_eq!(
        client.metadata(),
        (symbol_short!("Trivela"), symbol_short!("TVL"))
    );
    assert_eq!(client.balance(&user), 0);
    assert_eq!(client.total_claimed(), 0);
}

#[test]
fn test_credit_respects_max_per_call() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();
    client.set_max_credit_per_call(&admin, &100);

    let result = client.try_credit(&admin, &user, &101);
    assert_eq!(result, Err(Ok(Error::CreditLimitExceeded)));
    assert_eq!(client.balance(&user), 0);
}

#[test]
fn test_paused_blocks_credit_and_claim_with_clear_error() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();
    client.set_paused(&admin, &true);

    assert_eq!(
        client.try_credit(&admin, &user, &10),
        Err(Ok(Error::ContractPaused))
    );
    assert_eq!(client.try_claim(&user, &1), Err(Ok(Error::ContractPaused)));
}

// Symbol mirrors `REGISTER_EVENT` in the campaign contract; redeclared here
// because that constant is module-private.
const CAMPAIGN_REGISTER_EVENT: soroban_sdk::Symbol = symbol_short!("register");

#[test]
fn test_campaign_rewards_integration_flow() {
    let env = Env::default();

    let campaign_id = env.register_contract(None, CampaignContract);
    let campaign = CampaignContractClient::new(&env, &campaign_id);

    let rewards_id = env.register_contract(None, RewardsContract);
    let rewards = RewardsContractClient::new(&env, &rewards_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    campaign.initialize(&admin);
    rewards.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();

    // 1) Register the user in the campaign contract and assert the register
    //    event was emitted with the expected topics + data. The event log
    //    reflects only the most recent invocation, so we check it before
    //    any further reads.
    let dummy_leaf: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);
    let empty_proof: SdkVec<BytesN<32>> = SdkVec::new(&env);
    assert!(campaign.register(&user, &dummy_leaf, &empty_proof));
    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                campaign_id.clone(),
                vec![
                    &env,
                    CAMPAIGN_REGISTER_EVENT.into_val(&env),
                    user.clone().into_val(&env)
                ],
                ().into_val(&env)
            )
        ]
    );
    assert!(campaign.is_participant(&user));
    assert_eq!(campaign.get_participant_count(), 1);

    // 2) Credit points in the rewards contract and assert the credit event.
    rewards.credit(&admin, &user, &120);
    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                rewards_id.clone(),
                vec![
                    &env,
                    CREDIT_EVENT.into_val(&env),
                    user.clone().into_val(&env)
                ],
                120u64.into_val(&env)
            )
        ]
    );
    assert_eq!(rewards.balance(&user), 120);

    // 3) Claim a portion and assert the claim event + final balances.
    rewards.claim(&user, &70);
    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                rewards_id,
                vec![
                    &env,
                    CLAIM_EVENT.into_val(&env),
                    user.clone().into_val(&env)
                ],
                70u64.into_val(&env)
            )
        ]
    );
    assert_eq!(rewards.balance(&user), 50);
    assert_eq!(rewards.total_claimed(), 70);
}

/// Multi-user end-to-end flow: two participants register, both are credited
/// (one with a campaign multiplier), and both claim part of their balance.
/// Checks final per-user balances, the global `total_claimed`, and that the
/// credit events for both users land in the same invocation's event log
/// when batched.
#[test]
fn test_campaign_rewards_integration_multi_user() {
    let env = Env::default();

    let campaign_id = env.register_contract(None, CampaignContract);
    let campaign = CampaignContractClient::new(&env, &campaign_id);
    let rewards_id = env.register_contract(None, RewardsContract);
    let rewards = RewardsContractClient::new(&env, &rewards_id);

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    campaign.initialize(&admin);
    rewards.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();

    let dummy_leaf: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);
    let empty_proof: SdkVec<BytesN<32>> = SdkVec::new(&env);

    // Both users register.
    assert!(campaign.register(&alice, &dummy_leaf, &empty_proof));
    assert!(campaign.register(&bob, &dummy_leaf, &empty_proof));
    assert_eq!(campaign.get_participant_count(), 2);

    // Configure a 1.5x multiplier for campaign 7 and credit Alice through it.
    let campaign_seven: u64 = 7;
    rewards.set_campaign_multiplier(&admin, &campaign_seven, &15_000u32);
    let alice_balance = rewards.credit_for_campaign(&admin, &alice, &campaign_seven, &200);
    assert_eq!(alice_balance, 300); // 200 * 1.5

    // Bob is credited via a batch alongside Alice — verify the batch emits
    // a credit event for each recipient in order.
    let recipients = vec![&env, (alice.clone(), 50u64), (bob.clone(), 80u64)];
    rewards.batch_credit(&admin, &recipients);
    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                rewards_id.clone(),
                vec![
                    &env,
                    CREDIT_EVENT.into_val(&env),
                    alice.clone().into_val(&env)
                ],
                50u64.into_val(&env)
            ),
            (
                rewards_id.clone(),
                vec![
                    &env,
                    CREDIT_EVENT.into_val(&env),
                    bob.clone().into_val(&env)
                ],
                80u64.into_val(&env)
            )
        ]
    );

    assert_eq!(rewards.balance(&alice), 350);
    assert_eq!(rewards.balance(&bob), 80);

    // Both users claim, total_claimed accumulates correctly.
    rewards.claim(&alice, &100);
    rewards.claim(&bob, &30);
    assert_eq!(rewards.balance(&alice), 250);
    assert_eq!(rewards.balance(&bob), 50);
    assert_eq!(rewards.total_claimed(), 130);
}

/// Verifies the campaign time-window gates the on-chain registration step
/// of the rewards flow: a user cannot enter the campaign (and therefore
/// cannot legitimately participate in rewards) outside the window, but
/// once registered their reward credit/claim is independent of the window.
///
/// This documents the boundary between the two contracts: the campaign
/// owns participation (and its window), while rewards owns balances.
#[test]
fn test_campaign_window_gates_rewards_flow() {
    let env = Env::default();

    let campaign_id = env.register_contract(None, CampaignContract);
    let campaign = CampaignContractClient::new(&env, &campaign_id);
    let rewards_id = env.register_contract(None, RewardsContract);
    let rewards = RewardsContractClient::new(&env, &rewards_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    campaign.initialize(&admin);
    rewards.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();

    // Window opens at t=1_000 and closes at t=2_000.
    campaign.set_window(&admin, &0, &1_000, &2_000);
    assert_eq!(campaign.get_window(), (1_000, 2_000));

    let dummy_leaf: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);
    let empty_proof: SdkVec<BytesN<32>> = SdkVec::new(&env);

    // Before the window, registration is rejected with the exact error
    // and no rewards credit can be tied to a real participant yet.
    env.ledger().with_mut(|li| li.timestamp = 500);
    assert!(!campaign.is_within_window());
    assert_eq!(
        campaign.try_register(&user, &dummy_leaf, &empty_proof),
        Err(Ok(CampaignError::OutsideTimeWindow))
    );
    assert!(!campaign.is_participant(&user));

    // Inside the window, registration succeeds and the rewards flow runs.
    env.ledger().with_mut(|li| li.timestamp = 1_500);
    assert!(campaign.is_within_window());
    assert!(campaign.register(&user, &dummy_leaf, &empty_proof));
    rewards.credit(&admin, &user, &200);
    rewards.claim(&user, &50);

    // After the window closes, the existing participant keeps their
    // rewards balance — the window gates *registration*, not balances.
    env.ledger().with_mut(|li| li.timestamp = 5_000);
    assert!(!campaign.is_within_window());
    assert!(campaign.is_participant(&user));
    assert_eq!(rewards.balance(&user), 150);
    assert_eq!(rewards.total_claimed(), 50);

    // A second user trying to register after the window closes is still
    // rejected, even though the campaign is otherwise active.
    let latecomer = Address::generate(&env);
    assert_eq!(
        campaign.try_register(&latecomer, &dummy_leaf, &empty_proof),
        Err(Ok(CampaignError::OutsideTimeWindow))
    );
    assert_eq!(campaign.get_participant_count(), 1);
}

#[test]
fn test_schema_version_and_migrate_entrypoint() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let other = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
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
fn test_campaign_multiplier_applies_to_credit() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();
    client.set_campaign_multiplier(&admin, &42u64, &12_500u32); // 1.25x
    let balance = client.credit_for_campaign(&admin, &user, &42u64, &100u64);
    assert_eq!(balance, 125);
    assert_eq!(client.balance(&user), 125);
}

#[test]
fn test_campaign_multiplier_rounding_floor() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();
    client.set_campaign_multiplier(&admin, &7u64, &9_999u32);
    let balance = client.credit_for_campaign(&admin, &user, &7u64, &3u64);
    assert_eq!(balance, 2);
}

#[test]
fn test_randomized_points_accounting_invariants() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let users = seed_users(&env, 3);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    env.mock_all_auths();

    let mut rng = 0xC0FFEE_u64;
    let mut credited_total = 0u64;
    let mut expected_balances = [0u64; 3];

    for _ in 0..100 {
        rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1);
        let op = (rng % 3) as u8;
        let index = (rng as usize) % users.len();

        match op {
            0 => {
                let amount = (rng % 25) + 1;
                client.credit(&admin, &users[index], &amount);
                expected_balances[index] = expected_balances[index].saturating_add(amount);
                credited_total = credited_total.saturating_add(amount);
            }
            1 => {
                let balance = expected_balances[index];
                if balance > 0 {
                    let amount = (rng % balance) + 1;
                    client.claim(&users[index], &amount);
                    expected_balances[index] -= amount;
                }
            }
            _ => {
                let target = (index + 1) % users.len();
                let balance = expected_balances[index];
                if balance > 0 {
                    let amount = (rng % balance) + 1;
                    client.admin_transfer(&admin, &users[index], &users[target], &amount);
                    expected_balances[index] -= amount;
                    expected_balances[target] = expected_balances[target].saturating_add(amount);
                }
            }
        }

        let observed_balance_total: u64 = users.iter().map(|user| client.balance(user)).sum();
        let expected_balance_total: u64 = expected_balances.iter().copied().sum();

        assert_eq!(observed_balance_total, expected_balance_total);
        assert_eq!(
            observed_balance_total + client.total_claimed(),
            credited_total
        );
    }
}

#[test]
fn test_tiered_rewards_sorting_and_credit() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    env.mock_all_auths();

    // Tiers: [(10, 100), (0, 10), (20, 50)]
    // Sorted should be: [(10, 100), (20, 50), (0, 10)]
    let mut input_tiers = Vec::new(&env);
    input_tiers.push_back((10, 100));
    input_tiers.push_back((0, 10));
    input_tiers.push_back((20, 50));

    client.set_tiers(&admin, &1u64, &input_tiers);

    // Verify lookup for various ranks
    assert_eq!(client.get_tier_for_rank(&5, &1u64), 100);
    assert_eq!(client.get_tier_for_rank(&10, &1u64), 100);
    assert_eq!(client.get_tier_for_rank(&11, &1u64), 50);
    assert_eq!(client.get_tier_for_rank(&20, &1u64), 50);
    assert_eq!(client.get_tier_for_rank(&21, &1u64), 10);
    assert_eq!(client.get_tier_for_rank(&100, &1u64), 10);

    // Credit user by rank 5 (gets 100 points)
    let balance = client.credit_by_rank(&admin, &user, &5u64, &1u64);
    assert_eq!(balance, 100);
    assert_eq!(client.balance(&user), 100);

    // Verify events
    let set_tiers_event = Symbol::new(&env, "set_tiers");
    let tier_credit_event = Symbol::new(&env, "tier_credit");
    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                contract_id.clone(),
                vec![&env, set_tiers_event.into_val(&env), 1u64.into_val(&env)],
                ().into_val(&env)
            ),
            (
                contract_id.clone(),
                vec![
                    &env,
                    symbol_short!("credit").into_val(&env),
                    user.clone().into_val(&env)
                ],
                100u64.into_val(&env)
            ),
            (
                contract_id.clone(),
                vec![
                    &env,
                    tier_credit_event.into_val(&env),
                    user.clone().into_val(&env)
                ],
                (5u64, 100u64).into_val(&env)
            )
        ]
    );

    // Credit user by rank 25 (gets 10 points)
    let balance = client.credit_by_rank(&admin, &user, &25u64, &1u64);
    assert_eq!(balance, 110);
    assert_eq!(client.balance(&user), 110);

    // Clear tiers
    client.clear_tiers(&admin, &1u64);
    assert_eq!(client.get_tier_for_rank(&5, &1u64), 0);
}

// ── Rate Limiting Tests (issue #324) ─────────────────────────────────────────

#[test]
fn test_rate_limit_enforced() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    env.mock_all_auths();

    // Allow 2 calls per window of 10 ledgers.
    client.set_credit_rate_limit(&admin, &2u32, &10u32);
    assert_eq!(client.get_credit_rate_limit(), (2u32, 10u32));

    // First two calls succeed.
    client.credit(&admin, &user, &10);
    client.credit(&admin, &user, &10);
    assert_eq!(client.credit_call_count(&admin), 2);

    // Third call in the same window is rejected.
    let result = client.try_credit(&admin, &user, &10);
    assert_eq!(result, Err(Ok(Error::RateLimitExceeded)));
    assert_eq!(client.balance(&user), 20);
}

#[test]
fn test_rate_limit_window_rollover_resets_count() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    env.mock_all_auths();

    // Window of 10 ledgers, max 1 call per window.
    client.set_credit_rate_limit(&admin, &1u32, &10u32);

    // At ledger 5 (window 0): one call succeeds, second fails.
    env.ledger().with_mut(|li| li.sequence_number = 5);
    client.credit(&admin, &user, &10);
    assert_eq!(
        client.try_credit(&admin, &user, &10),
        Err(Ok(Error::RateLimitExceeded))
    );

    // At ledger 15 (window 1): count resets, one call succeeds again.
    env.ledger().with_mut(|li| li.sequence_number = 15);
    assert_eq!(client.credit_call_count(&admin), 0);
    client.credit(&admin, &user, &10);
    assert_eq!(client.credit_call_count(&admin), 1);
    assert_eq!(client.balance(&user), 20);
}

#[test]
fn test_rate_limit_batch_credit_counts_as_n_calls() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);
    let user_c = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    env.mock_all_auths();

    // Max 2 calls per window.
    client.set_credit_rate_limit(&admin, &2u32, &10u32);

    // Batch of 2 recipients uses up both slots.
    let recipients = vec![&env, (user_a.clone(), 10u64), (user_b.clone(), 10u64)];
    client.batch_credit(&admin, &recipients);
    assert_eq!(client.credit_call_count(&admin), 2);

    // A batch of 1 more should fail.
    let recipients2 = vec![&env, (user_c.clone(), 10u64)];
    let result = client.try_batch_credit(&admin, &recipients2);
    assert_eq!(result, Err(Ok(Error::RateLimitExceeded)));
}

#[test]
fn test_rate_limit_zero_disables_limiting() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    env.mock_all_auths();

    // 0 means unlimited.
    client.set_credit_rate_limit(&admin, &0u32, &10u32);

    for _ in 0..20 {
        client.credit(&admin, &user, &1);
    }
    assert_eq!(client.balance(&user), 20);
}

// ── Snapshot Tests (issue #325) ───────────────────────────────────────────────

#[test]
fn test_snapshot_creation_and_retrieval() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    env.mock_all_auths();

    env.ledger().with_mut(|li| li.sequence_number = 42);
    client.snapshot(&admin, &1u64);

    assert_eq!(client.get_snapshot(&1u64), Some(42u64));
    assert_eq!(client.get_snapshot(&99u64), None);
}

#[test]
fn test_snapshot_list_snapshots() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    env.mock_all_auths();

    env.ledger().with_mut(|li| li.sequence_number = 10);
    client.snapshot(&admin, &1u64);
    env.ledger().with_mut(|li| li.sequence_number = 20);
    client.snapshot(&admin, &2u64);

    let list = client.list_snapshots();
    assert_eq!(list.len(), 2);
    assert_eq!(list.get(0).unwrap(), (1u64, 10u64));
    assert_eq!(list.get(1).unwrap(), (2u64, 20u64));
}

#[test]
fn test_snapshot_emits_event() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    env.mock_all_auths();

    env.ledger().with_mut(|li| li.sequence_number = 77);
    client.snapshot(&admin, &5u64);

    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                contract_id.clone(),
                vec![&env, SNAPSHOT_EVENT.into_val(&env), 5u64.into_val(&env)],
                77u64.into_val(&env)
            )
        ]
    );
}

#[test]
fn test_snapshot_empty_list() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));

    let list = client.list_snapshots();
    assert_eq!(list.len(), 0);
}

// ── Vesting Tests (issue #326) ────────────────────────────────────────────────

#[test]
fn test_vesting_claim_before_start_returns_zero() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    env.mock_all_auths();

    // Vesting starts at ledger 100, ends at 200.
    env.ledger().with_mut(|li| li.sequence_number = 50);
    let vest_id = client.credit_vested(&admin, &user, &1000u64, &100u32, &200u32);
    assert_eq!(vest_id, 0u64);

    // Before start, nothing is unlocked.
    assert_eq!(client.vested_balance(&user), 0);
    let result = client.try_claim_vested(&user, &vest_id, &1);
    assert_eq!(result, Err(Ok(Error::InsufficientBalance)));
}

#[test]
fn test_vesting_claim_at_halfway_unlocks_half() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    env.mock_all_auths();

    // Vesting: 1000 points, ledgers 0 → 100.
    client.credit_vested(&admin, &user, &1000u64, &0u32, &100u32);

    // At ledger 50, exactly 500 should be unlocked.
    env.ledger().with_mut(|li| li.sequence_number = 50);
    assert_eq!(client.vested_balance(&user), 500);
    assert_eq!(client.total_vested(&user), 1000);

    let remaining = client.claim_vested(&user, &0u64, &500u64);
    assert_eq!(remaining, 0);
    assert_eq!(client.vested_balance(&user), 0);
}

#[test]
fn test_vesting_claim_at_end_unlocks_all() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    env.mock_all_auths();

    client.credit_vested(&admin, &user, &500u64, &0u32, &100u32);

    env.ledger().with_mut(|li| li.sequence_number = 100);
    assert_eq!(client.vested_balance(&user), 500);

    let remaining = client.claim_vested(&user, &0u64, &500u64);
    assert_eq!(remaining, 0);
    assert_eq!(client.vested_balance(&user), 0);
}

#[test]
fn test_vesting_claim_more_than_unlocked_errors() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    env.mock_all_auths();

    // 1000 points, vesting 0 → 100; at ledger 50, only 500 is unlocked.
    client.credit_vested(&admin, &user, &1000u64, &0u32, &100u32);
    env.ledger().with_mut(|li| li.sequence_number = 50);

    let result = client.try_claim_vested(&user, &0u64, &501u64);
    assert_eq!(result, Err(Ok(Error::InsufficientBalance)));
}

#[test]
fn test_vesting_not_found_errors() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    env.mock_all_auths();

    let result = client.try_claim_vested(&user, &99u64, &10u64);
    assert_eq!(result, Err(Ok(Error::VestingNotFound)));
}

#[test]
fn test_vesting_multiple_schedules() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    env.mock_all_auths();

    // Two vesting schedules.
    client.credit_vested(&admin, &user, &200u64, &0u32, &100u32);
    client.credit_vested(&admin, &user, &300u64, &0u32, &100u32);

    assert_eq!(client.total_vested(&user), 500);

    env.ledger().with_mut(|li| li.sequence_number = 100);
    // Both fully vested.
    assert_eq!(client.vested_balance(&user), 500);

    client.claim_vested(&user, &0u64, &200u64);
    client.claim_vested(&user, &1u64, &300u64);
    assert_eq!(client.vested_balance(&user), 0);
}

#[test]
fn test_vesting_emits_events() {
    let env = Env::default();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    env.mock_all_auths();

    client.credit_vested(&admin, &user, &100u64, &0u32, &50u32);
    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                contract_id.clone(),
                vec![
                    &env,
                    VESTED_CREDIT_EVENT.into_val(&env),
                    user.clone().into_val(&env)
                ],
                (0u64, 100u64).into_val(&env)
            )
        ]
    );

    env.ledger().with_mut(|li| li.sequence_number = 50);
    client.claim_vested(&user, &0u64, &100u64);
    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                contract_id.clone(),
                vec![
                    &env,
                    VESTED_CLAIM_EVENT.into_val(&env),
                    user.clone().into_val(&env)
                ],
                (0u64, 100u64).into_val(&env)
            )
        ]
    );
}

// ── 2-step admin transfer (issue #281) ───────────────────────────────────────

fn setup_admin_rotation() -> (Env, RewardsContractClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    (env, client, admin, new_admin)
}

#[test]
fn test_propose_and_accept_admin_happy_path() {
    let (_env, client, admin, new_admin) = setup_admin_rotation();
    assert_eq!(client.admin(), admin);
    assert_eq!(client.pending_admin(), None);

    client.propose_admin(&admin, &new_admin);
    assert_eq!(client.pending_admin(), Some(new_admin.clone()));
    // Admin doesn't change until accepted.
    assert_eq!(client.admin(), admin);

    client.accept_admin(&new_admin);
    assert_eq!(client.admin(), new_admin);
    assert_eq!(client.pending_admin(), None);
}

#[test]
fn test_propose_admin_without_accept_keeps_old_admin() {
    let (_env, client, admin, new_admin) = setup_admin_rotation();
    client.propose_admin(&admin, &new_admin);
    // pending_admin set but admin slot unchanged.
    assert_eq!(client.admin(), admin);
    assert_eq!(client.pending_admin(), Some(new_admin));
}

#[test]
fn test_non_admin_cannot_propose() {
    let (env, client, _admin, new_admin) = setup_admin_rotation();
    let imposter = Address::generate(&env);
    let result = client.try_propose_admin(&imposter, &new_admin);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

#[test]
fn test_only_pending_can_accept() {
    let (env, client, admin, new_admin) = setup_admin_rotation();
    let third_party = Address::generate(&env);
    client.propose_admin(&admin, &new_admin);
    let result = client.try_accept_admin(&third_party);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
    // Admin slot still untouched.
    assert_eq!(client.admin(), admin);
}

#[test]
fn test_accept_without_proposal_fails() {
    let (_env, client, _admin, new_admin) = setup_admin_rotation();
    let result = client.try_accept_admin(&new_admin);
    assert_eq!(result, Err(Ok(Error::NoPendingAdmin)));
}

#[test]
fn test_cancel_admin_transfer_clears_pending() {
    let (_env, client, admin, new_admin) = setup_admin_rotation();
    client.propose_admin(&admin, &new_admin);
    client.cancel_admin_transfer(&admin);
    assert_eq!(client.pending_admin(), None);
    // Subsequent accept fails because nothing pending.
    let result = client.try_accept_admin(&new_admin);
    assert_eq!(result, Err(Ok(Error::NoPendingAdmin)));
}

#[test]
fn test_propose_overwrites_previous_proposal() {
    let (env, client, admin, new_admin) = setup_admin_rotation();
    let later_admin = Address::generate(&env);
    client.propose_admin(&admin, &new_admin);
    client.propose_admin(&admin, &later_admin);
    assert_eq!(client.pending_admin(), Some(later_admin.clone()));
    // Original proposed admin can no longer accept.
    let result = client.try_accept_admin(&new_admin);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
    // The later proposal still works.
    client.accept_admin(&later_admin);
    assert_eq!(client.admin(), later_admin);
}
