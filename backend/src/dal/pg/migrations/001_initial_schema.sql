-- PostgreSQL schema for Trivela (issue #284).
--
-- Mirrors the SQLite schema produced by the legacy JS migrations in
-- src/db/migrations/, but uses PG-native types: BIGSERIAL primary keys,
-- BOOLEAN instead of INTEGER 0/1, TIMESTAMPTZ instead of TEXT ISO strings,
-- and JSONB for arbitrary blobs. The repository code translates back to the
-- domain shapes the SQLite repository already returns.

CREATE TABLE IF NOT EXISTS campaigns (
    id                    BIGSERIAL PRIMARY KEY,
    name                  TEXT        NOT NULL,
    slug                  TEXT        NOT NULL UNIQUE,
    description           TEXT        NOT NULL DEFAULT '',
    active                BOOLEAN     NOT NULL DEFAULT TRUE,
    featured              BOOLEAN     NOT NULL DEFAULT FALSE,
    reward_per_action     INTEGER     NOT NULL DEFAULT 0,
    referral_bonus_points INTEGER     NOT NULL DEFAULT 0,
    start_date            TIMESTAMPTZ,
    end_date              TIMESTAMPTZ,
    hidden                BOOLEAN     NOT NULL DEFAULT FALSE,
    hidden_reason         TEXT,
    contract_id           TEXT,
    image_url             TEXT,
    tags                  JSONB       NOT NULL DEFAULT '[]'::jsonb,
    category              TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_active     ON campaigns(active);
CREATE INDEX IF NOT EXISTS idx_campaigns_hidden     ON campaigns(hidden);
CREATE INDEX IF NOT EXISTS idx_campaigns_featured   ON campaigns(featured);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at);
CREATE INDEX IF NOT EXISTS idx_campaigns_category   ON campaigns(category);
CREATE INDEX IF NOT EXISTS idx_campaigns_name_lower ON campaigns(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_campaigns_tags_gin   ON campaigns USING GIN (tags);

-- audit_logs schema matches the column set the legacy SQLite repository writes
-- to: (actor, action, entity, entity_id, diff, created_at). The legacy
-- migration `001_initial_schema.js` declares a different shape, but the
-- repository INSERT is the source of truth callers depend on; we follow the
-- code, not the drift-y SQLite migration.
CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    actor       TEXT        NOT NULL,
    action      TEXT        NOT NULL,
    entity      TEXT        NOT NULL,
    entity_id   TEXT,
    diff        JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity     ON audit_logs(entity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id  ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
