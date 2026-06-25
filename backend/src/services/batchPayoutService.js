// @ts-check
import { randomUUID } from 'node:crypto';

const DEFAULT_MAX_OPS_PER_TX = 50;
const MIN_CHUNK_SIZE = 1;

/**
 * @typedef {{ id: string, campaignId: string|null, status: string, totalRecipients: number, succeeded: number, failed: number, currentChunk: number, totalChunks: number|null, maxOpsPerTx: number, continueOnError: boolean, createdAt: string, startedAt: string|null, completedAt: string|null, error: string|null }} BatchPayoutJob
 * @typedef {{ id: string, batchId: string, recipientAddress: string, amount: number, chunkIndex: number, status: string, txHash: string|null, error: string|null, processedAt: string|null }} BatchRecipient
 * @typedef {{ address: string, amount: number }} Recipient
 */

/**
 * Split an array into chunks of at most `size` elements.
 * @template T
 * @param {T[]} items
 * @param {number} size
 * @returns {T[][]}
 */
function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * @param {{
 *   batchJobRepository: ReturnType<import('../dal/sqliteBatchJobRepository.js').createSqliteBatchJobRepository>,
 *   sorobanAdapter: {
 *     buildAndSimulate: (from: string, recipients: Recipient[]) => Promise<{ success: boolean, resourceExceeded?: boolean, tx?: unknown }>,
 *     submit: (tx: unknown) => Promise<{ hash: string }>,
 *   },
 *   rpcPool?: ReturnType<import('../rpcPool.js').createRpcPool>,
 *   logger?: { info?: Function, warn?: Function, error?: Function },
 *   operatorSecret?: string,
 * }} deps
 */
