//! # Trivela Badges Contract
//!
//! NFT achievement badges for the Trivela campaign platform.
//! Mints soulbound (non-transferable) or transferable badges for milestones:
//! first claim, top-N rank, streaks, and referral milestones.
//!
//! Events:
//! - `mint`: topics `(mint, to)`, data `(badge_id: u64, badge_type: Symbol, metadata_uri: Bytes)`
//! - `transfer`: topics `(transfer, from, to)`, data `(badge_id: u64)`
//! - `freeze`: topics `(freeze, badge_id)`, data `(soulbound: bool)`

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contractmeta, contracttype, symbol_short, Address, Bytes,
    Env, Symbol, Vec,
};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Unauthorized = 500,
    BadgeNotFound = 501,
    BadgeAlreadyMinted = 502,
    SoulboundTransfer = 503,
    InvalidBadgeType = 504,
    MetadataRequired = 505,
    BadgeTypeAlreadyConfigured = 506,
}

contractmeta!(
    key = "Description",
    val = "Trivela NFT achievement badges"
);

// ── Storage keys ─────────────────────────────────────────────────────────────

const ADMIN: Symbol = symbol_short!("admin");
const BADGE_COUNTER: Symbol = symbol_short!("bdcntr");
const BADGE_OWNER: Symbol = symbol_short!("bdowner"); // (BADGE_OWNER, badge_id) -> Address
const BADGE_TYPE: Symbol = symbol_short!("bdtype"); // (BADGE_TYPE, badge_id) -> Symbol
const BADGE_METADATA: Symbol = symbol_short!("bdmeta"); // (BADGE_METADATA, badge_id) -> Bytes
const BADGE_SOULD: Symbol = symbol_short!("bdsoul"); // (BADGE_SOULD, badge_id) -> bool
const USER_BADGES: Symbol = symbol_short!("ubadges"); // (USER_BADGES, user) -> Vec<u64>
const USER_BADGE_SET: Symbol = symbol_short!("ubdset"); // (USER_BADGE_SET, user, badge_type) -> bool
const BADGE_TYPE_AUTH: Symbol = symbol_short!("btauth"); // (BADGE_TYPE_AUTH, badge_type) -> Address

// ── Badge types ──────────────────────────────────────────────────────────────

pub const FIRST_CLAIM: Symbol = symbol_short!("first_claim");
pub const TOP_RANK: Symbol = symbol_short!("top_rank");
pub const STREAK: Symbol = symbol_short!("streak");
pub const REFERRAL: Symbol = symbol_short!("referral");
pub const CUSTOM: Symbol = symbol_short!("custom");

// ── TTL constants ────────────────────────────────────────────────────────────

#[cfg(not(test))]
pub const TTL_THRESHOLD: u32 = 100_000;
#[cfg(not(test))]
pub const TTL_EXTEND_TO: u32 = 518_400;

#[cfg(test)]
pub const TTL_THRESHOLD: u32 = 50;
#[cfg(test)]
pub const TTL_EXTEND_TO: u32 = 100;

#[contract]
pub struct BadgesContract;

/// Metadata for a badge, stored on-chain or as a reference to off-chain JSON.
#[contracttype]
#[derive(Clone, Debug)]
pub struct BadgeMetadata {
    pub name: Symbol,
    pub description: Symbol,
    pub image_uri: Bytes,
    pub attributes: Vec<(Symbol, Symbol)>,
}

