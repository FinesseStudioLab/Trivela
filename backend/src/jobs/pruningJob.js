import { log } from '../middleware/logger.js';

const RETENTION_DAYS = {
  notifications: 90,
  indexedEvents: 180,
};

export function createPruningJob({ dal }) {
  return async function prune() {
    try {
      // Prune old notifications
      if (dal.notifications) {
        dal.notifications.deleteOlderThan(RETENTION_DAYS.notifications);
        log.info(`[pruning] Deleted notifications older than ${RETENTION_DAYS.notifications} days`);
      }

      // Prune old indexed events
      const pruneStmt = dal.db.prepare(`
        DELETE FROM indexed_events
        WHERE created_at < datetime('now', '-' || ? || ' days')
      `);
      pruneStmt.run(RETENTION_DAYS.indexedEvents);
      log.info(`[pruning] Deleted indexed events older than ${RETENTION_DAYS.indexedEvents} days`);

      // Update pruning state
      const updateStmt = dal.db.prepare(`
        INSERT OR REPLACE INTO pruning_state (resource_type, last_pruned_at)
        VALUES (?, datetime('now'))
      `);
      updateStmt.run('notifications');
      updateStmt.run('indexedEvents');

      log.info('[pruning] Pruning job completed successfully');
    } catch (error) {
      log.error('[pruning] Job failed:', error);
      throw error;
    }
  };
}
