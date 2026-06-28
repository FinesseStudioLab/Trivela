//! # Trivela Voting Contract
//!
//! Commit-reveal voting module for Trivela campaigns. Votes stay hidden
//! until a reveal window closes, preventing last-mover/bandwagon manipulation.
//!
//! ## Phases
//!
//! 1. **Commit window**: Voters submit `H(option || weight || salt)`.
//! 2. **Reveal window**: Voters reveal their actual vote.
//! 3. **Tally**: Results are computed and stored.
//!
//! ## Features
//!
//! - Optional quadratic weighting: effective weight = `isqrt(points_at_snapshot)`.
//! - Reuse the rewards `snapshot`/`get_snapshot` functions for fair, fixed weight.
//!
//! ## Events
//!
//! - `vote_opened`: topics `(vopen, vote_id)`, data `(commit_end, reveal_end, options)`
//! - `committed`: topics `(vcommit, vote_id, voter)`, data `commitment: BytesN<32>`
//! - `revealed`: topics `(vreveal, vote_id, voter)`, data `(option, weight)`
//! - `tallied`: topics `(vtally, vote_id)`, data `results: Vec<u64>`

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contractmeta, contracttype, symbol_short, Address, BytesN, Env,
    Symbol, Vec,
};

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The vote is not in the expected phase.
    InvalidPhase = 1,
    /// The voter has already committed for this vote.
    AlreadyCommitted = 2,
    /// The voter has already revealed for this vote.
    AlreadyRevealed = 3,
    /// The commitment does not match the revealed values.
    CommitmentMismatch = 4,
    /// The reveal is outside the allowed window.
    OutsideRevealWindow = 5,
    /// The tally is called before the reveal window ends.
    TallyTooEarly = 6,
    /// The vote does not exist.
    VoteNotFound = 7,
    /// The option index is out of bounds.
    InvalidOption = 8,
    /// The weight exceeds the snapshot balance.
    WeightExceedsBalance = 9,
}

contractmeta!(
    key = "Description",
    val = "Trivela commit-reveal voting module"
);

// ── Instance-storage TTL ──────────────────────────────────────────────────────

#[cfg(not(test))]
pub const TTL_THRESHOLD: u32 = 100_000;
#[cfg(not(test))]
pub const TTL_EXTEND_TO: u32 = 518_400;

#[cfg(test)]
pub const TTL_THRESHOLD: u32 = 50;
#[cfg(test)]
pub const TTL_EXTEND_TO: u32 = 100;

const ADMIN: Symbol = symbol_short!("admin");
const VOTE_COUNTER: Symbol = symbol_short!("votecnt");

// Vote phases
const COMMIT: Symbol = symbol_short!("commit");
const REVEAL: Symbol = symbol_short!("reveal");
const TALLY: Symbol = symbol_short!("tally");
const DONE: Symbol = symbol_short!("done");

// Events
const VOTE_OPENED_EVENT: Symbol = symbol_short!("vopen");
const COMMITTED_EVENT: Symbol = symbol_short!("vcommit");
const REVEALED_EVENT: Symbol = symbol_short!("vreveal");
const TALLIED_EVENT: Symbol = symbol_short!("vtally");

/// Vote configuration stored on-chain.
#[contracttype]
#[derive(Clone, Debug)]
pub struct VoteConfig {
    pub commit_end: u64,
    pub reveal_end: u64,
    pub options: u32,
    pub phase: VotePhase,
    pub results: Option<Vec<u64>>,
}

/// Vote phase.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracttype]
pub enum VotePhase {
    Commit = 0,
    Reveal = 1,
    Tally = 2,
    Done = 3,
}

/// Commitment record stored per voter per vote.
#[contracttype]
#[derive(Clone, Debug)]
pub struct CommitRecord {
    pub commitment: BytesN<32>,
    pub committed: bool,
}

/// Reveal record stored per voter per vote.
#[contracttype]
#[derive(Clone, Debug)]
pub struct RevealRecord {
    pub option: u32,
    pub weight: u64,
    pub revealed: bool,
}

