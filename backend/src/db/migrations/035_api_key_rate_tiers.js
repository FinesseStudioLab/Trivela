export const version = 35;
export const description = 'Add rate_tier column to api_keys for per-key rate limiting (#924)';

export function up(db) {
  db.exec(`
    ALTER TABLE api_keys ADD COLUMN rate_tier TEXT NOT NULL DEFAULT 'standard';
  `);
}
