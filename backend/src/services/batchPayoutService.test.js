// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBatchPayoutService } from './batchPayoutService.js';

// ── In-memory repository stub ────────────────────────────────────────────────

function makeRepo() {
  const jobs = new Map();
  const recipientsByChunk = new Map();

  function _chunkKey(batchId, chunkIndex) {
    return `${batchId}:${chunkIndex}`;
  }

  return {
    createJob({ id, campaignId, totalRecipients, totalChunks, maxOpsPerTx, continueOnError, createdAt }) {
      jobs.set(id, {
        id,
        campaignId: campaignId ?? null,
        status: 'pending',
        totalRecipients,
        succeeded: 0,
        failed: 0,
        currentChunk: 0,
        totalChunks,
        maxOpsPerTx,
        continueOnError,
        createdAt: createdAt ?? new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        error: null,
      });
      return id;
    },
    getById(id) {
      return jobs.get(id);
    },
    updateJob(id, fields) {
      const job = jobs.get(id);
      if (!job) return;
      if (fields.status != null) job.status = fields.status;
      if (fields.succeeded != null) job.succeeded = fields.succeeded;
      if (fields.failed != null) job.failed = fields.failed;
      if (fields.currentChunk != null) job.currentChunk = fields.currentChunk;
      if (fields.totalChunks != null) job.totalChunks = fields.totalChunks;
      if (fields.startedAt != null) job.startedAt = fields.startedAt;
      if (fields.completedAt != null) job.completedAt = fields.completedAt;
      if (fields.error != null) job.error = fields.error;
    },
    insertRecipients(recipients) {
      let counter = 0;
      for (const r of recipients) {
        const key = _chunkKey(r.batchId, r.chunkIndex);
        if (!recipientsByChunk.has(key)) recipientsByChunk.set(key, []);
        recipientsByChunk.get(key).push({
          id: `rec-${counter++}`,
          batchId: r.batchId,
          recipientAddress: r.recipientAddress,
          amount: r.amount,
          chunkIndex: r.chunkIndex,
          status: 'pending',
          txHash: null,
          error: null,
          processedAt: null,
        });
      }
    },
    getRecipientsByChunk(batchId, chunkIndex) {
      return recipientsByChunk.get(_chunkKey(batchId, chunkIndex)) ?? [];
    },
    markChunkSucceeded(batchId, chunkIndex, txHash, processedAt) {
      const recs = recipientsByChunk.get(_chunkKey(batchId, chunkIndex)) ?? [];
      for (const r of recs) {
        if (r.status === 'pending') {
          r.status = 'succeeded';
          r.txHash = txHash;
          r.processedAt = processedAt;
        }
      }
    },
    markChunkFailed(batchId, chunkIndex, errorMessage, processedAt) {
      const recs = recipientsByChunk.get(_chunkKey(batchId, chunkIndex)) ?? [];
      for (const r of recs) {
        if (r.status === 'pending') {
          r.status = 'failed';
          r.error = errorMessage;
          r.processedAt = processedAt;
        }
      }
    },
  };
}

