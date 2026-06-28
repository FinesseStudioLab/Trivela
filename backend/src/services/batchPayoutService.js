// @ts-check
// Batch payout transaction builder — packs up to k credit ops per Soroban tx,
// adapts k on resource-limit failures, checkpoints per chunk, and enforces
// idempotency so retried batches cannot double-pay.

const MIN_OPS_PER_CHUNK = 1;

export const RECIPIENT_STATUS = /** @type {const} */ ({
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
});

export const BATCH_STATUS = /** @type {const} */ ({
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  PARTIAL: 'partial',
  FAILED: 'failed',
});

export class BatchPayoutError extends Error {
  /** @param {string} message @param {string} code */
  constructor(message, code) {
    super(message);
    this.name = 'BatchPayoutError';
    this.code = code;
  }
}

/**
 * @typedef {{ address: string; amount: string }} PayoutOp
 * @typedef {{ address: string; amount: string; status: string; txHash: string | null; errorMessage: string | null }} RecipientRecord
 * @typedef {{
 *   id: string;
 *   campaignId: string;
 *   status: string;
 *   recipients: RecipientRecord[];
 *   totalRecipients: number;
 *   successCount: number;
 *   failCount: number;
 *   chunksCompleted: number;
 *   createdAt: string;
 *   updatedAt: string;
 *   completedAt: string | null;
 * }} BatchRecord
 */

/**
 * Creates an in-memory batch store.
 * Swap for a persistent implementation (SQLite/Postgres) in production.
 */
