//! # Trivela Rewards Contract
//!
//! On-chain points and rewards for the Trivela campaign platform.
//! Tracks user balances and allows claiming rewards.
//!
//! Events:
//! - `credit`: topics `(credit, user)`, data `amount: u64`
//! - `claim`: topics `(claim, user)`, data `amount: u64`
//! - `transfer`: topics `(transfer, from, to)`, data `amount: u64`
//! - `paused`: topics `(paused,)`, data `is_paused: bool`
//! - `max_credit_per_call`: topics `(mxcredit,)`, data `max_amount: u64`
//! - `campaign_multiplier`: topics `(multset, campaign_id)`, data `multiplier_bps: u32`
//! - `rate_limit_set`: topics `(ratlset,)`, data `(max_calls: u32, window_ledgers: u32)`
//! - `snapshot`: topics `(snapshot, snapshot_id)`, data `ledger: u32`
//! - `vested_credit`: topics `(vcredit, user)`, data `(vest_id: u64, total: u64)`
//! - `vested_claim`: topics `(vclaim, user)`, data `(vest_id: u64, amount: u64)`

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contractmeta, contracttype, symbol_short, Address, Env,
    Symbol, Vec,
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
    UnsupportedMigration = 6,
    InvalidMultiplier = 7,
    RateLimitExceeded = 8,
    VestingNotFound = 9,
    NoPendingAdmin = 10,
}

/// Vesting schedule record stored per user per vest_id.
#[contracttype]
#[derive(Clone, Debug)]
pub struct VestingRecord {
    pub total: u64,
    pub start_ledger: u32,
    pub end_ledger: u32,
    pub claimed: u64,
}

contractmeta!(
    key = "Description",
    val = "Trivela campaign rewards and points"
);

// ── Instance-storage TTL (issue #279) ────────────────────────────────────────
//
// `extend_ttl(threshold, extend_to)` is called on every state-mutating entry
// point. On mainnet each ledger closes in ~5 seconds, so the prior
// `extend_ttl(50, 100)` literals expired instance storage roughly 8 minutes
// after the last mutation, which would erase admin, balances, and metadata
// in production.
//
// Mainnet defaults aim for the contract to remain live for ~30 days after the
// most recent write, with extension triggered well before that window closes:
//   - `TTL_THRESHOLD` ≈ 100,000 ledgers (~6 days minimum life remaining)
//   - `TTL_EXTEND_TO` ≈ 518,400 ledgers (~30 days target lifetime)
//
// Tests use a `cfg(test)` override so suites don't spend the full ledger
// budget on TTL bookkeeping. See `docs/TTL_STRATEGY.md` for the full rationale.

#[cfg(not(test))]
pub const TTL_THRESHOLD: u32 = 100_000;
#[cfg(not(test))]
pub const TTL_EXTEND_TO: u32 = 518_400;

#[cfg(test)]
pub const TTL_THRESHOLD: u32 = 50;
#[cfg(test)]
pub const TTL_EXTEND_TO: u32 = 100;

const ADMIN: Symbol = symbol_short!("admin");
const BALANCE: Symbol = symbol_short!("balance");
const CLAIMED: Symbol = symbol_short!("claimed");
const METADATA: Symbol = symbol_short!("metadata");
const PAUSED: Symbol = symbol_short!("paused");
const CREDIT_EVENT: Symbol = symbol_short!("credit");
const CLAIM_EVENT: Symbol = symbol_short!("claim");
const TRANSFER_EVENT: Symbol = symbol_short!("transfer");
const PAUSED_EVENT: Symbol = symbol_short!("paused");
const MAX_CREDIT_EVENT: Symbol = symbol_short!("mxcredit");
const CAMPAIGN_MULTIPLIER_EVENT: Symbol = symbol_short!("multset");
const MAX_CREDIT_PER_CALL: Symbol = symbol_short!("mxcredit");
const SCHEMA_VERSION: Symbol = symbol_short!("schema_v");
const CURRENT_SCHEMA_VERSION: u32 = 1;
const CAMPAIGN_MULTIPLIER: Symbol = symbol_short!("mult");
const TIERS: Symbol = symbol_short!("tiers");
const BPS_DENOMINATOR: u128 = 10_000;