function makeAdapter({ succeedSim = true, resourceExceeded = false, submitHash = 'tx-hash-001' } = {}) {
  return {
    async buildAndSimulate(_from, _recipients) {
      if (resourceExceeded) return { success: false, resourceExceeded: true };
      if (!succeedSim) return { success: false };
      return { success: true, tx: { built: true } };
    },
    async submit(_tx) {
      return { hash: submitHash };
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('enqueueBatch creates a new job and returns created=true', () => {
  const repo = makeRepo();
  const service = createBatchPayoutService({ batchJobRepository: repo, sorobanAdapter: makeAdapter() });

  const { batchId, created } = service.enqueueBatch({
    from: 'GXXXX',
    recipients: [{ address: 'GAAA', amount: 100 }],
  });

  assert.equal(created, true);
  assert.equal(typeof batchId, 'string');
  const job = repo.getById(batchId);
  assert.equal(job.status, 'pending');
  assert.equal(job.totalRecipients, 1);
});

test('enqueueBatch is idempotent when batchId already exists', () => {
  const repo = makeRepo();
  const service = createBatchPayoutService({ batchJobRepository: repo, sorobanAdapter: makeAdapter() });

  const { batchId } = service.enqueueBatch({
    batchId: 'my-batch-id',
    from: 'GXXXX',
    recipients: [{ address: 'GAAA', amount: 100 }],
  });

  const { created } = service.enqueueBatch({
    batchId: 'my-batch-id',
    from: 'GXXXX',
    recipients: [{ address: 'GBBB', amount: 200 }],
  });

  assert.equal(created, false);
  assert.equal(batchId, 'my-batch-id');
  const job = repo.getById('my-batch-id');
  assert.equal(job.totalRecipients, 1);
});

test('enqueueBatch throws VALIDATION_ERROR when recipients is empty', () => {
  const repo = makeRepo();
  const service = createBatchPayoutService({ batchJobRepository: repo, sorobanAdapter: makeAdapter() });

  assert.throws(
    () => service.enqueueBatch({ from: 'GXXXX', recipients: [] }),
    (err) => err.code === 'VALIDATION_ERROR',
  );
});

test('enqueueBatch throws VALIDATION_ERROR when from is missing', () => {
  const repo = makeRepo();
  const service = createBatchPayoutService({ batchJobRepository: repo, sorobanAdapter: makeAdapter() });

  assert.throws(
    () => service.enqueueBatch({ from: '', recipients: [{ address: 'GAAA', amount: 100 }] }),
    (err) => err.code === 'VALIDATION_ERROR',
  );
});

test('enqueueBatch throws VALIDATION_ERROR when amount is not a positive integer', () => {
  const repo = makeRepo();
  const service = createBatchPayoutService({ batchJobRepository: repo, sorobanAdapter: makeAdapter() });

  assert.throws(
    () => service.enqueueBatch({ from: 'GXXXX', recipients: [{ address: 'GAAA', amount: -1 }] }),
    (err) => err.code === 'VALIDATION_ERROR',
  );
});

test('executeBatch marks job completed when simulation succeeds', async () => {
  const repo = makeRepo();
  const service = createBatchPayoutService({
    batchJobRepository: repo,
    sorobanAdapter: makeAdapter({ submitHash: 'hash-abc' }),
  });

  const { batchId } = service.enqueueBatch({
    from: 'GXXXX',
    recipients: [
      { address: 'GAAA', amount: 100 },
      { address: 'GBBB', amount: 200 },
    ],
  });

  const job = await service.executeBatch(batchId);
  assert.equal(job.status, 'completed');
  assert.equal(job.succeeded, 2);
  assert.equal(job.failed, 0);
});

test('executeBatch marks job failed when simulation fails and continueOnError=false', async () => {
  const repo = makeRepo();
  const service = createBatchPayoutService({
    batchJobRepository: repo,
    sorobanAdapter: makeAdapter({ succeedSim: false }),
  });

  const { batchId } = service.enqueueBatch({
    from: 'GXXXX',
    recipients: [{ address: 'GAAA', amount: 100 }],
    continueOnError: false,
  });

  const job = await service.executeBatch(batchId);
  assert.equal(job.status, 'failed');
});

test('executeBatch continues on error when continueOnError=true', async () => {
  const repo = makeRepo();
  const service = createBatchPayoutService({
    batchJobRepository: repo,
    sorobanAdapter: makeAdapter({ succeedSim: false }),
  });

  const { batchId } = service.enqueueBatch({
    from: 'GXXXX',
    recipients: [{ address: 'GAAA', amount: 100 }],
    continueOnError: true,
  });

  const job = await service.executeBatch(batchId);
  assert.equal(job.status, 'completed');
  assert.equal(job.failed, 1);
});

test('executeBatch respects maxOpsPerTx chunking', async () => {
  const repo = makeRepo();
  let simCalls = 0;
  const adapter = {
    async buildAndSimulate() {
      simCalls++;
      return { success: true, tx: {} };
    },
    async submit() {
      return { hash: 'h1' };
    },
  };

  const service = createBatchPayoutService({ batchJobRepository: repo, sorobanAdapter: adapter });

  const { batchId } = service.enqueueBatch({
    from: 'GXXXX',
    recipients: Array.from({ length: 5 }, (_, i) => ({ address: `G${i}`, amount: 10 })),
    maxOpsPerTx: 2,
  });

  const job = await service.executeBatch(batchId);
  assert.equal(job.totalChunks, 3);
  assert.equal(simCalls, 3);
  assert.equal(job.succeeded, 5);
});

test('executeBatch throws NOT_FOUND for unknown batchId', async () => {
  const repo = makeRepo();
  const service = createBatchPayoutService({ batchJobRepository: repo, sorobanAdapter: makeAdapter() });

  await assert.rejects(
    () => service.executeBatch('nonexistent'),
    (err) => err.code === 'NOT_FOUND',
  );
});

test('executeBatch returns immediately if job is already completed', async () => {
  const repo = makeRepo();
  const service = createBatchPayoutService({ batchJobRepository: repo, sorobanAdapter: makeAdapter() });

  const { batchId } = service.enqueueBatch({
    from: 'GXXXX',
    recipients: [{ address: 'GAAA', amount: 100 }],
  });

  await service.executeBatch(batchId);
  const jobAgain = await service.executeBatch(batchId);
  assert.equal(jobAgain.status, 'completed');
});

test('getBatch returns undefined for unknown id', () => {
  const repo = makeRepo();
  const service = createBatchPayoutService({ batchJobRepository: repo, sorobanAdapter: makeAdapter() });
  assert.equal(service.getBatch('no-such-id'), undefined);
});
