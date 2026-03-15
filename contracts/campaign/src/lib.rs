//! # Trivela Campaign Contract
//!
//! On-chain campaign metadata and eligibility for Trivela.
//! Stores campaign config and allows checking participant status.

#![no_std]

use soroban_sdk::{contract, contractimpl, contractmeta, contracterror, symbol_short, Env, Symbol};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Unauthorized = 100,
}

contractmeta!(
    name = "trivela-campaign",
    version = "0.1.0",
    description = "Trivela campaign configuration"
);

const ADMIN: Symbol = symbol_short!("admin");
const CAMPAIGN_ACTIVE: Symbol = symbol_short!("active");
const PARTICIPANT: Symbol = symbol_short!("participant");

#[contract]
pub struct CampaignContract;

#[contractimpl]
impl CampaignContract {
    /// Initialize campaign contract with an admin.
    pub fn initialize(env: Env, admin: soroban_sdk::Address) -> Result<(), Error> {
        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&CAMPAIGN_ACTIVE, &true);
        Ok(())
    }

    /// Set campaign active flag (admin only).
    pub fn set_active(env: Env, admin: soroban_sdk::Address, active: bool) -> Result<(), Error> {
        admin.require_auth();
        let stored: soroban_sdk::Address = env.storage().instance().get(&ADMIN).unwrap();
        if stored != admin {
            return Err(Error::Unauthorized);
        }
        env.storage().instance().set(&CAMPAIGN_ACTIVE, &active);
        Ok(())
    }

    /// Register a participant (authorized caller).
    pub fn register(env: Env, participant: soroban_sdk::Address) -> Result<bool, Error> {
        participant.require_auth();
        let key = (PARTICIPANT, participant.clone());
        if env.storage().instance().get::<_, bool>(&key).unwrap_or(false) {
            return Ok(false);
        }
        env.storage().instance().set(&key, &true);
        env.storage().instance().extend_ttl(50, 100);
        Ok(true)
    }

    /// Check if a participant is registered.
    pub fn is_participant(env: Env, participant: soroban_sdk::Address) -> bool {
        env.storage()
            .instance()
            .get(&(PARTICIPANT, participant))
            .unwrap_or(false)
    }

    /// Check if campaign is active.
    pub fn is_active(env: Env) -> bool {
        env.storage().instance().get(&CAMPAIGN_ACTIVE).unwrap_or(false)
    }
}

#[cfg(test)]
mod test;
