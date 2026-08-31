//! Merkle membership proof verification for the airdrop/eligibility tree.
//!
//! Tree convention (must match whatever builds the tree off-chain):
//!   - Leaf hash:  Poseidon(LEAF_DOMAIN_TAG, leaf_preimage)   [see poseidon.rs]
//!   - Node hash:  Poseidon(left, right)
//!   - `leaf_index` bit `k` (LSB first) tells you, at tree level `k`,
//!     whether the running hash is the left child (bit = 0) or right
//!     child (bit = 1) of the pair being combined with `siblings[k]`.
//!
//! This module only verifies proofs against an already-stored root -- root
//! storage, admin-set-root access control, and nullifier/double-claim
//! prevention belong in your contract's existing lib.rs, not here.

use soroban_sdk::{contracterror, contracttype, BytesN, Env, Vec};

use crate::poseidon::{hash_leaf, hash_pair, PoseidonHashError};

#[derive(Clone)]
#[contracttype]
pub struct MerkleProof {
    /// Sibling hashes from leaf level up to (but not including) the root,
    /// in bottom-up order.
    pub siblings: Vec<BytesN<32>>,
    /// Leaf's position in the tree. Bit `k` (LSB first) selects left/right
    /// at level `k` -- see module docs.
    pub leaf_index: u32,
}

#[contracterror]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum MerkleVerifyError {
    PoseidonHashFailed = 1,
    RootMismatch = 2,
}

impl From<PoseidonHashError> for MerkleVerifyError {
    fn from(_: PoseidonHashError) -> Self {
        MerkleVerifyError::PoseidonHashFailed
    }
}

/// Verifies `leaf_preimage` is included under `root` via `proof`.
/// Returns Ok(()) iff the recomputed root matches.
pub fn verify(
    env: &Env,
    root: &BytesN<32>,
    leaf_preimage: &BytesN<32>,
    proof: &MerkleProof,
) -> Result<(), MerkleVerifyError> {
    let mut current = hash_leaf(env, leaf_preimage)?;
    let mut index = proof.leaf_index;

    for sibling in proof.siblings.iter() {
        current = if index & 1 == 0 {
            hash_pair(env, &current, &sibling)?
        } else {
            hash_pair(env, &sibling, &current)?
        };
        index >>= 1;
    }

    if &current == root {
        Ok(())
    } else {
        Err(MerkleVerifyError::RootMismatch)
    }
}