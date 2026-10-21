// @ts-check
import {
  PARTICIPANT_COLUMNS,
  buildCsv,
  collectParticipants,
} from '../services/campaignExportData.js';

/** Durable-queue job type handled by {@link createCampaignExportWorker}. */
export const CAMPAIGN_EXPORT_JOB_TYPE = 'campaign_export';

const MIME_TYPES = { csv: 'text/csv; charset=utf-8', json: 'application/json; charset=utf-8' };

/**
 * Worker for asynchronous campaign exports (#1260).
 *
 * Heavy CSV/JSON generation runs off the HTTP request path via the durable job
 * queue, so large campaigns no longer hit request timeouts. The result is
 * uploaded through the configured storage adapter and the `export_jobs` row is
 * updated so clients can poll for a download URL.
 *
 * Redelivery-safe: a job that already completed is a no-op, and a failed
 * attempt records the error and rethrows so the queue applies its backoff.
 *
 * @param {{
 *   db: InstanceType<import('better-sqlite3')>,
 *   repository: ReturnType<import('../dal/sqliteExportJobRepository.js').createSqliteExportJobRepository>,
 *   campaignRepository: { getById: (id: string) => { id: string | number, name: string } | null | undefined },
 *   storage: import('../storage/storageAdapter.js').StorageAdapter,
 *   logger?: { info?: Function, warn?: Function, error?: Function },
 * }} options
 */
export function createCampaignExportWorker({
  db,
  repository,
  campaignRepository,
  storage,
  logger = console,
}) {
  /** @param {{ exportJobId: string }} payload */
  async function handle({ exportJobId }) {
    const job = repository.getById(exportJobId);
    if (!job) {
      logger.warn?.({ exportJobId }, 'campaignExport:drop reason=unknown_job');
      return;
    }
    if (job.status === 'completed') return;

    repository.markRunning(job.id);
    try {
      const campaign = campaignRepository.getById(job.campaignId);
      if (!campaign) throw new Error(`Campaign ${job.campaignId} no longer exists`);

      const participants = collectParticipants(db, job.campaignId, {
        fromDate: job.fromDate,
        toDate: job.toDate,
      });

      const content =
        job.format === 'csv'
          ? buildCsv(PARTICIPANT_COLUMNS, participants)
          : JSON.stringify(
              { campaign: { id: campaign.id, name: campaign.name }, participants },
              null,
              2,
            );

      const filename = `exports/campaigns/${job.campaignId}/${job.id}.${job.format}`;
      const { url, key } = await storage.upload({
        buffer: Buffer.from(content, 'utf8'),
        filename,
        mimeType: MIME_TYPES[job.format],
      });

      repository.markCompleted(job.id, {
        rowCount: participants.length,
        fileUrl: url,
        fileKey: key ?? filename,
      });
      logger.info?.({ exportJobId: job.id, rows: participants.length }, 'campaignExport:completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      repository.markFailed(job.id, message);
      logger.warn?.({ exportJobId: job.id, err: message }, 'campaignExport:failed');
      throw err;
    }
  }

  return { handle };
}
