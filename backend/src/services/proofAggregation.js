/**
 * Recursive Proof Aggregation for Batched Private Claims
 *
 * This module implements proof aggregation to amortize verification costs
 * when processing multiple private claims in a single batch.
 *
 * Background:
 *   Per-claim verification is costly. Each Groth16 verification on-chain costs
 *   ~200k-300k gas. For mass distribution (e.g., airdrops to 1000+ users),
 *   this becomes prohibitively expensive.
 *
 * Solution:
 *   Recursively aggregate N proofs into a single verification using
 *   recursive SNARKs (Groth16 over BN254 or Pasta curves).
 *
 * Architecture:
 *   1. Client generates individual claim proofs (base layer)
 *   2. Aggregation service recursively combines proofs in a Merkle tree
 *   3. On-chain contract verifies only the final aggregated proof
 *
 * Cost Analysis:
 *   - Single proof verification: ~250k gas
 *   - Aggregated proof verification: ~300k gas (one-time)
 *   - Per-claim marginal cost: ~0.3k gas (storage only)
 *
 *   For 100 claims:
 *     - Without aggregation: 100 * 250k = 25M gas
 *     - With aggregation: 300k + 100 * 0.3k = 330k gas
 *     - Savings: ~98.7%
 *
 * Prototype Status:
 *   This is a simulation. Production requires:
 *   - Bellman/Circom recursive aggregation circuits
 *   - Trusted setup for aggregation key
 *   - On-chain verifier contract update
 */

import { createHash, randomBytes } from 'node:crypto';

// Constants
const AGGREGATION_BATCH_SIZE = 8; // Power of 2 for Merkle tree
const PROOF_SIZE_BYTES = 192; // Groth16 proof size
const CURVE = 'bn128';

/**
 * Simulated proof structure matching Groth16 format.
 * In production, this would be actual SNARK proof data.
 */
export class Proof {
  constructor(data = null) {
    this.pi_a = data?.pi_a || this.randomFieldElement();
    this.pi_b = data?.pi_b || this.randomFieldElement();
    this.pi_c = data?.pi_c || this.randomFieldElement();
    this.protocol = 'groth16';
    this.curve = CURVE;
  }

  randomFieldElement() {
    return Array.from(randomBytes(32))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  serialize() {
    return JSON.stringify({
      pi_a: this.pi_a,
      pi_b: this.pi_b,
      pi_c: this.pi_c,
      protocol: this.protocol,
      curve: this.curve,
    });
  }

  static deserialize(data) {
    const parsed = JSON.parse(data);
    const proof = new Proof();
    proof.pi_a = parsed.pi_a;
    proof.pi_b = parsed.pi_b;
    proof.pi_c = parsed.pi_c;
    return proof;
  }
}

/**
 * Aggregation tree node.
 * Leaf nodes contain individual proofs; internal nodes contain aggregated proofs.
 */
class AggregationNode {
  constructor(proof, publicSignals = null, children = null) {
    this.proof = proof;
    this.publicSignals = publicSignals;
    this.children = children || [];
    this.hash = this.computeHash();
  }

  computeHash() {
    const data = this.proof.serialize() + JSON.stringify(this.publicSignals || []);
    return createHash('sha256').update(data).digest('hex');
  }

  isLeaf() {
    return this.children.length === 0;
  }
}

/**
 * Proof Aggregator — recursively combines proofs into a single verification.
 *
 * Usage:
 *   const aggregator = new ProofAggregator();
 *   const aggregated = await aggregator.aggregate([proof1, proof2, proof3, ...]);
 *   const isValid = await aggregator.verifyAggregated(aggregated);
 */
export class ProofAggregator {
  constructor(options = {}) {
    this.batchSize = options.batchSize || AGGREGATION_BATCH_SIZE;
    this.verificationKey = null; // Would be loaded from trusted setup
  }

  /**
   * Aggregate an array of proofs into a single proof.
   * Uses a binary Merkle tree structure for recursion.
   *
   * @param {Proof[]} proofs - Array of individual claim proofs
   * @returns {AggregationNode} - Root node with aggregated proof
   */
  async aggregate(proofs) {
    if (proofs.length === 0) {
      throw new Error('Cannot aggregate empty proof array');
    }

    if (proofs.length === 1) {
      return new AggregationNode(proofs[0], proofs[0].publicSignals);
    }

    // Pad to power of 2 for binary tree
    const paddedProofs = this.padToPowerOfTwo(proofs);

    // Build leaf nodes
    let currentLevel = paddedProofs.map(
      (proof, idx) => new AggregationNode(proof, { claimIndex: idx }),
    );

    // Recursively aggregate pairs until we have a single root
    while (currentLevel.length > 1) {
      const nextLevel = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1];

        // Simulate recursive aggregation
        // In production: call actual recursive circuit
        const aggregatedProof = await this.aggregatePair(left, right);
        const node = new AggregationNode(aggregatedProof, null, [left, right]);

        nextLevel.push(node);
      }