// Rate limiting constants (issue #324)
const RATE_LIM_MAX: Symbol = symbol_short!("ratlmax");
const RATE_LIM_WIN: Symbol = symbol_short!("ratlwin");
const RATE: Symbol = symbol_short!("rate");
const RATE_LIM_SET_EVENT: Symbol = symbol_short!("ratlset");

// Snapshot constants (issue #325)
const SNAPSHOT: Symbol = symbol_short!("snap");
const SNAP_LIST: Symbol = symbol_short!("snaplist");
const SNAPSHOT_EVENT: Symbol = symbol_short!("snapshot");

// Vesting constants (issue #326)
const VEST: Symbol = symbol_short!("vest");
const VEST_CTR: Symbol = symbol_short!("vestctr");
const VEST_IDS: Symbol = symbol_short!("vestids");
const VESTED_CREDIT_EVENT: Symbol = symbol_short!("vcredit");
const VESTED_CLAIM_EVENT: Symbol = symbol_short!("vclaim");

// ── 2-step admin transfer (issue #281) ───────────────────────────────────────
// `PENDING_ADMIN` holds an in-flight proposed admin; the new admin must call
// `accept_admin()` themselves to complete the rotation, eliminating the
// "wrong address, key now lost" failure mode of a one-step transfer.
const PENDING_ADMIN: Symbol = symbol_short!("padmin");
const ADMIN_PROPOSED_EVENT: Symbol = symbol_short!("aproposed");
const ADMIN_ACCEPTED_EVENT: Symbol = symbol_short!("aaccepted");

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

/// Check caller's rate limit and increment their count for the current window.
/// `n_calls` is how many calls to count (1 for credit, N for batch_credit).
fn check_and_increment_rate(env: &Env, caller: &Address, n_calls: u32) -> Result<(), Error> {
    let max_calls: u32 = env.storage().instance().get(&RATE_LIM_MAX).unwrap_or(0);
    if max_calls == 0 {
        return Ok(());
    }
    let window_ledgers: u32 = env.storage().instance().get(&RATE_LIM_WIN).unwrap_or(1);
    let current_ledger = env.ledger().sequence();
    let window_start = current_ledger.checked_div(window_ledgers).unwrap_or(0);
    let rate_key = (RATE, caller.clone(), window_start);
    let count: u32 = env.storage().instance().get(&rate_key).unwrap_or(0);
    if count.saturating_add(n_calls) > max_calls {
        return Err(Error::RateLimitExceeded);
    }
    env.storage().instance().set(&rate_key, &(count + n_calls));
    Ok(())
}

