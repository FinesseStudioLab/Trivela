-- Migration: Analytics Events Table
-- Privacy-respecting analytics for funnel tracking
-- No PII, consent-aware, 90-day retention

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Event identification
  event_name TEXT NOT NULL,
  session_id TEXT NOT NULL,      -- Anonymized session identifier
  
  -- Campaign context (optional)
  campaign_id TEXT,
  
  -- UTM attribution
  source TEXT,                    -- UTM source
  medium TEXT,                    -- UTM medium
  campaign TEXT,                  -- UTM campaign name
  
  -- Event data (JSON)
  properties TEXT NOT NULL DEFAULT '{}',
  
  -- Timestamps
  timestamp TEXT NOT NULL,        -- Event occurrence time (ISO 8601)
  created_at TEXT NOT NULL,       -- Record creation time (ISO 8601)
  
  -- Indexes for efficient querying
  CONSTRAINT valid_event_name CHECK (
    event_name IN (
      'wallet_connect_initiated',
      'wallet_connect_success',
      'wallet_connect_failed',
      'registration_viewed',
      'registration_initiated',
      'registration_tx_signed',
      'registration_success',
      'registration_failed',
      'rewards_viewed',
      'claim_initiated',
      'claim_tx_signed',
      'claim_success',
      'claim_failed',
      'campaign_list_viewed',
      'campaign_card_clicked',
      'campaign_detail_viewed',
      'campaign_create_started',
      'campaign_create_step_completed',
      'campaign_create_success',
      'campaign_create_abandoned',
      'session_started',
      'page_viewed',
      'transaction_simulation_failed',
      'rpc_request_timeout'
    )
  )
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_campaign ON analytics_events(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_source ON analytics_events(source) WHERE source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_funnel ON analytics_events(event_name, timestamp, campaign_id);

-- User consent preferences
CREATE TABLE IF NOT EXISTS analytics_consent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,
  consent_given BOOLEAN NOT NULL DEFAULT 0,
  consent_timestamp TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_consent_session ON analytics_consent(session_id);

-- Aggregated metrics cache (for performance)
CREATE TABLE IF NOT EXISTS analytics_metrics_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_type TEXT NOT NULL,      -- 'funnel', 'dropoff', 'source', 'retention'
  metric_key TEXT NOT NULL,       -- Unique identifier for the metric
  metric_data TEXT NOT NULL,      -- JSON data
  start_date TEXT,
  end_date TEXT,
  computed_at TEXT NOT NULL,
  UNIQUE(metric_type, metric_key, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS idx_metrics_type_key ON analytics_metrics_cache(metric_type, metric_key);
CREATE INDEX IF NOT EXISTS idx_metrics_computed ON analytics_metrics_cache(computed_at);
