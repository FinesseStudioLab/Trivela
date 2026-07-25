export const version = 26;
export const description = 'User notification preferences for SMS/WhatsApp opt-in (#1028)';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           TEXT NOT NULL UNIQUE,
      email_enabled     INTEGER NOT NULL DEFAULT 1,
      sms_enabled       INTEGER NOT NULL DEFAULT 0,
      whatsapp_enabled  INTEGER NOT NULL DEFAULT 0,
      phone_number      TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);
  `);
}