/// Compute unlocked amount for a vesting record at `now` (current ledger sequence).
fn compute_unlocked(now: u32, record: &VestingRecord) -> u64 {
    if now <= record.start_ledger {
        return 0;
    }
    if now >= record.end_ledger {
        return record.total;
    }
    let elapsed = (now - record.start_ledger) as u128;
    let duration = (record.end_ledger - record.start_ledger) as u128;
    let total = record.total as u128;
    let unlocked = total * elapsed / duration;
    (unlocked.min(record.total as u128)) as u64
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
        env.storage()
            .instance()
            .set(&SCHEMA_VERSION, &CURRENT_SCHEMA_VERSION);
        Ok(())
    }

    /// Returns the active storage schema version for this contract.
    pub fn schema_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&SCHEMA_VERSION)
            .unwrap_or(CURRENT_SCHEMA_VERSION)
    }

    /// Migration entrypoint for future schema changes.
    ///
    /// Current behavior is intentionally idempotent for version `1`, so operational
    /// scripts can call this safely during deployments/upgrades.
    pub fn migrate(env: Env, admin: Address, target_version: u32) -> Result<u32, Error> {
        require_admin(&env, &admin)?;
        if target_version != CURRENT_SCHEMA_VERSION {
            return Err(Error::UnsupportedMigration);
        }
        env.storage()
            .instance()
            .set(&SCHEMA_VERSION, &CURRENT_SCHEMA_VERSION);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(CURRENT_SCHEMA_VERSION)
    }

    /// Set maximum amount allowed per single credit call (admin only).
    /// Set to 0 to disable the limit.
    pub fn set_max_credit_per_call(env: Env, admin: Address, max_amount: u64) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&MAX_CREDIT_PER_CALL, &max_amount);
        env.events().publish((MAX_CREDIT_EVENT,), max_amount);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Get maximum amount allowed per single credit call (0 means unlimited).
    pub fn max_credit_per_call(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&MAX_CREDIT_PER_CALL)
            .unwrap_or(0)
    }

    /// Set campaign-specific reward multiplier in basis points (admin only).
    /// Example: 10_000 = 1.0x, 12_500 = 1.25x, 5_000 = 0.5x.
    pub fn set_campaign_multiplier(
        env: Env,
        admin: Address,
        campaign_id: u64,
        multiplier_bps: u32,
    ) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        if multiplier_bps == 0 {
            return Err(Error::InvalidMultiplier);
        }
        env.storage()
            .instance()
            .set(&(CAMPAIGN_MULTIPLIER, campaign_id), &multiplier_bps);
        env.events()
            .publish((CAMPAIGN_MULTIPLIER_EVENT, campaign_id), multiplier_bps);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Returns multiplier in basis points for campaign, defaults to 10_000.
    pub fn campaign_multiplier(env: Env, campaign_id: u64) -> u32 {
        env.storage()
            .instance()
            .get(&(CAMPAIGN_MULTIPLIER, campaign_id))
            .unwrap_or(10_000)
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
        check_and_increment_rate(&env, &from, 1)?;

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
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(new_balance)
    }

    /// Credit points using campaign multiplier. Rounding uses floor division:
    /// `adjusted = base_amount * multiplier_bps / 10_000`.
    pub fn credit_for_campaign(
        env: Env,
        from: Address,
        user: Address,
        campaign_id: u64,
        base_amount: u64,
    ) -> Result<u64, Error> {
        let multiplier_bps: u32 = env
            .storage()
            .instance()
            .get(&(CAMPAIGN_MULTIPLIER, campaign_id))
            .unwrap_or(10_000);
        if multiplier_bps == 0 {
            return Err(Error::InvalidMultiplier);
        }
        let adjusted_u128 = (base_amount as u128)
            .checked_mul(multiplier_bps as u128)
            .ok_or(Error::Overflow)?
            / BPS_DENOMINATOR;
        if adjusted_u128 > u64::MAX as u128 {
            return Err(Error::Overflow);
        }
        let adjusted = adjusted_u128 as u64;
        Self::credit(env, from, user, adjusted)
    }

    /// Credit points to multiple users in one call.
    /// Each recipient counts as one call toward the rate limit.
    pub fn batch_credit(
        env: Env,
        from: Address,
        recipients: Vec<(Address, u64)>,
    ) -> Result<(), Error> {
        from.require_auth();
        ensure_not_paused(&env)?;
        check_and_increment_rate(&env, &from, recipients.len())?;

        let mut staged = Vec::new(&env);

        for (user, amount) in recipients.iter() {
            let key = (BALANCE, user.clone());
            let current: u64 = env.storage().instance().get(&key).unwrap_or(0);
            let new_balance = current.checked_add(amount).ok_or(Error::Overflow)?;
            staged.push_back((user, new_balance));
        }

        for (user, new_balance) in staged.iter() {
            env.storage()
                .instance()
                .set(&(BALANCE, user.clone()), &new_balance);
        }

        for (user, amount) in recipients.iter() {
            env.events().publish((CREDIT_EVENT, user), amount);
        }

        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
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
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
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

        let from_key = (BALANCE, from.clone());
        let from_balance: u64 = env.storage().instance().get(&from_key).unwrap_or(0);
        let new_from_balance = from_balance
            .checked_sub(amount)
            .ok_or(Error::InsufficientBalance)?;
        env.storage().instance().set(&from_key, &new_from_balance);

        let to_key = (BALANCE, to.clone());
        let to_balance: u64 = env.storage().instance().get(&to_key).unwrap_or(0);
        let new_to_balance = to_balance.checked_add(amount).ok_or(Error::Overflow)?;
        env.storage().instance().set(&to_key, &new_to_balance);

        env.events().publish((TRANSFER_EVENT, from, to), amount);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    // ── Admin rotation (issue #281) ──────────────────────────────────────────

    /// Return the current admin address.
    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&ADMIN).unwrap()
    }

    /// Return the pending admin address proposed by the current admin, if any.
    /// `None` when there is no in-flight transfer.
    pub fn pending_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&PENDING_ADMIN)
    }

    /// Propose a new admin (current admin only). The transfer does not take
    /// effect until `accept_admin` is called by the new admin.
    ///
    /// Calling again overwrites the previous pending admin, so the current
    /// admin can cancel a proposal by calling `cancel_admin_transfer` or by
    /// proposing themselves.
    pub fn propose_admin(
        env: Env,
        current_admin: Address,
        new_admin: Address,
    ) -> Result<(), Error> {
        require_admin(&env, &current_admin)?;
        env.storage().instance().set(&PENDING_ADMIN, &new_admin);
        env.events()
            .publish((ADMIN_PROPOSED_EVENT, current_admin), new_admin);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Accept admin role. Caller MUST be the address that the current admin
    /// previously proposed via `propose_admin`. Clears the pending slot on
    /// success.
    pub fn accept_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        new_admin.require_auth();
        let pending: Address = env
            .storage()
            .instance()
            .get(&PENDING_ADMIN)
            .ok_or(Error::NoPendingAdmin)?;
        if pending != new_admin {
            return Err(Error::Unauthorized);
        }
        env.storage().instance().set(&ADMIN, &new_admin);
        env.storage().instance().remove(&PENDING_ADMIN);
        env.events()
            .publish((ADMIN_ACCEPTED_EVENT,), new_admin);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Cancel an in-flight admin transfer (current admin only).
    pub fn cancel_admin_transfer(env: Env, current_admin: Address) -> Result<(), Error> {
        require_admin(&env, &current_admin)?;
        env.storage().instance().remove(&PENDING_ADMIN);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Pause the contract (admin only). Blocks credit and claim operations.
    pub fn set_paused(env: Env, admin: Address, paused: bool) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        env.storage().instance().set(&PAUSED, &paused);
        env.events().publish((PAUSED_EVENT,), paused);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Check if contract is paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&PAUSED).unwrap_or(false)
    }

    /// Configure tiered reward distribution for a campaign (admin only).
    pub fn set_tiers(
        env: Env,
        admin: Address,
        campaign_id: u64,
        tiers: Vec<(u64, u64)>,
    ) -> Result<(), Error> {
        require_admin(&env, &admin)?;

        let sorted = sort_tiers(&env, tiers);
        env.storage().instance().set(&(TIERS, campaign_id), &sorted);

        env.events()
            .publish((Symbol::new(&env, "set_tiers"), campaign_id), ());
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Clear configured tiers for a campaign (admin only).
    pub fn clear_tiers(env: Env, admin: Address, campaign_id: u64) -> Result<(), Error> {
        require_admin(&env, &admin)?;

        env.storage().instance().remove(&(TIERS, campaign_id));

        env.events()
            .publish((Symbol::new(&env, "clear_tiers"), campaign_id), ());
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Get points reward for a given rank under a campaign.
    pub fn get_tier_for_rank(env: Env, rank: u64, campaign_id: u64) -> u64 {
        let tiers_opt: Option<Vec<(u64, u64)>> =
            env.storage().instance().get(&(TIERS, campaign_id));
        if let Some(tiers) = tiers_opt {
            for (max_rank, points) in tiers.iter() {
                if max_rank > 0 {
                    if rank <= max_rank {
                        return points;
                    }
                } else if max_rank == 0 {
                    return points;
                }
            }
        }
        0
    }

    /// Credit points to a user based on their rank.
    pub fn credit_by_rank(
        env: Env,
        from: Address,
        user: Address,
        rank: u64,
        campaign_id: u64,
    ) -> Result<u64, Error> {
        from.require_auth();
        ensure_not_paused(&env)?;

        let points = Self::get_tier_for_rank(env.clone(), rank, campaign_id);
        let new_balance = Self::credit(env.clone(), from, user.clone(), points)?;

        env.events()
            .publish((Symbol::new(&env, "tier_credit"), user), (rank, points));

        Ok(new_balance)
    }

    // ── Rate Limiting (issue #324) ────────────────────────────────────────────

    /// Set per-caller credit rate limit (admin only).
    /// `max_calls` credits allowed per `window_ledgers` ledger window.
    /// Set `max_calls = 0` to disable rate limiting.
    pub fn set_credit_rate_limit(
        env: Env,
        admin: Address,
        max_calls: u32,
        window_ledgers: u32,
    ) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        env.storage().instance().set(&RATE_LIM_MAX, &max_calls);
        env.storage().instance().set(&RATE_LIM_WIN, &window_ledgers);
        env.events()
            .publish((RATE_LIM_SET_EVENT,), (max_calls, window_ledgers));
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Get the current rate limit config: `(max_calls, window_ledgers)`.
    /// Returns `(0, 0)` when no limit is configured.
    pub fn get_credit_rate_limit(env: Env) -> (u32, u32) {
        let max_calls: u32 = env.storage().instance().get(&RATE_LIM_MAX).unwrap_or(0);
        let window_ledgers: u32 = env.storage().instance().get(&RATE_LIM_WIN).unwrap_or(0);
        (max_calls, window_ledgers)
    }

    /// Get the number of credit calls made by `caller` in the current window.
    pub fn credit_call_count(env: Env, caller: Address) -> u32 {
        let window_ledgers: u32 = env.storage().instance().get(&RATE_LIM_WIN).unwrap_or(1);
        let current_ledger = env.ledger().sequence();
        let window_start = if window_ledgers > 0 {
            current_ledger.checked_div(window_ledgers).unwrap_or(0)
        } else {
            0u32
        };
        let rate_key = (RATE, caller, window_start);
        env.storage().instance().get(&rate_key).unwrap_or(0)
    }

    // ── Snapshot (issue #325) ─────────────────────────────────────────────────

    /// Record the current ledger number under `snapshot_id` (admin only).
    /// Does NOT copy balances — stores a ledger reference for off-chain indexing.
    /// Off-chain indexers can use the ledger number with Horizon `getLedgerEntries`
    /// to reconstruct balances at that point in time.
    pub fn snapshot(env: Env, admin: Address, snapshot_id: u64) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        let ledger_number = env.ledger().sequence() as u64;
        env.storage()
            .instance()
            .set(&(SNAPSHOT, snapshot_id), &ledger_number);

        let mut list: Vec<(u64, u64)> = env
            .storage()
            .instance()
            .get(&SNAP_LIST)
            .unwrap_or_else(|| Vec::new(&env));
        list.push_back((snapshot_id, ledger_number));
        env.storage().instance().set(&SNAP_LIST, &list);

        env.events()
            .publish((SNAPSHOT_EVENT, snapshot_id), ledger_number);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Returns the ledger number recorded for `snapshot_id`, or `None`.
    pub fn get_snapshot(env: Env, snapshot_id: u64) -> Option<u64> {
        env.storage().instance().get(&(SNAPSHOT, snapshot_id))
    }

    /// Returns all `(snapshot_id, ledger_number)` pairs in creation order.
    pub fn list_snapshots(env: Env) -> Vec<(u64, u64)> {
        env.storage()
            .instance()
            .get(&SNAP_LIST)
            .unwrap_or_else(|| Vec::new(&env))
    }

    // ── Vesting (issue #326) ──────────────────────────────────────────────────

    /// Credit a linearly-vesting amount to a user (authorized caller only).
    /// Vesting is linear: `unlocked = total * (now - start_ledger) / (end_ledger - start_ledger)`.
    /// Returns the new vest_id for this schedule.
    pub fn credit_vested(
        env: Env,
        from: Address,
        user: Address,
        total_amount: u64,
        start_ledger: u32,
        end_ledger: u32,
    ) -> Result<u64, Error> {
        from.require_auth();
        ensure_not_paused(&env)?;

        let vest_ctr_key = (VEST_CTR, user.clone());
        let vest_id: u64 = env.storage().instance().get(&vest_ctr_key).unwrap_or(0);
        let next_vest_id = vest_id + 1;

        let record = VestingRecord {
            total: total_amount,
            start_ledger,
            end_ledger,
            claimed: 0,
        };
        env.storage()
            .instance()
            .set(&(VEST, user.clone(), vest_id), &record);
        env.storage().instance().set(&vest_ctr_key, &next_vest_id);

        let vest_ids_key = (VEST_IDS, user.clone());
        let mut ids: Vec<u64> = env
            .storage()
            .instance()
            .get(&vest_ids_key)
            .unwrap_or_else(|| Vec::new(&env));
        ids.push_back(vest_id);
        env.storage().instance().set(&vest_ids_key, &ids);

        env.events()
            .publish((VESTED_CREDIT_EVENT, user), (vest_id, total_amount));
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(vest_id)
    }

    /// Returns the currently unlocked but unclaimed vested balance for a user
    /// across all active vesting schedules.
    pub fn vested_balance(env: Env, user: Address) -> u64 {
        let vest_ids_key = (VEST_IDS, user.clone());
        let ids: Vec<u64> = env
            .storage()
            .instance()
            .get(&vest_ids_key)
            .unwrap_or_else(|| Vec::new(&env));
        let now = env.ledger().sequence();
        let mut total_available = 0u64;
        for vest_id in ids.iter() {
            let key = (VEST, user.clone(), vest_id);
            if let Some(record) = env.storage().instance().get::<_, VestingRecord>(&key) {
                let unlocked = compute_unlocked(now, &record);
                let available = unlocked.saturating_sub(record.claimed);
                total_available = total_available.saturating_add(available);
            }
        }
        total_available
    }

    /// Claim up to `amount` from the unlocked portion of a specific vesting schedule.
    /// Returns the remaining claimable amount in that vest schedule after this claim.
    pub fn claim_vested(env: Env, user: Address, vest_id: u64, amount: u64) -> Result<u64, Error> {
        user.require_auth();
        ensure_not_paused(&env)?;

        let key = (VEST, user.clone(), vest_id);
        let mut record: VestingRecord = env
            .storage()
            .instance()
            .get(&key)
            .ok_or(Error::VestingNotFound)?;

        let now = env.ledger().sequence();
        let unlocked = compute_unlocked(now, &record);
        let available = unlocked.saturating_sub(record.claimed);

        if amount > available {
            return Err(Error::InsufficientBalance);
        }

        record.claimed = record.claimed.checked_add(amount).ok_or(Error::Overflow)?;
        env.storage().instance().set(&key, &record);

        env.events()
            .publish((VESTED_CLAIM_EVENT, user), (vest_id, amount));
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(available - amount)
    }

    /// Returns the sum of all vesting schedule totals for a user (vested + unvested).
    pub fn total_vested(env: Env, user: Address) -> u64 {
        let vest_ids_key = (VEST_IDS, user.clone());
        let ids: Vec<u64> = env
            .storage()
            .instance()
            .get(&vest_ids_key)
            .unwrap_or_else(|| Vec::new(&env));
        let mut total = 0u64;
        for vest_id in ids.iter() {
            let key = (VEST, user.clone(), vest_id);
            if let Some(record) = env.storage().instance().get::<_, VestingRecord>(&key) {
                total = total.saturating_add(record.total);
            }
        }
        total
    }
}

fn sort_tiers(_env: &Env, tiers: Vec<(u64, u64)>) -> Vec<(u64, u64)> {
    let mut sorted = tiers.clone();
    let len = sorted.len();
    if len <= 1 {
        return sorted;
    }

    for i in 0..len {
        for j in 0..len - 1 - i {
            let (rank_a, points_a) = sorted.get(j).unwrap();
            let (rank_b, points_b) = sorted.get(j + 1).unwrap();

            let swap = rank_b != 0 && (rank_a == 0 || rank_a > rank_b);

            if swap {
                sorted.set(j, (rank_b, points_b));
                sorted.set(j + 1, (rank_a, points_a));
            }
        }
    }
    sorted
}

#[cfg(test)]
mod test;
