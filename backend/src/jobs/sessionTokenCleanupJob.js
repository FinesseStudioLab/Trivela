import { log } from '../middleware/logger.js';

export function createSessionTokenCleanupJob({ dal }) {
  return async function cleanupSessionTokens() {
    try {
      if (!dal.sessionTokens) {
        log.warn('[sessionTokenCleanup] Session tokens repository not available');
        return;
      }

      const deletedCount = dal.sessionTokens.deleteExpired();
      log.info(
        `[sessionTokenCleanup] Deleted ${deletedCount} expired session tokens`,
      );

      const expiredCount = dal.sessionTokens.getExpiredCount();
      if (expiredCount > 0) {
        log.warn(`[sessionTokenCleanup] ${expiredCount} additional expired tokens still exist`);
      }

      log.info('[sessionTokenCleanup] Job completed successfully');
    } catch (error) {
      log.error({ err: error }, '[sessionTokenCleanup] Job failed');
      throw error;
    }
  };
}
