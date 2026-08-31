// @ts-check

/**
 * Job handler for bulk point-credit operations.
 *
 * Each job payload carries a list of validated rows. The handler credits
 * points for every row and accumulates per-row results so callers can
 * distinguish partial failures from total ones.
 *
 * @param {{
 *   dal: {
 *     points: {
 *       credit: (args: { address: string, amount: number, label?: string, reason?: string }) => unknown
 *     },
 *     bulkCreditResults?: {
 *       upsert?: (result: object) => unknown
 *     }
 *   },
 *   log?: Pick<Console, 'info' | 'warn' | 'error'>
 * }} deps
 */
export function createBulkCreditJobHandler({ dal, log = console }) {
  /**
   * @param {{
   *   jobId: string,
   *   campaignId?: string,
   *   rows: Array<{ row: number, address: string, points: number, label?: string }>
   * }} payload
   */
  return async function handleBulkCredit(payload) {
    const { jobId, campaignId, rows } = payload;

    if (!Array.isArray(rows) || rows.length === 0) {
      log.warn?.(`bulkCreditJob:skip jobId=${jobId} reason=empty_rows`);
      return;
    }

    log.info?.(
      `bulkCreditJob:start jobId=${jobId} rows=${rows.length} campaignId=${campaignId ?? 'none'}`,
    );

    let succeeded = 0;
    let failed = 0;
    const failures = [];

    for (const entry of rows) {
      try {
        await dal.points.credit({
          address: entry.address,
          amount: entry.points,
          label: entry.label,
          reason: campaignId ? `bulk-credit:${campaignId}` : 'bulk-credit',
        });
        succeeded++;
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err ?? 'unknown');
        failures.push({ row: entry.row, address: entry.address, error: message });
        log.warn?.(
          `bulkCreditJob:row_error jobId=${jobId} row=${entry.row} address=${entry.address} error=${message}`,
        );
      }
    }

    log.info?.(`bulkCreditJob:done jobId=${jobId} succeeded=${succeeded} failed=${failed}`);

    if (failed > 0 && failed === rows.length) {
      throw new Error(`All ${rows.length} rows failed. First error: ${failures[0]?.error}`);
    }
  };
}
