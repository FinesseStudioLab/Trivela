export const version = 10;
export const description = 'Add A/B testing support for campaign variants';

export function up(db) {
  db.exec(`
    -- Table for storing campaign variants (for A/B testing)
    CREATE TABLE IF NOT EXISTS campaign_variants (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id           INTEGER NOT NULL,
      variant_key           TEXT    NOT NULL,  -- e.g., 'control', 'variant_a', 'variant_b'
      name                  TEXT    NOT NULL,  -- Human-readable name
      description           TEXT,
      traffic_weight        INTEGER NOT NULL DEFAULT 50,  -- Percentage of traffic (0-100)
      is_control            INTEGER NOT NULL DEFAULT 0,   -- Whether this is the control variant
      active                INTEGER NOT NULL DEFAULT 1,   -- Whether this variant is active
      config                TEXT    NOT NULL DEFAULT '{}', -- JSON blob for variant-specific config
      created_at            TEXT    NOT NULL,
      updated_at            TEXT    NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      UNIQUE (campaign_id, variant_key)
    );

    -- Table for tracking user assignments to variants
    CREATE TABLE IF NOT EXISTS variant_assignments (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id           INTEGER NOT NULL,
      variant_id            INTEGER NOT NULL,
      user_id               TEXT    NOT NULL,  -- User identifier (wallet address, session ID, etc.)
      assigned_at           TEXT    NOT NULL,
      sticky                INTEGER NOT NULL DEFAULT 1,  -- Whether to keep user in same variant
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (variant_id) REFERENCES campaign_variants(id) ON DELETE CASCADE,
      UNIQUE (campaign_id, user_id)
    );

    -- Table for tracking variant results
    CREATE TABLE IF NOT EXISTS variant_results (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id           INTEGER NOT NULL,
      variant_id            INTEGER NOT NULL,
      metric_name           TEXT    NOT NULL,  -- e.g., 'conversion', 'engagement', 'claim_rate'
      metric_value          REAL    NOT NULL,  -- The measured value
      user_id               TEXT,               -- Optional: user who generated this metric
      recorded_at           TEXT    NOT NULL,
      metadata              TEXT    DEFAULT '{}', -- JSON blob for additional context
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (variant_id) REFERENCES campaign_variants(id) ON DELETE CASCADE
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_campaign_variants_campaign_id ON campaign_variants(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_variants_active      ON campaign_variants(active);
    
    CREATE INDEX IF NOT EXISTS idx_variant_assignments_campaign  ON variant_assignments(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_variant_assignments_user      ON variant_assignments(user_id);
    CREATE INDEX IF NOT EXISTS idx_variant_assignments_variant   ON variant_assignments(variant_id);
    
    CREATE INDEX IF NOT EXISTS idx_variant_results_campaign      ON variant_results(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_variant_results_variant       ON variant_results(variant_id);
    CREATE INDEX IF NOT EXISTS idx_variant_results_metric        ON variant_results(metric_name);
    CREATE INDEX IF NOT EXISTS idx_variant_results_recorded_at   ON variant_results(recorded_at);
  `);
}

export function down(db) {
  db.exec(`
    DROP TABLE IF EXISTS variant_results;
    DROP TABLE IF EXISTS variant_assignments;
    DROP TABLE IF EXISTS campaign_variants;
  `);
}
