// @ts-check
import { randomUUID } from 'node:crypto';

/**
 * Map a DB row to the public-facing job shape.
 * @param {Record<string, unknown>} row
 */
function rowToJob(row) {
  let payload = null;
  if (row.payload !== null && row.payload !== undefined && row.payload !== '') {
    try {
      payload = JSON.parse(/** @type {string} */ (row.payload));
    } catch {
      payload = row.payload;
    }
  }
  return {
    id: /** @type {string} */ (row.id),
    type: /** @type {string} */ (row.type),
    payload,
    status: /** @type {string} */ (row.status),
    attempts: /** @type {number} */ (row.attempts),
    maxAttempts: /** @type {number} */ (row.max_attempts),
    baseDelayMs: /** @type {number} */ (row.base_delay_ms),
    maxDelayMs: /** @type {number} */ (row.max_delay_ms),
    runAt: /** @type {string} */ (row.run_at),
    visibleAt: /** @type {string} */ (row.visible_at),
    enqueuedAt: /** @type {string} */ (row.enqueued_at),
    errorMessage: row.error_message ?? null,
  };
}

/**
 * Persistent job queue store backed by the `job_queue` table (migration 018).
 *
 * Status values: 'pending' | 'running' | 'dead'
 *
 * @param {{ db: InstanceType<import('better-sqlite3')> }} params
 */
export function createSqliteJobQueueRepository({ db }) {
  const insertStmt = db.prepare(`
    INSERT INTO job_queue
      (id, type, payload, status, attempts, max_attempts, base_delay_ms, max_delay_ms,
       run_at, visible_at, enqueued_at)
    VALUES (?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?, ?)
  `);

  const selectPendingStmt = db.prepare(`
    SELECT * FROM job_queue
    WHERE status = 'pending' AND run_at <= ?
    ORDER BY run_at
    LIMIT 1
  `);

  const updateToRunningStmt = db.prepare(`
    UPDATE job_queue SET status = 'running', visible_at = ? WHERE id = ?
  `);

  // BEGIN IMMEDIATE ensures the write lock is held from the start, preventing
  // two processes from reading the same pending row before either updates it.
  const claimTx = db.transaction((now, newVisibleAt) => {
    const row = selectPendingStmt.get(now);
    if (!row) return null;
    updateToRunningStmt.run(newVisibleAt, row.id);
    return row;
  });

  const ackStmt = db.prepare('DELETE FROM job_queue WHERE id = ?');

  const nackPendingStmt = db.prepare(`
    UPDATE job_queue
    SET status = 'pending', run_at = ?, attempts = ?, error_message = ?, visible_at = run_at
    WHERE id = ?
  `);

  const nackDeadStmt = db.prepare(`
    UPDATE job_queue SET status = 'dead', error_message = ? WHERE id = ?
  `);

  const recoverStaleStmt = db.prepare(`
    UPDATE job_queue
    SET status = 'pending', visible_at = run_at
    WHERE status = 'running' AND visible_at < ?
  `);

  const listDeadStmt = db.prepare(`
    SELECT * FROM job_queue
    WHERE status = 'dead'
    ORDER BY enqueued_at DESC
    LIMIT ? OFFSET ?
  `);

  const countDeadStmt = db.prepare(`SELECT COUNT(*) AS n FROM job_queue WHERE status = 'dead'`);

  const findByIdStmt = db.prepare('SELECT * FROM job_queue WHERE id = ? LIMIT 1');

  const deleteByIdStmt = db.prepare('DELETE FROM job_queue WHERE id = ?');

  /**
   * Persist a new job into the queue.
   *
   * @param {{
   *   id?: string,
   *   type: string,
   *   payload?: unknown,
   *   maxAttempts?: number,
   *   baseDelayMs?: number,
   *   maxDelayMs?: number,
   *   runAt?: string,
   *   visibleAt?: string,
   *   enqueuedAt?: string,
   * }} job
   */
  function enqueue(job) {
    const id = job.id ?? randomUUID();
    const now = new Date().toISOString();
    const runAt = job.runAt ?? now;
    const payload =
      job.payload === undefined || job.payload === null ? null : JSON.stringify(job.payload);
    insertStmt.run(
      id,
      job.type,
      payload,
      job.maxAttempts ?? 5,
      job.baseDelayMs ?? 1_000,
      job.maxDelayMs ?? 30_000,
      runAt,
      job.visibleAt ?? runAt,
      job.enqueuedAt ?? now,
    );
    return id;
  }

  /**
   * Atomically claim the next available job (pending, runAt <= now).
   * Uses an IMMEDIATE transaction to prevent double-claiming in multi-process deployments.
   *
   * @param {number} visibilityTimeoutMs
   * @returns {ReturnType<typeof rowToJob> | null}
   */
  function claimNext(visibilityTimeoutMs) {
    const now = new Date().toISOString();
    const newVisibleAt = new Date(Date.now() + visibilityTimeoutMs).toISOString();
    const row = claimTx.immediate(now, newVisibleAt);
    return row ? rowToJob(row) : null;
  }

  /**
   * Acknowledge a completed job (remove from queue).
   * @param {string} id
   */
  function ack(id) {
    ackStmt.run(id);
  }

  /**
   * Negative-acknowledge: retry later or mark dead.
   *
   * @param {string} id
   * @param {{ nextRunAt?: string, attempts?: number, errorMessage?: string, isDead?: boolean }} opts
   */
  function nack(id, { nextRunAt, attempts, errorMessage, isDead = false } = {}) {
    if (isDead) {
      nackDeadStmt.run(errorMessage ?? null, id);
    } else {
      nackPendingStmt.run(
        nextRunAt ?? new Date().toISOString(),
        attempts ?? 1,
        errorMessage ?? null,
        id,
      );
    }
  }

  /**
   * Reset stale running jobs (worker crashed) back to pending.
   * Jobs are considered stale when their visible_at has passed.
   *
   * @param {number} visibilityTimeoutMs
   * @returns {number} number of rows recovered
   */
  function recoverStale(visibilityTimeoutMs) {
    const cutoff = new Date(Date.now() - visibilityTimeoutMs).toISOString();
    const info = recoverStaleStmt.run(cutoff);
    return info.changes;
  }

  /**
   * @param {{ limit?: number, offset?: number }} [opts]
   */
  function listDead({ limit = 100, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 500);
    const safeOffset = Math.max(0, Math.floor(offset));
    const rows = listDeadStmt.all(safeLimit, safeOffset);
    return rows.map(rowToJob);
  }

  function countDead() {
    const row = countDeadStmt.get();
    return row?.n ?? 0;
  }

  /**
   * @param {string} id
   */
  function getById(id) {
    const row = findByIdStmt.get(id);
    return row ? rowToJob(row) : null;
  }

  /**
   * @param {string} id
   */
  function removeById(id) {
    const info = deleteByIdStmt.run(id);
    return info.changes > 0;
  }

  return { enqueue, claimNext, ack, nack, recoverStale, listDead, countDead, getById, removeById };
}
