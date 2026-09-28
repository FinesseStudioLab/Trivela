import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SorobanTransactionSubmitter, NonceQueue } from './sorobanTransactionSubmitter.js';

describe('NonceQueue', () => {
  let queue;

  beforeEach(() => {
    queue = new NonceQueue();
  });

  it('should increment nonce sequentially', async () => {
    const nonce1 = await queue.getNextNonce('account1');
    const nonce2 = await queue.getNextNonce('account1');
    const nonce3 = await queue.getNextNonce('account1');

    expect(nonce1).toBe(1);
    expect(nonce2).toBe(2);
    expect(nonce3).toBe(3);
  });

  it('should handle multiple accounts independently', async () => {
    const nonce1a = await queue.getNextNonce('account1');
    const nonce2a = await queue.getNextNonce('account2');
    const nonce1b = await queue.getNextNonce('account1');

    expect(nonce1a).toBe(1);
    expect(nonce2a).toBe(1);
    expect(nonce1b).toBe(2);
  });

  it('should reset nonce on demand', async () => {
    await queue.getNextNonce('account1');
    await queue.getNextNonce('account1');

    queue.resetNonce('account1');

    const nextNonce = await queue.getNextNonce('account1');
    expect(nextNonce).toBe(1);
  });

  it('should process enqueued transactions sequentially', async () => {
    const results = [];
    const submitFn = vi.fn(async (tx, nonce) => {
      results.push({ tx, nonce });
      return { hash: `tx-${nonce}` };
    });

    const tx1 = { accountId: 'account1', transaction: 'tx1', submitFn };
    const tx2 = { accountId: 'account1', transaction: 'tx2', submitFn };

    await queue.enqueue(tx1);
    await queue.enqueue(tx2);

    expect(results).toHaveLength(2);
    expect(results[0].nonce).toBe(1);
    expect(results[1].nonce).toBe(2);
  });
});

describe('SorobanTransactionSubmitter', () => {
  let submitter;
  let mockRpcClient;
  let mockDb;

  beforeEach(() => {
    mockRpcClient = {
      request: vi.fn(async (req) => ({
        result: { hash: 'tx-hash-123' },
      })),
    };

    mockDb = {};

    submitter = new SorobanTransactionSubmitter({
      rpcClient: mockRpcClient,
      db: mockDb,
    });
  });

  it('should submit transaction with proper nonce', async () => {
    const result = await submitter.submitTransaction('account1', 'raw-tx-data');

    expect(mockRpcClient.request).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('should handle submission errors gracefully', async () => {
    mockRpcClient.request.mockImplementationOnce(async () => ({
      error: { code: -32000, message: 'Invalid account nonce' },
    }));

    await expect(
      submitter.submitTransaction('account1', 'raw-tx-data')
    ).rejects.toThrow();
  });

  it('should track transaction status', async () => {
    mockRpcClient.request.mockImplementationOnce(async () => ({
      result: { status: 'SUCCESS' },
    }));

    const status = await submitter.trackTransactionStatus('tx-hash-123');

    expect(status).toEqual({ status: 'SUCCESS' });
  });

  it('should return non-queue instance', () => {
    const queue = submitter.getNonceQueue();
    expect(queue).toBeDefined();
    expect(queue).toBeInstanceOf(NonceQueue);
  });
});
