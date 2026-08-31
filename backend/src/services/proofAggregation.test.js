/**
 * Tests for recursive proof aggregation.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Proof, ProofAggregator, BatchClaimProcessor } from './proofAggregation.js';

describe('Proof', () => {
  it('creates a proof with random field elements', () => {
    const proof = new Proof();
    assert.ok(proof.pi_a);
    assert.ok(proof.pi_b);
    assert.ok(proof.pi_c);
    assert.strictEqual(proof.protocol, 'groth16');
    assert.strictEqual(proof.curve, 'bn128');
  });

  it('serializes and deserializes correctly', () => {
    const proof = new Proof();
    const serialized = proof.serialize();
    const deserialized = Proof.deserialize(serialized);

    assert.strictEqual(deserialized.pi_a, proof.pi_a);
    assert.strictEqual(deserialized.pi_b, proof.pi_b);
    assert.strictEqual(deserialized.pi_c, proof.pi_c);
  });
});

describe('ProofAggregator', () => {
  let aggregator;

  beforeEach(() => {
    aggregator = new ProofAggregator({ batchSize: 8 });
  });

  it('aggregates a single proof', async () => {
    const proof = new Proof();
    const result = await aggregator.aggregate([proof]);

    assert.ok(result);
    assert.ok(result.proof instanceof Proof);
    assert.strictEqual(result.isLeaf(), true);
  });

  it('aggregates multiple proofs', async () => {
    const proofs = [new Proof(), new Proof(), new Proof(), new Proof()];
    const result = await aggregator.aggregate(proofs);

    assert.ok(result);
    assert.ok(result.proof instanceof Proof);
    assert.strictEqual(result.children.length, 2);
  });

  it('pads to power of two', async () => {
    const proofs = [new Proof(), new Proof(), new Proof()]; // 3 proofs
    const result = await aggregator.aggregate(proofs);

    // Should still work, padded to 4
    assert.ok(result);
  });

  it('verifies aggregated proof', async () => {
    const proofs = [new Proof(), new Proof(), new Proof(), new Proof()];
    const aggregated = await aggregator.aggregate(proofs);
    const isValid = await aggregator.verifyAggregated(aggregated);

    assert.strictEqual(isValid, true);
  });

  it('extracts claim indices', async () => {
    const proofs = [new Proof(), new Proof(), new Proof(), new Proof()];
    const aggregated = await aggregator.aggregate(proofs);
    const indices = aggregator.extractClaimIndices(aggregated);

    assert.deepStrictEqual(indices, [0, 1, 2, 3]);
  });

  it('estimates gas cost correctly', () => {
    const estimate = aggregator.estimateGasCost(100);

    assert.strictEqual(estimate.withoutAggregation, 25000000);
    assert.strictEqual(estimate.withAggregation, 330000);
    assert.strictEqual(estimate.savings, 24670000);
    assert.ok(parseFloat(estimate.savingsPercent) > 98);
  });

  it('scales gas cost with proof count', () => {
    const estimate1 = aggregator.estimateGasCost(10);
    const estimate2 = aggregator.estimateGasCost(100);
    const estimate3 = aggregator.estimateGasCost(1000);

    // Savings percentage should increase with count
    assert.ok(parseFloat(estimate1.savingsPercent) < parseFloat(estimate2.savingsPercent));
    assert.ok(parseFloat(estimate2.savingsPercent) < parseFloat(estimate3.savingsPercent));
  });
});

describe('BatchClaimProcessor', () => {
  let processor;

  beforeEach(() => {
    processor = new BatchClaimProcessor();
  });

  it('processes a batch of claims', async () => {
    const claims = [
      { id: '1', proof: new Proof() },
      { id: '2', proof: new Proof() },
      { id: '3', proof: new Proof() },
      { id: '4', proof: new Proof() },
    ];

    const result = await processor.processBatch(claims);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.claimCount, 4);
    assert.deepStrictEqual(result.claimIndices, [0, 1, 2, 3]);
    assert.ok(result.gasEstimate);
    assert.ok(result.serialized);
  });

  it('handles large batches', async () => {
    const claims = Array(64)
      .fill(null)
      .map((_, i) => ({ id: `${i}`, proof: new Proof() }));

    const result = await processor.processBatch(claims);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.claimCount, 64);
  });
});
