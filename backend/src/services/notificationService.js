// Notification service for creating in-app notifications when key events occur.
// Issue #914 — in-app notifications for credits, claims, and unlocks.

// Bug fix (unrelated to #927, but blocked verifying it): this imported a
// module that doesn't exist, crashing every test/boot path that transitively
// loads index.js -> notificationService.js.
import { log as logger } from '../middleware/logger.js';

/**
 * @param {{
 *   notificationRepo: ReturnType<import('../dal/sqliteNotificationRepository.js').createSqliteNotificationRepository>;
 *   emailService?: typeof import('./emailService.js');
 *   webPushService?: ReturnType<import('./webPushService.js').createWebPushService>;
 *   notificationPreferencesRepo?: ReturnType<import('../dal/sqliteNotificationPreferencesRepository.js').createSqliteNotificationPreferencesRepository>;
 * }} opts
 */
export function createNotificationService({
  notificationRepo,
  emailService,
  webPushService,
  notificationPreferencesRepo,
}) {
  /**
   * Create an in-app notification and optionally dispatch to email/push
   * based on user preferences.
   *
   * @param {object} params
   * @param {string} params.userId - The user's wallet address or ID
   * @param {string} params.title - Notification title
   * @param {string} params.message - Notification body
   * @param {string} [params.type] - Event type (e.g. 'credit', 'claim', 'unlock')
   * @param {string|number} [params.campaignId] - Related campaign ID
   * @param {object} [params.emailVars] - Template variables for email (if enabled)
   */
  async function notify({ userId, title, message, type = 'reward', campaignId, emailVars }) {
    // 1. Always create in-app notification
    const inAppResult = notificationRepo.create({
      userId,
      campaignId: campaignId ?? null,
      title,
      message,
      type,
    });

    logger.info?.({
      event: 'notification_created',
      userId,
      type,
      notificationId: inAppResult.id,
    });

    // 2. Check user preferences and dispatch to email/push if enabled
    if (!notificationPreferencesRepo) return inAppResult;

    const preferences = notificationPreferencesRepo.getPreferences(userId);
    const emailEnabled = preferences.some(
      (p) => p.channel === 'email' && (p.eventType === type || p.eventType === '*') && p.enabled,
    );
    const pushEnabled = preferences.some(
      (p) => p.channel === 'push' && (p.eventType === type || p.eventType === '*') && p.enabled,
    );

    // 3. Send email if enabled and service available
    if (emailEnabled && emailService && emailVars) {
      try {
        // Email sending would be implemented here when email provider is configured
        logger.info?.({
          event: 'email_notification_skipped',
          userId,
          type,
          reason: 'not_configured',
        });
      } catch (err) {
        logger.error?.({ event: 'email_notification_failed', userId, type, error: err.message });
      }
    }

    // 4. Send push if enabled and service available
    if (pushEnabled && webPushService?.isConfigured()) {
      try {
        await webPushService.sendToUser(userId, {
          title,
          body: message,
          type,
          campaignId,
        });
      } catch (err) {
        logger.error?.({ event: 'push_notification_failed', userId, type, error: err.message });
      }
    }

    return inAppResult;
  }

  return { notify };
}
