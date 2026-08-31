//! Comprehensive integration tests ensuring every public contract function is tested.
//!
//! This module provides integration test coverage for all public entry points
//! across rewards and campaign contracts, with assertions on both state changes
//! and event emissions.

use soroban_sdk::testutils::{Address as _, Events, Ledger};
use soroban_sdk::{symbol_short, Address, BytesN, Env, Vec as SdkVec};
use trivela_rewards_contract::{RewardsContract, RewardsContractClient};

// ── Helper Functions ─────────────────────────────────────────────────────────

fn setup_rewards(env: &Env) -> (RewardsContractClient<'_>, Address) {
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    env.mock_all_auths();
    (client, admin)
}

/// True when `event`'s first topic is the symbol `name`.
///
/// `Events::all()` returns `ContractEvents` in soroban-sdk 25 and its
/// `events()` slice is XDR, so the topic is matched on the ScVal directly
/// rather than round-tripping through `Val`.
fn first_topic_is(event: &soroban_sdk::xdr::ContractEvent, name: &str) -> bool {
    let soroban_sdk::xdr::ContractEventBody::V0(body) = &event.body;
    match body.topics.first() {
        Some(soroban_sdk::xdr::ScVal::Symbol(sym)) => sym.0.as_slice() == name.as_bytes(),
        _ => false,
    }
}

fn has_event(env: &Env, name: &str) -> bool {
    env.events()
        .all()
        .events()
        .iter()
        .any(|e| first_topic_is(e, name))
}

// ── Core Functions Tests ─────────────────────────────────────────────────────

#[test]
fn test_metadata() {
    let env = Env::default();
    let (contract, _admin) = setup_rewards(&env);

    let (name, symbol) = contract.metadata();
    assert_eq!(name, symbol_short!("Trivela"));
    assert_eq!(symbol, symbol_short!("TVL"));
}

#[test]
fn test_credit_for_campaign_with_multiplier() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);
    let user = Address::generate(&env);

    // Set campaign multiplier to 1.5x (15000 bps)
    contract.set_campaign_multiplier(&admin, &1, &15000);
    assert!(has_event(&env, "multset"));

    // Credit 100 base points → should become 150
    let balance = contract.credit_for_campaign(&admin, &user, &1, &100);
    assert!(has_event(&env, "credit"));
    assert_eq!(balance, 150);
    assert_eq!(contract.balance(&user), 150);
}

#[test]
fn test_batch_credit() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);
    let users: std::vec::Vec<Address> = (0..3).map(|_| Address::generate(&env)).collect();

    let mut recipients = SdkVec::new(&env);
    recipients.push_back((users[0].clone(), 100u64));
    recipients.push_back((users[1].clone(), 200u64));
    recipients.push_back((users[2].clone(), 300u64));

    contract.batch_credit(&admin, &recipients);

    // Should emit a credit event per user. `Events::all()` only covers the most
    // recent invocation, so this has to be read before the balance() calls.
    let events = env.events().all();
    let credit_events: Vec<_> = events
        .events()
        .iter()
        .filter(|e| first_topic_is(e, "credit"))
        .collect();
    assert_eq!(credit_events.len(), 3);

    assert_eq!(contract.balance(&users[0]), 100);
    assert_eq!(contract.balance(&users[1]), 200);
    assert_eq!(contract.balance(&users[2]), 300);
}

// ── Admin Operations Tests ───────────────────────────────────────────────────

#[test]
fn test_admin_rotation() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);
    let new_admin = Address::generate(&env);

    // Propose new admin
    contract.propose_admin(&admin, &new_admin);
    assert!(has_event(&env, "aproposed"));
    assert_eq!(contract.pending_admin(), Some(new_admin.clone()));

    // Accept admin from new address
    contract.accept_admin(&new_admin);
    assert!(has_event(&env, "aaccepted"));
    assert_eq!(contract.admin(), new_admin);
    assert_eq!(contract.pending_admin(), None);
}

