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
//! - `redeem`: topics `(redeem, user)`, data `(points_burned: u64, asset_amount: i128)`
//! - `ref_config`: topics `(refcfg,)`, data `(rate_bps: u32, per_referrer_cap: u64)`
//! - `ref_bonus`: topics `(refbonus, referrer, referee)`, data `(bonus: u64, qualifying_amount: u64)`
//! - `pruned`: topics `(pruned, kind)`, data `count: u32`
//!
//! ## Storage pruning
//!
//! Multisig nonce records are not bumped indefinitely on Soroban;
//! [`RewardsContract::prune_used_nonces`] lets anyone reclaim storage for
//! nonces past their TTL, in capped batches. [`RewardsContract::storage_stats`]
//! reports current usage for monitoring.
//!
//! ## Co-admin multisig
//!
//! `set_paused` is a critical operation: once a threshold is configured via
//! `set_multisig_threshold`, it requires at least that many valid co-admin
//! signatures (registered via `add_co_admin`) over `(op, nonce, args_hash)`,
//! verified with ed25519. The nonce is consumed on use regardless of how many
//! signers participated.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contractmeta, contracttype, symbol_short, Address,
    Bytes, BytesN, Env, Symbol, Vec,
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
    InsufficientReserve = 11,
    InvalidRedemptionRate = 12,
    InvalidAdminNonce = 13,
    /// A referrer and referee cannot be the same address.
    SelfReferral = 14,
    /// The referee was previously rewarded as a referee of this referrer (cycle).
    CircularReferral = 15,
    /// This referee has already triggered a referral bonus (one per referee).
    ReferralAlreadyRewarded = 16,
    /// Paying this bonus would exceed the configured per-referrer cap.
    ReferralCapExceeded = 17,
    /// Referral rewards have not been configured (bonus rate is zero).
    ReferralNotConfigured = 18,
    /// The supplied referral configuration is invalid.
    InvalidReferralConfig = 19,
    /// The computed referral bonus rounded down to zero.
    ZeroReferralBonus = 20,
    /// SEP-41 token mode is not enabled.
    TokenModeNotEnabled = 21,
    /// SEP-41: allowance not sufficient for transfer_from.
    AllowanceExceeded = 22,
    /// SEP-41: approval expiration ledger has passed.
    ApprovalExpired = 23,
    /// SEP-41: invalid expiration ledger (must be > current ledger).
    InvalidExpiration = 24,
    InvalidThreshold = 25,
    InsufficientSignatures = 26,
    NonceReused = 27,
    DuplicateSigner = 28,
    UnknownSigner = 29,
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
const PRUNED_EVENT: Symbol = symbol_short!("pruned");

// ── multisig nonce storage (#451 / #454) ────────────────────────────────────
const NONCE_USED: Symbol = symbol_short!("msnonce");
const NONCE_REGISTRY: Symbol = symbol_short!("nreg");
const NONCE_CURSOR: Symbol = symbol_short!("ncursor");
/// Multisig nonces older than this many ledgers are eligible for pruning.
const NONCE_TTL_LEDGERS: u32 = 10_000;

// ── co-admin multisig (#454) ────────────────────────────────────────────────
const CO_ADMINS: Symbol = symbol_short!("coadmin");
const MULTISIG_THRESHOLD: Symbol = symbol_short!("msthresh");
const OP_SET_PAUSED: u32 = 1;

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

// Redemption constants (issue #450)
const REDEMPTION_ASSET: Symbol = symbol_short!("red_asst");
const REDEMPTION_RATE: Symbol = symbol_short!("red_rate");
const REDEMPTION_RESERVE: Symbol = symbol_short!("red_rsrv");
const REDEEM_EVENT: Symbol = symbol_short!("redeem");

// Admin nonce — incremented on each admin operation to prevent replay attacks.
const ADMIN_NONCE: Symbol = symbol_short!("anonce");

// ── 2-step admin transfer (issue #281) ───────────────────────────────────────
// `PENDING_ADMIN` holds an in-flight proposed admin; the new admin must call
// `accept_admin()` themselves to complete the rotation, eliminating the
// "wrong address, key now lost" failure mode of a one-step transfer.
const PENDING_ADMIN: Symbol = symbol_short!("padmin");
const ADMIN_PROPOSED_EVENT: Symbol = symbol_short!("aproposed");
const ADMIN_ACCEPTED_EVENT: Symbol = symbol_short!("aaccepted");

