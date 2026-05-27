import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { assertCampaignRepository } from './campaignRepository.js';
import { createSqliteCampaignRepository } from './sqliteCampaignRepository.js';
import { assertAuditLogRepository } from './auditLogRepository.js';
import { createSqliteAuditLogRepository } from './sqliteAuditLogRepository.js';
import { WebhookRepository } from './webhookRepository.js';

export async function createDal({
  dbPath = ':memory:',
  campaigns = [],
  campaignRepository,
  auditLogRepository,
  webhookRepository,
} = {}) {
  const db = new Database(dbPath);

  // Run migrations on startup for SQLite
  await runMigrations(db);

  return {
    campaigns: assertCampaignRepository(
      campaignRepository
        ?? createSqliteCampaignRepository({
          db,
          seed: campaigns,
        }),
    ),
    auditLogs: assertAuditLogRepository(
      auditLogRepository ?? createSqliteAuditLogRepository({ db }),
    ),
    webhooks: webhookRepository ?? new WebhookRepository(db),
  };
}
