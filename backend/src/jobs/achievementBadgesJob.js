import { log } from '../middleware/logger.js';
import {
  BADGE_CATALOG,
  evaluateBadges,
  normalizeMetrics,
  validateBadgeCatalog,
} from '../services/achievementBadgeService.js';

const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 5_000;

/**
 * Background calculator for global achievement badges (#1247).
 *
 * Walks every user seen by the indexer in keyset-paged batches, recomputes
 * their aggregate milestone metrics, stores the snapshot, and grants any badge
 * whose threshold is now met. Runs are idempotent: re-running grants nothing
 * new and only refreshes snapshots, so the job is safe to retry or overlap
 * with a restart. One user's failure is logged and skipped rather than
 * aborting the whole run.
 *
 * @param {{
 *   repository: ReturnType<typeof import('../dal/sqliteUserBadgeRepository.js').createSqliteUserBadgeRepository> | undefined,
 *   catalog?: readonly import('../services/achievementBadgeService.js').BadgeDefinition[],
 *   batchSize?: number,
 *   logger?: any,
 *   now?: () => Date,
 * }} deps
 */
export function createAchievementBadgesJob({
  repository,
  catalog = BADGE_CATALOG,
  batchSize = DEFAULT_BATCH_SIZE,
  logger = log,
  now = () => new Date(),
}) {
  validateBadgeCatalog(catalog);
  const limit = Math.min(
    Number.isInteger(batchSize) && batchSize > 0 ? batchSize : DEFAULT_BATCH_SIZE,
    MAX_BATCH_SIZE,
  );

  return async function calculateAchievementBadges() {
    if (!repository) {
      logger.warn('[achievementBadges] User badge repository not available');
      return { usersScanned: 0, badgesGranted: 0, failures: 0 };
    }

    const computedAt = now().toISOString();
    let afterUser = '';
    let usersScanned = 0;
    let badgesGranted = 0;
    let failures = 0;

    for (;;) {
      const rows = repository.listUserMetrics({ afterUser, limit });
      if (rows.length === 0) break;

      for (const row of rows) {
        if (typeof row.user !== 'string' || row.user.length === 0) {
          failures++;
          continue;
        }
        try {
          const metrics = normalizeMetrics(row);
          const earned = evaluateBadges(metrics, catalog);
          badgesGranted += repository.saveResults({
            user: row.user,
            metrics,
            earned,
            computedAt,
          });
        } catch (err) {
          failures++;
          logger.warn({ user: row.user, err }, '[achievementBadges] Failed to process user');
        }
      }

      usersScanned += rows.length;
      const lastUser = rows[rows.length - 1].user;
      // Keyset cursor must strictly advance, otherwise a misbehaving query
      // would spin this loop forever.
      if (typeof lastUser !== 'string' || lastUser <= afterUser) {
        throw new Error('[achievementBadges] Pagination cursor did not advance');
      }
      afterUser = lastUser;
      if (rows.length < limit) break;
    }

    const summary = { usersScanned, badgesGranted, failures };
    logger.info(summary, '[achievementBadges] Calculation completed');
    return summary;
  };
}
