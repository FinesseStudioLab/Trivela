import { randomUUID } from 'crypto';

export function createSqliteCampaignRewardNotificationRepository({ db }) {
  const stmtInsert = db.prepare(`
    INSERT OR IGNORE INTO campaign_reward_notifications
    (id, campaign_id, user_address, notification_type)
    VALUES (?, ?, ?, ?)
  `);

  const stmtGetNotified = db.prepare(`
    SELECT user_address FROM campaign_reward_notifications
    WHERE campaign_id = ? AND notification_type = ?
  `);

  const stmtHasBeenNotified = db.prepare(`
    SELECT 1 FROM campaign_reward_notifications
    WHERE campaign_id = ? AND user_address = ? AND notification_type = ?
  `);

  return {
    recordNotification(campaignId, userAddress, type = 'reward_available') {
      const id = `notif_${randomUUID()}`;
      stmtInsert.run(id, campaignId, userAddress, type);
    },

    hasBeenNotified(campaignId, userAddress, type = 'reward_available') {
      const result = stmtHasBeenNotified.get(campaignId, userAddress, type);
      return !!result;
    },

    getNotifiedUsers(campaignId, type = 'reward_available') {
      const rows = stmtGetNotified.all(campaignId, type);
      return rows.map((row) => row.user_address);
    },
  };
}
