export const version = 49;
export const description = 'User achievement badges and milestone progress snapshots (#1247)';

/**
 * Written by the achievement badge calculator (jobs/achievementBadgesJob.js),
 * which aggregates the indexer projection tables from migration 033.
 *
 * - user_badges is append-only: a badge, once granted, is never revoked by the
 *   worker, so the (user, badge_id) primary key doubles as the idempotency key.
 * - user_milestone_progress holds the latest metric snapshot per user; badge
 *   progress is derived from it at read time against the badge catalog, so a
 *   catalog change never requires a data migration.
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_badges (
      user         TEXT NOT NULL,
      badge_id     TEXT NOT NULL,
      metric_value REAL NOT NULL,
      awarded_at   TEXT NOT NULL,
      PRIMARY KEY (user, badge_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges(badge_id);

    CREATE TABLE IF NOT EXISTS user_milestone_progress (
      user             TEXT    PRIMARY KEY,
      campaigns_joined INTEGER NOT NULL DEFAULT 0,
      credits_received INTEGER NOT NULL DEFAULT 0,
      points_earned    REAL    NOT NULL DEFAULT 0,
      claims_made      INTEGER NOT NULL DEFAULT 0,
      referrals_made   INTEGER NOT NULL DEFAULT 0,
      computed_at      TEXT    NOT NULL
    );
  `);
}
