//! SEP-41 conformance tests for the rewards contract's optional token-mode
//! interface (issue: complete allowance/expiry semantics + conformance tests).
//!
//! Covers: balance mirroring, transfer, approve/allowance (including expiry
//! and clearing-on-spend), transfer_from, burn, burn_from, metadata reads,
//! the token-mode gate, and the i128->u64 overflow guard.

use soroban_sdk::testutils::{Address as _, Events, Ledger};
use soroban_sdk::{symbol_short, Address, Env};
use trivela_rewards_contract::{Error, RewardsContract, RewardsContractClient};

fn setup(env: &Env) -> (RewardsContractClient<'_>, Address) {
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    env.mock_all_auths();
    (client, admin)
}

fn has_event(env: &Env, name: &str) -> bool {
    use soroban_sdk::xdr::{ContractEvent, ContractEventBody, ScVal};
    fn topic0_is(event: &ContractEvent, name: &str) -> bool {
        let ContractEventBody::V0(body) = &event.body;
        matches!(body.topics.first(), Some(ScVal::Symbol(s)) if s.0.as_slice() == name.as_bytes())
    }
    env.events().all().events().iter().any(|e| topic0_is(e, name))
}

// ── Gating ────────────────────────────────────────────────────────────────

#[test]
fn token_ops_rejected_before_token_mode_enabled() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    contract.credit(&admin, &a, &100);

    let err = contract.try_sep41_transfer(&a, &b, &10).unwrap_err().unwrap();
    assert_eq!(err, Error::TokenModeNotEnabled);
}

#[test]
fn enable_token_mode_is_reflected_in_metadata() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    assert!(!contract.is_token_mode());

    contract.enable_token_mode(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"), &7);
    assert!(contract.is_token_mode());
    assert_eq!(contract.sep41_name(), symbol_short!("Trivela"));
    assert_eq!(contract.sep41_symbol(), symbol_short!("TVL"));
    assert_eq!(contract.sep41_decimals(), 7);
}

#[test]
fn decimals_rejected_above_18() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    let err = contract
        .try_enable_token_mode(&admin, &symbol_short!("T"), &symbol_short!("T"), &19)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::InvalidMultiplier);
}

// ── balance() mirrors the points ledger ─────────────────────────────────────

#[test]
fn sep41_balance_mirrors_points_balance() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    let user = Address::generate(&env);
    contract.enable_token_mode(&admin, &symbol_short!("T"), &symbol_short!("T"), &6);

    contract.credit(&admin, &user, &250);
    assert_eq!(contract.sep41_balance(&user), 250i128);
    assert_eq!(contract.balance(&user), 250u64);
}

// ── transfer ─────────────────────────────────────────────────────────────

#[test]
fn transfer_moves_balance_and_emits_event() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    contract.enable_token_mode(&admin, &symbol_short!("T"), &symbol_short!("T"), &6);
    contract.credit(&admin, &from, &100);

    contract.sep41_transfer(&from, &to, &40);
    assert!(has_event(&env, "transfer"));
    assert_eq!(contract.sep41_balance(&from), 60);
    assert_eq!(contract.sep41_balance(&to), 40);
}

#[test]
fn transfer_insufficient_balance_fails() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    contract.enable_token_mode(&admin, &symbol_short!("T"), &symbol_short!("T"), &6);
    contract.credit(&admin, &from, &10);

    let err = contract.try_sep41_transfer(&from, &to, &11).unwrap_err().unwrap();
    assert_eq!(err, Error::InsufficientBalance);
}

#[test]
fn transfer_rejects_negative_amount() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    contract.enable_token_mode(&admin, &symbol_short!("T"), &symbol_short!("T"), &6);
    contract.credit(&admin, &from, &10);

    let err = contract.try_sep41_transfer(&from, &to, &-1).unwrap_err().unwrap();
    assert_eq!(err, Error::Overflow);
}

#[test]
fn transfer_rejects_amount_above_u64_max() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    contract.enable_token_mode(&admin, &symbol_short!("T"), &symbol_short!("T"), &6);
    contract.credit(&admin, &from, &10);

    let too_big = (u64::MAX as i128) + 1;
    let err = contract
        .try_sep41_transfer(&from, &to, &too_big)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::Overflow);
}

// ── approve / allowance ─────────────────────────────────────────────────────

#[test]
fn approve_sets_allowance_and_emits_event() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    contract.enable_token_mode(&admin, &symbol_short!("T"), &symbol_short!("T"), &6);

    contract.sep41_approve(&owner, &spender, &50, &0);
    assert!(has_event(&env, "approve"));
    assert_eq!(contract.sep41_allowance(&owner, &spender), 50);
}