// ── On-chain referral rewards (issue #656 / #603) ────────────────────────────
// The referral *graph* (who referred whom) is attributed by the campaign
// contract; this contract owns the *payout* and its anti-abuse invariants:
// self/circular blocking, one-bonus-per-referee uniqueness (the sybil gate),
// and a configurable per-referrer cap. Referral state lives in instance storage
// alongside balances, matching the existing crediting model.
const REF_RATE: Symbol = symbol_short!("refrate"); // u32 bonus rate, basis points
const REF_CAP: Symbol = symbol_short!("refcap"); // u64 cumulative cap per referrer (0 = uncapped)
const REF_PAID: Symbol = symbol_short!("refpaid"); // (REF_PAID, referee) -> referrer Address
const REF_TOTAL: Symbol = symbol_short!("reftotal"); // (REF_TOTAL, referrer) -> u64 cumulative bonus
const REF_COUNT: Symbol = symbol_short!("refcount"); // (REF_COUNT, referrer) -> u64 referrals rewarded
const REF_CONFIG_EVENT: Symbol = symbol_short!("refcfg");
const REF_BONUS_EVENT: Symbol = symbol_short!("refbonus");
// Upper bound on the configurable rate (1000%) to guard against fat-finger
// configuration and keep `qualifying_amount * rate_bps` comfortably in range.
const MAX_REFERRAL_RATE_BPS: u32 = 100_000;

// ── SEP-41 Token Interface (issue #530) ─────────────────────────────────────
// Optional token-backed mode where reward points are SEP-41-compliant tokens.
// When token_mode is enabled, the contract exposes standard token functions.
const TOKEN_MODE: Symbol = symbol_short!("tokmode");
const TOKEN_DECIMALS: Symbol = symbol_short!("tokdec");
const TOKEN_NAME: Symbol = symbol_short!("tokname");
const TOKEN_SYMBOL: Symbol = symbol_short!("toksym");
const ALLOWANCE: Symbol = symbol_short!("allow");

// SEP-41 Events
const SEP41_TRANSFER_EVENT: Symbol = symbol_short!("transfer");
const SEP41_APPROVE_EVENT: Symbol = symbol_short!("approve");
const SEP41_BURN_EVENT: Symbol = symbol_short!("burn");

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

