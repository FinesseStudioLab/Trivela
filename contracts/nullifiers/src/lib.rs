//! # Trivela Nullifier Registry
//!
//! A standalone Soroban contract that provides shared, audited storage for
//! spent nullifiers. Consumer contracts (campaigns, voting, etc.) call
//! `spend` to atomically check-and-record a nullifier, preventing double-use
//! across anonymous actions.
//!
//! ## Design
//!
//! - **Namespacing**: Keys are `(consumer, nullifier)` so the same nullifier
//!   in two consumers doesn't collide.
//! - **Auth**: `spend` requires `consumer.require_auth()` and the consumer
//!   must be in the allowlist — only registered contracts can write.
//! - **Atomicity**: `spend` reverts with `Error::AlreadySpent` if the
//!   nullifier is already present; otherwise stores it.
//! - **TTL/rent**: Spent entries use persistent storage with documented TTL
//!   extension strategy.
//!
//! ## Events
//!
//! - `spent`: topics `(spent, consumer)`, data `nullifier: BytesN<32>`
//! - `consumer_added`: topics `(cadd, consumer)`, data `()`

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contractmeta, contracttype, symbol_short, Address, BytesN, Env,
    Symbol, Vec,
};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The nullifier has already been spent by this consumer.
    AlreadySpent = 1,
    /// The caller is not an authorized consumer.
    Unauthorized = 2,
    /// The contract has not been initialized.
    NotInitialized = 3,
}

contractmeta!(
    key = "Description",
    val = "Trivela nullifier registry for anonymous double-action prevention"
);

// ── Instance-storage TTL ──────────────────────────────────────────────────────
//
// Mainnet ledgers close every ~5 seconds. We use modest TTL values that are
// refreshed on each mutation. See docs/TTL_STRATEGY.md for rationale.

#[cfg(not(test))]
pub const TTL_THRESHOLD: u32 = 100_000;
#[cfg(not(test))]
pub const TTL_EXTEND_TO: u32 = 518_400;

#[cfg(test)]
pub const TTL_THRESHOLD: u32 = 50;
#[cfg(test)]
pub const TTL_EXTEND_TO: u32 = 100;

const ADMIN: Symbol = symbol_short!("admin");
const CONSUMERS: Symbol = symbol_short!("consumers");
const SPENT_EVENT: Symbol = symbol_short!("spent");
const CONSUMER_ADDED_EVENT: Symbol = symbol_short!("cadd");

/// Storage key for a spent nullifier: (consumer, nullifier).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NullifierKey {
    pub consumer: Address,
    pub nullifier: BytesN<32>,
}

#[contract]
pub struct NullifierRegistry;

fn extend_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn require_admin(env: &Env) -> Result<Address, Error> {
    let admin: Address = env
        .storage()
        .instance()
        .get(&ADMIN)
        .ok_or(Error::NotInitialized)?;
    admin.require_auth();
    Ok(admin)
}

fn is_consumer(env: &Env, consumer: &Address) -> bool {
    let consumers: Vec<Address> = env
        .storage()
        .instance()
        .get(&CONSUMERS)
        .unwrap_or_else(|| soroban_sdk::vec![&env]);
    consumers.contains(consumer)
}

fn add_consumer_to_list(env: &Env, consumer: &Address) {
    let mut consumers: Vec<Address> = env
        .storage()
        .instance()
        .get(&CONSUMERS)
        .unwrap_or_else(|| soroban_sdk::vec![&env]);
    if !consumers.contains(consumer) {
        consumers.push_back(consumer.clone());
        env.storage().instance().set(&CONSUMERS, &consumers);
    }
}

