//! Tests for campaign reward pool rebalancing (#1186).
extern crate std;

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{symbol_short, Address, Env};

const FROM: u64 = 1;
const TO: u64 = 2;

fn setup() -> (Env, RewardsContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, RewardsContract);
    let client = RewardsContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin, &symbol_short!("Trivela"), &symbol_short!("TVL"));
    client.set_campaign_supply_cap(&admin, &FROM, &1_000);
    client.set_campaign_supply_cap(&admin, &TO, &500);
    (env, client, admin)
}

#[test]
fn moves_unspent_pool_between_campaigns() {
    let (_env, client, admin) = setup();

    client.rebalance_campaign_pool(&admin, &FROM, &TO, &400);

    assert_eq!(client.campaign_supply_cap(&FROM), 600);
    assert_eq!(client.campaign_supply_cap(&TO), 900);
    // Combined pool is conserved.
    assert_eq!(
        client.campaign_supply_cap(&FROM) + client.campaign_supply_cap(&TO),
        1_500
    );
}

#[test]
fn cannot_move_already_issued_rewards() {
    let (env, client, admin) = setup();
    let user = Address::generate(&env);
    client.credit_for_campaign_capped(&admin, &user, &FROM, &700);
    assert_eq!(client.campaign_unspent_supply(&FROM), 300);

    assert_eq!(
        client.try_rebalance_campaign_pool(&admin, &FROM, &TO, &301),
        Err(Ok(Error::CampaignSupplyCapExceeded))
    );

    client.rebalance_campaign_pool(&admin, &FROM, &TO, &300);
    assert_eq!(client.campaign_unspent_supply(&FROM), 0);
    assert_eq!(client.campaign_supply_cap(&FROM), 700);
    assert_eq!(client.campaign_issued(&FROM), 700);
    assert_eq!(client.campaign_unspent_supply(&TO), 800);
}

#[test]
fn rejects_zero_same_and_uncapped_campaigns() {
    let (_env, client, admin) = setup();

    assert_eq!(
        client.try_rebalance_campaign_pool(&admin, &FROM, &TO, &0),
        Err(Ok(Error::ZeroAmount))
    );
    assert_eq!(
        client.try_rebalance_campaign_pool(&admin, &FROM, &FROM, &10),
        Err(Ok(Error::InvalidSupplyCap))
    );
    // Campaign 3 is uncapped, in either direction.
    assert_eq!(
        client.try_rebalance_campaign_pool(&admin, &FROM, &3, &10),
        Err(Ok(Error::InvalidSupplyCap))
    );
    assert_eq!(
        client.try_rebalance_campaign_pool(&admin, &3, &TO, &10),
        Err(Ok(Error::InvalidSupplyCap))
    );
    assert_eq!(client.campaign_unspent_supply(&3), 0);
}

#[test]
fn rejects_non_admin() {
    let (env, client, _admin) = setup();
    let stranger = Address::generate(&env);
    assert_eq!(
        client.try_rebalance_campaign_pool(&stranger, &FROM, &TO, &10),
        Err(Ok(Error::Unauthorized))
    );
    assert_eq!(client.campaign_supply_cap(&FROM), 1_000);
}

#[test]
fn rejects_destination_cap_overflow() {
    let (_env, client, admin) = setup();
    client.set_campaign_supply_cap(&admin, &TO, &u64::MAX);
    assert_eq!(
        client.try_rebalance_campaign_pool(&admin, &FROM, &TO, &1),
        Err(Ok(Error::Overflow))
    );
}
