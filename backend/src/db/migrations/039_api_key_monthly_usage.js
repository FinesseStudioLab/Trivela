export const version = 39;
export const description =
  'Add api_key_monthly_usage table for per-key monthly quota tracking (#759)';

export function up(db) {
  db.exec(`
    CREATE TABLE api_key_monthly_usage (
      api_key_id TEXT NOT NULL,
      month TEXT NOT NULL, -- 'YYYY-MM', UTC
      request_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (api_key_id, month),
      FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
    );
  `);
}