      currentLevel = nextLevel;
    }

    return currentLevel[0];
  }

  /**
   * Aggregate a pair of proofs using recursive SNARK.
   * This is a simulation — production requires actual circuit.
   */
  async aggregatePair(leftNode, rightNode) {
    // Simulate aggregation delay
    await new Promise((resolve) => setTimeout(resolve, 10));

    // In production, this would:
    // 1. Invoke recursive aggregation circuit
    // 2. Compute new proof that verifies both inputs
    // 3. Combine public inputs

    const aggregatedProof = new Proof();
    aggregatedProof.pi_a = createHash('sha256')
      .update(leftNode.hash + rightNode.hash)
      .digest('hex')
      .slice(0, 64);
    aggregatedProof.pi_b = leftNode.proof.pi_b;
    aggregatedProof.pi_c = rightNode.proof.pi_c;

    return aggregatedProof;
  }

  /**
   * Verify an aggregated proof.
   * In production, this calls the on-chain verifier.
   */
  async verifyAggregated(rootNode) {
    if (!rootNode || !rootNode.proof) {
      return false;
    }

    // Simulate verification delay
    await new Promise((resolve) => setTimeout(resolve, 5));

    // In production, this would:
    // 1. Call smart contract's verifyProof function
    // 2. Check that public signals match expected values

    // Simulated verification always succeeds for valid structure
    return rootNode.proof instanceof Proof;
  }

  /**
   * Extract claim indices from aggregated proof tree.
   * Used to determine which claims are covered by the verification.
   */
  extractClaimIndices(rootNode) {
    const indices = [];

    const traverse = (node) => {
      if (node.isLeaf() && node.publicSignals?.claimIndex !== undefined) {
        indices.push(node.publicSignals.claimIndex);
      }
      node.children.forEach(traverse);
    };

    traverse(rootNode);
    return indices.sort((a, b) => a - b);
  }

  /**
   * Compute gas cost estimate for verification.
   */
  estimateGasCost(proofCount) {
    const SINGLE_PROOF_GAS = 250000;
    const AGGREGATED_PROOF_GAS = 300000;
    const PER_CLAIM_STORAGE_GAS = 300;

    const withoutAggregation = proofCount * SINGLE_PROOF_GAS;
    const withAggregation = AGGREGATED_PROOF_GAS + proofCount * PER_CLAIM_STORAGE_GAS;

    return {
      withoutAggregation,
      withAggregation,
      savings: withoutAggregation - withAggregation,
      savingsPercent: ((1 - withAggregation / withoutAggregation) * 100).toFixed(1),
    };
  }

  /**
   * Pad proof array to next power of 2.
   */
  padToPowerOfTwo(proofs) {
    const nextPower = Math.pow(2, Math.ceil(Math.log2(proofs.length)));

    if (proofs.length === nextPower) {
      return proofs;
    }

    // Create dummy proofs for padding
    const padding = Array(nextPower - proofs.length)
      .fill(null)
      .map(() => new Proof());

    return [...proofs, ...padding];
  }

  /**
   * Serialize aggregated proof for on-chain submission.
   */
  serializeForChain(rootNode) {
    return {
      proof: {
        pi_a: rootNode.proof.pi_a,
        pi_b: rootNode.proof.pi_b,
        pi_c: rootNode.proof.pi_c,
      },
      claimCount: this.extractClaimIndices(rootNode).length,
      rootHash: rootNode.hash,
    };
  }
}

/**
 * Batch claim processor using proof aggregation.
 */
export class BatchClaimProcessor {
  constructor(options = {}) {
    this.aggregator = new ProofAggregator(options);
  }

  /**
   * Process a batch of private claims with aggregated verification.
   */
  async processBatch(claims) {
    const proofs = claims.map((claim) => claim.proof || new Proof());

    console.log(`Aggregating ${claims.length} proofs...`);

    const startTime = Date.now();
    const aggregatedRoot = await this.aggregator.aggregate(proofs);
    const aggregationTime = Date.now() - startTime;

    console.log('Verifying aggregated proof...');
    const verifyStart = Date.now();
    const isValid = await this.aggregator.verifyAggregated(aggregatedRoot);
    const verifyTime = Date.now() - verifyStart;

    const gasEstimate = this.aggregator.estimateGasCost(claims.length);
    const claimIndices = this.aggregator.extractClaimIndices(aggregatedRoot);

    return {
      success: isValid,
      claimCount: claims.length,
      claimIndices,
      aggregationTimeMs: aggregationTime,
      verificationTimeMs: verifyTime,
      gasEstimate,
      serialized: this.aggregator.serializeForChain(aggregatedRoot),
    };
  }
}

// Export for use in other modules
export default ProofAggregator;
