export const version = 34;
export const description =
  'Backfill notification_preferences skipped by a duplicate version (#1026)';

/**
 * Heals databases where `013_notification_preferences.js` never ran.
 *
 * Two migration files share version 13 (`013_notification_preferences.js` and
 * `013_push_subscriptions.js`). The runner skips a file whose version is
 * already in `_schema_migrations`, so any database migrated when only one of
 * them existed has 13 recorded but is missing the other's tables. That is the
 * case for the checked-in trivela.db: `push_subscriptions` exists,
 * `notification_preferences` does not, and the server crashes at boot when the
 * preferences repository prepares its statements.
 *
 * This re-states 013's schema under a fresh version so it applies everywhere.
 * Every statement is IF NOT EXISTS, so databases that did get 013 are
 * unaffected.
 */
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
