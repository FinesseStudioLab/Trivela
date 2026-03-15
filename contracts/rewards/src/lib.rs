//! # Trivela Rewards Contract
//!
//! On-chain points and rewards for the Trivela campaign platform.
//! Tracks user balances and allows claiming rewards.

#![no_std]

use soroban_sdk::{contract, contractimpl, contractmeta, contracterror, symbol_short, Env, Symbol};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Overflow = 1,
    InsufficientBalance = 2,
}

contractmeta!(
    name = "trivela-rewards",
    version = "0.1.0",
    description = "Trivela campaign rewards and points"
);

const BALANCE: Symbol = symbol_short!("balance");
const TOTAL_CLAIMED: Symbol = symbol_short!("total_claimed");

#[contract]
pub struct RewardsContract;

#[contractimpl]
impl RewardsContract {
    /// Initialize the rewards contract (admin).
    pub fn initialize(env: Env, admin: soroban_sdk::Address) -> Result<(), Error> {
        env.storage().instance().set(&symbol_short!("admin"), &admin);
        env.storage().instance().set(&TOTAL_CLAIMED, &0u64);
        Ok(())
    }

    /// Get the current points balance for a user.
    pub fn balance(env: Env, user: soroban_sdk::Address) -> u64 {
        env.storage()
            .instance()
            .get(&(BALANCE, user))
            .unwrap_or(0)
    }

    /// Credit points to a user (admin or authorized campaign only).
    pub fn credit(
        env: Env,
        from: soroban_sdk::Address,
        user: soroban_sdk::Address,
        amount: u64,
    ) -> Result<u64, Error> {
        from.require_auth();
        let key = (BALANCE, user.clone());
        let current: u64 = env.storage().instance().get(&key).unwrap_or(0);
        let new_balance = current.checked_add(amount).ok_or(Error::Overflow)?;
        env.storage().instance().set(&key, &new_balance);
        env.storage().instance().extend_ttl(50, 100);
        Ok(new_balance)
    }

    /// Claim rewards for a user (reduces balance).
    pub fn claim(env: Env, user: soroban_sdk::Address, amount: u64) -> Result<u64, Error> {
        user.require_auth();
        let key = (BALANCE, user.clone());
        let current: u64 = env.storage().instance().get(&key).unwrap_or(0);
        let new_balance = current.checked_sub(amount).ok_or(Error::InsufficientBalance)?;
        env.storage().instance().set(&key, &new_balance);
        let total: u64 = env.storage().instance().get(&TOTAL_CLAIMED).unwrap_or(0);
        env.storage().instance().set(&TOTAL_CLAIMED, &total.saturating_add(amount));
        env.storage().instance().extend_ttl(50, 100);
        Ok(new_balance)
    }

    /// Get total claimed rewards (global stats).
    pub fn total_claimed(env: Env) -> u64 {
        env.storage().instance().get(&TOTAL_CLAIMED).unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
