/**
 * Analytics rollup job.
 *
 * Aggregates raw analytics_events into materialized rollup_hourly table
 * for fast analytics dashboard queries. Runs every hour, computing
 * 1-hour-old buckets (ensuring all events for that hour have arrived).
 *
 * Incremental: only processes hours not yet rolled up.
 */

import logger from '../utils/logger.js';

export async function analyticsRollupJob({ db, logger: jobLogger = logger } = {}) {
  const log = jobLogger;

  try {
    // Get the last rolled-up hour bucket
    const lastRollup = db
      .prepare('SELECT MAX(hour_bucket) as lastBucket FROM analytics_rollup_hourly')
      .get();
    const lastBucket = lastRollup?.lastBucket || null;

    // Compute 1 hour ago (to allow all events to arrive before aggregating)
    const nowUtc = new Date();
    const oneHourAgo = new Date(nowUtc.getTime() - 60 * 60 * 1000);
    const hourBucket = oneHourAgo.toISOString().substring(0, 13); // YYYY-MM-DDTHH

    if (lastBucket && lastBucket >= hourBucket) {
      log.info?.('analyticsRollup: already rolled up, skipping');
      return;
    }

    // Aggregate events for this hour from raw analytics_events
    const events = db
      .prepare(
        `SELECT event_type, campaign_id, COUNT(*) as count
         FROM analytics_events
         WHERE datetime(created_at) >= datetime(?)
           AND datetime(created_at) < datetime(datetime(?, '+1 hour'))
         GROUP BY event_type, campaign_id`,
      )
      .all(hourBucket, hourBucket);

    let inserted = 0;
    for (const event of events) {
      try {
        db.prepare(
          `INSERT OR REPLACE INTO analytics_rollup_hourly
           (hour_bucket, campaign_id, event_type, event_count, created_at)
           VALUES (?, ?, ?, ?, datetime('now'))`,
        ).run(hourBucket, event.campaign_id, event.event_type, event.count);
        inserted++;
      } catch (err) {
        log.error?.(`rollup:insert failed for ${hourBucket} ${event.event_type}`, err);
      }
    }

    log.info?.(
      `analyticsRollup: processed hour_bucket=${hourBucket} inserted=${inserted} aggregates`,
    );
  } catch (err) {
    log.error?.('analyticsRollupJob:error', err);
    throw err;
  }
}
