export const version = 11;
export const description = 'Add event tables for cohort and retention analysis';

export function up(db) {
  // Create tables for tracking user events for cohort analysis
  db.exec(`
    -- User registration/activity tracking
    CREATE TABLE IF NOT EXISTS user_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      user_address TEXT NOT NULL,
      activity_type TEXT NOT NULL, -- 'registered', 'claimed', 'active'
      occurred_at TEXT NOT NULL, -- ISO 8601 timestamp
      ledger INTEGER,
      tx_hash TEXT,
      metadata TEXT, -- JSON for additional data
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_activities_campaign 
      ON user_activities(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_user_activities_user 
      ON user_activities(campaign_id, user_address);
    CREATE INDEX IF NOT EXISTS idx_user_activities_type 
      ON user_activities(campaign_id, activity_type);
    CREATE INDEX IF NOT EXISTS idx_user_activities_occurred 
      ON user_activities(campaign_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_user_activities_user_type 
      ON user_activities(campaign_id, user_address, activity_type);

    -- Precomputed cohort statistics for performance
    CREATE TABLE IF NOT EXISTS cohort_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      cohort_period TEXT NOT NULL, -- e.g., '2024-W01', '2024-01', '2024-01-01'
      cohort_size INTEGER NOT NULL DEFAULT 0,
      granularity TEXT NOT NULL, -- 'day', 'week', 'month'
      period_start TEXT NOT NULL, -- ISO 8601 timestamp
      period_end TEXT NOT NULL, -- ISO 8601 timestamp
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(campaign_id, cohort_period, granularity),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_cohort_stats_campaign 
      ON cohort_stats(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_cohort_stats_period 
      ON cohort_stats(campaign_id, cohort_period);

    -- Precomputed retention data
    CREATE TABLE IF NOT EXISTS retention_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      cohort_period TEXT NOT NULL,
      offset_period INTEGER NOT NULL, -- 0, 1, 2, 3... (weeks/days/months after cohort)
      metric_type TEXT NOT NULL, -- 'claimed', 'active'
      user_count INTEGER NOT NULL DEFAULT 0,
      granularity TEXT NOT NULL, -- 'day', 'week', 'month'
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(campaign_id, cohort_period, offset_period, metric_type, granularity),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_retention_data_campaign 
      ON retention_data(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_retention_data_cohort 
      ON retention_data(campaign_id, cohort_period);
    CREATE INDEX IF NOT EXISTS idx_retention_data_metric 
      ON retention_data(campaign_id, metric_type);
  `);
}

export function down(db) {
  db.exec(`
    DROP INDEX IF EXISTS idx_retention_data_metric;
    DROP INDEX IF EXISTS idx_retention_data_cohort;
    DROP INDEX IF EXISTS idx_retention_data_campaign;
    DROP TABLE IF EXISTS retention_data;

    DROP INDEX IF EXISTS idx_cohort_stats_period;
    DROP INDEX IF EXISTS idx_cohort_stats_campaign;
    DROP TABLE IF EXISTS cohort_stats;

    DROP INDEX IF EXISTS idx_user_activities_user_type;
    DROP INDEX IF EXISTS idx_user_activities_occurred;
    DROP INDEX IF EXISTS idx_user_activities_type;
    DROP INDEX IF EXISTS idx_user_activities_user;
    DROP INDEX IF EXISTS idx_user_activities_campaign;
    DROP TABLE IF NOT EXISTS user_activities;
  `);
}
