export const version = 49;
export const description = 'Add influencer_referral_codes table for partner referral links';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS influencer_referral_codes (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      code               TEXT    NOT NULL UNIQUE,
      influencer_handle  TEXT    NOT NULL,
      campaign_id        INTEGER,
      active             INTEGER NOT NULL DEFAULT 1,
      click_count        INTEGER NOT NULL DEFAULT 0,
      created_at         TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_influencer_codes_handle ON influencer_referral_codes(influencer_handle);
  `);
}
