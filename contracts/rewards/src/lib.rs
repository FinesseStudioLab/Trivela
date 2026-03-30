//! # Trivela Rewards Contract
//!
//! On-chain points and rewards for the Trivela campaign platform.
//! Tracks user balances and allows claiming rewards.
//!
//! Events:
//! - `credit`: topics `(credit, user)`, data `amount: u64`
//! - `claim`: topics `(claim, user)`, data `amount: u64`

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contractmeta, symbol_short, Address, BytesN, Env, Symbol, Vec,
};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Overflow = 1,
    InsufficientBalance = 2,
    Unauthorized = 3,
    ContractPaused = 4,
    CreditLimitExceeded = 5,
}

contractmeta!(
    key = "Description",
    val = "Trivela campaign rewards and points"
);

const ADMIN: Symbol = symbol_short!("admin");
const BALANCE: Symbol = symbol_short!("balance");
const CLAIMED: Symbol = symbol_short!("claimed");
const METADATA: Symbol = symbol_short!("metadata");
const PAUSED: Symbol = symbol_short!("paused");
const CREDIT_EVENT: Symbol = symbol_short!("credit");
const CLAIM_EVENT: Symbol = symbol_short!("claim");
const MAX_CREDIT_PER_CALL: Symbol = symbol_short!("mxcredit");

#[contract]
pub struct RewardsContract;

fn require_admin(env: &Env, admin: &Address) -> Result<(), Error> {
    admin.require_auth();

    let stored_admin: Address = env.storage().instance().get(&ADMIN).unwrap();
    if &stored_admin != admin {
        return Err(Error::Unauthorized);
    }

    Ok(())
}

fn ensure_not_paused(env: &Env) -> Result<(), Error> {
    let paused: bool = env.storage().instance().get(&PAUSED).unwrap_or(false);
    if paused {
        return Err(Error::ContractPaused);
    }

    Ok(())
}

