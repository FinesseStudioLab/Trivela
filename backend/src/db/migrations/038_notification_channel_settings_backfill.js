export const version = 38;
export const description =
  'Backfill notification_channel_settings skipped by a duplicate version (#1028)';

/**
 * Heals databases where `026_notification_preferences.js` never ran.
 *
 * Two migration files share version 26 (`026_notification_preferences.js` and
 * `026_operator_balance_log.js`). The runner skips a file whose version is
 * already in `_schema_migrations`, so any database migrated when only one of
 * them existed has 26 recorded but is missing the other's tables. That is the
 * case for the checked-in trivela.db: `operator_balance_log` exists,
 * `notification_channel_settings` does not, and the server crashes at boot
 * when the notification preferences repository prepares its statements.
 *
 * This re-states 26's schema under a fresh version so it applies everywhere.
 * Every statement is IF NOT EXISTS, so databases that did get 26 are
 * unaffected.
 */
export function up(db) {
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
