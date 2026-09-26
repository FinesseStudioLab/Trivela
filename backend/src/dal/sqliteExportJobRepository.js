// @ts-check
import { randomUUID } from 'node:crypto';

/**
 * @typedef {{
 *   id: string,
 *   campaignId: string,
 *   format: 'csv' | 'json',
 *   fromDate: string | null,
 *   toDate: string | null,
 *   status: 'queued' | 'running' | 'completed' | 'failed',
 *   rowCount: number | null,
 *   fileUrl: string | null,
 *   fileKey: string | null,
 *   error: string | null,
 *   attempts: number,
 *   createdAt: string,
 *   startedAt: string | null,
 *   completedAt: string | null,
 * }} ExportJob
 */

/** @returns {ExportJob | null} */
function rowToJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    campaignId: row.campaign_id,
    format: row.format,
    fromDate: row.from_date ?? null,
    toDate: row.to_date ?? null,
    status: row.status,
    rowCount: row.row_count ?? null,
    fileUrl: row.file_url ?? null,
    fileKey: row.file_key ?? null,
    error: row.error ?? null,
    attempts: row.attempts,
    createdAt: row.created_at,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
  };
}

/**
 * Persistence for asynchronous campaign export jobs (#1260).
 *
 * @param {{ db: InstanceType<import('better-sqlite3')> }} params
 */
export function createSqliteExportJobRepository({ db }) {
  const insertStmt = db.prepare(`
    INSERT INTO export_jobs (id, campaign_id, format, from_date, to_date, status, created_at)
    VALUES (@id, @campaignId, @format, @fromDate, @toDate, 'queued', @createdAt)
  `);
  const byIdStmt = db.prepare('SELECT * FROM export_jobs WHERE id = ?');
  const listStmt = db.prepare(
    'SELECT * FROM export_jobs WHERE campaign_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
  );
  const runningStmt = db.prepare(`
    UPDATE export_jobs
       SET status = 'running', started_at = ?, attempts = attempts + 1, error = NULL
     WHERE id = ?
  `);
  const completedStmt = db.prepare(`
    UPDATE export_jobs
       SET status = 'completed', row_count = ?, file_url = ?, file_key = ?,
           completed_at = ?, error = NULL
     WHERE id = ?
  `);
  const failedStmt = db.prepare("UPDATE export_jobs SET status = 'failed', error = ? WHERE id = ?");

  return {
    /**
     * @param {{ campaignId: string, format: 'csv' | 'json', fromDate?: string | null, toDate?: string | null }} input
     * @returns {ExportJob}
     */
    create({ campaignId, format, fromDate = null, toDate = null }) {
      const id = randomUUID();
      insertStmt.run({
        id,
        campaignId: String(campaignId),
        format,
        fromDate,
        toDate,
        createdAt: new Date().toISOString(),
      });
      return /** @type {ExportJob} */ (rowToJob(byIdStmt.get(id)));
    },

    /** @param {string} id */
    getById(id) {
      return rowToJob(byIdStmt.get(id));
    },

    /** @param {string | number} campaignId @param {number} [limit] */
    listByCampaign(campaignId, limit = 20) {
      return listStmt
        .all(String(campaignId), Math.min(Math.max(limit, 1), 100))
        .map((row) => /** @type {ExportJob} */ (rowToJob(row)));
    },

    /** @param {string} id */
    markRunning(id) {
      runningStmt.run(new Date().toISOString(), id);
    },

    /**
     * @param {string} id
     * @param {{ rowCount: number, fileUrl: string, fileKey?: string | null }} result
     */
    markCompleted(id, { rowCount, fileUrl, fileKey = null }) {
      completedStmt.run(rowCount, fileUrl, fileKey, new Date().toISOString(), id);
    },

    /** @param {string} id @param {string} error */
    markFailed(id, error) {
      failedStmt.run(error.slice(0, 500), id);
    },
  };
}
