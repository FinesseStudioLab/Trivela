// @ts-check
import { randomUUID } from 'node:crypto';

/**
 * Map a DB row to the public-facing failed-job shape.
 * @param {{ id: string, type: string, payload: string | null, error_message: string, attempts: number, failed_at: string, enqueued_at: string | null }} row
 */
function rowToFailedJob(row) {
  let payload = null;
  if (row.payload !== null && row.payload !== undefined && row.payload !== '') {
    try {
      payload = JSON.parse(row.payload);
    } catch {
      // Stored as a non-JSON string (e.g. legacy data) — return raw.
      payload = row.payload;
    }
  }
  return {
    id: row.id,
    type: row.type,
    payload,
    errorMessage: row.error_message,
    attempts: row.attempts,
    failedAt: row.failed_at,
    enqueuedAt: row.enqueued_at ?? null,
  };
}

/**
 * Persistent dead-letter store for jobs that exhausted their retry budget.
 *
 * Backed by the `failed_jobs` table (migration 007). Used by the job runner
 * for `record()` calls and by the admin API for inspection / requeue.
 *
 * @param {{ db: InstanceType<import('better-sqlite3')> }} params
 */
export function createSqliteFailedJobRepository({ db }) {
  const insertStmt = db.prepare(`
    INSERT INTO failed_jobs (id, type, payload, error_message, attempts, failed_at, enqueued_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const findByIdStmt = db.prepare('SELECT * FROM failed_jobs WHERE id = ? LIMIT 1');

  const deleteByIdStmt = db.prepare('DELETE FROM failed_jobs WHERE id = ?');

  const listStmt = db.prepare(`
    SELECT id, type, payload, error_message, attempts, failed_at, enqueued_at
    FROM failed_jobs
    ORDER BY failed_at DESC
    LIMIT ? OFFSET ?
  `);

  const countStmt = db.prepare('SELECT COUNT(*) AS n FROM failed_jobs');

  /**
   * @param {{
   *   id?: string,
   *   type: string,
   *   payload?: unknown,
   *   errorMessage: string,
   *   attempts: number,
   *   failedAt?: string,
   *   enqueuedAt?: string | null,
   * }} entry
   */
  function record(entry) {
    const id = entry.id ?? randomUUID();
    const payload =
      entry.payload === undefined || entry.payload === null ? null : JSON.stringify(entry.payload);
    insertStmt.run(
      id,
      entry.type,
      payload,
      entry.errorMessage,
      entry.attempts,
      entry.failedAt ?? new Date().toISOString(),
      entry.enqueuedAt ?? null,
    );
    return id;
  }

  /**
   * @param {{ limit?: number, offset?: number }} [opts]
   */
  function list({ limit = 100, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 500);
    const safeOffset = Math.max(0, Math.floor(offset));
    const rows = listStmt.all(safeLimit, safeOffset);
    return rows.map(rowToFailedJob);
  }

  function count() {
    const row = countStmt.get();
    return row?.n ?? 0;
  }

  /**
   * @param {string} id
   */
  function getById(id) {
    const row = findByIdStmt.get(id);
    return row ? rowToFailedJob(row) : undefined;
  }

  /**
   * @param {string} id
   */
  function remove(id) {
    const info = deleteByIdStmt.run(id);
    return info.changes > 0;
  }

  return { record, list, count, getById, remove };
}
