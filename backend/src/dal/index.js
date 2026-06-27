import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { assertCampaignRepository } from './campaignRepository.js';
import {
  createSqliteCampaignRepository,
  parseCategoriesConfig,
} from './sqliteCampaignRepository.js';
import { assertAuditLogRepository } from './auditLogRepository.js';
import { createSqliteAuditLogRepository } from './sqliteAuditLogRepository.js';
import { WebhookRepository } from './webhookRepository.js';
import { createSqliteReferralRepository } from './sqliteReferralRepository.js';
import { assertApiKeyRepository } from './apiKeyRepository.js';
import { createSqliteApiKeyRepository } from './sqliteApiKeyRepository.js';
import { createSqliteFailedJobRepository } from './sqliteFailedJobRepository.js';
import { createSqliteVariantRepository } from './sqliteVariantRepository.js';
import { createSqliteCohortRepository } from './sqliteCohortRepository.js';
import { createSqlitePushSubscriptionRepository } from './sqlitePushSubscriptionRepository.js';
import { createPool, isPostgresUrl } from './pg/pgClient.js';
import { createSqliteAllowlistRepository } from './sqliteAllowlistRepository.js';
import { SqliteOrganizationRepository } from './sqliteOrganizationRepository.js';
import { createSqliteOrgMemberRepository } from './sqliteOrgMemberRepository.js';
import { createSqliteUsageRepository } from './sqliteUsageRepository.js';
import { createSqliteFeatureFlagRepository } from './sqliteFeatureFlagRepository.js';
import { createSqliteIdempotencyRepository } from './sqliteIdempotencyRepository.js';

import { runPgMigrations } from './pg/migrate.js';
import { createPgCampaignRepository } from './pg/pgCampaignRepository.js';
import { createPgAuditLogRepository } from './pg/pgAuditLogRepository.js';

/**
 * Build the DAL.
 *
 * Routing (issue #284):
 *   - When `databaseUrl` (or `process.env.DATABASE_URL`) begins with
 *     `postgres://` / `postgresql://`, the PG implementations are used for
 *     campaigns + audit logs. Webhooks, referrals, and API keys stay on
 *     SQLite as they have not been ported yet.
 *   - Otherwise SQLite is used end-to-end via better-sqlite3.
 *
 * The `dbPath` knob still controls the SQLite location.
 */
export async function createDal({
  dbPath = ':memory:',
  databaseUrl = process.env.DATABASE_URL,
  campaigns = [],
  campaignRepository,
  auditLogRepository,
  webhookRepository,
  apiKeyRepository,
  failedJobRepository,
  allowedCategories,
  allowlistRepository,
} = {}) {
  const db = new Database(dbPath);
  await runMigrations(db);

  const categories = allowedCategories ?? parseCategoriesConfig(process.env.TRIVELA_CATEGORIES);

  let pgPool;
  let pgCampaigns;
  let pgAuditLogs;
  if (isPostgresUrl(databaseUrl)) {
    pgPool = createPool(databaseUrl);
    await runPgMigrations(pgPool);
    pgCampaigns = createPgCampaignRepository({
      pool: pgPool,
      seed: campaigns,
      allowedCategories: categories,
    });
    pgAuditLogs = createPgAuditLogRepository({ pool: pgPool });
  }

  return {
    campaigns: assertCampaignRepository(
      campaignRepository ??
        pgCampaigns ??
        createSqliteCampaignRepository({
          db,
          seed: campaigns,
          allowedCategories: categories,
        }),
    ),
    auditLogs: assertAuditLogRepository(
      auditLogRepository ?? pgAuditLogs ?? createSqliteAuditLogRepository({ db }),
    ),
    webhooks: webhookRepository ?? new WebhookRepository(db),
    referrals: createSqliteReferralRepository({ db }),
    variants: createSqliteVariantRepository({ db }),
    cohorts: createSqliteCohortRepository({ db }),
    pushSubscriptions: createSqlitePushSubscriptionRepository({ db }),
    apiKeys: assertApiKeyRepository(apiKeyRepository ?? createSqliteApiKeyRepository({ db })),
    failedJobs: failedJobRepository ?? createSqliteFailedJobRepository({ db }),
    allowlists: allowlistRepository ?? createSqliteAllowlistRepository({ db }),
    organizations: new SqliteOrganizationRepository(db),
    orgMembers: createSqliteOrgMemberRepository({ db }),
    usage: createSqliteUsageRepository({ db }),
    featureFlags: createSqliteFeatureFlagRepository({ db }),
    idempotency: createSqliteIdempotencyRepository({ db }),
    db,
    pgPool,
  };
}
