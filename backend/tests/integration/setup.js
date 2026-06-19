// @ts-check
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrate.js';
import { createSqliteCampaignRepository } from '../../src/dal/sqliteCampaignRepository.js';
import { createSqliteAuditLogRepository } from '../../src/dal/sqliteAuditLogRepository.js';

/**
 * Create an in-memory SQLite database with all migrations applied.
 * Seeds default test data and returns repository instances.
 */
export function createIntegrationTestEnv() {
  const db = new Database(':memory:');

  // Run all migrations (issue #303)
  runMigrations(db);

  // Create repositories backed by the real SQLite DB
  const campaigns = createSqliteCampaignRepository({ db });
  const auditLogs = createSqliteAuditLogRepository({ db });

  return {
    db,
    campaigns,
    auditLogs,
    /** Clean up after test */
    destroy() {
      db.close();
    },
  };
}

/**
 * Seed the database with test campaigns.
 * Returns the created campaign objects.
 */
export function seedCampaigns(campaigns, data = []) {
  return data.map((item) =>
    campaigns.create({
      name: item.name,
      slug: item.slug,
      description: item.description ?? '',
      active: item.active ?? true,
      featured: item.featured ?? false,
      rewardPerAction: item.rewardPerAction ?? 10,
      referralBonusPoints: item.referralBonusPoints ?? 0,
      startDate: item.startDate ?? null,
      endDate: item.endDate ?? null,
      tags: item.tags ?? [],
      category: item.category ?? null,
    }),
  );
}

/**
 * Seed the database with test audit log entries.
 */
export function seedAuditLogs(auditLogs, data = []) {
  return data.map((item) =>
    auditLogs.create({
      actor: item.actor,
      action: item.action,
      entity: item.entity,
      entityId: item.entityId,
      diff: item.diff ?? null,
      timestamp: item.timestamp ?? new Date().toISOString(),
    }),
  );
}