fn require_admin_with_nonce(env: &Env, admin: &Address, nonce: i128) -> Result<(), Error> {
    admin.require_auth();

    let stored_admin: Address = env.storage().instance().get(&ADMIN).unwrap();
    if &stored_admin != admin {
        return Err(Error::Unauthorized);
    }

    let current: i128 = env.storage().instance().get(&ADMIN_NONCE).unwrap_or(0);
    if nonce != current {
        return Err(Error::InvalidAdminNonce);
    }
    env.storage().instance().set(&ADMIN_NONCE, &(current + 1));

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

/// Build the signed payload for a multisig operation: `sha256(op || nonce || args_hash)`.
/// `op` is a stable per-function discriminant used in place of the function
/// name string (Symbol byte access is not available in `no_std`).
fn multisig_message(env: &Env, op: u32, nonce: u64, args_hash: &BytesN<32>) -> Bytes {
    let mut buf = [0u8; 44];
    buf[0..4].copy_from_slice(&op.to_be_bytes());
    buf[4..12].copy_from_slice(&nonce.to_be_bytes());
    buf[12..44].copy_from_slice(&args_hash.to_array());
    Bytes::from_slice(env, &buf)
}

/// Verify at least `required` distinct co-admin signatures over
/// `(op, nonce, args_hash)`, then consume `nonce` for replay protection.
/// The nonce is consumed regardless of how many signers submitted.
fn verify_multisig(
    env: &Env,
    op: u32,
    args_hash: BytesN<32>,
    nonce: u64,
    signatures: &Vec<(Address, BytesN<64>)>,
) -> Result<(), Error> {
    let required: u32 = env.storage().instance().get(&MULTISIG_THRESHOLD).unwrap_or(0);
    if required == 0 {
        return Ok(());
    }

    let nonce_key = (NONCE_USED, nonce);
    if env.storage().instance().get::<_, u32>(&nonce_key).is_some() {
        return Err(Error::NonceReused);
    }

    let co_admins: Vec<(Address, BytesN<32>)> =
        env.storage().instance().get(&CO_ADMINS).unwrap_or(Vec::new(env));
    let message = multisig_message(env, op, nonce, &args_hash);

    let mut seen: Vec<Address> = Vec::new(env);
    for (signer, sig) in signatures.iter() {
        if seen.iter().any(|s| s == signer) {
            return Err(Error::DuplicateSigner);
        }
        let pubkey = co_admins
            .iter()
            .find_map(|(addr, key)| if addr == signer { Some(key) } else { None })
            .ok_or(Error::UnknownSigner)?;
        env.crypto().ed25519_verify(&pubkey, &message, &sig);
        seen.push_back(signer.clone());
    }

    if seen.len() < required {
        return Err(Error::InsufficientSignatures);
    }

    env.storage().instance().set(&nonce_key, &env.ledger().sequence());
    let mut registry: Vec<u64> = env.storage().instance().get(&NONCE_REGISTRY).unwrap_or(Vec::new(env));
    registry.push_back(nonce);
    env.storage().instance().set(&NONCE_REGISTRY, &registry);
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
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(CURRENT_SCHEMA_VERSION)
    }

    /// Replace the contract WASM in-place without resetting participant state.
    ///
    /// Calls `contract_update_current_contract_wasm` with the supplied hash of
    /// the new WASM blob.  Balances and vesting records in persistent storage
    /// survive because Soroban WASM-only upgrades never touch storage.
    /// Requires admin auth and a valid nonce so upgrades are replay-safe.
    ///
    /// Typical workflow (issue #518):
    ///   1. Upload new WASM → obtain `new_wasm_hash`.
    ///   2. Call `upgrade(admin, nonce, new_wasm_hash)`.
    ///   3. If storage layout changed, call `migrate(admin, target_version)`.
    pub fn upgrade(env: Env, admin: Address, nonce: i128, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        require_admin_with_nonce(&env, &admin, nonce)?;
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    /// Set maximum amount allowed per single credit call (admin only).
    /// Set to 0 to disable the limit.
    pub fn set_max_credit_per_call(env: Env, admin: Address, max_amount: u64) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&MAX_CREDIT_PER_CALL, &max_amount);
        env.events().publish((MAX_CREDIT_EVENT,), max_amount);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
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
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
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
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
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

        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
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
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
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
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
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
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
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
        env.events().publish((ADMIN_ACCEPTED_EVENT,), new_admin);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Cancel an in-flight admin transfer (current admin only).
    pub fn cancel_admin_transfer(env: Env, current_admin: Address) -> Result<(), Error> {
        require_admin(&env, &current_admin)?;
        env.storage().instance().remove(&PENDING_ADMIN);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Pause the contract. Blocks credit and claim operations.
    ///
    /// This is a critical operation: when a multisig threshold is configured
    /// (see [`Self::set_multisig_threshold`]), `signatures` must contain at
    /// least `required` valid co-admin signatures over
    /// `(op, nonce, sha256(paused))`; otherwise pass an empty `Vec` and the
    /// legacy single-admin check applies (`nonce` is ignored in that case).
    pub fn set_paused(
        env: Env,
        admin: Address,
        nonce: u64,
        paused: bool,
        signatures: Vec<(Address, BytesN<64>)>,
    ) -> Result<(), Error> {
        let threshold: u32 = env.storage().instance().get(&MULTISIG_THRESHOLD).unwrap_or(0);
        if threshold > 0 {
            let mut buf = [0u8; 1];
            buf[0] = paused as u8;
            let args_hash = env.crypto().sha256(&Bytes::from_slice(&env, &buf)).into();
            verify_multisig(&env, OP_SET_PAUSED, args_hash, nonce, &signatures)?;
        } else {
            require_admin(&env, &admin)?;
        }
        env.storage().instance().set(&PAUSED, &paused);
        env.events().publish((PAUSED_EVENT,), paused);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
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
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Clear configured tiers for a campaign (admin only).
    pub fn clear_tiers(env: Env, admin: Address, campaign_id: u64) -> Result<(), Error> {
        require_admin(&env, &admin)?;

        env.storage().instance().remove(&(TIERS, campaign_id));

        env.events()
            .publish((Symbol::new(&env, "clear_tiers"), campaign_id), ());
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
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
        // `Self::credit` below already calls `from.require_auth()`; calling it
        // again here would double-authorize the same address in one frame and
        // trip the host's `Auth(ExistingValue)` guard.
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
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
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
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
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
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
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
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
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

    /// Set redemption rate for points-to-asset conversion (admin only).
    /// rate_bps: how many units of asset per 10,000 points (basis points).
    /// Example: rate_bps = 100 means 100/10,000 = 0.01 asset per point.
    pub fn set_redemption_rate(
        env: Env,
        admin: Address,
        nonce: i128,
        asset: Address,
        rate_bps: u32,
    ) -> Result<(), Error> {
        require_admin_with_nonce(&env, &admin, nonce)?;

        if rate_bps == 0 {
            return Err(Error::InvalidRedemptionRate);
        }

        env.storage().instance().set(&REDEMPTION_ASSET, &asset);
        env.storage().instance().set(&REDEMPTION_RATE, &rate_bps);
        env.storage().instance().extend_ttl(50, 100);

        Ok(())
    }

    /// Get redemption rate configuration.
    /// Returns (asset_address, rate_bps) or None if not configured.
    pub fn redemption_rate(env: Env) -> Option<(Address, u32)> {
        let asset: Option<Address> = env.storage().instance().get(&REDEMPTION_ASSET);
        let rate: Option<u32> = env.storage().instance().get(&REDEMPTION_RATE);

        match (asset, rate) {
            (Some(a), Some(r)) => Some((a, r)),
            _ => None,
        }
    }

    /// Get current redemption reserve balance.
    pub fn redemption_reserve(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&REDEMPTION_RESERVE)
            .unwrap_or(0)
    }

    /// Alias for redemption_reserve — returns the current payout reserve balance.
    pub fn payout_reserve_balance(env: Env) -> i128 {
        Self::redemption_reserve(env) as i128
    }

    /// Redeem points for asset tokens.
    /// Burns points_amount from user balance, transfers asset tokens to user.
    /// Returns the amount of asset tokens transferred.
    pub fn redeem(env: Env, user: Address, points_amount: u64) -> Result<i128, Error> {
        user.require_auth();
        ensure_not_paused(&env)?;

        // Get redemption config
        let asset_address: Address = env
            .storage()
            .instance()
            .get(&REDEMPTION_ASSET)
            .ok_or(Error::InvalidRedemptionRate)?;

        let rate_bps: u32 = env
            .storage()
            .instance()
            .get(&REDEMPTION_RATE)
            .ok_or(Error::InvalidRedemptionRate)?;

        // Calculate asset amount: points_amount * rate_bps / 10_000
        let asset_amount_u128 = (points_amount as u128)
            .checked_mul(rate_bps as u128)
            .ok_or(Error::Overflow)?
            / BPS_DENOMINATOR;

        if asset_amount_u128 > i128::MAX as u128 {
            return Err(Error::Overflow);
        }
        let asset_amount = asset_amount_u128 as i128;

        // Check reserve
        let current_reserve: u64 = env
            .storage()
            .instance()
            .get(&REDEMPTION_RESERVE)
            .unwrap_or(0);
        if (asset_amount as u64) > current_reserve {
            return Err(Error::InsufficientReserve);
        }

        // Burn points from user balance
        let balance_key = (BALANCE, user.clone());
        let current_balance: u64 = env.storage().instance().get(&balance_key).unwrap_or(0);
        let new_balance = current_balance
            .checked_sub(points_amount)
            .ok_or(Error::InsufficientBalance)?;
        env.storage().instance().set(&balance_key, &new_balance);

        // Update reserve
        let new_reserve = current_reserve.saturating_sub(asset_amount as u64);
        env.storage()
            .instance()
            .set(&REDEMPTION_RESERVE, &new_reserve);

        // Transfer asset tokens to user using SAC
        use soroban_sdk::token;
        let token_client = token::Client::new(&env, &asset_address);
        token_client.transfer(&env.current_contract_address(), &user, &asset_amount);

        // Emit redeem event
        env.events()
            .publish((REDEEM_EVENT, user), (points_amount, asset_amount));
        env.storage().instance().extend_ttl(50, 100);

        Ok(asset_amount)
    }

    /// Withdraw asset tokens from redemption reserve (admin only).
    /// Used to reclaim unredeemed assets.
    pub fn withdraw_reserve(
        env: Env,
        admin: Address,
        nonce: i128,
        amount: u64,
    ) -> Result<(), Error> {
        require_admin_with_nonce(&env, &admin, nonce)?;

        let asset_address: Address = env
            .storage()
            .instance()
            .get(&REDEMPTION_ASSET)
            .ok_or(Error::InvalidRedemptionRate)?;

        let current_reserve: u64 = env
            .storage()
            .instance()
            .get(&REDEMPTION_RESERVE)
            .unwrap_or(0);
        if amount > current_reserve {
            return Err(Error::InsufficientReserve);
        }

        let new_reserve = current_reserve.saturating_sub(amount);
        env.storage()
            .instance()
            .set(&REDEMPTION_RESERVE, &new_reserve);

        // Transfer tokens to admin
        use soroban_sdk::token;
        let token_client = token::Client::new(&env, &asset_address);
        token_client.transfer(&env.current_contract_address(), &admin, &(amount as i128));

        env.storage().instance().extend_ttl(50, 100);
        Ok(())
    }

    /// Fund redemption reserve (callable by anyone, typically admin).
    /// Transfers asset tokens from caller to contract reserve.
    pub fn fund_reserve(env: Env, from: Address, amount: u64) -> Result<(), Error> {
        from.require_auth();

        let asset_address: Address = env
            .storage()
            .instance()
            .get(&REDEMPTION_ASSET)
            .ok_or(Error::InvalidRedemptionRate)?;

        // Transfer tokens from caller to contract
        use soroban_sdk::token;
        let token_client = token::Client::new(&env, &asset_address);
        token_client.transfer(&from, env.current_contract_address(), &(amount as i128));

        // Update reserve
        let current_reserve: u64 = env
            .storage()
            .instance()
            .get(&REDEMPTION_RESERVE)
            .unwrap_or(0);
        let new_reserve = current_reserve.checked_add(amount).ok_or(Error::Overflow)?;
        env.storage()
            .instance()
            .set(&REDEMPTION_RESERVE, &new_reserve);

        env.storage().instance().extend_ttl(50, 100);
        Ok(())
    }

    // ── Referral rewards ─────────────────────────────────────────────────────

    /// Configure the on-chain referral reward engine (admin only).
    ///
    /// `rate_bps` is the referrer bonus as basis points of a referee's
    /// qualifying amount (`bonus = qualifying_amount * rate_bps / 10_000`) and
    /// must be in `1..=MAX_REFERRAL_RATE_BPS`. `per_referrer_cap` is the maximum
    /// cumulative bonus a single referrer may earn; `0` means uncapped.
    pub fn set_referral_config(
        env: Env,
        admin: Address,
        rate_bps: u32,
        per_referrer_cap: u64,
    ) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        if rate_bps == 0 || rate_bps > MAX_REFERRAL_RATE_BPS {
            return Err(Error::InvalidReferralConfig);
        }
        env.storage().instance().set(&REF_RATE, &rate_bps);
        env.storage().instance().set(&REF_CAP, &per_referrer_cap);
        env.events()
            .publish((REF_CONFIG_EVENT,), (rate_bps, per_referrer_cap));
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Returns the referral configuration as `(rate_bps, per_referrer_cap)`.
    /// Defaults to `(0, 0)` when referral rewards have not been configured.
    pub fn referral_config(env: Env) -> (u32, u64) {
        let rate: u32 = env.storage().instance().get(&REF_RATE).unwrap_or(0);
        let cap: u64 = env.storage().instance().get(&REF_CAP).unwrap_or(0);
        (rate, cap)
    }

    /// Pay a referrer the configured bonus for a referee's qualifying action
    /// (admin only). Enforces the anti-abuse invariants on-chain:
    ///
    /// - **self-referral**: `referrer == referee` is rejected.
    /// - **circular**: rejected when `referrer` was itself previously rewarded as
    ///   a referee of `referee` (an `A → B` then `B → A` cycle).
    /// - **uniqueness / sybil gate**: each `referee` can trigger at most one
    ///   referral bonus, ever — making the payout idempotent and all-or-nothing.
    /// - **per-referrer cap**: the referrer's cumulative bonus may not exceed the
    ///   configured cap.
    ///
    /// On success the bonus is credited to `referrer`'s balance (emitting the
    /// standard `credit` event so balance indexers stay consistent) and a
    /// `ref_bonus` event is published for attribution/instrumentation. Returns
    /// the bonus amount credited.
    pub fn pay_referral_bonus(
        env: Env,
        admin: Address,
        referrer: Address,
        referee: Address,
        qualifying_amount: u64,
    ) -> Result<u64, Error> {
        require_admin(&env, &admin)?;
        ensure_not_paused(&env)?;

        let rate_bps: u32 = env.storage().instance().get(&REF_RATE).unwrap_or(0);
        if rate_bps == 0 {
            return Err(Error::ReferralNotConfigured);
        }
        if referrer == referee {
            return Err(Error::SelfReferral);
        }

        // Uniqueness / replay: a referee may only ever be rewarded once.
        let referee_key = (REF_PAID, referee.clone());
        let already: Option<Address> = env.storage().instance().get(&referee_key);
        if already.is_some() {
            return Err(Error::ReferralAlreadyRewarded);
        }

        // Circular: reject if the referrer was previously rewarded as a referee
        // of this referee (A referred B; now B is trying to refer A).
        let prior_for_referrer: Option<Address> =
            env.storage().instance().get(&(REF_PAID, referrer.clone()));
        if prior_for_referrer == Some(referee.clone()) {
            return Err(Error::CircularReferral);
        }

        // bonus = qualifying_amount * rate_bps / 10_000 (floor division).
        let bonus_u128 = (qualifying_amount as u128)
            .checked_mul(rate_bps as u128)
            .ok_or(Error::Overflow)?
            / BPS_DENOMINATOR;
        if bonus_u128 > u64::MAX as u128 {
            return Err(Error::Overflow);
        }
        let bonus = bonus_u128 as u64;
        if bonus == 0 {
            return Err(Error::ZeroReferralBonus);
        }

        // Per-referrer cap (0 = uncapped).
        let cap: u64 = env.storage().instance().get(&REF_CAP).unwrap_or(0);
        let prior_total: u64 = env
            .storage()
            .instance()
            .get(&(REF_TOTAL, referrer.clone()))
            .unwrap_or(0);
        let new_total = prior_total.checked_add(bonus).ok_or(Error::Overflow)?;
        if cap > 0 && new_total > cap {
            return Err(Error::ReferralCapExceeded);
        }

        // Credit the referrer's balance (same storage as `credit`).
        let balance_key = (BALANCE, referrer.clone());
        let current: u64 = env.storage().instance().get(&balance_key).unwrap_or(0);
        let new_balance = current.checked_add(bonus).ok_or(Error::Overflow)?;
        env.storage().instance().set(&balance_key, &new_balance);

        // Record attribution edge + per-referrer counters.
        env.storage().instance().set(&referee_key, &referrer);
        env.storage()
            .instance()
            .set(&(REF_TOTAL, referrer.clone()), &new_total);
        let prior_count: u64 = env
            .storage()
            .instance()
            .get(&(REF_COUNT, referrer.clone()))
            .unwrap_or(0);
        env.storage().instance().set(
            &(REF_COUNT, referrer.clone()),
            &prior_count.saturating_add(1),
        );

        env.events()
            .publish((CREDIT_EVENT, referrer.clone()), bonus);
        env.events().publish(
            (REF_BONUS_EVENT, referrer, referee),
            (bonus, qualifying_amount),
        );
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(bonus)
    }

    /// Cumulative referral bonus credited to `referrer`.
    pub fn referral_bonus_total(env: Env, referrer: Address) -> u64 {
        env.storage()
            .instance()
            .get(&(REF_TOTAL, referrer))
            .unwrap_or(0)
    }

    /// Number of referees `referrer` has been rewarded for.
    pub fn referral_reward_count(env: Env, referrer: Address) -> u64 {
        env.storage()
            .instance()
            .get(&(REF_COUNT, referrer))
            .unwrap_or(0)
    }

    /// The referrer that was rewarded for `referee`, if any.
    pub fn rewarded_referrer_of(env: Env, referee: Address) -> Option<Address> {
        env.storage().instance().get(&(REF_PAID, referee))
    }

    // ── SEP-41 Token Interface (issue #530) ──────────────────────────────────

    /// Enable token mode (admin only). One-way: once enabled, cannot be disabled.
    /// This enables SEP-41-compliant token interface alongside existing points API.
    pub fn enable_token_mode(
        env: Env,
        admin: Address,
        name: Symbol,
        symbol: Symbol,
        decimals: u32,
    ) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        if decimals > 18 {
            return Err(Error::InvalidMultiplier);
        }
        env.storage().instance().set(&TOKEN_MODE, &true);
        env.storage().instance().set(&TOKEN_NAME, &name);
        env.storage().instance().set(&TOKEN_SYMBOL, &symbol);
        env.storage().instance().set(&TOKEN_DECIMALS, &decimals);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Check if token mode is enabled.
    pub fn is_token_mode(env: Env) -> bool {
        env.storage().instance().get(&TOKEN_MODE).unwrap_or(false)
    }

    /// SEP-41: Returns the balance of `id` as i128.
    /// Maps internal u64 points to i128 per SEP-41 standard.
    pub fn sep41_balance(env: Env, id: Address) -> i128 {
        let balance: u64 = env.storage().instance().get(&(BALANCE, id)).unwrap_or(0);
        balance as i128
    }

    /// SEP-41: Transfer `amount` from `from` to `to`.
    /// Requires authorization from `from`.
    pub fn sep41_transfer(
        env: Env,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), Error> {
        if !Self::is_token_mode(env.clone()) {
            return Err(Error::TokenModeNotEnabled);
        }
        from.require_auth();
        ensure_not_paused(&env)?;

        if amount < 0 {
            return Err(Error::Overflow);
        }
        let amount_u64 = amount as u64;

        let from_key = (BALANCE, from.clone());
        let from_balance: u64 = env.storage().instance().get(&from_key).unwrap_or(0);
        let new_from_balance = from_balance
            .checked_sub(amount_u64)
            .ok_or(Error::InsufficientBalance)?;
        env.storage().instance().set(&from_key, &new_from_balance);

        let to_key = (BALANCE, to.clone());
        let to_balance: u64 = env.storage().instance().get(&to_key).unwrap_or(0);
        let new_to_balance = to_balance.checked_add(amount_u64).ok_or(Error::Overflow)?;
        env.storage().instance().set(&to_key, &new_to_balance);

        env.events()
            .publish((SEP41_TRANSFER_EVENT, from, to), amount);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// SEP-41: Transfer `amount` from `from` to `to` using allowance.
    /// Requires authorization from `spender`.
    pub fn sep41_transfer_from(
        env: Env,
        spender: Address,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), Error> {
        if !Self::is_token_mode(env.clone()) {
            return Err(Error::TokenModeNotEnabled);
        }
        spender.require_auth();
        ensure_not_paused(&env)?;

        if amount < 0 {
            return Err(Error::Overflow);
        }
        let amount_u64 = amount as u64;

        let allowance_key = (ALLOWANCE, from.clone(), spender.clone());
        let (allowed, expiration): (u64, u32) = env
            .storage()
            .instance()
            .get(&allowance_key)
            .unwrap_or((0, 0));

        if expiration > 0 && env.ledger().sequence() > expiration {
            env.storage().instance().remove(&allowance_key);
            return Err(Error::ApprovalExpired);
        }

        if allowed < amount_u64 {
            return Err(Error::AllowanceExceeded);
        }

        let new_allowed = allowed - amount_u64;
        if new_allowed == 0 {
            env.storage().instance().remove(&allowance_key);
        } else {
            env.storage().instance().set(&allowance_key, &(new_allowed, expiration));
        }

        let from_key = (BALANCE, from.clone());
        let from_balance: u64 = env.storage().instance().get(&from_key).unwrap_or(0);
        let new_from_balance = from_balance
            .checked_sub(amount_u64)
            .ok_or(Error::InsufficientBalance)?;
        env.storage().instance().set(&from_key, &new_from_balance);

        let to_key = (BALANCE, to.clone());
        let to_balance: u64 = env.storage().instance().get(&to_key).unwrap_or(0);
        let new_to_balance = to_balance.checked_add(amount_u64).ok_or(Error::Overflow)?;
        env.storage().instance().set(&to_key, &new_to_balance);

        env.events()
            .publish((SEP41_TRANSFER_EVENT, from, to), amount);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// SEP-41: Set allowance for `spender` to spend `amount` from caller's balance.
    /// If expiration_ledger is 0, the allowance does not expire.
    pub fn sep41_approve(
        env: Env,
        from: Address,
        spender: Address,
        amount: i128,
        expiration_ledger: u32,
    ) -> Result<(), Error> {
        if !Self::is_token_mode(env.clone()) {
            return Err(Error::TokenModeNotEnabled);
        }
        from.require_auth();

        if amount < 0 {
            return Err(Error::Overflow);
        }

        if expiration_ledger > 0 && expiration_ledger <= env.ledger().sequence() {
            return Err(Error::InvalidExpiration);
        }

        let amount_u64 = amount as u64;
        let allowance_key = (ALLOWANCE, from.clone(), spender.clone());
        env.storage()
            .instance()
            .set(&allowance_key, &(amount_u64, expiration_ledger));

        env.events()
            .publish((SEP41_APPROVE_EVENT, from, spender), amount);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// SEP-41: Returns the allowance `owner` has granted to `spender`.
    pub fn sep41_allowance(env: Env, owner: Address, spender: Address) -> i128 {
        let allowance_key = (ALLOWANCE, owner, spender);
        let (allowed, _expiration): (u64, u32) = env
            .storage()
            .instance()
            .get(&allowance_key)
            .unwrap_or((0, 0));
        allowed as i128
    }

    /// SEP-41: Returns the number of decimals used for display.
    pub fn sep41_decimals(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&TOKEN_DECIMALS)
            .unwrap_or(0)
    }

    /// SEP-41: Returns the name of the token.
    pub fn sep41_name(env: Env) -> Symbol {
        env.storage()
            .instance()
            .get(&TOKEN_NAME)
            .unwrap_or_else(|| symbol_short!("Trivela"))
    }

    /// SEP-41: Returns the symbol of the token.
    pub fn sep41_symbol(env: Env) -> Symbol {
        env.storage()
            .instance()
            .get(&TOKEN_SYMBOL)
            .unwrap_or_else(|| symbol_short!("TVL"))
    }

    /// SEP-41: Burn `amount` from `from`'s balance.
    /// Requires authorization from `from`.
    pub fn sep41_burn(env: Env, from: Address, amount: i128) -> Result<(), Error> {
        if !Self::is_token_mode(env.clone()) {
            return Err(Error::TokenModeNotEnabled);
        }
        from.require_auth();
        ensure_not_paused(&env)?;

        if amount < 0 {
            return Err(Error::Overflow);
        }
        let amount_u64 = amount as u64;

        let from_key = (BALANCE, from.clone());
        let from_balance: u64 = env.storage().instance().get(&from_key).unwrap_or(0);
        let new_from_balance = from_balance
            .checked_sub(amount_u64)
            .ok_or(Error::InsufficientBalance)?;
        env.storage().instance().set(&from_key, &new_from_balance);

        let total: u64 = env.storage().instance().get(&CLAIMED).unwrap_or(0);
        env.storage()
            .instance()
            .set(&CLAIMED, &total.saturating_add(amount_u64));

        env.events()
            .publish((SEP41_BURN_EVENT, from), amount);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// SEP-41: Burn `amount` from `from`'s balance using allowance.
    /// Requires authorization from `spender`.
    pub fn sep41_burn_from(
        env: Env,
        spender: Address,
        from: Address,
        amount: i128,
    ) -> Result<(), Error> {
        if !Self::is_token_mode(env.clone()) {
            return Err(Error::TokenModeNotEnabled);
        }
        spender.require_auth();
        ensure_not_paused(&env)?;

        if amount < 0 {
            return Err(Error::Overflow);
        }
        let amount_u64 = amount as u64;

        let allowance_key = (ALLOWANCE, from.clone(), spender.clone());
        let (allowed, expiration): (u64, u32) = env
            .storage()
            .instance()
            .get(&allowance_key)
            .unwrap_or((0, 0));

        if expiration > 0 && env.ledger().sequence() > expiration {
            env.storage().instance().remove(&allowance_key);
            return Err(Error::ApprovalExpired);
        }

        if allowed < amount_u64 {
            return Err(Error::AllowanceExceeded);
        }

        let new_allowed = allowed - amount_u64;
        if new_allowed == 0 {
            env.storage().instance().remove(&allowance_key);
        } else {
            env.storage().instance().set(&allowance_key, &(new_allowed, expiration));
        }

        let from_key = (BALANCE, from.clone());
        let from_balance: u64 = env.storage().instance().get(&from_key).unwrap_or(0);
        let new_from_balance = from_balance
            .checked_sub(amount_u64)
            .ok_or(Error::InsufficientBalance)?;
        env.storage().instance().set(&from_key, &new_from_balance);

        let total: u64 = env.storage().instance().get(&CLAIMED).unwrap_or(0);
        env.storage()
            .instance()
            .set(&CLAIMED, &total.saturating_add(amount_u64));

        env.events()
            .publish((SEP41_BURN_EVENT, from), amount);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    // ── nonce pruning (#451) ─────────────────────────────────────────────

    /// Remove multisig nonce records older than [`NONCE_TTL_LEDGERS`], up to
    /// `max_entries` per call. Callable by anyone since it only deletes
    /// stale data. Returns the number of entries pruned.
    pub fn prune_used_nonces(env: Env, max_entries: u32) -> u32 {
        let registry: Vec<u64> = env
            .storage()
            .instance()
            .get(&NONCE_REGISTRY)
            .unwrap_or(Vec::new(&env));
        let len = registry.len();
        if len == 0 || max_entries == 0 {
            return 0;
        }

        let now = env.ledger().sequence();
        let mut cursor: u32 = env.storage().instance().get(&NONCE_CURSOR).unwrap_or(0);
        if cursor >= len {
            cursor = 0;
        }

        let mut pruned = 0u32;
        let mut checked = 0u32;
        let mut idx = cursor;
        while checked < len && pruned < max_entries {
            let nonce = registry.get(idx).unwrap();
            let key = (NONCE_USED, nonce);
            if let Some(used_at) = env.storage().instance().get::<_, u32>(&key) {
                if now.saturating_sub(used_at) > NONCE_TTL_LEDGERS {
                    env.storage().instance().remove(&key);
                    pruned += 1;
                }
            }
            idx = (idx + 1) % len;
            checked += 1;
        }
        env.storage().instance().set(&NONCE_CURSOR, &idx);

        if pruned > 0 {
            env.events().publish((PRUNED_EVENT, symbol_short!("nonce")), pruned);
        }
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        pruned
    }

    /// Storage stats for monitoring: `(participant_count, nonce_count, expired_estimate)`.
    /// `participant_count` is always `0` here; the rewards contract tracks
    /// balances, not participants. `expired_estimate` counts currently-stale
    /// nonce records.
    pub fn storage_stats(env: Env) -> (u64, u64, u64) {
        let registry: Vec<u64> = env
            .storage()
            .instance()
            .get(&NONCE_REGISTRY)
            .unwrap_or(Vec::new(&env));
        let nonce_count = registry.len() as u64;

        let now = env.ledger().sequence();
        let mut expired = 0u64;
        for nonce in registry.iter() {
            if let Some(used_at) = env.storage().instance().get::<_, u32>(&(NONCE_USED, nonce)) {
                if now.saturating_sub(used_at) > NONCE_TTL_LEDGERS {
                    expired += 1;
                }
            }
        }
        (0, nonce_count, expired)
    }

    // ── co-admin multisig (#454) ────────────────────────────────────────

    /// Register a co-admin's ed25519 public key for multisig verification
    /// (admin only). Overwrites the key if `co_admin` is already registered.
    pub fn add_co_admin(env: Env, admin: Address, co_admin: Address, pubkey: BytesN<32>) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        let mut co_admins: Vec<(Address, BytesN<32>)> =
            env.storage().instance().get(&CO_ADMINS).unwrap_or(Vec::new(&env));
        let mut found = false;
        for i in 0..co_admins.len() {
            let (addr, _) = co_admins.get(i).unwrap();
            if addr == co_admin {
                co_admins.set(i, (co_admin.clone(), pubkey.clone()));
                found = true;
                break;
            }
        }
        if !found {
            co_admins.push_back((co_admin, pubkey));
        }
        env.storage().instance().set(&CO_ADMINS, &co_admins);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Remove a co-admin from the multisig signer set (admin only).
    pub fn remove_co_admin(env: Env, admin: Address, co_admin: Address) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        let co_admins: Vec<(Address, BytesN<32>)> =
            env.storage().instance().get(&CO_ADMINS).unwrap_or(Vec::new(&env));
        let mut remaining = Vec::new(&env);
        for (addr, pubkey) in co_admins.iter() {
            if addr != co_admin {
                remaining.push_back((addr, pubkey));
            }
        }
        env.storage().instance().set(&CO_ADMINS, &remaining);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Set the M-of-N multisig threshold for critical operations (admin only).
    /// `required = 0` disables multisig (legacy single-admin auth applies).
    pub fn set_multisig_threshold(env: Env, admin: Address, required: u32) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        let co_admins: Vec<(Address, BytesN<32>)> =
            env.storage().instance().get(&CO_ADMINS).unwrap_or(Vec::new(&env));
        if required > co_admins.len() {
            return Err(Error::InvalidThreshold);
        }
        env.storage().instance().set(&MULTISIG_THRESHOLD, &required);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        Ok(())
    }

    /// Returns the configured M-of-N multisig threshold (0 = disabled).
    pub fn multisig_threshold(env: Env) -> u32 {
        env.storage().instance().get(&MULTISIG_THRESHOLD).unwrap_or(0)
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

#[cfg(test)]
mod fuzz_test;

#[cfg(all(test, kani))]
mod kani_harnesses;

#[cfg(test)]
mod negative_tests;
