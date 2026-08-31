export const version = 12;
export const description =
  'Add referral_bonus_events table for growth instrumentation (issue #656)';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS referral_bonus_events (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer          TEXT    NOT NULL,
      referee           TEXT    NOT NULL,
      bonus             TEXT    NOT NULL,
      qualifying_amount TEXT    NOT NULL,
      ledger            INTEGER,
      tx_hash           TEXT,
      created_at        INTEGER NOT NULL,
      UNIQUE(referee)
    );

    CREATE INDEX IF NOT EXISTS idx_referral_bonus_events_referrer ON referral_bonus_events(referrer);
  `);
}
