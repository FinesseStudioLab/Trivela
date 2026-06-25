// @ts-check
import { randomUUID } from 'node:crypto';

export const VALID_RESOURCES = ['api_calls', 'campaigns', 'participants', 'payouts'];

/**
 * @param {{ db: InstanceType<import('better-sqlite3')> }} params
 */
export function createSqliteUsageRepository({ db }) {
  // ── Quota CRUD ────────────────────────────────────────────────────────────

  const upsertQuotaStmt = db.prepare(`
    INSERT INTO org_quotas (id, org_id, resource, soft_limit, hard_limit, window_seconds, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(org_id, resource) DO UPDATE SET
      soft_limit     = excluded.soft_limit,
      hard_limit     = excluded.hard_limit,
      window_seconds = excluded.window_seconds,
      updated_at     = excluded.updated_at
  `);

  const selectQuotaStmt = db.prepare(`SELECT * FROM org_quotas WHERE org_id = ? AND resource = ?`);
  const selectAllQuotasForOrgStmt = db.prepare(
    `SELECT * FROM org_quotas WHERE org_id = ? ORDER BY resource`,
  );

  function upsertQuota({
    orgId,
    resource,
    softLimit = null,
    hardLimit = null,
    windowSeconds = 3600,
  }) {
    const id = randomUUID();
    const updatedAt = new Date().toISOString();
    upsertQuotaStmt.run(id, orgId, resource, softLimit, hardLimit, windowSeconds, updatedAt);
    return getQuota(orgId, resource);
  }

  function getQuota(orgId, resource) {
    const row = selectQuotaStmt.get(orgId, resource);
    if (!row) return null;
    return rowToQuota(row);
  }

  function getOrgQuotas(orgId) {
    return selectAllQuotasForOrgStmt.all(orgId).map(rowToQuota);
  }

  // ── Usage log ─────────────────────────────────────────────────────────────

  const upsertUsageStmt = db.prepare(`
    INSERT INTO org_usage_log (id, org_id, resource, window_start, count, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(org_id, resource, window_start) DO UPDATE SET
      count      = excluded.count,
      updated_at = excluded.updated_at
  `);

  const selectUsageStmt = db.prepare(
    `SELECT * FROM org_usage_log WHERE org_id = ? AND resource = ? AND window_start = ?`,
  );

  const selectRecentUsageStmt = db.prepare(`
    SELECT * FROM org_usage_log
    WHERE org_id = ? AND resource = ?
    ORDER BY window_start DESC
    LIMIT 1
  `);

  const selectAllUsageForOrgStmt = db.prepare(`
    SELECT * FROM org_usage_log
    WHERE org_id = ?
    ORDER BY resource, window_start DESC
  `);

  const selectAllOrgUsageStmt = db.prepare(`
    SELECT u.*, q.soft_limit, q.hard_limit, q.window_seconds
    FROM org_usage_log u
    LEFT JOIN org_quotas q ON q.org_id = u.org_id AND q.resource = u.resource
    ORDER BY u.org_id, u.resource, u.window_start DESC
  `);

  function upsertUsageWindow({ orgId, resource, windowStart, count }) {
    const id = randomUUID();
    const updatedAt = new Date().toISOString();
    upsertUsageStmt.run(id, orgId, resource, windowStart, count, updatedAt);
  }

  function getUsageWindow(orgId, resource, windowStart) {
    const row = selectUsageStmt.get(orgId, resource, windowStart);
    return row ? rowToUsage(row) : null;
  }

  function getLatestUsage(orgId, resource) {
    const row = selectRecentUsageStmt.get(orgId, resource);
    return row ? rowToUsage(row) : null;
  }

  function getOrgUsageSummary(orgId) {
    return selectAllUsageForOrgStmt.all(orgId).map(rowToUsage);
  }

  function adminExportAll() {
    return selectAllOrgUsageStmt.all().map((row) => ({
      orgId: row.org_id,
      resource: row.resource,
      windowStart: row.window_start,
      count: row.count,
      updatedAt: row.updated_at,
      softLimit: row.soft_limit ?? null,
      hardLimit: row.hard_limit ?? null,
      windowSeconds: row.window_seconds ?? null,
    }));
  }

  return {
    upsertQuota,
    getQuota,
    getOrgQuotas,
    upsertUsageWindow,
    getUsageWindow,
    getLatestUsage,
    getOrgUsageSummary,
    adminExportAll,
  };
}

function rowToQuota(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    resource: row.resource,
    softLimit: row.soft_limit ?? null,
    hardLimit: row.hard_limit ?? null,
    windowSeconds: row.window_seconds,
    updatedAt: row.updated_at,
  };
}

function rowToUsage(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    resource: row.resource,
    windowStart: row.window_start,
    count: row.count,
    updatedAt: row.updated_at,
  };
}
