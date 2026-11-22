export const version = 40;
export const description =
  'Add decay_policy JSON column to campaigns for per-campaign point expiry configuration';

/**
 * Decay policy is stored as a JSON object with the shape:
 *   {
 *     kind: 'linear' | 'exponential',
 *     rate_bps: number,       // 1–10 000 (basis points per period)
 *     period_ledgers: number, // ledgers per decay period (>= 1)
 *     cliff_ledgers: number   // grace-window ledgers before decay starts
 *   }
 * NULL means no decay policy is configured for the campaign.
 */
export function up(db) {
  const columns = db.prepare('PRAGMA table_info(campaigns)').all();
  const columnNames = new Set(columns.map((col) => col.name));

  if (!columnNames.has('decay_policy')) {
    db.exec('ALTER TABLE campaigns ADD COLUMN decay_policy TEXT DEFAULT NULL;');
  }

  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_campaigns_decay_policy
       ON campaigns(id)
       WHERE decay_policy IS NOT NULL;`,
  );
}
