// @ts-check
import { Router } from 'express';
import { CAMPAIGN_EXPORT_JOB_TYPE } from '../jobs/campaignExportWorker.js';

const FORMATS = new Set(['csv', 'json']);

/** @param {unknown} value */
function isValidDate(value) {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

/**
 * Asynchronous campaign exports (#1260).
 *
 *   POST /campaigns/:id/exports           -> 202, queues the export
 *   GET  /campaigns/:id/exports           -> recent export jobs
 *   GET  /campaigns/:id/exports/:jobId    -> status (+ downloadUrl once completed)
 *
 * The synchronous `GET /campaigns/:id/export` endpoint is unchanged.
 *
 * @param {{
 *   repository: ReturnType<import('../dal/sqliteExportJobRepository.js').createSqliteExportJobRepository>,
 *   campaignRepository: { getById: (id: string) => unknown },
 *   jobQueue: { enqueue: (type: string, payload: unknown, opts?: object) => void },
 *   guard?: import('express').RequestHandler[],
 *   recordAudit?: (req: import('express').Request, entry: object) => void,
 *   logger?: { info?: Function },
 * }} options
 */
export function createCampaignExportJobRoutes({
  repository,
  campaignRepository,
  jobQueue,
  guard = [],
  recordAudit,
  logger = console,
}) {
  const router = Router();

  /** @param {import('../dal/sqliteExportJobRepository.js').ExportJob} job @param {string} base */
  function present(job, base) {
    return {
      jobId: job.id,
      campaignId: job.campaignId,
      format: job.format,
      status: job.status,
      from: job.fromDate,
      to: job.toDate,
      rowCount: job.rowCount,
      downloadUrl: job.status === 'completed' ? job.fileUrl : null,
      error: job.status === 'failed' ? job.error : null,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      statusUrl: `${base}/campaigns/${job.campaignId}/exports/${job.id}`,
    };
  }

  router.post('/campaigns/:id/exports', ...guard, (req, res) => {
    const campaign = campaignRepository.getById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found', code: 'NOT_FOUND' });
    }

    const format = String(req.body?.format ?? 'csv').toLowerCase();
    if (!FORMATS.has(format)) {
      return res
        .status(400)
        .json({ error: 'Invalid format. Use "csv" or "json"', code: 'INVALID_FORMAT' });
    }

    const { from, to } = req.body ?? {};
    for (const [name, value] of [
      ['from', from],
      ['to', to],
    ]) {
      if (value !== undefined && value !== null && !isValidDate(value)) {
        return res
          .status(400)
          .json({ error: `"${name}" must be an ISO 8601 date`, code: 'VALIDATION_ERROR' });
      }
    }

    const job = repository.create({
      campaignId: req.params.id,
      format: /** @type {'csv' | 'json'} */ (format),
      fromDate: from ?? null,
      toDate: to ?? null,
    });
    jobQueue.enqueue(CAMPAIGN_EXPORT_JOB_TYPE, { exportJobId: job.id }, { maxAttempts: 3 });
    recordAudit?.(req, {
      action: 'campaign.export.queued',
      entity: 'campaign',
      entityId: req.params.id,
      diff: { jobId: job.id, format, from: job.fromDate, to: job.toDate },
    });
    logger.info?.({ exportJobId: job.id, campaignId: req.params.id }, 'campaignExport:queued');

    return res.status(202).json(present(job, req.baseUrl));
  });

  router.get('/campaigns/:id/exports', ...guard, (req, res) => {
    if (!campaignRepository.getById(req.params.id)) {
      return res.status(404).json({ error: 'Campaign not found', code: 'NOT_FOUND' });
    }
    const limit = Number.parseInt(String(req.query.limit ?? ''), 10) || 20;
    const data = repository
      .listByCampaign(req.params.id, limit)
      .map((j) => present(j, req.baseUrl));
    return res.json({ data, total: data.length });
  });

  router.get('/campaigns/:id/exports/:jobId', ...guard, (req, res) => {
    const job = repository.getById(req.params.jobId);
    if (!job || job.campaignId !== String(req.params.id)) {
      return res.status(404).json({ error: 'Export job not found', code: 'NOT_FOUND' });
    }
    return res.json(present(job, req.baseUrl));
  });

  return router;
}
