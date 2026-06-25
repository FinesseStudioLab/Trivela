// @ts-check
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { createIntegrationTestEnv } from './setup.js';
import { createAuditLogService } from '../../src/services/auditLogService.js';

describe('auditLogService — integration tests', () => {
  /** @type {ReturnType<typeof createIntegrationTestEnv>} */
  let env;
  /** @type {ReturnType<typeof createAuditLogService>} */
  let auditLogService;

  before(() => {
    env = createIntegrationTestEnv();
    auditLogService = createAuditLogService({
      auditLogRepository: env.auditLogs,
      orgMemberRepository: env.orgMembers,
    });
  });

  after(() => {
    env.destroy();
  });

  describe('logAction', () => {
    it('creates audit log entry with org context', () => {
      const entry = auditLogService.logAction({
        actor: 'test-user',
        action: 'create',
        entity: 'campaign',
        entityId: 'camp-123',
        orgId: 'org-456',
        diff: { name: 'Test Campaign' },
      });

      assert.ok(entry);
      assert.equal(entry.actor, 'test-user');
      assert.equal(entry.action, 'create');
      assert.equal(entry.entity, 'campaign');
      assert.equal(entry.entityId, 'camp-123');
      assert.equal(entry.orgId, 'org-456');
      assert.deepEqual(entry.diff, { name: 'Test Campaign' });
    });
  });

  describe('getOrgAuditLogs', () => {
    before(() => {
      // Seed test data
      auditLogService.logAction({
        actor: 'user-1',
        action: 'create',
        entity: 'campaign',
        entityId: 'camp-1',
        orgId: 'org-1',
      });
      auditLogService.logAction({
        actor: 'user-1',
        action: 'update',
        entity: 'campaign',
        entityId: 'camp-1',
        orgId: 'org-1',
      });
      auditLogService.logAction({
        actor: 'user-2',
        action: 'create',
        entity: 'campaign',
        entityId: 'camp-2',
        orgId: 'org-2',
      });
      auditLogService.logAction({
        actor: 'user-1',
        action: 'delete',
        entity: 'apiKey',
        entityId: 'key-1',
        orgId: 'org-1',
      });
    });

    it('returns org-scoped audit logs with pagination', () => {
      const result = auditLogService.getOrgAuditLogs('org-1', {
        page: 1,
        pageSize: 10,
      });

      assert.ok(result.data);
      assert.equal(result.data.length, 3);
      assert.ok(result.data.every(log => log.orgId === 'org-1'));
      
      assert.ok(result.pagination);
      assert.equal(result.pagination.page, 1);
      assert.equal(result.pagination.totalCount, 3);
      assert.equal(result.pagination.totalPages, 1);
      assert.equal(result.pagination.hasNextPage, false);
    });

    it('filters by actor', () => {
      const result = auditLogService.getOrgAuditLogs('org-1', {
        actor: 'user-1',
      });

      assert.equal(result.data.length, 3);
      assert.ok(result.data.every(log => log.actor === 'user-1'));
    });

    it('filters by action', () => {
      const result = auditLogService.getOrgAuditLogs('org-1', {
        action: 'create',
      });

      assert.equal(result.data.length, 1);
      assert.ok(result.data.every(log => log.action === 'create'));
    });

    it('filters by entity', () => {
      const result = auditLogService.getOrgAuditLogs('org-1', {
        entity: 'campaign',
      });

      assert.equal(result.data.length, 2);
      assert.ok(result.data.every(log => log.entity === 'campaign'));
    });

    it('handles pagination correctly', () => {
      const page1 = auditLogService.getOrgAuditLogs('org-1', {
        page: 1,
        pageSize: 2,
      });

      assert.equal(page1.data.length, 2);
      assert.equal(page1.pagination.hasNextPage, true);
      assert.equal(page1.pagination.hasPreviousPage, false);

      const page2 = auditLogService.getOrgAuditLogs('org-1', {
        page: 2,
        pageSize: 2,
      });

      assert.equal(page2.data.length, 1);
      assert.equal(page2.pagination.hasNextPage, false);
      assert.equal(page2.pagination.hasPreviousPage, true);
    });

    it('returns only logs for specified org', () => {
      const org1Logs = auditLogService.getOrgAuditLogs('org-1');
      const org2Logs = auditLogService.getOrgAuditLogs('org-2');

      assert.equal(org1Logs.data.length, 3);
      assert.equal(org2Logs.data.length, 1);
      assert.ok(org1Logs.data.every(log => log.orgId === 'org-1'));
      assert.ok(org2Logs.data.every(log => log.orgId === 'org-2'));
    });
  });

  describe('getActivityFeed', () => {
    it('returns recent activities with descriptions', () => {
      const activities = auditLogService.getActivityFeed('org-1', {
        limit: 5,
      });

      assert.ok(Array.isArray(activities));
      assert.ok(activities.length > 0);
      assert.ok(activities.every(activity => activity.description));
      assert.ok(activities.every(activity => activity.orgId === 'org-1'));
    });

    it('respects limit parameter', () => {
      const activities = auditLogService.getActivityFeed('org-1', {
        limit: 2,
      });

      assert.equal(activities.length, 2);
    });

    it('generates readable descriptions', () => {
      const activities = auditLogService.getActivityFeed('org-1');
      const createActivity = activities.find(a => a.action === 'create');
      const updateActivity = activities.find(a => a.action === 'update');
      const deleteActivity = activities.find(a => a.action === 'delete');

      if (createActivity) {
        assert.ok(createActivity.description.includes('created'));
      }
      if (updateActivity) {
        assert.ok(updateActivity.description.includes('updated'));
      }
      if (deleteActivity) {
        assert.ok(deleteActivity.description.includes('deleted'));
      }
    });
  });

  describe('exportToCsv', () => {
    it('exports org audit logs as CSV', () => {
      const result = auditLogService.exportToCsv('org-1');

      assert.ok(result.content);
      assert.ok(result.filename);
      assert.equal(result.mimeType, 'text/csv');
      
      const lines = result.content.split('\n');
      assert.ok(lines.length > 1); // Header + data rows
      assert.ok(lines[0].includes('ID,Actor,Action,Entity'));
    });

    it('includes only org-specific data in CSV export', () => {
      const result = auditLogService.exportToCsv('org-1');
      const lines = result.content.split('\n');
      
      // Should have header + 3 data rows for org-1
      assert.equal(lines.length, 5); // header + 3 rows + empty line at end
    });

    it('handles CSV escaping correctly', () => {
      auditLogService.logAction({
        actor: 'user,with,commas',
        action: 'create',
        entity: 'test',
        entityId: 'test-id',
        orgId: 'org-test',
        diff: { description: 'Test "quoted" value' },
      });

      const result = auditLogService.exportToCsv('org-test');
      assert.ok(result.content.includes('"user,with,commas"'));
      assert.ok(result.content.includes('""quoted""'));
    });
  });

  describe('exportToJson', () => {
    it('exports org audit logs as JSON', () => {
      const result = auditLogService.exportToJson('org-1');

      assert.ok(result.content);
      assert.ok(result.filename);
      assert.equal(result.mimeType, 'application/json');
      
      const data = JSON.parse(result.content);
      assert.equal(data.orgId, 'org-1');
      assert.ok(data.exportedAt);
      assert.ok(Array.isArray(data.auditLogs));
      assert.equal(data.auditLogs.length, 3);
    });

    it('includes metadata in JSON export', () => {
      const result = auditLogService.exportToJson('org-1', {
        action: 'create',
        startDate: '2024-01-01',
      });

      const data = JSON.parse(result.content);
      assert.deepEqual(data.filters, {
        action: 'create',
        startDate: '2024-01-01',
      });
      assert.equal(data.totalRecords, data.auditLogs.length);
    });
  });

  describe('getOrgAuditStats', () => {
    it('returns audit statistics for organization', () => {
      const stats = auditLogService.getOrgAuditStats('org-1');

      assert.ok(stats);
      assert.equal(stats.totalActions, 3);
      assert.ok(stats.actionBreakdown);
      assert.ok(stats.entityBreakdown);
      assert.ok(Array.isArray(stats.topActors));
      
      // Check action breakdown
      assert.equal(stats.actionBreakdown.create, 1);
      assert.equal(stats.actionBreakdown.update, 1);
      assert.equal(stats.actionBreakdown.delete, 1);
      
      // Check entity breakdown
      assert.equal(stats.entityBreakdown.campaign, 2);
      assert.equal(stats.entityBreakdown.apiKey, 1);
    });

    it('returns top actors sorted by activity count', () => {
      const stats = auditLogService.getOrgAuditStats('org-1');
      const topActor = stats.topActors[0];

      assert.ok(topActor);
      assert.equal(topActor.actor, 'user-1');
      assert.equal(topActor.count, 3);
    });

    it('handles date filtering in stats', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      
      const stats = auditLogService.getOrgAuditStats('org-1', {
        startDate: futureDate.toISOString(),
      });

      assert.equal(stats.totalActions, 0);
      assert.deepEqual(stats.actionBreakdown, {});
      assert.deepEqual(stats.entityBreakdown, {});
      assert.equal(stats.topActors.length, 0);
    });
  });
});