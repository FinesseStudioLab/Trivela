// @ts-check
import { randomUUID } from 'node:crypto';

/**
 * @param {object} row
 * @returns {import('../services/batchPayoutService.js').BatchPayoutJob}
 */
function rowToJob(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id ?? null,
    status: row.status,
    totalRecipients: row.total_recipients,
    succeeded: row.succeeded,
    failed: row.failed,
    currentChunk: row.current_chunk,
    totalChunks: row.total_chunks ?? null,
    maxOpsPerTx: row.max_ops_per_tx,
    continueOnError: row.continue_on_error === 1,
    createdAt: row.created_at,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    error: row.error ?? null,
  };
}

/**
 * @param {object} row
 * @returns {import('../services/batchPayoutService.js').BatchRecipient}
 */
function rowToRecipient(row) {
  return {
    id: row.id,
    batchId: row.batch_id,
    recipientAddress: row.recipient_address,
    amount: row.amount,
    chunkIndex: row.chunk_index,
    status: row.status,
    txHash: row.tx_hash ?? null,
    error: row.error ?? null,
    processedAt: row.processed_at ?? null,
  };
}

/**
 * @param {{ db: InstanceType<import('better-sqlite3')> }} params
 */
export function createSqliteBatchJobRepository({ db }) {
  const insertJobStmt = db.prepare(`
    INSERT INTO batch_payout_jobs
      (id, campaign_id, status, total_recipients, succeeded, failed,
       current_chunk, total_chunks, max_ops_per_tx, continue_on_error,
       created_at, started_at, completed_at, error)
    VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, NULL, NULL, NULL)
  `);

  const getJobStmt = db.prepare('SELECT * FROM batch_payout_jobs WHERE id = ? LIMIT 1');

  const updateJobStmt = db.prepare(`
    UPDATE batch_payout_jobs
    SET status = COALESCE(?, status),
        succeeded = COALESCE(?, succeeded),
        failed = COALESCE(?, failed),
        current_chunk = COALESCE(?, current_chunk),
        total_chunks = COALESCE(?, total_chunks),
        started_at = COALESCE(?, started_at),
        completed_at = COALESCE(?, completed_at),
        error = COALESCE(?, error)
    WHERE id = ?
  `);

  const insertRecipientStmt = db.prepare(`
    INSERT INTO batch_payout_recipients
      (id, batch_id, recipient_address, amount, chunk_index, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `);

  const getRecipientsByChunkStmt = db.prepare(`
    SELECT * FROM batch_payout_recipients
    WHERE batch_id = ? AND chunk_index = ?
    ORDER BY rowid ASC
  `);

  const updateRecipientStmt = db.prepare(`
    UPDATE batch_payout_recipients
    SET status = COALESCE(?, status),
        tx_hash = COALESCE(?, tx_hash),
        error = COALESCE(?, error),
        processed_at = COALESCE(?, processed_at)
    WHERE id = ?
  `);

  const updateRecipientsByChunkStmt = db.prepare(`
    UPDATE batch_payout_recipients
    SET status = ?, tx_hash = ?, processed_at = ?
    WHERE batch_id = ? AND chunk_index = ? AND status = 'pending'
  `);

  const markChunkFailedStmt = db.prepare(`
    UPDATE batch_payout_recipients
    SET status = 'failed', error = ?, processed_at = ?
    WHERE batch_id = ? AND chunk_index = ? AND status = 'pending'
  `);

  const listJobsStmt = db.prepare(`
    SELECT * FROM batch_payout_jobs ORDER BY created_at DESC LIMIT ? OFFSET ?
  `);

  /**
   * @param {{
   *   id?: string,
   *   campaignId?: string | null,
   *   totalRecipients: number,
   *   totalChunks: number,
   *   maxOpsPerTx: number,
   *   continueOnError: boolean,
   *   createdAt?: string,
   * }} params
   */
  function createJob({ id, campaignId, totalRecipients, totalChunks, maxOpsPerTx, continueOnError, createdAt }) {
    const jobId = id ?? randomUUID();
    insertJobStmt.run(
      jobId,
      campaignId ?? null,
      'pending',
      totalRecipients,
      totalChunks,
      maxOpsPerTx,
      continueOnError ? 1 : 0,
      createdAt ?? new Date().toISOString(),
    );
    return jobId;
  }

  /**
   * @param {string} batchId
   * @returns {import('../services/batchPayoutService.js').BatchPayoutJob | undefined}
   */
  function getById(batchId) {
    const row = getJobStmt.get(batchId);
    return row ? rowToJob(row) : undefined;
  }

  /**
   * @param {string} batchId
   * @param {{
   *   status?: string,
   *   succeeded?: number,
   *   failed?: number,
   *   currentChunk?: number,
   *   totalChunks?: number,
   *   startedAt?: string,
   *   completedAt?: string,
   *   error?: string,
   * }} fields
   */
  function updateJob(batchId, fields) {
    updateJobStmt.run(
      fields.status ?? null,
      fields.succeeded ?? null,
      fields.failed ?? null,
      fields.currentChunk ?? null,
      fields.totalChunks ?? null,
      fields.startedAt ?? null,
      fields.completedAt ?? null,
      fields.error ?? null,
      batchId,
    );
  }

  const insertRecipients = db.transaction(
    /**
     * @param {Array<{ batchId: string, recipientAddress: string, amount: number, chunkIndex: number }>} recipients
     */
    (recipients) => {
      for (const r of recipients) {
        insertRecipientStmt.run(randomUUID(), r.batchId, r.recipientAddress, r.amount, r.chunkIndex);
      }
    },
  );

  /**
   * @param {string} batchId
   * @param {number} chunkIndex
   * @returns {import('../services/batchPayoutService.js').BatchRecipient[]}
   */
  function getRecipientsByChunk(batchId, chunkIndex) {
    const rows = getRecipientsByChunkStmt.all(batchId, chunkIndex);
    return rows.map(rowToRecipient);
  }

  /**
   * Mark all pending recipients in a chunk as succeeded with a tx hash.
   * @param {string} batchId
   * @param {number} chunkIndex
   * @param {string} txHash
   * @param {string} processedAt
   */
  function markChunkSucceeded(batchId, chunkIndex, txHash, processedAt) {
    updateRecipientsByChunkStmt.run('succeeded', txHash, processedAt, batchId, chunkIndex);
  }

  /**
   * Mark all pending recipients in a chunk as failed.
   * @param {string} batchId
   * @param {number} chunkIndex
   * @param {string} errorMessage
   * @param {string} processedAt
   */
  function markChunkFailed(batchId, chunkIndex, errorMessage, processedAt) {
    markChunkFailedStmt.run(errorMessage, processedAt, batchId, chunkIndex);
  }

  /**
   * @param {{ limit?: number, offset?: number }} [opts]
   */
  function listJobs({ limit = 50, offset = 0 } = {}) {
    const rows = listJobsStmt.all(Math.min(limit, 200), Math.max(offset, 0));
    return rows.map(rowToJob);
  }

  return {
    createJob,
    getById,
    updateJob,
    insertRecipients,
    getRecipientsByChunk,
    markChunkSucceeded,
    markChunkFailed,
    listJobs,
  };
}
