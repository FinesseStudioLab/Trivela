export const version = 26;
export const description = 'User notification channel settings for SMS/WhatsApp opt-in (#1028)';

export function up(db) {
  // Migration 013 already owns `notification_preferences` for the
  // per-(user, channel, event_type) opt-in model (#1026). These per-user
  // channel toggles are a different shape and get their own table rather than
  // fighting over the name.
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_channel_settings (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           TEXT NOT NULL UNIQUE,
      email_enabled     INTEGER NOT NULL DEFAULT 1,
      sms_enabled       INTEGER NOT NULL DEFAULT 0,
      whatsapp_enabled  INTEGER NOT NULL DEFAULT 0,
      phone_number      TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notification_channel_settings_user_id
      ON notification_channel_settings(user_id);
  `);
}