#[contractimpl]
impl NullifierRegistry {
    /// Initialize the registry with an admin.
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        admin.require_auth();
        env.storage().instance().set(&ADMIN, &admin);
        let empty_consumers: Vec<Address> = soroban_sdk::vec![&env];
        env.storage()
            .instance()
            .set(&CONSUMERS, &empty_consumers);
        extend_ttl(&env);
        Ok(())
    }

    /// Register a consumer contract that is allowed to spend nullifiers.
    ///
    /// Only the admin can call this.
    pub fn register_consumer(env: Env, consumer: Address) -> Result<(), Error> {
        require_admin(&env)?;
        add_consumer_to_list(&env, &consumer);
        env.storage()
            .instance()
            .set(&CONSUMER_ADDED_EVENT, &consumer);
        extend_ttl(&env);
        Ok(())
    }

    /// Check whether a nullifier has been spent by a consumer.
    pub fn is_spent(env: Env, consumer: Address, nullifier: BytesN<32>) -> bool {
        let key = NullifierKey {
            consumer,
            nullifier,
        };
        env.storage().persistent().has(&key)
    }

    /// Atomically check-and-spend a nullifier.
    ///
    /// - Requires `consumer.require_auth()`.
    /// - Consumer must be registered.
    /// - Reverts with `Error::AlreadySpent` if the nullifier is already spent.
    pub fn spend(env: Env, consumer: Address, nullifier: BytesN<32>) -> Result<(), Error> {
        consumer.require_auth();

        if !is_consumer(&env, &consumer) {
            return Err(Error::Unauthorized);
        }

        let key = NullifierKey {
            consumer: consumer.clone(),
            nullifier: nullifier.clone(),
        };

        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadySpent);
        }

        env.storage().persistent().set(&key, &true);

        env.events()
            .publish((SPENT_EVENT, consumer), nullifier);

        extend_ttl(&env);
        Ok(())
    }

    /// Admin: bump TTL for a specific spent nullifier entry.
    pub fn bump_ttl(
        env: Env,
        consumer: Address,
        nullifier: BytesN<32>,
    ) -> Result<(), Error> {
        require_admin(&env)?;

        let key = NullifierKey {
            consumer,
            nullifier,
        };

        if env.storage().persistent().has(&key) {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }

        extend_ttl(&env);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    fn setup() -> (Env, Address, NullifierRegistryClient<'static>) {
        let env = Env::default();
        let contract_id = env.register_contract(None, NullifierRegistry);
        let client = NullifierRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);

        env.mock_all_auths();
        client.initialize(&admin);

        (env, admin, client)
    }

    #[test]
    fn test_initialize() {
        let (env, _, client) = setup();

        let consumer = Address::generate(&env);
        let nullifier = BytesN::from_array(&env, &[1u8; 32]);
        assert_eq!(client.is_spent(&consumer, &nullifier), false);
    }

    #[test]
    fn test_register_and_spend() {
        let (env, _, client) = setup();
        let consumer = Address::generate(&env);

        client.register_consumer(&consumer);

        let nullifier = BytesN::from_array(&env, &[1u8; 32]);
        assert_eq!(client.is_spent(&consumer, &nullifier), false);

        client.spend(&consumer, &nullifier);

        assert_eq!(client.is_spent(&consumer, &nullifier), true);
    }

    #[test]
    fn test_double_spend_reverts() {
        let (env, _, client) = setup();
        let consumer = Address::generate(&env);

        client.register_consumer(&consumer);

        let nullifier = BytesN::from_array(&env, &[1u8; 32]);
        client.spend(&consumer, &nullifier);

        let result = client.try_spend(&consumer, &nullifier);
        assert_eq!(result, Err(Ok(Error::AlreadySpent)));
    }

    #[test]
    fn test_unregistered_consumer_reverts() {
        let (env, _, client) = setup();
        let consumer = Address::generate(&env);

        let nullifier = BytesN::from_array(&env, &[1u8; 32]);
        let result = client.try_spend(&consumer, &nullifier);
        assert_eq!(result, Err(Ok(Error::Unauthorized)));
    }

    #[test]
    fn test_same_nullifier_different_consumers() {
        let (env, _, client) = setup();
        let consumer1 = Address::generate(&env);
        let consumer2 = Address::generate(&env);

        client.register_consumer(&consumer1);
        client.register_consumer(&consumer2);

        let nullifier = BytesN::from_array(&env, &[1u8; 32]);
        client.spend(&consumer1, &nullifier);

        // Same nullifier, different consumer — should succeed
        client.spend(&consumer2, &nullifier);
    }

    #[test]
    fn test_bump_ttl() {
        let (env, _, client) = setup();
        let consumer = Address::generate(&env);

        client.register_consumer(&consumer);

        let nullifier = BytesN::from_array(&env, &[1u8; 32]);
        client.spend(&consumer, &nullifier);

        // Should not error
        client.bump_ttl(&consumer, &nullifier);
    }
}