// @ts-check
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { parseAllowlistCsv, validateGAddress, MAX_ALLOWLIST_ROWS } from '../lib/allowlist/csv.js';

const DEFAULT_POINTS_PER_ROW = 1;
const MAX_CSV_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Admin API for bulk point-credit via CSV upload.
 *
 * Routes:
 *   POST   /api/v1/bulk-credit/upload   – parse + validate CSV, return preview
 *   POST   /api/v1/bulk-credit/submit   – enqueue a validated batch for async execution
 *   GET    /api/v1/bulk-credit/:jobId   – poll job status
 *
 * @param {{
 *   jobQueue: { enqueue: (type: string, payload: unknown) => void },
 *   jobStore?: { getStatus?: (jobId: string) => object | null },
 *   requireApiKey: import('express').RequestHandler | import('express').RequestHandler[],
 *   log?: Pick<Console, 'info' | 'warn' | 'error'>,
 * }} deps
 * @returns {import('express').Router}
 */
export function createBulkCreditRouter({ jobQueue, jobStore, requireApiKey, log = console }) {
  const router = Router();
  const auth = Array.isArray(requireApiKey) ? requireApiKey : [requireApiKey];

  const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_CSV_BYTES },
  });

  // ── POST /api/v1/bulk-credit/upload ──────────────────────────────────────────
  // Parse and validate a CSV file. Returns a preview — nothing is written yet.

  router.post('/bulk-credit/upload', ...auth, csvUpload.single('file'), (req, res) => {
    // multer decorates the request at runtime; Express's own type has no
    // `file`, and @types/multer is not a dependency — describe what is used.
    const upload = /** @type {{ buffer: Buffer } | undefined} */ (/** @type {any} */ (req).file);

    if (!upload && !req.body?.csv) {
      return res.status(400).json({ error: 'No CSV data provided', code: 'MISSING_CSV' });
    }

    const raw = upload ? upload.buffer.toString('utf8') : String(req.body.csv);
    const { rows } = parseAllowlistCsv(raw);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'CSV contains no rows', code: 'EMPTY_CSV' });
    }

    if (rows.length > MAX_ALLOWLIST_ROWS) {
      return res.status(400).json({
        error: `CSV exceeds maximum of ${MAX_ALLOWLIST_ROWS} rows`,
        code: 'CSV_TOO_LARGE',
      });
    }

    const invalid = rows.filter((r) => !validateGAddress(r.address));
    if (invalid.length > 0) {
      return res.status(400).json({
        error: 'CSV contains invalid Stellar addresses',
        code: 'INVALID_ADDRESSES',
        invalidCount: invalid.length,
        details: invalid.slice(0, 20).map((r) => ({ row: r.row, address: r.address })),
      });
    }

    const normalised = rows.map((r) => ({
      row: r.row,
      address: r.address,
      label: r.label ?? undefined,
      points: r.bonus_points
        ? Number(r.bonus_points) || DEFAULT_POINTS_PER_ROW
        : DEFAULT_POINTS_PER_ROW,
    }));

    return res.json({
      valid: true,
      totalRows: normalised.length,
      preview: normalised.slice(0, 5),
      rows: normalised,
    });
  });

  // ── POST /api/v1/bulk-credit/submit ──────────────────────────────────────────
  // Accepts the validated rows from /upload and enqueues the credit job.

  router.post('/bulk-credit/submit', ...auth, (req, res) => {
    const { rows, campaignId } = req.body ?? {};

    if (!Array.isArray(rows) || rows.length === 0) {
      return res
        .status(400)
        .json({ error: 'rows must be a non-empty array', code: 'MISSING_ROWS' });
    }

    if (rows.length > MAX_ALLOWLIST_ROWS) {
      return res.status(400).json({
        error: `Maximum ${MAX_ALLOWLIST_ROWS} rows per submission`,
        code: 'BATCH_TOO_LARGE',
      });
    }

    const invalid = rows.filter((r) => !validateGAddress(r.address));
    if (invalid.length > 0) {
      return res.status(400).json({
        error: 'Submission contains invalid addresses',
        code: 'INVALID_ADDRESSES',
        details: invalid.slice(0, 10).map((r) => ({ row: r.row, address: r.address })),
      });
    }

    const jobId = randomUUID();

    try {
      jobQueue.enqueue('bulk-credit', {
        jobId,
        campaignId: typeof campaignId === 'string' ? campaignId : undefined,
        rows,
      });
    } catch (err) {
      log.error?.('bulkCredit:enqueue_failed', err);
      return res.status(500).json({ error: 'Failed to enqueue job', code: 'ENQUEUE_FAILED' });
    }

    log.info?.(
      `bulkCredit:enqueued jobId=${jobId} rows=${rows.length} campaignId=${campaignId ?? 'none'}`,
    );

    return res.status(202).json({
      jobId,
      status: 'queued',
      totalRows: rows.length,
    });
  });

  // ── GET /api/v1/bulk-credit/:jobId ──────────────────────────────────────────
  // Poll job status from the durable job store when available.

  router.get('/bulk-credit/:jobId', ...auth, (req, res) => {
    const { jobId } = req.params;

    if (typeof jobStore?.getStatus === 'function') {
      const status = jobStore.getStatus(jobId);
      if (!status) {
        return res.status(404).json({ error: 'Job not found', code: 'NOT_FOUND' });
      }
      return res.json({ jobId, ...status });
    }

    return res.json({ jobId, status: 'queued', note: 'Status tracking not configured' });
  });

  return router;
}