export function createBatchPayoutService({
  batchJobRepository,
  sorobanAdapter,
  rpcPool,
  logger = console,
  operatorSecret,
}) {
  /**
   * Idempotent enqueue: if a job with batchId already exists return it unchanged.
   *
   * @param {{
   *   batchId?: string,
   *   from: string,
   *   recipients: Recipient[],
   *   campaignId?: string | null,
   *   maxOpsPerTx?: number,
   *   continueOnError?: boolean,
   * }} params
   * @returns {{ batchId: string, created: boolean }}
   */
  function enqueueBatch({ batchId, from, recipients, campaignId, maxOpsPerTx, continueOnError = true }) {
    if (!from || typeof from !== 'string') {
      throw Object.assign(new Error('"from" address is required'), { code: 'VALIDATION_ERROR' });
    }
    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw Object.assign(new Error('"recipients" must be a non-empty array'), { code: 'VALIDATION_ERROR' });
    }
    for (const r of recipients) {
      if (!r.address || typeof r.address !== 'string') {
        throw Object.assign(new Error('Each recipient must have a string "address"'), { code: 'VALIDATION_ERROR' });
      }
      if (typeof r.amount !== 'number' || r.amount <= 0 || !Number.isInteger(r.amount)) {
        throw Object.assign(new Error('Each recipient must have a positive integer "amount"'), { code: 'VALIDATION_ERROR' });
      }
    }

    const id = batchId ?? randomUUID();
    const existing = batchJobRepository.getById(id);
    if (existing) {
      return { batchId: id, created: false };
    }

    const k = Math.max(MIN_CHUNK_SIZE, maxOpsPerTx ?? DEFAULT_MAX_OPS_PER_TX);
    const chunks = chunk(recipients, k);

    batchJobRepository.createJob({
      id,
      campaignId: campaignId ?? null,
      totalRecipients: recipients.length,
      totalChunks: chunks.length,
      maxOpsPerTx: k,
      continueOnError,
      createdAt: new Date().toISOString(),
    });

    const dbRecipients = chunks.flatMap((ch, chunkIdx) =>
      ch.map((r) => ({
        batchId: id,
        recipientAddress: r.address,
        amount: r.amount,
        chunkIndex: chunkIdx,
      })),
    );
    batchJobRepository.insertRecipients(dbRecipients);

    logger.info?.(`batch_payout:enqueued batchId=${id} recipients=${recipients.length} chunks=${chunks.length}`);
    return { batchId: id, created: true };
  }

  /**
   * Execute a previously enqueued batch.
   *
   * Processes chunk by chunk, checkpointing after each. On resource-exceeded
   * errors the chunk is split in half (adaptive k). Respects continueOnError:
   * when false, the first chunk failure aborts the whole batch.
   *
   * @param {string} batchId
   * @returns {Promise<BatchPayoutJob>}
   */
  async function executeBatch(batchId) {
    const job = batchJobRepository.getById(batchId);
    if (!job) {
      throw Object.assign(new Error(`Batch ${batchId} not found`), { code: 'NOT_FOUND' });
    }
    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }
    if (job.status === 'running') {
      throw Object.assign(new Error(`Batch ${batchId} is already running`), { code: 'CONFLICT' });
    }

    const startedAt = new Date().toISOString();
    batchJobRepository.updateJob(batchId, { status: 'running', startedAt });

    let succeeded = job.succeeded;
    let failed = job.failed;
    const totalChunks = job.totalChunks ?? 0;

    for (let chunkIdx = job.currentChunk; chunkIdx < totalChunks; chunkIdx++) {
      const recipients = batchJobRepository.getRecipientsByChunk(batchId, chunkIdx);
      const pending = recipients.filter((r) => r.status === 'pending');

      if (pending.length === 0) {
        batchJobRepository.updateJob(batchId, { currentChunk: chunkIdx + 1 });
        continue;
      }

      const chunkResult = await _processChunk(batchId, chunkIdx, pending, job.continueOnError);
      succeeded += chunkResult.succeeded;
      failed += chunkResult.failed;

      batchJobRepository.updateJob(batchId, {
        succeeded,
        failed,
        currentChunk: chunkIdx + 1,
      });

      if (chunkResult.aborted) {
        const completedAt = new Date().toISOString();
        batchJobRepository.updateJob(batchId, {
          status: 'failed',
          completedAt,
          error: chunkResult.error ?? 'Chunk failed and continueOnError=false',
        });
        logger.warn?.(`batch_payout:aborted batchId=${batchId} atChunk=${chunkIdx}`);
        return batchJobRepository.getById(batchId);
      }
    }

    const completedAt = new Date().toISOString();
    batchJobRepository.updateJob(batchId, {
      status: 'completed',
      succeeded,
      failed,
      completedAt,
    });

    logger.info?.(`batch_payout:done batchId=${batchId} succeeded=${succeeded} failed=${failed}`);
    return batchJobRepository.getById(batchId);
  }

  /**
   * Process a single chunk of recipients, with adaptive halving on resource exceeded.
   *
   * @param {string} batchId
   * @param {number} chunkIdx
   * @param {BatchRecipient[]} pending
   * @param {boolean} continueOnError
   * @returns {Promise<{ succeeded: number, failed: number, aborted: boolean, error?: string }>}
   */
  async function _processChunk(batchId, chunkIdx, pending, continueOnError) {
    let currentPending = pending;
    let subChunkSize = currentPending.length;

    while (currentPending.length > 0 && subChunkSize >= MIN_CHUNK_SIZE) {
      const subChunk = currentPending.slice(0, subChunkSize);
      const recipientsForTx = subChunk.map((r) => ({
        address: r.recipientAddress,
        amount: r.amount,
      }));

      let rpcUrl;
      try {
        if (rpcPool) rpcUrl = await rpcPool.acquire();

        const sim = await sorobanAdapter.buildAndSimulate(recipientsForTx[0]?.address ?? '', recipientsForTx);

        if (!sim.success && sim.resourceExceeded && subChunkSize > MIN_CHUNK_SIZE) {
          subChunkSize = Math.max(MIN_CHUNK_SIZE, Math.floor(subChunkSize / 2));
          logger.warn?.(`batch_payout:resource_exceeded batchId=${batchId} chunkIdx=${chunkIdx} halving to k=${subChunkSize}`);
          continue;
        }

        if (!sim.success) {
          const errorMsg = 'Simulation failed';
          batchJobRepository.markChunkFailed(batchId, chunkIdx, errorMsg, new Date().toISOString());
          if (!continueOnError) {
            return { succeeded: 0, failed: subChunk.length, aborted: true, error: errorMsg };
          }
          return { succeeded: 0, failed: currentPending.length, aborted: false };
        }

        const submission = await sorobanAdapter.submit(sim.tx);
        const processedAt = new Date().toISOString();
        const processedIds = new Set(subChunk.map((r) => r.id));

        for (const r of subChunk) {
          batchJobRepository.markChunkSucceeded(r.batchId, r.chunkIndex, submission.hash, processedAt);
          void processedIds;
        }

        currentPending = currentPending.slice(subChunkSize);
        subChunkSize = currentPending.length;
        return { succeeded: subChunk.length, failed: 0, aborted: false };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        batchJobRepository.markChunkFailed(batchId, chunkIdx, errorMsg, new Date().toISOString());
        logger.error?.({ err }, `batch_payout:chunk_error batchId=${batchId} chunkIdx=${chunkIdx}`);
        if (!continueOnError) {
          return { succeeded: 0, failed: currentPending.length, aborted: true, error: errorMsg };
        }
        return { succeeded: 0, failed: currentPending.length, aborted: false };
      } finally {
        if (rpcPool && rpcUrl) rpcPool.release();
      }
    }

    return { succeeded: 0, failed: currentPending.length, aborted: false };
  }

  /**
   * @param {string} batchId
   */
  function getBatch(batchId) {
    return batchJobRepository.getById(batchId);
  }

  return { enqueueBatch, executeBatch, getBatch };
}
