// @ts-check
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBatchPayoutService,
  createInMemoryBatchStore,
  chunkArray,
  RECIPIENT_STATUS,
  BATCH_STATUS,
  BatchPayoutError,
} from './batchPayoutService.js';

// ── chunkArray helper ─────────────────────────────────────────────────────────

test('chunkArray splits an array into equal-sized chunks', () => {
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('chunkArray returns one chunk when size >= array length', () => {
  assert.deepEqual(chunkArray([1, 2, 3], 10), [[1, 2, 3]]);
});

test('chunkArray returns one-element chunks when size is 1', () => {
  assert.deepEqual(chunkArray(['a', 'b'], 1), [['a'], ['b']]);
});

test('chunkArray returns empty array for empty input', () => {
  assert.deepEqual(chunkArray([], 5), []);
});

// ── in-memory store ───────────────────────────────────────────────────────────

test('createInMemoryBatchStore round-trips a record', () => {
  const store = createInMemoryBatchStore();
  const rec = {
    id: 'b1',
    campaignId: 'c1',
    status: BATCH_STATUS.PENDING,
    recipients: [],
    totalRecipients: 0,
    successCount: 0,
    failCount: 0,
    chunksCompleted: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
  };
  store.saveBatch(rec);
  assert.equal(store.getBatch('b1').id, 'b1');
});

test('createInMemoryBatchStore returns undefined for unknown batchId', () => {
  const store = createInMemoryBatchStore();
  assert.equal(store.getBatch('nope'), undefined);
});

test('updateBatch throws for unknown batchId', () => {
  const store = createInMemoryBatchStore();
  assert.throws(() => store.updateBatch('ghost', { status: BATCH_STATUS.RUNNING }), BatchPayoutError);
});

// ── registerBatch ─────────────────────────────────────────────────────────────

function makeService(overrides = {}) {
  const silentLog = { info() {}, warn() {}, error() {} };
  return createBatchPayoutService({
    simulateChunk: async () => ({ success: true, resourceLimitExceeded: false }),
    submitChunk: async () => ({ success: true, txHash: 'TX_HASH' }),
    store: createInMemoryBatchStore(),
    maxOpsPerChunk: 3,
    failMode: 'continue',
    log: silentLog,
    ...overrides,
  });
}

const RECIPIENTS = [
  { address: 'GAAA', amount: '100' },
  { address: 'GBBB', amount: '200' },
  { address: 'GCCC', amount: '300' },
];

test('registerBatch creates a batch in PENDING state', () => {
  const svc = makeService();
  const batch = svc.registerBatch({ batchId: 'b1', recipients: RECIPIENTS, campaignId: 'c1' });
  assert.equal(batch.id, 'b1');
  assert.equal(batch.status, BATCH_STATUS.PENDING);
  assert.equal(batch.totalRecipients, 3);
  assert.equal(batch.successCount, 0);
  assert.equal(batch.failCount, 0);
});

test('registerBatch is idempotent — second call returns the same record', () => {
  const svc = makeService();
  const first = svc.registerBatch({ batchId: 'b1', recipients: RECIPIENTS, campaignId: 'c1' });
  const second = svc.registerBatch({
    batchId: 'b1',
    recipients: [{ address: 'GDDD', amount: '99' }],
    campaignId: 'c2',
  });
  assert.deepEqual(first, second);
  assert.equal(second.totalRecipients, 3); // original recipients preserved
});

test('registerBatch rejects empty recipients array', () => {
  const svc = makeService();
  assert.throws(
    () => svc.registerBatch({ batchId: 'b1', recipients: [], campaignId: 'c1' }),
    BatchPayoutError,
  );
});

test('registerBatch rejects a recipient missing amount', () => {
  const svc = makeService();
  assert.throws(
    () =>
      svc.registerBatch({
        batchId: 'b1',
        recipients: [{ address: 'GAAA', amount: '' }],
        campaignId: 'c1',
      }),
    BatchPayoutError,
  );
});

// ── executeBatch — happy path ─────────────────────────────────────────────────

test('executeBatch marks all recipients SUCCESS when everything passes', async () => {
  const svc = makeService();
  svc.registerBatch({ batchId: 'b1', recipients: RECIPIENTS, campaignId: 'c1' });
  const result = await svc.executeBatch('b1');

  assert.equal(result.status, BATCH_STATUS.COMPLETED);
  assert.equal(result.successCount, 3);
  assert.equal(result.failCount, 0);
  for (const r of result.recipients) {
    assert.equal(r.status, RECIPIENT_STATUS.SUCCESS);
    assert.equal(r.txHash, 'TX_HASH');
  }
});

test('executeBatch uses the correct number of chunks (ceil(N/k))', async () => {
  let chunkCallCount = 0;
  const svc = makeService({
    simulateChunk: async () => ({ success: true, resourceLimitExceeded: false }),
    submitChunk: async () => {
      chunkCallCount += 1;
      return { success: true, txHash: 'TX' };
    },
    maxOpsPerChunk: 2,
  });
  svc.registerBatch({ batchId: 'b1', recipients: RECIPIENTS, campaignId: 'c1' }); // 3 recipients, k=2 → 2 chunks
  await svc.executeBatch('b1');
  assert.equal(chunkCallCount, 2);
});

test('executeBatch skips already-completed batch without re-running', async () => {
  let callCount = 0;
  const svc = makeService({
    submitChunk: async () => {
      callCount += 1;
      return { success: true, txHash: 'TX' };
    },
  });
  svc.registerBatch({ batchId: 'b1', recipients: RECIPIENTS, campaignId: 'c1' });
  await svc.executeBatch('b1');
  const firstCallCount = callCount;
  await svc.executeBatch('b1'); // second call — should be a no-op
  assert.equal(callCount, firstCallCount);
});

test('executeBatch rejects if batch does not exist', async () => {
  const svc = makeService();
  await assert.rejects(() => svc.executeBatch('ghost'), BatchPayoutError);
});

test('executeBatch rejects concurrent execution of the same batch', async () => {
  let resolveSubmit;
  const submitDone = new Promise((r) => { resolveSubmit = r; });

  const svc = makeService({
    submitChunk: async () => {
      await submitDone;
      return { success: true, txHash: 'TX' };
    },
  });
  svc.registerBatch({ batchId: 'b1', recipients: RECIPIENTS, campaignId: 'c1' });
  const first = svc.executeBatch('b1');
  await assert.rejects(() => svc.executeBatch('b1'), BatchPayoutError);
  resolveSubmit();
  await first;
});

// ── executeBatch — adaptive k ─────────────────────────────────────────────────

test('executeBatch halves k on resourceLimitExceeded and retries', async () => {
  const simulateCalls = [];
  let firstCall = true;

  const svc = makeService({
    simulateChunk: async (ops) => {
      simulateCalls.push(ops.length);
      if (firstCall && ops.length > 1) {
        firstCall = false;
        return { success: false, resourceLimitExceeded: true };
      }
      return { success: true, resourceLimitExceeded: false };
    },
    maxOpsPerChunk: 4,
  });

  const recipients = [
    { address: 'GA', amount: '1' },
    { address: 'GB', amount: '2' },
    { address: 'GC', amount: '3' },
    { address: 'GD', amount: '4' },
  ];
  svc.registerBatch({ batchId: 'b1', recipients, campaignId: 'c1' });
  const result = await svc.executeBatch('b1');

  // First simulate call was 4 ops (failed), second was 2 (halved)
  assert.equal(simulateCalls[0], 4);
  assert.equal(simulateCalls[1], 2);
  assert.equal(result.successCount, 4);
  assert.equal(result.status, BATCH_STATUS.COMPLETED);
});

test('executeBatch fails ops when resource limit hits k=1 (cannot halve further)', async () => {
  const svc = makeService({
    simulateChunk: async () => ({ success: false, resourceLimitExceeded: true, errorMessage: 'too big' }),
    maxOpsPerChunk: 1,
  });
  const recipients = [{ address: 'GA', amount: '1' }, { address: 'GB', amount: '2' }];
  svc.registerBatch({ batchId: 'b1', recipients, campaignId: 'c1' });
  const result = await svc.executeBatch('b1');

  assert.equal(result.failCount, 2);
  assert.equal(result.status, BATCH_STATUS.PARTIAL);
  for (const r of result.recipients) {
    assert.equal(r.status, RECIPIENT_STATUS.FAILED);
  }
});

// ── executeBatch — fail modes ─────────────────────────────────────────────────

test('continue mode: marks failed chunk and processes the rest', async () => {
  let callIndex = 0;
  const svc = makeService({
    simulateChunk: async () => ({ success: true, resourceLimitExceeded: false }),
    submitChunk: async () => {
      callIndex += 1;
      if (callIndex === 1) return { success: false, errorMessage: 'rpc error' };
      return { success: true, txHash: 'TX2' };
    },
    maxOpsPerChunk: 1,
    failMode: 'continue',
  });
  const recipients = [{ address: 'GA', amount: '1' }, { address: 'GB', amount: '2' }];
  svc.registerBatch({ batchId: 'b1', recipients, campaignId: 'c1' });
  const result = await svc.executeBatch('b1');

  assert.equal(result.failCount, 1);
  assert.equal(result.successCount, 1);
  assert.equal(result.status, BATCH_STATUS.PARTIAL);
});

test('abort mode: stops after first submission failure', async () => {
  let submitCount = 0;
  const svc = makeService({
    simulateChunk: async () => ({ success: true, resourceLimitExceeded: false }),
    submitChunk: async () => {
      submitCount += 1;
      return { success: false, errorMessage: 'rpc error' };
    },
    maxOpsPerChunk: 1,
    failMode: 'abort',
  });
  const recipients = [
    { address: 'GA', amount: '1' },
    { address: 'GB', amount: '2' },
    { address: 'GC', amount: '3' },
  ];
  svc.registerBatch({ batchId: 'b1', recipients, campaignId: 'c1' });
  const result = await svc.executeBatch('b1');

  assert.equal(submitCount, 1); // stopped after first failure
  assert.equal(result.status, BATCH_STATUS.FAILED);
});

test('abort mode: stops after first simulation failure', async () => {
  let simCount = 0;
  const svc = makeService({
    simulateChunk: async () => {
      simCount += 1;
      return { success: false, resourceLimitExceeded: false, errorMessage: 'sim error' };
    },
    maxOpsPerChunk: 1,
    failMode: 'abort',
  });
  const recipients = [{ address: 'GA', amount: '1' }, { address: 'GB', amount: '2' }];
  svc.registerBatch({ batchId: 'b1', recipients, campaignId: 'c1' });
  const result = await svc.executeBatch('b1');

  assert.equal(simCount, 1);
  assert.equal(result.status, BATCH_STATUS.FAILED);
});

// ── executeBatch — per-recipient errors ───────────────────────────────────────

test('per-recipient errors from submitChunk are recorded correctly', async () => {
  const svc = makeService({
    submitChunk: async (ops) => ({
      success: true,
      txHash: 'TX1',
      recipientErrors: { [ops[0].address]: 'account frozen' },
    }),
    maxOpsPerChunk: 3,
  });
  svc.registerBatch({ batchId: 'b1', recipients: RECIPIENTS, campaignId: 'c1' });
  const result = await svc.executeBatch('b1');

  const frozen = result.recipients.find((r) => r.address === 'GAAA');
  assert.equal(frozen.status, RECIPIENT_STATUS.FAILED);
  assert.equal(frozen.errorMessage, 'account frozen');
  assert.equal(result.failCount, 1);
  assert.equal(result.successCount, 2);
  assert.equal(result.status, BATCH_STATUS.PARTIAL);
});

// ── executeBatch — checkpointing / resume ─────────────────────────────────────

test('executeBatch resumes from first pending recipient after partial failure', async () => {
  const store = createInMemoryBatchStore();
  const silentLog = { info() {}, warn() {}, error() {} };
  let submitCount = 0;

  function makeSvc(failFirst) {
    return createBatchPayoutService({
      simulateChunk: async () => ({ success: true, resourceLimitExceeded: false }),
      submitChunk: async () => {
        submitCount += 1;
        if (failFirst && submitCount === 1) return { success: false, errorMessage: 'transient' };
        return { success: true, txHash: 'TX_OK' };
      },
      store,
      maxOpsPerChunk: 1,
      failMode: 'continue',
      log: silentLog,
    });
  }

  // First run: first op fails
  const svc1 = makeSvc(true);
  svc1.registerBatch({ batchId: 'b1', recipients: RECIPIENTS, campaignId: 'c1' });
  const partial = await svc1.executeBatch('b1');
  assert.equal(partial.status, BATCH_STATUS.PARTIAL);
  assert.equal(partial.failCount, 1);
  assert.equal(partial.successCount, 2);

  // Reset submit counter; second run should not re-submit already-succeeded recipients
  submitCount = 0;
  const svc2 = makeSvc(false);
  // Force the failed recipient back to pending so it can be retried
  const stored = store.getBatch('b1');
  stored.recipients[0].status = RECIPIENT_STATUS.PENDING;
  stored.recipients[0].errorMessage = null;
  store.updateBatch('b1', { recipients: stored.recipients, status: BATCH_STATUS.PENDING });

  const final = await svc2.executeBatch('b1');
  assert.equal(submitCount, 1); // only the previously-failed recipient was resubmitted
  assert.equal(final.successCount, 3);
  assert.equal(final.status, BATCH_STATUS.COMPLETED);
});

// ── getBatch / listBatches ────────────────────────────────────────────────────

test('getBatch returns undefined for unknown batchId', () => {
  const svc = makeService();
  assert.equal(svc.getBatch('ghost'), undefined);
});

test('listBatches returns all registered batches in reverse-creation order', async () => {
  const svc = makeService();
  svc.registerBatch({ batchId: 'b1', recipients: [{ address: 'GA', amount: '1' }], campaignId: 'c1' });
  // Small delay so createdAt strings differ
  await new Promise((r) => setTimeout(r, 2));
  svc.registerBatch({ batchId: 'b2', recipients: [{ address: 'GB', amount: '2' }], campaignId: 'c1' });

  const list = svc.listBatches();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'b2'); // most recent first
});
