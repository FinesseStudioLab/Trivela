use super::*;
use soroban_sdk::testutils::{Address as _, BytesN};
use soroban_sdk::{symbol_short, Address, Bytes, Env};

fn setup() -> (Env, Address, BadgesContractClient<'static>) {
    let env = Env::default();
    let contract_id = env.register_contract(None, BadgesContract);
    let client = BadgesContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    (env, admin, client)
}

fn sample_metadata(env: &Env) -> Bytes {
    let mut meta = Bytes::new(env);
    meta.extend_from_slice(b"ipfs://badge-metadata.json");
    meta
}

#[test]
fn test_initialize() {
    let (env, admin, client) = setup();
    assert_eq!(client.admin(), admin);
    assert_eq!(client.total_supply(), 0);
}

#[test]
fn test_mint_first_claim_badge() {
    let (env, admin, client) = setup();
    let user = Address::generate(&env);
    let metadata = sample_metadata(&env);

    env.mock_all_auths();

    let badge_id = client.mint(&user, &FIRST_CLAIM, &metadata, &true);

    assert_eq!(badge_id, 1);
    assert_eq!(client.total_supply(), 1);
    assert_eq!(client.owner_of(&badge_id), Some(user.clone()));
    assert_eq!(client.badge_type(&badge_id), Some(FIRST_CLAIM));
    assert_eq!(client.is_soulbound(&badge_id), true);
    assert_eq!(client.balance_of(&user), 1);
    assert_eq!(client.tokens_of(&user).len(), 1);
    assert!(client.has_badge_type(&user, FIRST_CLAIM));
}

#[test]
fn test_mint_transferable_badge() {
    let (env, admin, client) = setup();
    let user = Address::generate(&env);
    let metadata = sample_metadata(&env);

    env.mock_all_auths();

    let badge_id = client.mint(&user, &TOP_RANK, &metadata, &false);
    assert_eq!(client.is_soulbound(&badge_id), false);
}

#[test]
fn test_transfer_non_soulbound() {
    let (env, admin, client) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let metadata = sample_metadata(&env);

    env.mock_all_auths();

    let badge_id = client.mint(&alice, &TOP_RANK, &metadata, &false);
    assert_eq!(client.owner_of(&badge_id), Some(alice.clone()));

    client.transfer(&alice, &bob, &badge_id);

    assert_eq!(client.owner_of(&badge_id), Some(bob.clone()));
    assert_eq!(client.balance_of(&alice), 0);
    assert_eq!(client.balance_of(&bob), 1);
}

#[test]
fn test_transfer_soulbound_fails() {
    let (env, admin, client) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let metadata = sample_metadata(&env);

    env.mock_all_auths();

    let badge_id = client.mint(&alice, &FIRST_CLAIM, &metadata, &true);

    let result = client.try_transfer(&alice, &bob, &badge_id);
    assert_eq!(result, Err(Ok(Error::SoulboundTransfer)));
}

#[test]
fn test_soulbound_dedup() {
    let (env, admin, client) = setup();
    let user = Address::generate(&env);
    let metadata = sample_metadata(&env);

    env.mock_all_auths();

    // First mint succeeds
    let badge_id = client.mint(&user, &FIRST_CLAIM, &metadata, &true);
    assert_eq!(badge_id, 1);

    // Second soulbound mint of same type fails
    let result = client.try_mint(&user, &FIRST_CLAIM, &metadata, &true);
    assert_eq!(result, Err(Ok(Error::BadgeAlreadyMinted)));
}

#[test]
fn test_non_soulbound_no_dedup() {
    let (env, admin, client) = setup();
    let user = Address::generate(&env);
    let metadata = sample_metadata(&env);

    env.mock_all_auths();

    // Multiple non-soulbound badges of same type allowed
    let badge1 = client.mint(&user, &TOP_RANK, &metadata, &false);
    let badge2 = client.mint(&user, &TOP_RANK, &metadata, &false);
    assert_ne!(badge1, badge2);
    assert_eq!(client.balance_of(&user), 2);
}

#[test]
fn test_freeze_badge() {
    let (env, admin, client) = setup();
    let user = Address::generate(&env);
    let metadata = sample_metadata(&env);

    env.mock_all_auths();

    let badge_id = client.mint(&user, &TOP_RANK, &metadata, &false);
    assert_eq!(client.is_soulbound(&badge_id), false);

    client.freeze_badge(&admin, &badge_id);
    assert_eq!(client.is_soulbound(&badge_id), true);

    // Transfer after freeze should fail
    let bob = Address::generate(&env);
    let result = client.try_transfer(&user, &bob, &badge_id);
    assert_eq!(result, Err(Ok(Error::SoulboundTransfer)));
}

#[test]
fn test_unauthorized_mint_fails() {
    let (env, admin, client) = setup();
    let user = Address::generate(&env);
    let metadata = sample_metadata(&env);
    let impostor = Address::generate(&env);

    // Impostor tries to mint without minter config (should fail - no auth)
    let result = client.try_mint(&user, &FIRST_CLAIM, &metadata, &true);
    // Without mock_all_auths, this should fail because admin auth is required
    assert!(result.is_err() || result == Err(Ok(Error::Unauthorized)));
}

#[test]
fn test_set_badge_type_minter() {
    let (env, admin, client) = setup();
    let rewards_contract = Address::generate(&env);

    env.mock_all_auths();

    client.set_badge_type_minter(&admin, &FIRST_CLAIM, &rewards_contract);
    assert_eq!(
        client.get_badge_type_minter(&FIRST_CLAIM),
        Some(rewards_contract.clone())
    );

    // Now the rewards contract can mint (mock_all_auths handles this)
    let user = Address::generate(&env);
    let metadata = sample_metadata(&env);
    let badge_id = client.mint(&user, &FIRST_CLAIM, &metadata, &true);
    assert_eq!(badge_id, 1);
}

#[test]
fn test_token_uri() {
    let (env, admin, client) = setup();
    let user = Address::generate(&env);
    let metadata = sample_metadata(&env);

    env.mock_all_auths();

    let badge_id = client.mint(&user, &FIRST_CLAIM, &metadata, &true);
    let stored_uri = client.token_uri(&badge_id);
    assert!(stored_uri.is_some());
}

#[test]
fn test_owner_of_nonexistent() {
    let (env, _, client) = setup();
    assert_eq!(client.owner_of(&999), None);
}

#[test]
fn test_balance_of_empty() {
    let (env, _, client) = setup();
    let user = Address::generate(&env);
    assert_eq!(client.balance_of(&user), 0);
}
