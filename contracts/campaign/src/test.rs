//! Tests for the Trivela campaign contract.

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::Address;

#[test]
fn test_initialize_and_active() {
    let env = Env::default();
    let contract_id = env.register_contract(None, CampaignContract);
    let client = CampaignContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin).unwrap();
    assert!(client.is_active());
}

#[test]
fn test_register_participant() {
    let env = Env::default();
    let contract_id = env.register_contract(None, CampaignContract);
    let client = CampaignContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let participant = Address::generate(&env);
    client.initialize(&admin).unwrap();
    env.mock_all_auths();
    let registered = client.register(&participant).unwrap();
    assert!(registered);
    assert!(client.is_participant(&participant));
}
