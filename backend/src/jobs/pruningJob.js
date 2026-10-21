import { log } from '../middleware/logger.js';

const RETENTION_DAYS = {
  notifications: 90,
  indexedEvents: 180,
  deletedCampaigns: parseInt(process.env.SOFT_DELETE_RETENTION_DAYS, 10) || 30,
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

      // Hard-delete soft-deleted campaigns that exceed retention window
      if (dal.campaigns && dal.campaigns.hardDelete) {
        const deletedCampaigns = dal.campaigns.listDeleted({
          olderThanDays: RETENTION_DAYS.deletedCampaigns,
        });
        for (const campaign of deletedCampaigns) {
          dal.campaigns.hardDelete(campaign.id);
          log.info(
            `[pruning] Hard-deleted soft-deleted campaign ${campaign.id} (deleted at ${campaign.deletedAt})`,
          );
        }
        if (deletedCampaigns.length > 0) {
          log.info(
            `[pruning] Hard-deleted ${deletedCampaigns.length} soft-deleted campaigns older than ${RETENTION_DAYS.deletedCampaigns} days`,
          );
        }
      }

      // Update pruning state
      const updateStmt = dal.db.prepare(`
        INSERT OR REPLACE INTO pruning_state (resource_type, last_pruned_at)
        VALUES (?, datetime('now'))
      `);
      updateStmt.run('notifications');
      updateStmt.run('indexedEvents');
      updateStmt.run('deletedCampaigns');

      log.info('[pruning] Pruning job completed successfully');
    } catch (error) {
      log.error({ err: error }, '[pruning] Job failed');
      throw error;
    }
  };
}
