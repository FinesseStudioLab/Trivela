# Range-Proof Library for Confidential Reward Amounts (#940)

> **Status:** Design stub — implementation tracked in issue #940.

## Summary

Soroban contracts handling confidential balances and reward claims need to validate that amounts are
within legal bounds (e.g., `0 < amount ≤ MAX_REWARD`) without revealing the actual value. This
document defines the integration surface and threat model for a reusable range-proof module.

---

## Design

### Goal

Given a commitment `C = Commit(v, r)` (Pedersen commitment), prove that `v ∈ [low, high]` without
revealing `v` or the blinding factor `r`.

### Approach — Bulletproofs (compressed range proofs)

Bulletproofs produce proofs of size `O(log n)` bits rather than `O(n)`, making them suitable for
on-chain verification within Soroban's instruction budget.

A Rust implementation will expose:

```rust
/// Verify that the committed value lies in [low, high].
/// Returns Ok(()) on success; Err(RangeProofError) otherwise.
pub fn verify_range_proof(
    commitment: &PedersenCommitment,
    proof: &[u8],
    low: u64,
    high: u64,
) -> Result<(), RangeProofError>
```

### Threat model

| Threat                                                 | Mitigation                                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Proof forgery (prover claims v in range when it isn't) | Soundness of Bulletproofs under DLP hardness assumption                                 |
| Replay of a valid proof for a different commitment     | Commitment binds to specific (v, r); proof is tied to C                                 |
| Negative or overflow amounts                           | Explicit lower bound `low = 1`; upper bound caps max reward                             |
| Instruction budget exceeded                            | Pre-verify proof byte-length; skip verification if proof absent (permissioned fallback) |

---

## Acceptance Criteria (from issue #940)

- [ ] `verify_range_proof` verifies on-chain within Soroban instruction budget
- [ ] Module is re-usable across `claim_reward` and `redeem_balance` flows
- [ ] Test vectors provided for `[1, 100]`, `[1, 10000]`, and a failing case
- [ ] Docs updated here with final API and integration example

---

## References

- [Bulletproofs paper](https://eprint.iacr.org/2017/1066.pdf) — Bünz et al., 2017
- [dalek-cryptography/bulletproofs](https://github.com/dalek-cryptography/bulletproofs) — Rust crate
- Soroban instruction budget limits — Stellar Developer Docs
