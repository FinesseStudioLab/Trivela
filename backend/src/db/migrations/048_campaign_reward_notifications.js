export const migration = {
  name: '048_campaign_reward_notifications',
  description: 'Track campaign reward availability notifications to prevent duplicate sends',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS campaign_reward_notifications (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        user_address TEXT NOT NULL,
        notification_type TEXT NOT NULL DEFAULT 'reward_available',
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(campaign_id, user_address, notification_type)
      );

      CREATE INDEX IF NOT EXISTS idx_reward_notif_campaign
        ON campaign_reward_notifications(campaign_id);

      CREATE INDEX IF NOT EXISTS idx_reward_notif_user
        ON campaign_reward_notifications(user_address);

      CREATE INDEX IF NOT EXISTS idx_reward_notif_sent
        ON campaign_reward_notifications(sent_at);
    `);
  },
};