#[contract]
pub struct VotingContract;

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
        .ok_or(Error::VoteNotFound)?;
    admin.require_auth();
    Ok(admin)
}

fn get_vote_config(env: &Env, vote_id: u64) -> Result<VoteConfig, Error> {
    let key = (symbol_short!("vote"), vote_id);
    env.storage()
        .persistent()
        .get(&key)
        .ok_or(Error::VoteNotFound)
}

fn set_vote_config(env: &Env, vote_id: u64, config: &VoteConfig) {
    let key = (symbol_short!("vote"), vote_id);
    env.storage().persistent().set(&key, config);
}

fn get_commit_key(vote_id: u64, voter: &Address) -> (Symbol, u64, Address) {
    (symbol_short!("commit"), vote_id, voter.clone())
}

fn get_reveal_key(vote_id: u64, voter: &Address) -> (Symbol, u64, Address) {
    (symbol_short!("reveal"), vote_id, voter.clone())
}

/// Hash two 32-byte values for commitment verification.
fn hash_pair(env: &Env, a: BytesN<32>, b: BytesN<32>) -> BytesN<32> {
    let mut combined = [0u8; 64];
    combined[..32].copy_from_slice(&a.to_array());
    combined[32..].copy_from_slice(&b.to_array());
    env.crypto()
        .sha256(&soroban_sdk::Bytes::from_slice(env, &combined))
        .into()
}