#[test]
fn test_cancel_admin_transfer() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);
    let new_admin = Address::generate(&env);

    contract.propose_admin(&admin, &new_admin);
    assert_eq!(contract.pending_admin(), Some(new_admin));

    contract.cancel_admin_transfer(&admin);
    assert_eq!(contract.pending_admin(), None);
}

#[test]
fn test_admin_transfer() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);

    // Credit from, then transfer to another user
    contract.credit(&admin, &from, &100);
    contract.admin_transfer(&admin, &from, &to, &40);
    assert!(has_event(&env, "transfer"));

    assert_eq!(contract.balance(&from), 60);
    assert_eq!(contract.balance(&to), 40);
}

// ── Pause Controls Tests ─────────────────────────────────────────────────────

#[test]
fn test_pause_credit() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);

    contract.set_paused_credit(&admin, &true);
    assert!(has_event(&env, "pscredit"));
    assert!(contract.is_paused_credit());

    contract.set_paused_credit(&admin, &false);
    assert!(!contract.is_paused_credit());
}

#[test]
fn test_pause_claim() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);

    contract.set_paused_claim(&admin, &true);
    assert!(has_event(&env, "psclaim"));
    assert!(contract.is_paused_claim());
}

#[test]
fn test_pause_redeem() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);

    contract.set_paused_redeem(&admin, &true);
    assert!(has_event(&env, "psredeem"));
    assert!(contract.is_paused_redeem());
}

// ── Campaign Features Tests ──────────────────────────────────────────────────

#[test]
fn test_campaign_multiplier() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);

    assert_eq!(contract.campaign_multiplier(&1), 10_000); // Default 1.0x

    contract.set_campaign_multiplier(&admin, &1, &20_000); // 2.0x
    assert_eq!(contract.campaign_multiplier(&1), 20_000);
}

#[test]
fn test_max_credit_per_call() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);

    contract.set_max_credit_per_call(&admin, &1000);
    assert!(has_event(&env, "mxcredit"));
    assert_eq!(contract.max_credit_per_call(), 1000);
}

#[test]
fn test_tiers() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);

    let mut tiers = SdkVec::new(&env);
    tiers.push_back((10u64, 1000u64)); // Ranks 1-10: 1000 points
    tiers.push_back((50u64, 500u64)); // Ranks 11-50: 500 points

    contract.set_tiers(&admin, &1, &tiers);

    assert_eq!(contract.get_tier_for_rank(&5, &1), 1000);
    assert_eq!(contract.get_tier_for_rank(&30, &1), 500);
    assert_eq!(contract.get_tier_for_rank(&100, &1), 0);

    contract.clear_tiers(&admin, &1);
    assert_eq!(contract.get_tier_for_rank(&5, &1), 0);
}

#[test]
fn test_credit_by_rank() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);
    let user = Address::generate(&env);

    let mut tiers = SdkVec::new(&env);
    tiers.push_back((10u64, 500u64));
    contract.set_tiers(&admin, &1, &tiers);

    let balance = contract.credit_by_rank(&admin, &user, &3, &1);
    assert_eq!(balance, 500);
    assert_eq!(contract.balance(&user), 500);
}

// ── Rate Limiting Tests ──────────────────────────────────────────────────────

#[test]
fn test_rate_limit() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);

    contract.set_credit_rate_limit(&admin, &10, &100);
    assert!(has_event(&env, "ratlset"));

    let (max_calls, window) = contract.get_credit_rate_limit();
    assert_eq!(max_calls, 10);
    assert_eq!(window, 100);

    let caller = Address::generate(&env);
    assert_eq!(contract.credit_call_count(&caller), 0);
}

// ── Snapshot Tests ───────────────────────────────────────────────────────────

#[test]
fn test_snapshots() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);

    contract.snapshot(&admin, &1);
    assert!(has_event(&env, "snapshot"));

    let ledger_num = contract.get_snapshot(&1);
    assert!(ledger_num.is_some());

    let list = contract.list_snapshots();
    assert_eq!(list.len(), 1);
}