#[contractimpl]
impl BadgesContract {
    /// Initialize the badges contract with an admin.
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&BADGE_COUNTER, &0u64);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Return the current admin address.
    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&ADMIN).unwrap()
    }

    /// Configure which address is authorized to mint a specific badge type.
    /// Only admin can configure minters. The minter could be the rewards
    /// contract, campaign contract, or an admin address.
    pub fn set_badge_type_minter(
        env: Env,
        admin: Address,
        badge_type: Symbol,
        minter: Address,
    ) -> Result<(), Error> {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        if stored_admin != admin {
            return Err(Error::Unauthorized);
        }

        env.storage()
            .instance()
            .set(&(BADGE_TYPE_AUTH, badge_type), &minter);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Get the authorized minter for a badge type.
    pub fn get_badge_type_minter(env: Env, badge_type: Symbol) -> Option<Address> {
        env.storage()
            .instance()
            .get(&(BADGE_TYPE_AUTH, badge_type))
    }

    /// Mint an achievement badge to an address.
    ///
    /// - `to`: recipient address
    /// - `badge_type`: the milestone type (e.g., FIRST_CLAIM, TOP_RANK)
    /// - `metadata_uri`: URI or bytes pointing to badge metadata (JSON on IPFS/S3)
    /// - `soulbound`: if true, the badge cannot be transferred
    ///
    /// Returns the badge_id of the newly minted badge.
    ///
    /// Authorization: only the configured minter for `badge_type` can mint,
    /// or the admin if no minter is configured for that type.
    pub fn mint(
        env: Env,
        to: Address,
        badge_type: Symbol,
        metadata_uri: Bytes,
        soulbound: bool,
    ) -> Result<u64, Error> {
        // Check authorization: minter for this badge type, or admin
        let minter_opt: Option<Address> = env
            .storage()
            .instance()
            .get(&(BADGE_TYPE_AUTH, badge_type.clone()));

        if let Some(minter) = minter_opt {
            minter.require_auth();
        } else {
            // Fall back to admin authorization
            let admin: Address = env.storage().instance().get(&ADMIN).unwrap();
            admin.require_auth();
        }

        // Prevent duplicate soulbound badges of the same type per user
        if soulbound {
            let already_minted: bool = env
                .storage()
                .instance()
                .get(&(USER_BADGE_SET, to.clone(), badge_type.clone()))
                .unwrap_or(false);
            if already_minted {
                return Err(Error::BadgeAlreadyMinted);
            }
        }

        // Allocate badge_id
        let badge_id: u64 = env.storage().instance().get(&BADGE_COUNTER).unwrap_or(0);
        let next_id = badge_id
            .checked_add(1)
            .ok_or(Error::BadgeAlreadyMinted)?;
        env.storage().instance().set(&BADGE_COUNTER, &next_id);

        // Store badge data
        env.storage()
            .instance()
            .set(&(BADGE_OWNER, badge_id), &to);
        env.storage()
            .instance()
            .set(&(BADGE_TYPE, badge_id), &badge_type);
        env.storage()
            .instance()
            .set(&(BADGE_METADATA, badge_id), &metadata_uri);
        env.storage()
            .instance()
            .set(&(BADGE_SOULD, badge_id), &soulbound);

        // Add to user's badge list
        let user_badges_key = (USER_BADGES, to.clone());
        let mut badges: Vec<u64> = env
            .storage()
            .instance()
            .get(&user_badges_key)
            .unwrap_or_else(|| Vec::new(&env));
        badges.push_back(badge_id);
        env.storage().instance().set(&user_badges_key, &badges);

        // Mark badge type as minted for this user (for soulbound dedup)
        if soulbound {
            env.storage().instance().set(
                &(USER_BADGE_SET, to.clone(), badge_type.clone()),
                &true,
            );
        }

        env.events().publish(
            (symbol_short!("mint"), to),
            (badge_id, badge_type, metadata_uri),
        );
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        Ok(badge_id)
    }

    /// Transfer a badge from one address to another.
    /// Reverts if the badge is soulbound.
    pub fn transfer(
        env: Env,
        from: Address,
        to: Address,
        badge_id: u64,
    ) -> Result<(), Error> {
        from.require_auth();

        let owner: Address = env
            .storage()
            .instance()
            .get(&(BADGE_OWNER, badge_id))
            .ok_or(Error::BadgeNotFound)?;

        if owner != from {
            return Err(Error::Unauthorized);
        }

        let soulbound: bool = env
            .storage()
            .instance()
            .get(&(BADGE_SOULD, badge_id))
            .unwrap_or(false);
        if soulbound {
            return Err(Error::SoulboundTransfer);
        }

        // Update owner
        env.storage()
            .instance()
            .set(&(BADGE_OWNER, badge_id), &to);

        // Update user badge lists
        let from_key = (USER_BADGES, from.clone());
        let mut from_badges: Vec<u64> = env
            .storage()
            .instance()
            .get(&from_key)
            .unwrap_or_else(|| Vec::new(&env));
        // Remove badge from sender's list
        let mut new_from_badges = Vec::new(&env);
        for id in from_badges.iter() {
            if id != badge_id {
                new_from_badges.push_back(id);
            }
        }
        env.storage().instance().set(&from_key, &new_from_badges);

        // Add to receiver's list
        let to_key = (USER_BADGES, to.clone());
        let mut to_badges: Vec<u64> = env
            .storage()
            .instance()
            .get(&to_key)
            .unwrap_or_else(|| Vec::new(&env));
        to_badges.push_back(badge_id);
        env.storage().instance().set(&to_key, &to_badges);

        env.events()
            .publish((symbol_short!("transfer"), from, to), badge_id);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        Ok(())
    }

    /// Freeze a badge as soulbound (admin only).
    /// Once frozen, the badge cannot be transferred.
    pub fn freeze_badge(env: Env, admin: Address, badge_id: u64) -> Result<(), Error> {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&ADMIN).unwrap();
        if stored_admin != admin {
            return Err(Error::Unauthorized);
        }

        let exists: bool = env
            .storage()
            .instance()
            .get::<_, Address>(&(&(BADGE_OWNER, badge_id)))
            .is_some();
        if !exists {
            return Err(Error::BadgeNotFound);
        }

        env.storage()
            .instance()
            .set(&(BADGE_SOULD, badge_id), &true);
        env.events().publish(symbol_short!("freeze"), badge_id);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        Ok(())
    }

    /// Get the owner of a badge.
    pub fn owner_of(env: Env, badge_id: u64) -> Option<Address> {
        env.storage()
            .instance()
            .get(&(BADGE_OWNER, badge_id))
    }

    /// Get the number of badges owned by an address.
    pub fn balance_of(env: Env, owner: Address) -> u64 {
        let badges: Vec<u64> = env
            .storage()
            .instance()
            .get(&(USER_BADGES, owner))
            .unwrap_or_else(|| Vec::new(&env));
        badges.len()
    }

    /// Get the badge type of a badge.
    pub fn badge_type(env: Env, badge_id: u64) -> Option<Symbol> {
        env.storage()
            .instance()
            .get(&(BADGE_TYPE, badge_id))
    }

    /// Get the metadata URI of a badge.
    pub fn token_uri(env: Env, badge_id: u64) -> Option<Bytes> {
        env.storage()
            .instance()
            .get(&(BADGE_METADATA, badge_id))
    }

    /// Check if a badge is soulbound (non-transferable).
    pub fn is_soulbound(env: Env, badge_id: u64) -> bool {
        env.storage()
            .instance()
            .get(&(BADGE_SOULD, badge_id))
            .unwrap_or(false)
    }

    /// Get all badge IDs owned by an address.
    pub fn tokens_of(env: Env, owner: Address) -> Vec<u64> {
        env.storage()
            .instance()
            .get(&(USER_BADGES, owner))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Get total number of badges minted.
    pub fn total_supply(env: Env) -> u64 {
        env.storage().instance().get(&BADGE_COUNTER).unwrap_or(0)
    }

    /// Check if a specific badge type has been minted for a user (soulbound dedup).
    pub fn has_badge_type(env: Env, user: Address, badge_type: Symbol) -> bool {
        env.storage()
            .instance()
            .get(&(USER_BADGE_SET, user, badge_type))
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod test;
