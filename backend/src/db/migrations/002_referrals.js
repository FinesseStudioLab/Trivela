export const version = 2;
export const description = 'Add referrals table and referral_bonus_points column to campaigns';

export function up(db) {
  db.exec(`ALTER TABLE campaigns ADD COLUMN referral_bonus_points INTEGER NOT NULL DEFAULT 0;`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS referrals (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id      INTEGER NOT NULL,
      referrer_address TEXT    NOT NULL,
      referee_address  TEXT    NOT NULL,
      created_at       TEXT    NOT NULL,
      UNIQUE(campaign_id, referee_address)
    );

    CREATE INDEX IF NOT EXISTS idx_referrals_campaign_referrer ON referrals(campaign_id, referrer_address);
    CREATE INDEX IF NOT EXISTS idx_referrals_campaign_referee  ON referrals(campaign_id, referee_address);
  `);
}