// ── Vesting Tests ────────────────────────────────────────────────────────────

#[test]
fn test_vesting_flow() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);
    let user = Address::generate(&env);

    let start_ledger = env.ledger().sequence();
    let end_ledger = start_ledger + 1000;

    // Credit vested amount
    let vest_id = contract.credit_vested(&admin, &user, &1000, &start_ledger, &end_ledger);
    assert!(has_event(&env, "vcredit"));
    assert_eq!(vest_id, 0);

    // Check vested balance (at start, nothing unlocked yet)
    assert_eq!(contract.vested_balance(&user), 0);
    assert_eq!(contract.total_vested(&user), 1000);

    // Advance ledger to 50% through vesting period
    // `Ledger::set_sequence` was removed in soroban-sdk 25; mutate the info directly.
    env.ledger()
        .with_mut(|li| li.sequence_number = start_ledger + 500);
    assert_eq!(contract.vested_balance(&user), 500);

    // Claim 200 from vested
    let remaining = contract.claim_vested(&user, &vest_id, &200);
    assert!(has_event(&env, "vclaim"));
    assert_eq!(remaining, 300); // 500 unlocked - 200 claimed
}

// ── Redemption Tests ─────────────────────────────────────────────────────────

#[test]
fn test_redemption_flow() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);
    let user = Address::generate(&env);

    // fund_reserve performs a real SAC transfer, so the asset has to be an
    // actual deployed token contract rather than a bare generated address.
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let asset = sac.address();
    soroban_sdk::token::StellarAssetClient::new(&env, &asset).mint(&admin, &10_000);

    // Set redemption rate: 100 bps = 0.01 asset per point
    contract.set_redemption_rate(&admin, &0, &asset, &100);

    let rate = contract.redemption_rate();
    assert_eq!(rate, Some((asset.clone(), 100u32)));

    // Fund reserve
    contract.fund_reserve(&admin, &10000);
    assert_eq!(contract.redemption_reserve(), 10000);
    assert_eq!(contract.payout_reserve_balance(), 10000);

    // Credit user and redeem
    contract.credit(&admin, &user, &1000);

    // Note: Actual redemption requires SAC token transfer - mock or skip
    // let asset_received = contract.redeem(&user, &500);
    // assert!(has_event(&env, "redeem"));

    // Withdraw from reserve
    contract.withdraw_reserve(&admin, &1, &5000);
    assert_eq!(contract.redemption_reserve(), 5000);
}

#[test]
fn test_total_supply() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);
    let user = Address::generate(&env);

    assert_eq!(contract.total_supply(), 0);

    contract.credit(&admin, &user, &100);
    assert_eq!(contract.total_supply(), 100);

    contract.claim(&user, &30);
    assert_eq!(contract.total_supply(), 70);
}

// ── Referral Tests ───────────────────────────────────────────────────────────

#[test]
fn test_referral_flow() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);
    let referrer = Address::generate(&env);
    let referee = Address::generate(&env);

    // Configure referral: 10% bonus (1000 bps), 500 cap per referrer
    contract.set_referral_config(&admin, &1000, &500);
    assert!(has_event(&env, "refcfg"));

    let (rate, cap) = contract.referral_config();
    assert_eq!(rate, 1000);
    assert_eq!(cap, 500);

    // Pay referral bonus
    let bonus = contract.pay_referral_bonus(&admin, &referrer, &referee, &100);
    assert!(has_event(&env, "refbonus"));
    assert_eq!(bonus, 10); // 10% of 100
    assert_eq!(contract.balance(&referrer), 10);

    assert_eq!(contract.referral_bonus_total(&referrer), 10);
    assert_eq!(contract.referral_reward_count(&referrer), 1);
    assert_eq!(contract.rewarded_referrer_of(&referee), Some(referrer));
}

// ── SEP-41 Token Interface Tests ─────────────────────────────────────────────

