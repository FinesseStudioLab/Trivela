# Zero-Knowledge Trusted Setup Strategy

## Executive Summary

This document outlines Trivela's approach to the zero-knowledge proof trusted setup, comparing Groth16's ceremony-based model with transparent alternatives, and documenting the chosen strategy with its security assumptions.

## Background

Zero-knowledge proving systems require different setup approaches:

- **Groth16**: Requires a per-circuit trusted setup ceremony. If the ceremony is compromised, soundness is undermined—malicious provers could create false proofs.
- **Transparent Systems** (PLONK, Halo2, STARK): No trusted setup required. Security relies solely on cryptographic assumptions (e.g., discrete log, collision-resistant hashing).

## Analysis: Groth16 vs. Transparent Alternatives on Soroban

### Groth16 Advantages
- **Proof Size**: ~128-256 bytes (constant, very small)
- **Verification Cost**: ~1-2ms, lowest gas cost on Soroban
- **Maturity**: Battle-tested in production (Zcash, Filecoin, Tornado Cash)
- **Library Support**: Excellent Rust support via `bellman`, `ark-groth16`

### Groth16 Disadvantages
- **Trusted Setup Required**: Per-circuit ceremony needed
- **Ceremony Risk**: Compromise of toxic waste breaks soundness
- **Circuit-Specific**: New ceremony required for any circuit changes
- **Operational Overhead**: Must securely coordinate multi-party computation (MPC)

### PLONK Advantages
- **Universal Setup**: One-time ceremony for all circuits (of bounded size)
- **Flexibility**: Can update circuits without new ceremonies
- **Modern Design**: Polynomial commitment schemes (KZG)

### PLONK Disadvantages
- **Larger Proofs**: ~400-800 bytes
- **Higher Verification Cost**: ~2-4x Groth16 (still acceptable on Soroban)
- **KZG Trusted Setup**: Still requires a universal setup (though reusable)

### Halo2 / STARK Advantages
- **Truly Transparent**: No trusted setup whatsoever
- **Quantum Resistant** (STARKs): Future-proof security
- **Developer Friendly**: Easier circuit iteration

### Halo2 / STARK Disadvantages
- **Proof Size**: 10-100KB (significantly larger)
- **Verification Cost**: Can be 10-50x Groth16
- **Soroban Gas Impact**: May exceed reasonable transaction limits
- **Less Mature**: Fewer production deployments

### Soroban Cost Estimation

| System   | Proof Size | Est. Verification Gas | Relative Cost |
|----------|------------|----------------------|---------------|
| Groth16  | 192 bytes  | ~50K ops             | 1x            |
| PLONK    | 600 bytes  | ~120K ops            | 2.4x          |
| Halo2    | 20KB       | ~800K ops            | 16x           |
| STARK    | 50KB       | ~1.2M ops            | 24x           |

*Note: These are estimates. Actual costs depend on circuit complexity and Soroban's evolving gas model.*

## Chosen Approach: Groth16 with Robust Ceremony

### Rationale

We have chosen **Groth16** for the following reasons:

1. **Cost Efficiency**: On-chain verification costs are critical for user experience and adoption. Groth16's ~2-3x cost advantage over PLONK and ~20x over transparent systems is decisive.

2. **Production Maturity**: Groth16 has secured billions in value across multiple production systems. The ceremony risk is well-understood and manageable.

3. **Soroban Constraints**: While Soroban is evolving, keeping verification costs low ensures the protocol remains usable even with conservative gas limits.

4. **Ceremony Mitigation**: Modern MPC ceremony tools (Powers of Tau, Phase 2 coordinators) make trusted setups operationally feasible and auditable.

### Security Assumptions

#### Cryptographic Assumptions
- **Discrete Logarithm Problem**: Hardness in pairing-friendly elliptic curve groups (BLS12-381)
- **Knowledge of Exponent (KEA)**: Required for extraction in proofs of knowledge
- **Bilinear Pairing Security**: No efficient algorithm to break pairing computations

#### Ceremony Security Model
- **Honest Participant Assumption**: At least ONE participant in the MPC must be honest and destroy their toxic waste
- **Number of Participants**: Minimum 10, target 50+ for high confidence
- **Entropy Sources**: Each participant contributes randomness from independent sources
- **Verification**: All contributions are publicly verifiable through cryptographic transcripts

#### Trust Boundaries
- **What We Trust**: The MPC ceremony protocol and that ≥1 participant is honest
- **What We Don't Trust**: Any single participant, ceremony coordinator, or hardware
- **Defense in Depth**: Multiple independent parties, diverse geographic locations, open participation