export function createInMemoryBatchStore() {
  /** @type {Map<string, BatchRecord>} */
  const batches = new Map();

  return {
    /** @param {BatchRecord} record */
    saveBatch(record) {
      batches.set(record.id, JSON.parse(JSON.stringify(record)));
    },
    /** @param {string} batchId @returns {BatchRecord | undefined} */
    getBatch(batchId) {
      const r = batches.get(batchId);
      return r ? JSON.parse(JSON.stringify(r)) : undefined;
    },
    /** @param {string} batchId @param {Partial<BatchRecord>} updates */
    updateBatch(batchId, updates) {
      const existing = batches.get(batchId);
      if (!existing) throw new BatchPayoutError(`Batch ${batchId} not found`, 'NOT_FOUND');
      batches.set(batchId, {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      });
    },
    /** @returns {BatchRecord[]} */
    listBatches() {
      return Array.from(batches.values())
        .map((r) => JSON.parse(JSON.stringify(r)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  };
}

/**
 * Creates the batch payout service.
 *
 * @param {{
 *   simulateChunk: (ops: PayoutOp[]) => Promise<{ success: boolean; resourceLimitExceeded: boolean; errorMessage?: string }>,
 *   submitChunk: (ops: PayoutOp[]) => Promise<{ success: boolean; txHash?: string; recipientErrors?: Record<string, string>; errorMessage?: string }>,
 *   store: ReturnType<typeof createInMemoryBatchStore>,
 *   maxOpsPerChunk?: number,
 *   failMode?: 'continue' | 'abort',
 *   log?: Pick<Console, 'info' | 'warn' | 'error'>,
 * }} deps
 */
export function createBatchPayoutService({
  simulateChunk,
  submitChunk,
  store,
  maxOpsPerChunk = 50,
  failMode = 'continue',
  log = console,
}) {
  /**
   * Register a new batch. Returns immediately; call executeBatch(id) to run.
   * Idempotent: re-submitting a batchId that already exists returns the
   * existing record without modifying it — prevents duplicate submissions.
   *
   * @param {{ batchId: string; recipients: Array<{address: string; amount: string}>; campaignId: string }} params
   * @returns {BatchRecord}
   */
  function registerBatch({ batchId, recipients, campaignId }) {
    if (!batchId || typeof batchId !== 'string') {
      throw new BatchPayoutError('batchId is required', 'INVALID_INPUT');
    }
    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new BatchPayoutError('recipients must be a non-empty array', 'INVALID_INPUT');
    }
    for (const r of recipients) {
      if (!r.address || typeof r.address !== 'string') {
        throw new BatchPayoutError('each recipient must have a string address', 'INVALID_INPUT');
      }
      if (!r.amount || typeof r.amount !== 'string') {
        throw new BatchPayoutError('each recipient must have a string amount', 'INVALID_INPUT');
      }
    }

    const existing = store.getBatch(batchId);
    if (existing) return existing; // idempotency

    /** @type {BatchRecord} */
    const record = {
      id: batchId,
      campaignId: campaignId ?? '',
      status: BATCH_STATUS.PENDING,
      recipients: recipients.map((r) => ({
        address: r.address,
        amount: r.amount,
        status: RECIPIENT_STATUS.PENDING,
        txHash: null,
        errorMessage: null,
      })),
      totalRecipients: recipients.length,
      successCount: 0,
      failCount: 0,
      chunksCompleted: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
    };

    store.saveBatch(record);
    return store.getBatch(batchId);
  }

  /**
   * Execute a registered batch. Safe to call after a partial failure —
   * resumes from the first still-pending recipient (checkpoint recovery).
   *
   * @param {string} batchId
   * @returns {Promise<BatchRecord>}
   */
  async function executeBatch(batchId) {
    const batch = store.getBatch(batchId);
    if (!batch) throw new BatchPayoutError(`Batch ${batchId} not found`, 'NOT_FOUND');

    if (batch.status === BATCH_STATUS.COMPLETED) {
      log.info(`batch:skip_completed id=${batchId}`);
      return batch;
    }
    if (batch.status === BATCH_STATUS.RUNNING) {
      throw new BatchPayoutError(`Batch ${batchId} is already running`, 'ALREADY_RUNNING');
    }

    store.updateBatch(batchId, { status: BATCH_STATUS.RUNNING });

    // Resume: only process recipients that are still pending.
    // Recipients already marked success/failed from a previous partial run are skipped.
    const queue = batch.recipients
      .filter((r) => r.status === RECIPIENT_STATUS.PENDING)
      .map((r) => ({ ...r })); // mutable copies

    let successCount = batch.successCount;
    let failCount = batch.failCount;
    let chunksCompleted = batch.chunksCompleted;
    let k = Math.min(maxOpsPerChunk, queue.length || 1);
    let head = 0;
    let aborted = false;

    while (head < queue.length && !aborted) {
      const chunk = queue.slice(head, head + k);

      log.info(`batch:chunk_start id=${batchId} head=${head} ops=${chunk.length} k=${k}`);

      const simResult = await simulateChunk(chunk.map((r) => ({ address: r.address, amount: r.amount })));

      if (!simResult.success) {
        if (simResult.resourceLimitExceeded && k > MIN_OPS_PER_CHUNK) {
          // Halve chunk size and retry the same head position
          k = Math.max(MIN_OPS_PER_CHUNK, Math.floor(k / 2));
          log.warn(`batch:adaptive_k id=${batchId} reduced_to=${k}`);
          continue;
        }

        // Simulation failed for a non-resource reason, or k is already minimum
        const reason = simResult.errorMessage || 'simulation failed';
        for (const r of chunk) {
          r.status = RECIPIENT_STATUS.FAILED;
          r.errorMessage = reason;
        }
        failCount += chunk.length;

        if (failMode === 'abort') {
          aborted = true;
          break;
        }

        head += chunk.length;
        _checkpoint(batchId, queue, { successCount, failCount, chunksCompleted });
        continue;
      }

      // Simulation passed — submit the chunk
      const submitResult = await submitChunk(chunk.map((r) => ({ address: r.address, amount: r.amount })));

      if (submitResult.success) {
        for (const r of chunk) {
          r.status = RECIPIENT_STATUS.SUCCESS;
          r.txHash = submitResult.txHash ?? null;
        }
        // Apply any per-recipient errors reported by the contract (partial ops failure)
        if (submitResult.recipientErrors) {
          for (const [addr, errMsg] of Object.entries(submitResult.recipientErrors)) {
            const r = chunk.find((c) => c.address === addr);
            if (r) {
              r.status = RECIPIENT_STATUS.FAILED;
              r.errorMessage = errMsg;
            }
          }
        }
        const chunkSuccess = chunk.filter((r) => r.status === RECIPIENT_STATUS.SUCCESS).length;
        const chunkFail = chunk.filter((r) => r.status === RECIPIENT_STATUS.FAILED).length;
        successCount += chunkSuccess;
        failCount += chunkFail;
      } else {
        const reason = submitResult.errorMessage || 'submission failed';
        for (const r of chunk) {
          r.status = RECIPIENT_STATUS.FAILED;
          r.errorMessage = reason;
        }
        failCount += chunk.length;
        if (failMode === 'abort') {
          head += chunk.length;
          _checkpoint(batchId, queue, { successCount, failCount, chunksCompleted });
          aborted = true;
          break;
        }
      }

      chunksCompleted += 1;
      head += chunk.length;
      _checkpoint(batchId, queue, { successCount, failCount, chunksCompleted });
    }

    // Recompute totals from recipient state so that resumed batches
    // (where a previously-failed recipient was reset to pending and retried)
    // report accurate counts rather than accumulated deltas.
    const finalBatch = store.getBatch(batchId);
    const finalSuccess = finalBatch.recipients.filter((r) => r.status === RECIPIENT_STATUS.SUCCESS).length;
    const finalFail = finalBatch.recipients.filter((r) => r.status === RECIPIENT_STATUS.FAILED).length;

    const finalStatus = aborted
      ? BATCH_STATUS.FAILED
      : finalFail > 0
        ? BATCH_STATUS.PARTIAL
        : BATCH_STATUS.COMPLETED;

    store.updateBatch(batchId, {
      status: finalStatus,
      successCount: finalSuccess,
      failCount: finalFail,
      chunksCompleted,
      completedAt: new Date().toISOString(),
    });

    return store.getBatch(batchId);
  }

  /**
   * Flush the current in-memory queue state back to the persistent store.
   * Called after every chunk so a crash can be resumed mid-batch.
   *
   * @param {string} batchId
   * @param {RecipientRecord[]} queue
   * @param {{ successCount: number; failCount: number; chunksCompleted: number }} counters
   */
  function _checkpoint(batchId, queue, counters) {
    const batch = store.getBatch(batchId);
    if (!batch) return;

    const queueMap = new Map(queue.map((r) => [r.address, r]));
    const merged = batch.recipients.map((r) => {
      const updated = queueMap.get(r.address);
      return updated
        ? { ...r, status: updated.status, txHash: updated.txHash, errorMessage: updated.errorMessage }
        : r;
    });

    store.updateBatch(batchId, { recipients: merged, ...counters });
  }

  /** @param {string} batchId @returns {BatchRecord | undefined} */
  function getBatch(batchId) {
    return store.getBatch(batchId);
  }

  /** @returns {BatchRecord[]} */
  function listBatches() {
    return store.listBatches();
  }

  return { registerBatch, executeBatch, getBatch, listBatches };
}

// ── internal helpers (exported for unit tests) ────────────────────────────────

/**
 * Split an array into chunks of at most `size` elements.
 * @template T
 * @param {T[]} arr
 * @param {number} size
 * @returns {T[][]}
 */
export function chunkArray(arr, size) {
  if (size <= 0) size = 1;
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}