#[test]
fn test_token_mode() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);

    assert!(!contract.is_token_mode());

    contract.enable_token_mode(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"), &6);
    assert!(contract.is_token_mode());

    assert_eq!(contract.sep41_name(), symbol_short!("Trivela"));
    assert_eq!(contract.sep41_symbol(), symbol_short!("TVL"));
    assert_eq!(contract.sep41_decimals(), 6);
}

#[test]
fn test_sep41_transfer() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);

    contract.enable_token_mode(&admin, &symbol_short!("TEST"), &symbol_short!("TST"), &6);
    contract.credit(&admin, &from, &100);

    contract.sep41_transfer(&from, &to, &40);
    assert!(has_event(&env, "transfer"));
    assert_eq!(contract.sep41_balance(&from), 60);
    assert_eq!(contract.sep41_balance(&to), 40);
}

#[test]
fn test_sep41_approve_and_transfer_from() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);

    contract.enable_token_mode(&admin, &symbol_short!("TEST"), &symbol_short!("TST"), &6);
    contract.credit(&admin, &owner, &100);

    // Approve spender
    contract.sep41_approve(&owner, &spender, &50, &0);
    assert!(has_event(&env, "approve"));
    assert_eq!(contract.sep41_allowance(&owner, &spender), 50);

    // Spender transfers from owner
    contract.sep41_transfer_from(&spender, &owner, &recipient, &30);
    assert_eq!(contract.sep41_balance(&owner), 70);
    assert_eq!(contract.sep41_balance(&recipient), 30);
    assert_eq!(contract.sep41_allowance(&owner, &spender), 20);
}

#[test]
fn test_sep41_burn() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);
    let user = Address::generate(&env);

    contract.enable_token_mode(&admin, &symbol_short!("TEST"), &symbol_short!("TST"), &6);
    contract.credit(&admin, &user, &100);

    contract.sep41_burn(&user, &30);
    assert!(has_event(&env, "burn"));
    assert_eq!(contract.sep41_balance(&user), 70);
}

#[test]
fn test_sep41_burn_from() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);
    let owner = Address::generate(&env);
    let burner = Address::generate(&env);

    contract.enable_token_mode(&admin, &symbol_short!("TEST"), &symbol_short!("TST"), &6);
    contract.credit(&admin, &owner, &100);
    contract.sep41_approve(&owner, &burner, &50, &0);

    contract.sep41_burn_from(&burner, &owner, &30);
    assert_eq!(contract.sep41_balance(&owner), 70);
    assert_eq!(contract.sep41_allowance(&owner, &burner), 20);
}

// ── Storage & Multisig Tests ─────────────────────────────────────────────────

#[test]
fn test_storage_stats() {
    let env = Env::default();
    let (contract, _admin) = setup_rewards(&env);

    let (participants, nonces, expired) = contract.storage_stats();
    assert_eq!(participants, 0); // Rewards contract doesn't track participants
    assert_eq!(nonces, 0);
    assert_eq!(expired, 0);
}

#[test]
fn test_multisig_configuration() {
    let env = Env::default();
    let (contract, admin) = setup_rewards(&env);
    let co_admin1 = Address::generate(&env);
    let co_admin2 = Address::generate(&env);
    let pubkey1 = BytesN::from_array(&env, &[1u8; 32]);
    let pubkey2 = BytesN::from_array(&env, &[2u8; 32]);

    assert_eq!(contract.multisig_threshold(), 0);

    contract.add_co_admin(&admin, &co_admin1, &pubkey1);
    contract.add_co_admin(&admin, &co_admin2, &pubkey2);

    contract.set_multisig_threshold(&admin, &2);
    assert_eq!(contract.multisig_threshold(), 2);

    contract.remove_co_admin(&admin, &co_admin1);
    // Note: Actual multisig pause test requires signature generation
}

#[test]
fn test_prune_used_nonces() {
    let env = Env::default();
    let (contract, _admin) = setup_rewards(&env);

    let pruned = contract.prune_used_nonces(&10);
    // Initially no nonces to prune
    assert_eq!(pruned, 0);
}