## Ceremony Protocol

### Phase 1: Powers of Tau (Universal Setup)

We will participate in or run a **Powers of Tau ceremony** for BLS12-381:

1. **Existing Ceremonies**: Evaluate reusing existing Powers of Tau transcripts (Zcash, Ethereum's KZG ceremony)
2. **Independent Ceremony**: If needed, coordinate our own with:
   - Minimum 10 participants
   - Open invitation to community, security researchers, and partners
   - Diverse execution environments (different OS, hardware, locations)
   - Public attestations from each participant

### Phase 2: Circuit-Specific Setup

For each circuit (e.g., campaign participation proof, vote aggregation):

1. **Circuit Finalization**: Lock the circuit design before ceremony
2. **MPC Coordination**: Use `snarkjs` or `phase2-cli` for coordination
3. **Participant Selection**: Include:
   - Core team members (at least 3)
   - External security auditors
   - Community contributors
   - Independent validators
4. **Transcript Publication**: All contributions published for public verification
5. **Final Parameters**: Verification keys published on-chain and in docs

### Operational Security

#### During Ceremony
- Each participant uses fresh, isolated environment (air-gapped preferred)
- Entropy from multiple sources (hardware RNG, system randomness, manual input)
- Immediate secure deletion of private randomness after contribution
- Cryptographic proof of contribution computed and published

#### After Ceremony
- **Transcript Verification**: Independent parties verify all contributions
- **Parameter Storage**: Final parameters stored in:
  - Git repository (contracts/params/)
  - IPFS for redundancy
  - On-chain verification key storage
- **Audit Trail**: Complete ceremony logs published in docs/ceremonies/

### Verification Keys Publication

All verification keys will be:
1. **Checked into Repository**: `contracts/circuit-name/verification_key.json`
2. **Content-Addressed**: IPFS CID published in documentation
3. **On-Chain**: Verification key hash stored in contract for integrity checks
4. **Auditor Access**: Provided to all security auditors for review

## Migration Path to Transparent Systems

If Soroban's gas model improves or PLONK/Halo2 optimizations advance:

### Criteria for Migration
- Transparent system verification costs within 3x of Groth16
- Mature Rust implementation with Soroban compatibility
- Security audit of the new system completed

### Migration Process
1. Implement parallel proving with both systems
2. Run extended testnet with transparent proofs
3. Gradual rollout with dual-verification period
4. Full migration after 3-6 months of stable operation

## Audit and Review Checklist

For security auditors and grant reviewers:

- [ ] Ceremony design reviewed by cryptography expert
- [ ] Minimum participant threshold met (10+)
- [ ] Ceremony transcript publicly available and verifiable
- [ ] Verification keys published with content hashes
- [ ] All circuits documented with security properties
- [ ] Fallback/upgrade path defined
- [ ] Cryptographic assumptions explicitly stated
- [ ] Ceremony coordinator is distinct from core developers

## References and Resources

### Trusted Setup Resources
- [Zcash Powers of Tau](https://github.com/ZcashFoundation/powersoftau-attestations)
- [Ethereum KZG Ceremony](https://ceremony.ethereum.org/)
- [Perpetual Powers of Tau](https://github.com/weijiekoh/perpetualpowersoftau)

### Ceremony Tools
- [snarkjs](https://github.com/iden3/snarkjs) - JavaScript ceremony coordinator
- [phase2-ceremony](https://github.com/kobigurk/phase2-ceremony) - Rust implementation
- [bellman](https://github.com/zkcrypto/bellman) - Groth16 implementation

### Security Analysis
- [On the Security of the Groth16 zk-SNARK](https://eprint.iacr.org/2016/260.pdf)
- [Scalable Multi-party Computation for zk-SNARK Parameters](https://eprint.iacr.org/2017/1050.pdf)
- [The Hunting of the SNARK](https://eprint.iacr.org/2014/580.pdf)

## Conclusion

Groth16 with a robust, transparent MPC ceremony provides the optimal balance of security, cost-efficiency, and operational maturity for Trivela's current needs. The ceremony approach, while requiring coordination, is well-understood and has been successfully executed by major projects. The trust model is explicit: we require only one honest participant among many, a significantly weaker assumption than trusting any single entity.

As the ecosystem evolves, we remain committed to evaluating transparent alternatives and will migrate when the cost/benefit trade-off shifts.

---

**Document Version**: 1.0  
**Last Updated**: August 2026  
**Review Date**: February 2027  
**Owner**: Trivela Security Team
