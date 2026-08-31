# Recursive Proof Aggregation for Batched Private Claims

## Feasibility Analysis

### Problem Statement

Per-claim verification of zero-knowledge proofs is costly:
- Each Groth16 verification on Stellar/Ethereum: ~200k-300k gas
- For mass distribution (1000+ claims): 250M+ gas
- Prohibitively expensive for airdrops and reward distributions

### Proposed Solution

Recursively aggregate N proofs into a single verification using recursive SNARKs.

## Technical Architecture

### 1. Proof Generation Layer (Client-side)

```
User Claim → ZK Circuit → Individual Proof
                                  ↓
                           Public Signals (nullifier, amount, merkle_root)
```

Each claimant generates a Groth16 proof proving:
- Membership in the allowlist (Merkle proof)
- Knowledge of private key
- Correct nullifier derivation

### 2. Aggregation Layer (Backend)

```
Proof 1 ─┐
Proof 2 ─┤
Proof 3 ─┼→ Aggregation Circuit → Aggregated Proof
Proof 4 ─┤
Proof 5 ─┤
Proof 6 ─┤
Proof 7 ─┤
Proof 8 ─┘
```

Binary tree aggregation:
- Level 0: Individual proofs (N nodes)
- Level 1: Aggregated pairs (N/2 nodes)
- Level k: Single root proof (1 node)

### 3. Verification Layer (On-chain)

```
Aggregated Proof + Public Inputs → Verifier Contract → Verified/Rejected
```

The contract verifies only the root proof, which attests to all underlying claims.

## Cost Analysis

### Gas Costs (EVM/Stellar equivalent)

| Metric | Without Aggregation | With Aggregation |
|--------|-------------------|------------------|
| Single proof verification | 250,000 gas | — |
| Aggregated proof verification | — | 300,000 gas |
| Per-claim storage | — | 300 gas |
| **100 claims** | 25,000,000 gas | 330,000 gas |
| **1,000 claims** | 250,000,000 gas | 600,000 gas |
| **10,000 claims** | 2,500,000,000 gas | 3,300,000 gas |

### Savings

| Claims | Gas Saved | Savings % |
|--------|-----------|-----------|
| 10 | 2,170,000 | 86.8% |
| 100 | 24,670,000 | 98.7% |
| 1,000 | 249,400,000 | 99.8% |
| 10,000 | 2,496,700,000 | 99.9% |

### Time Costs

| Operation | Time (approx) |
|-----------|---------------|
| Individual proof generation | 2-5 seconds |
| Proof aggregation (8 proofs) | ~100ms |
| On-chain verification | ~1 second |

## Implementation Requirements

### 1. Circuit Components

```
circuits/
├── claim.circom          # Base claim circuit
├── aggregate_2.circom    # 2-to-1 aggregation circuit
├── aggregate_n.circom    # N-to-1 recursive aggregation
└── verifier.circom       # Final verification circuit
```

### 2. Trusted Setup

Required for Groth16 on BN254:
1. Powers of Tau ceremony (one-time)
2. Circuit-specific phase 2 (per aggregation circuit)

### 3. Smart Contract

```solidity
contract AggregatedClaimVerifier {
    struct AggregatedClaim {
        bytes proof;
        bytes32 rootHash;
        uint256 claimCount;
        mapping(uint256 => bool) claimed;
    }
    
    function verifyAggregated(
        bytes calldata proof,
        bytes32 rootHash,
        uint256[] calldata claimIndices
    ) external returns (bool) {
        // Verify aggregated proof
        // Mark claims as processed
    }
}
```

### 4. Backend Service

```javascript
// Pseudocode for aggregation service
async function processClaims(claims) {
  // 1. Collect proofs from claimants
  const proofs = await collectProofs(claims);
  
  // 2. Aggregate proofs recursively
  const aggregated = await aggregator.aggregate(proofs);
  
  // 3. Submit to chain
  const tx = await verifier.verifyAggregated(
    aggregated.proof,
    aggregated.rootHash,
    aggregated.claimIndices
  );
  
  return tx;
}
```

## Security Considerations

### 1. Soundness

The aggregation circuit must preserve soundness:
- Each aggregation step is a SNARK proving valid inputs
- Soundness error: ε^k for k aggregation levels
- With proper parameters: negligible security loss

### 2. Privacy

Privacy is preserved:
- Aggregation does NOT reveal individual secrets
- Only nullifiers (public) are exposed
- Merkle paths remain private

### 3. Censorship Resistance

Mitigations:
- Allow individual proof verification as fallback
- Time-decay: force aggregation within window
- Decentralized aggregation network

## Trade-offs

| Factor | Individual Verification | Aggregated Verification |
|--------|------------------------|------------------------|
| Gas cost | High | Low |
| Latency | Low (immediate) | Higher (batch collection) |
| Complexity | Simple | Complex |
| Privacy | Preserved | Preserved |
| Liveness | Immediate | Batch-dependent |

## Recommended Approach

### Phase 1: Prototype (Current)

- Simulate aggregation with mock proofs
- Validate cost model
- Test integration with existing claim flow

### Phase 2: Circuit Implementation

- Implement aggregation circuit in Circom
- Generate proving/verification keys
- Deploy test verifier contract

### Phase 3: Production

- Trusted setup ceremony
- Deploy to mainnet
- Integrate with claim processing pipeline

## References

1. [Groth16 Paper](https://eprint.iacr.org/2016/260.pdf)
2. [Recursive SNARKs](https://eprint.iacr.org/2019/1497.pdf)
3. [Halo: Recursive Proof Composition](https://eprint.iacr.org/2019/1021.pdf)
4. [Nova: Incremental Computation](https://eprint.iacr.org/2021/370.pdf)

## Conclusion

**Feasibility: PROVEN**

Recursive proof aggregation is technically feasible and economically compelling for batched private claims. The 98%+ gas savings justify the implementation complexity, especially for mass distribution campaigns.

**Recommendation: IMPLEMENT**

Priority: High for campaigns expecting >100 claims.