#[test]
fn approve_rejects_expiration_in_the_past_or_present() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    contract.enable_token_mode(&admin, &symbol_short!("T"), &symbol_short!("T"), &6);

    let now = env.ledger().sequence();
    let err = contract
        .try_sep41_approve(&owner, &spender, &50, &now)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::InvalidExpiration);
}

#[test]
fn transfer_from_spends_allowance() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);
    contract.enable_token_mode(&admin, &symbol_short!("T"), &symbol_short!("T"), &6);
    contract.credit(&admin, &owner, &100);

    contract.sep41_approve(&owner, &spender, &50, &0);
    contract.sep41_transfer_from(&spender, &owner, &recipient, &30);

    assert_eq!(contract.sep41_balance(&owner), 70);
    assert_eq!(contract.sep41_balance(&recipient), 30);
    assert_eq!(contract.sep41_allowance(&owner, &spender), 20);
}

#[test]
fn transfer_from_exceeding_allowance_fails() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);
    contract.enable_token_mode(&admin, &symbol_short!("T"), &symbol_short!("T"), &6);
    contract.credit(&admin, &owner, &100);
    contract.sep41_approve(&owner, &spender, &10, &0);

    let err = contract
        .try_sep41_transfer_from(&spender, &owner, &recipient, &11)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::AllowanceExceeded);
}

#[test]
fn transfer_from_after_expiration_fails_and_clears_allowance() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);
    contract.enable_token_mode(&admin, &symbol_short!("T"), &symbol_short!("T"), &6);
    contract.credit(&admin, &owner, &100);

    let now = env.ledger().sequence();
    contract.sep41_approve(&owner, &spender, &50, &(now + 10));

    env.ledger().with_mut(|li| li.sequence_number = now + 11);

    let err = contract
        .try_sep41_transfer_from(&spender, &owner, &recipient, &10)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::ApprovalExpired);
    // Expired allowance is cleared as a side effect of the failed attempt.
    assert_eq!(contract.sep41_allowance(&owner, &spender), 0);
}

#[test]
fn allowance_fully_spent_is_cleared_not_left_at_zero_entry() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);
    contract.enable_token_mode(&admin, &symbol_short!("T"), &symbol_short!("T"), &6);
    contract.credit(&admin, &owner, &100);

    contract.sep41_approve(&owner, &spender, &30, &0);
    contract.sep41_transfer_from(&spender, &owner, &recipient, &30);
    assert_eq!(contract.sep41_allowance(&owner, &spender), 0);
}

// ── burn / burn_from ─────────────────────────────────────────────────────

#[test]
fn burn_reduces_balance_and_emits_event() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    let user = Address::generate(&env);
    contract.enable_token_mode(&admin, &symbol_short!("T"), &symbol_short!("T"), &6);
    contract.credit(&admin, &user, &100);

    contract.sep41_burn(&user, &30);
    assert!(has_event(&env, "burn"));
    assert_eq!(contract.sep41_balance(&user), 70);
    assert_eq!(contract.total_claimed(), 30);
}

#[test]
fn burn_from_spends_allowance_and_burns() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    let owner = Address::generate(&env);
    let burner = Address::generate(&env);
    contract.enable_token_mode(&admin, &symbol_short!("T"), &symbol_short!("T"), &6);
    contract.credit(&admin, &owner, &100);
    contract.sep41_approve(&owner, &burner, &50, &0);

    contract.sep41_burn_from(&burner, &owner, &30);
    assert!(has_event(&env, "burn"));
    assert_eq!(contract.sep41_balance(&owner), 70);
    assert_eq!(contract.sep41_allowance(&owner, &burner), 20);
}

#[test]
fn burn_from_exceeding_allowance_fails() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    let owner = Address::generate(&env);
    let burner = Address::generate(&env);
    contract.enable_token_mode(&admin, &symbol_short!("T"), &symbol_short!("T"), &6);
    contract.credit(&admin, &owner, &100);
    contract.sep41_approve(&owner, &burner, &5, &0);

    let err = contract
        .try_sep41_burn_from(&burner, &owner, &6)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, Error::AllowanceExceeded);
}

// ── pause interaction ────────────────────────────────────────────────────

#[test]
fn token_ops_respect_global_pause() {
    let env = Env::default();
    let (contract, admin) = setup(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    contract.enable_token_mode(&admin, &symbol_short!("T"), &symbol_short!("T"), &6);
    contract.credit(&admin, &from, &100);

    contract.set_paused(&admin, &0, &true, &soroban_sdk::Vec::new(&env));
    let err = contract.try_sep41_transfer(&from, &to, &10).unwrap_err().unwrap();
    assert_eq!(err, Error::ContractPaused);
}