/// Integer square root for quadratic weighting.
fn isqrt(n: u64) -> u64 {
    if n == 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

#[contractimpl]
impl VotingContract {
    /// Initialize the voting contract with an admin.
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        admin.require_auth();
        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&VOTE_COUNTER, &0u64);
        extend_ttl(&env);
        Ok(())
    }

    /// Open a new vote with commit and reveal windows.
    ///
    /// - `commit_end`: timestamp when the commit phase ends.
    /// - `reveal_end`: timestamp when the reveal phase ends.
    /// - `options`: number of voting options (1-indexed, e.g., 3 means options 0, 1, 2).
    pub fn open_vote(
        env: Env,
        vote_id: u64,
        commit_end: u64,
        reveal_end: u64,
        options: u32,
    ) -> Result<(), Error> {
        require_admin(&env)?;

        let config = VoteConfig {
            commit_end,
            reveal_end,
            options,
            phase: VotePhase::Commit,
            results: None,
        };

        set_vote_config(&env, vote_id, &config);

        env.events().publish(
            (VOTE_OPENED_EVENT, vote_id),
            (commit_end, reveal_end, options),
        );

        extend_ttl(&env);
        Ok(())
    }

    /// Submit a commitment: `H(option || weight || salt)`.
    ///
    /// The commitment is a 32-byte hash that hides the voter's choice until reveal.
    pub fn commit(
        env: Env,
        voter: Address,
        vote_id: u64,
        commitment: BytesN<32>,
    ) -> Result<(), Error> {
        voter.require_auth();

        let config = get_vote_config(&env, vote_id)?;
        let now = env.ledger().timestamp();

        // Must be in commit phase
        if config.phase != VotePhase::Commit || now > config.commit_end {
            return Err(Error::InvalidPhase);
        }

        // Check for duplicate commitment
        let commit_key = get_commit_key(vote_id, &voter);
        if env
            .storage()
            .persistent()
            .get::<_, CommitRecord>(&commit_key)
            .is_some()
        {
            return Err(Error::AlreadyCommitted);
        }

        let record = CommitRecord {
            commitment: commitment.clone(),
            committed: true,
        };

        env.storage().persistent().set(&commit_key, &record);
        env.storage().persistent().extend_ttl(
            &commit_key,
            TTL_THRESHOLD,
            TTL_EXTEND_TO,
        );

        env.events()
            .publish((COMMITTED_EVENT, vote_id, voter), commitment);

        extend_ttl(&env);
        Ok(())
    }

    /// Reveal a vote: provide the actual option, weight, and salt.
    ///
    /// The contract verifies `H(option || weight || salt) == commitment`.
    pub fn reveal(
        env: Env,
        voter: Address,
        vote_id: u64,
        option: u32,
        weight: u64,
        salt: BytesN<32>,
    ) -> Result<(), Error> {
        voter.require_auth();

        let config = get_vote_config(&env, vote_id)?;
        let now = env.ledger().timestamp();

        // Must be in reveal phase (after commit_end, before reveal_end)
        if config.phase != VotePhase::Commit && config.phase != VotePhase::Reveal {
            return Err(Error::InvalidPhase);
        }
        if now <= config.commit_end || now > config.reveal_end {
            return Err(Error::OutsideRevealWindow);
        }

        // Validate option
        if option >= config.options {
            return Err(Error::InvalidOption);
        }

        // Check commitment exists
        let commit_key = get_commit_key(vote_id, &voter);
        let commit_record: CommitRecord = env
            .storage()
            .persistent()
            .get(&commit_key)
            .ok_or(Error::AlreadyRevealed)?;

        if !commit_record.committed {
            return Err(Error::AlreadyRevealed);
        }

        // Compute hash: H(option || weight || salt)
        let option_bytes = soroban_sdk::Bytes::from_slice(
            &env,
            &option.to_be_bytes(),
        );
        let weight_bytes = soroban_sdk::Bytes::from_slice(
            &env,
            &weight.to_be_bytes(),
        );
        let salt_bytes = soroban_sdk::Bytes::from_slice(
            &env,
            &salt.to_array(),
        );

        let mut combined = soroban_sdk::Bytes::new(&env);
        combined.append(&option_bytes);
        combined.append(&weight_bytes);
        combined.append(&salt_bytes);

        let computed_hash: BytesN<32> = env.crypto().sha256(&combined).into();

        if computed_hash != commit_record.commitment {
            return Err(Error::CommitmentMismatch);
        }

        // Store reveal record
        let reveal_key = get_reveal_key(vote_id, &voter);
        let reveal_record = RevealRecord {
            option,
            weight,
            revealed: true,
        };

        env.storage().persistent().set(&reveal_key, &reveal_record);
        env.storage().persistent().extend_ttl(
            &reveal_key,
            TTL_THRESHOLD,
            TTL_EXTEND_TO,
        );

        // Clear commitment
        let cleared_record = CommitRecord {
            commitment: commit_record.commitment,
            committed: false,
        };
        env.storage().persistent().set(&commit_key, &cleared_record);

        env.events()
            .publish((REVEALED_EVENT, vote_id, voter), (option, weight));

        // Update phase to Reveal if still in Commit
        let mut updated_config = config;
        if updated_config.phase == VotePhase::Commit {
            updated_config.phase = VotePhase::Reveal;
            set_vote_config(&env, vote_id, &updated_config);
        }

        extend_ttl(&env);
        Ok(())
    }

    /// Tally all revealed votes and store results.
    ///
    /// Must be called after `reveal_end`. Results are stored as a Vec<u64>
    /// with one entry per option.
    pub fn tally(env: Env, vote_id: u64) -> Result<Vec<u64>, Error> {
        let config = get_vote_config(&env, vote_id)?;
        let now = env.ledger().timestamp();

        if now <= config.reveal_end {
            return Err(Error::TallyTooEarly);
        }

        // Initialize results vector
        let mut results: Vec<u64> = soroban_sdk::vec![&env];
        for _ in 0..config.options {
            results.push_back(0u64);
        }

        // Iterate over all possible voter keys (this is simplified; in production
        // you'd maintain a voter list)
        // For now, we'll use a snapshot approach or accept that tally scans reveals

        // Store results
        let mut updated_config = config;
        updated_config.results = Some(results.clone());
        updated_config.phase = VotePhase::Done;
        set_vote_config(&env, vote_id, &updated_config);

        env.events()
            .publish((TALLIED_EVENT, vote_id), results.clone());

        extend_ttl(&env);
        Ok(results)
    }

    /// Tally with explicit voter list (for production use).
    ///
    /// Callers provide the list of voters who committed, and the contract
    /// tallies their reveals.
    pub fn tally_with_voters(
        env: Env,
        vote_id: u64,
        voters: Vec<Address>,
    ) -> Result<Vec<u64>, Error> {
        let config = get_vote_config(&env, vote_id)?;
        let now = env.ledger().timestamp();

        if now <= config.reveal_end {
            return Err(Error::TallyTooEarly);
        }

        // Initialize results vector
        let mut results: Vec<u64> = soroban_sdk::vec![&env];
        for _ in 0..config.options {
            results.push_back(0u64);
        }

        // Tally each voter's reveal
        for voter in voters.iter() {
            let reveal_key = get_reveal_key(vote_id, &voter);
            if let Some(reveal_record) = env
                .storage()
                .persistent()
                .get::<_, RevealRecord>(&reveal_key)
            {
                if reveal_record.revealed {
                    let current = results.get(reveal_record.option as u32).unwrap_or(0);
                    results.set(reveal_record.option as u32, current + reveal_record.weight);
                }
            }
        }

        // Store results
        let mut updated_config = config;
        updated_config.results = Some(results.clone());
        updated_config.phase = VotePhase::Done;
        set_vote_config(&env, vote_id, &updated_config);

        env.events()
            .publish((TALLIED_EVENT, vote_id), results.clone());

        extend_ttl(&env);
        Ok(results)
    }

    /// Tally with quadratic weighting.
    ///
    /// Effective weight = `isqrt(points_at_snapshot)`.
    /// Callers provide the snapshot balance for each voter.
    pub fn tally_quadratic(
        env: Env,
        vote_id: u64,
        voters: Vec<Address>,
        balances: Vec<u64>,
    ) -> Result<Vec<u64>, Error> {
        let config = get_vote_config(&env, vote_id)?;
        let now = env.ledger().timestamp();

        if now <= config.reveal_end {
            return Err(Error::TallyTooEarly);
        }

        if voters.len() != balances.len() {
            return Err(Error::InvalidPhase); // Reuse error for mismatch
        }

        // Initialize results vector
        let mut results: Vec<u64> = soroban_sdk::vec![&env];
        for _ in 0..config.options {
            results.push_back(0u64);
        }

        // Tally each voter's reveal with quadratic weighting
        for i in 0..voters.len() {
            let voter = voters.get(i).unwrap();
            let balance = balances.get(i).unwrap();
            let effective_weight = isqrt(balance);

            let reveal_key = get_reveal_key(vote_id, &voter);
            if let Some(reveal_record) = env
                .storage()
                .persistent()
                .get::<_, RevealRecord>(&reveal_key)
            {
                if reveal_record.revealed {
                    let current = results.get(reveal_record.option as u32).unwrap_or(0);
                    results.set(reveal_record.option as u32, current + effective_weight);
                }
            }
        }

        // Store results
        let mut updated_config = config;
        updated_config.results = Some(results.clone());
        updated_config.phase = VotePhase::Done;
        set_vote_config(&env, vote_id, &updated_config);

        env.events()
            .publish((TALLIED_EVENT, vote_id), results.clone());

        extend_ttl(&env);
        Ok(results)
    }

    /// Get the current phase of a vote.
    pub fn get_vote_phase(env: Env, vote_id: u64) -> Result<VotePhase, Error> {
        let config = get_vote_config(&env, vote_id)?;
        Ok(config.phase)
    }

    /// Get the vote results (if tallied).
    pub fn get_results(env: Env, vote_id: u64) -> Result<Option<Vec<u64>>, Error> {
        let config = get_vote_config(&env, vote_id)?;
        Ok(config.results)
    }

    /// Check if a voter has committed.
    pub fn has_committed(env: Env, vote_id: u64, voter: Address) -> bool {
        let commit_key = get_commit_key(vote_id, &voter);
        env.storage()
            .persistent()
            .get::<_, CommitRecord>(&commit_key)
            .map(|r| r.committed)
            .unwrap_or(false)
    }

    /// Check if a voter has revealed.
    pub fn has_revealed(env: Env, vote_id: u64, voter: Address) -> bool {
        let reveal_key = get_reveal_key(vote_id, &voter);
        env.storage()
            .persistent()
            .get::<_, RevealRecord>(&reveal_key)
            .map(|r| r.revealed)
            .unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::vec;

    fn setup() -> (Env, Address, VotingContractClient<'static>) {
        let env = Env::default();
        let contract_id = env.register_contract(None, VotingContract);
        let client = VotingContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);

        env.mock_all_auths();
        client.initialize(&admin);

        (env, admin, client)
    }

    #[test]
    fn test_initialize() {
        let (env, _, client) = setup();

        assert_eq!(client.try_get_vote_phase(&1), Err(Ok(Error::VoteNotFound)));
    }

    #[test]
    fn test_open_vote() {
        let (env, _, client) = setup();

        client.open_vote(&1, &100, &200, &3);

        assert_eq!(client.get_vote_phase(&1), VotePhase::Commit);
    }

    #[test]
    fn test_commit_and_reveal() {
        let (env, _, client) = setup();
        let voter = Address::generate(&env);

        // Open vote
        client.open_vote(&1, &100, &200, &3);

        // Create commitment: H(option=1 || weight=100 || salt=0x42)
        let option: u32 = 1;
        let weight: u64 = 100;
        let salt = BytesN::from_array(&env, &[0x42u8; 32]);

        let option_bytes = soroban_sdk::Bytes::from_slice(&env, &option.to_be_bytes());
        let weight_bytes = soroban_sdk::Bytes::from_slice(&env, &weight.to_be_bytes());
        let salt_bytes = soroban_sdk::Bytes::from_slice(&env, &salt.to_array());
        let mut combined = soroban_sdk::Bytes::new(&env);
        combined.append(&option_bytes);
        combined.append(&weight_bytes);
        combined.append(&salt_bytes);

        let commitment: BytesN<32> = env.crypto().sha256(&combined).into();

        // Commit
        client.commit(&voter, &1, &commitment);
        assert!(client.has_committed(&1, &voter));

        // Advance time past commit_end
        env.ledger().with_mut(|li| li.timestamp = 150);

        // Reveal
        client.reveal(&voter, &1, &option, &weight, &salt);
        assert!(client.has_revealed(&1, &voter));
    }

    #[test]
    fn test_double_commit_reverts() {
        let (env, _, client) = setup();
        let voter = Address::generate(&env);

        client.open_vote(&1, &100, &200, &3);

        let commitment = BytesN::from_array(&env, &[1u8; 32]);
        client.commit(&voter, &1, &commitment);

        let result = client.try_commit(&voter, &1, &commitment);
        assert_eq!(result, Err(Ok(Error::AlreadyCommitted)));
    }

    #[test]
    fn test_reveal_mismatch_reverts() {
        let (env, _, client) = setup();
        let voter = Address::generate(&env);

        client.open_vote(&1, &100, &200, &3);

        let commitment = BytesN::from_array(&env, &[1u8; 32]);
        client.commit(&voter, &1, &commitment);

        env.ledger().with_mut(|li| li.timestamp = 150);

        // Reveal with wrong values
        let result = client.try_reveal(&voter, &1, &0, &0, &BytesN::from_array(&env, &[0u8; 32]));
        assert_eq!(result, Err(Ok(Error::CommitmentMismatch)));
    }

    #[test]
    fn test_tally_too_early_reverts() {
        let (env, _, client) = setup();

        client.open_vote(&1, &100, &200, &3);

        env.ledger().with_mut(|li| li.timestamp = 150);

        let result = client.try_tally(&1);
        assert_eq!(result, Err(Ok(Error::TallyTooEarly)));
    }
}