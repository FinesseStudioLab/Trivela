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
