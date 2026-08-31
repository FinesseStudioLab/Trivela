// Migration 013 — notification preferences + unsubscribe (issue #1026)
export const version = 13;
export const description =
  'Add notification_preferences table for per-user channel/event opt-in and unsubscribe tokens';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_address   TEXT    NOT NULL,
      channel        TEXT    NOT NULL,
      event_type     TEXT    NOT NULL DEFAULT '*',
      enabled        INTEGER NOT NULL DEFAULT 1,
      updated_at     TEXT    NOT NULL,
      PRIMARY KEY (user_address, channel, event_type)
    );

    CREATE INDEX IF NOT EXISTS idx_notif_prefs_user
      ON notification_preferences(user_address);

    CREATE TABLE IF NOT EXISTS unsubscribe_tokens (
      token          TEXT    PRIMARY KEY,
      user_address   TEXT    NOT NULL,
      channel        TEXT,
      created_at     TEXT    NOT NULL,
      used_at        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_unsub_tokens_user
      ON unsubscribe_tokens(user_address);
  `);
}