#[contractimpl]
impl RewardsContract {
    /// Initialize the rewards contract (admin).
    pub fn initialize(env: Env, admin: Address, name: Symbol, symbol: Symbol) -> Result<(), Error> {
        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&CLAIMED, &0u64);
        env.storage().instance().set(&METADATA, &(name, symbol));
        env.storage().instance().set(&PAUSED, &false);
        env.storage().instance().set(&MAX_CREDIT_PER_CALL, &0u64);
        Ok(())
    }

    /// Set maximum amount allowed per single credit call (admin only).
    /// Set to 0 to disable the limit.
    pub fn set_max_credit_per_call(env: Env, admin: Address, max_amount: u64) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&MAX_CREDIT_PER_CALL, &max_amount);
        env.storage().instance().extend_ttl(50, 100);
        Ok(())
    }

    /// Get maximum amount allowed per single credit call (0 means unlimited).
    pub fn max_credit_per_call(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&MAX_CREDIT_PER_CALL)
            .unwrap_or(0)
    }

    /// Get contract metadata (name and symbol).
    pub fn metadata(env: Env) -> (Symbol, Symbol) {
        env.storage()
            .instance()
            .get(&METADATA)
            .unwrap_or((symbol_short!("Trivela"), symbol_short!("TVL")))
    }

    /// Get the current points balance for a user.
    pub fn balance(env: Env, user: Address) -> u64 {
        env.storage().instance().get(&(BALANCE, user)).unwrap_or(0)
    }

    /// Credit points to a user.
    pub fn credit(env: Env, from: Address, user: Address, amount: u64) -> Result<u64, Error> {
        from.require_auth();
        ensure_not_paused(&env)?;

        let max_credit_per_call: u64 = env
            .storage()
            .instance()
            .get(&MAX_CREDIT_PER_CALL)
            .unwrap_or(0);
        if max_credit_per_call > 0 && amount > max_credit_per_call {
            return Err(Error::CreditLimitExceeded);
        }

        let key = (BALANCE, user.clone());
        let current: u64 = env.storage().instance().get(&key).unwrap_or(0);
        let new_balance = current.checked_add(amount).ok_or(Error::Overflow)?;
        env.storage().instance().set(&key, &new_balance);
        env.events().publish((CREDIT_EVENT, user), amount);
        env.storage().instance().extend_ttl(50, 100);
        Ok(new_balance)
    }

    /// Credit points to multiple users in one call.
    pub fn batch_credit(
        env: Env,
        from: Address,
        recipients: Vec<(Address, u64)>,
    ) -> Result<(), Error> {
        from.require_auth();

        let mut staged = Vec::new(&env);

        for (user, amount) in recipients.iter() {
            let key = (BALANCE, user.clone());
            let current: u64 = env.storage().instance().get(&key).unwrap_or(0);
            let new_balance = current.checked_add(amount).ok_or(Error::Overflow)?;
            staged.push_back((user, new_balance));
        }

        for (user, new_balance) in staged.iter() {
            env.storage().instance().set(&(BALANCE, user), &new_balance);
        }

        env.storage().instance().extend_ttl(50, 100);
        Ok(())
    }

    /// Claim rewards for a user (reduces balance).
    pub fn claim(env: Env, user: Address, amount: u64) -> Result<u64, Error> {
        user.require_auth();
        ensure_not_paused(&env)?;

        let key = (BALANCE, user.clone());
        let current: u64 = env.storage().instance().get(&key).unwrap_or(0);
        let new_balance = current
            .checked_sub(amount)
            .ok_or(Error::InsufficientBalance)?;
        env.storage().instance().set(&key, &new_balance);

        let total: u64 = env.storage().instance().get(&CLAIMED).unwrap_or(0);
        env.storage()
            .instance()
            .set(&CLAIMED, &total.saturating_add(amount));

        env.events().publish((CLAIM_EVENT, user), amount);
        env.storage().instance().extend_ttl(50, 100);
        Ok(new_balance)
    }

    /// Get total claimed rewards (global stats).
    pub fn total_claimed(env: Env) -> u64 {
        env.storage().instance().get(&CLAIMED).unwrap_or(0)
    }

    /// Transfer points from one user to another (admin only).
    pub fn admin_transfer(
        env: Env,
        admin: Address,
        from: Address,
        to: Address,
        amount: u64,
    ) -> Result<(), Error> {
        require_admin(&env, &admin)?;

        let from_key = (BALANCE, from);
        let from_balance: u64 = env.storage().instance().get(&from_key).unwrap_or(0);
        let new_from_balance = from_balance
            .checked_sub(amount)
            .ok_or(Error::InsufficientBalance)?;
        env.storage().instance().set(&from_key, &new_from_balance);

        let to_key = (BALANCE, to);
        let to_balance: u64 = env.storage().instance().get(&to_key).unwrap_or(0);
        let new_to_balance = to_balance.checked_add(amount).ok_or(Error::Overflow)?;
        env.storage().instance().set(&to_key, &new_to_balance);

        env.storage().instance().extend_ttl(50, 100);
        Ok(())
    }

    /// Pause the contract (admin only). Blocks credit and claim operations.
    pub fn set_paused(env: Env, admin: Address, paused: bool) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        env.storage().instance().set(&PAUSED, &paused);
        Ok(())
    }

    /// Check if contract is paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&PAUSED).unwrap_or(false)
    }

    /// Upgrade the contract WASM to a new version (admin only).
    ///
    /// The new WASM must have been uploaded to the network first using
    /// `stellar contract install`. The `new_wasm_hash` is obtained from that
    /// installation step.
    ///
    /// **State preservation**: Soroban upgrades preserve all instance and
    /// persistent storage. Only the logic (WASM bytecode) changes. New code
    /// MUST read the existing storage layout — adding new storage keys is safe,
    /// but reordering, removing, or repurposing existing keys will corrupt data.
    pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }
}

#[cfg(test)]
mod test;
