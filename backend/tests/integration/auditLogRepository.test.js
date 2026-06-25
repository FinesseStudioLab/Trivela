// @ts-check
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { createIntegrationTestEnv, seedAuditLogs } from './setup.js';

describe('sqliteAuditLogRepository — integration tests (real SQLite)', () => {
  /** @type {import('../../src/dal/sqliteAuditLogRepository.js').SqliteAuditLogRepository} */
  let auditLogs;
  /** @type {() => void} */
  let destroy;

  before(() => {
    const env = createIntegrationTestEnv();
    auditLogs = env.auditLogs;
    destroy = env.destroy;
  });

  after(() => {
    destroy();
  });

  describe('CRUD operations', () => {
    it('creates an audit log entry with org context', () => {
      const entry = auditLogs.create({
        actor: 'test-actor',
        action: 'create',
        entity: 'campaign',
        entityId: '123',
        orgId: 'org-456',
        diff: { after: { name: 'Test' } },
      });

      assert.ok(entry);
      assert.equal(entry.actor, 'test-actor');
      assert.equal(entry.action, 'create');
      assert.equal(entry.entity, 'campaign');
      assert.equal(entry.entityId, '123');
      assert.equal(entry.orgId, 'org-456');
      assert.deepEqual(entry.diff, { after: { name: 'Test' } });
      assert.ok(entry.timestamp);
    });

    it('creates audit log entry with null diff', () => {
      const entry = auditLogs.create({
        actor: 'system',
        action: 'delete',
        entity: 'campaign',
        entityId: '456',
        orgId: 'org-789',
      });

      assert.ok(entry);
      assert.equal(entry.diff, null);
      assert.equal(entry.orgId, 'org-789');
    });

    it('creates audit log entry without entityId and orgId', () => {
      const entry = auditLogs.create({
        actor: 'system',
        action: 'bulk-action',
        entity: 'campaign',
      });

      assert.ok(entry);
      assert.equal(entry.entityId, null);
      assert.equal(entry.orgId, null);
    });
  });

  describe('query by filters', () => {
    before(() => {
      // Clear existing data and seed
      seedAuditLogs(auditLogs, [
        { actor: 'admin-1', action: 'create', entity: 'campaign', entityId: '1', orgId: 'org-1' },
        { actor: 'admin-1', action: 'update', entity: 'campaign', entityId: '1', orgId: 'org-1' },
        { actor: 'admin-1', action: 'delete', entity: 'campaign', entityId: '1', orgId: 'org-1' },
        { actor: 'admin-2', action: 'create', entity: 'campaign', entityId: '2', orgId: 'org-2' },
        { actor: 'admin-1', action: 'create', entity: 'apiKey', entityId: 'k1', orgId: 'org-1' },
        { actor: 'admin-2', action: 'update', entity: 'campaign', entityId: '2', orgId: 'org-2' },
        { actor: 'admin-3', action: 'create', entity: 'webhook', entityId: 'w1', orgId: null },
      ]);
    });

    it('lists all audit logs', () => {
      const result = auditLogs.list();
      assert.ok(result.length >= 7);
    });

    it('filters by orgId', () => {
      const result = auditLogs.list({ orgId: 'org-1' });
      assert.equal(result.length, 4);
      assert.ok(result.every((entry) => entry.orgId === 'org-1'));
    });

    it('filters by campaignId (entity + entityId)', () => {
      const result = auditLogs.list({ entity: 'campaign', entityId: '1' });
      assert.equal(result.length, 3);
      assert.ok(result.every((entry) => entry.entity === 'campaign' && entry.entityId === '1'));
    });

    it('filters by entity only', () => {
      const result = auditLogs.list({ entity: 'campaign' });
      assert.ok(result.length >= 5);
      assert.ok(result.every((entry) => entry.entity === 'campaign'));
    });

    it('filters by action', () => {
      const result = auditLogs.list({ action: 'create' });
      assert.ok(result.length >= 4);
      assert.ok(result.every((entry) => entry.action === 'create'));
    });

    it('filters by actor', () => {
      const result = auditLogs.list({ actor: 'admin-1' });
      assert.equal(result.length, 4);
      assert.ok(result.every((entry) => entry.actor === 'admin-1'));
    });

    it('combines org and entity filters', () => {
      const result = auditLogs.list({ orgId: 'org-1', entity: 'campaign' });
      assert.equal(result.length, 3);
      assert.ok(result.every((entry) => entry.orgId === 'org-1' && entry.entity === 'campaign'));
    });

    it('combines org and action filters', () => {
      const result = auditLogs.list({ orgId: 'org-2', action: 'create' });
      assert.equal(result.length, 1);
      assert.ok(result.every((entry) => entry.orgId === 'org-2' && entry.action === 'create'));
    });

    it('returns empty array for no matches', () => {
      const result = auditLogs.list({ orgId: 'non-existent-org' });
      assert.deepEqual(result, []);
    });

    it('handles null orgId filter', () => {
      const result = auditLogs.list({ orgId: null });
      assert.equal(result.length, 1);
      assert.ok(result.every((entry) => entry.orgId === null));
    });
  });

  describe('pagination', () => {
    it('respects limit and offset', () => {
      const page1 = auditLogs.list({ limit: 3, offset: 0 });
      const page2 = auditLogs.list({ limit: 3, offset: 3 });

      assert.equal(page1.length, 3);
      assert.equal(page2.length, 3);
      
      // Ensure no overlap (IDs should be different)
      const page1Ids = page1.map(entry => entry.id);
      const page2Ids = page2.map(entry => entry.id);
      assert.ok(page1Ids.every(id => !page2Ids.includes(id)));
    });

    it('combines filters with pagination', () => {
      const result = auditLogs.list({ orgId: 'org-1', limit: 2, offset: 0 });
      assert.equal(result.length, 2);
      assert.ok(result.every(entry => entry.orgId === 'org-1'));
    });
  });

  describe('count method', () => {
    it('counts all audit logs without filters', () => {
      const total = auditLogs.count();
      assert.ok(total >= 7);
    });

    it('counts with org filter', () => {
      const org1Count = auditLogs.count({ orgId: 'org-1' });
      const org2Count = auditLogs.count({ orgId: 'org-2' });
      
      assert.equal(org1Count, 4);
      assert.equal(org2Count, 2);
    });

    it('counts with multiple filters', () => {
      const count = auditLogs.count({ orgId: 'org-1', entity: 'campaign' });
      assert.equal(count, 3);
    });

    it('counts with date filters', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      
      const count = auditLogs.count({ startDate: futureDate.toISOString() });
      assert.equal(count, 0);
    });
  });

  describe('date filtering', () => {
    it('filters by start date', () => {
      const now = new Date().toISOString();
      
      // Add a new entry
      auditLogs.create({
        actor: 'test-user',
        action: 'test',
        entity: 'test',
        entityId: 'test-id',
        orgId: 'org-test',
        timestamp: now,
      });
      
      const result = auditLogs.list({ startDate: now });
      assert.ok(result.length >= 1);
      assert.ok(result.some(entry => entry.actor === 'test-user'));
    });

    it('filters by end date', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      
      const result = auditLogs.list({ endDate: pastDate.toISOString() });
      // Should return fewer results than total
      const total = auditLogs.count();
      assert.ok(result.length < total);
    });

    it('combines date range with org filter', () => {
      const now = new Date().toISOString();
      
      auditLogs.create({
        actor: 'recent-user',
        action: 'recent-action',
        entity: 'test',
        entityId: 'recent-id',
        orgId: 'org-1',
        timestamp: now,
      });
      
      const result = auditLogs.list({
        orgId: 'org-1',
        startDate: now,
      });
      
      assert.ok(result.length >= 1);
      assert.ok(result.every(entry => entry.orgId === 'org-1'));
      assert.ok(result.some(entry => entry.actor === 'recent-user'));
    });
  });

  describe('ordering', () => {
    it('returns entries in reverse chronological order (newest first)', () => {
      const result = auditLogs.list();
      if (result.length >= 2) {
        // IDs are auto-incrementing; higher ID = newer
        for (let i = 1; i < result.length; i++) {
          assert.ok(
            Number(result[i - 1].id) > Number(result[i].id),
            `Entry ${result[i - 1].id} should be newer than ${result[i].id}`,
          );
        }
      }
    });

    it('maintains order when filtering', () => {
      const result = auditLogs.list({ orgId: 'org-1' });
      if (result.length >= 2) {
        for (let i = 1; i < result.length; i++) {
          assert.ok(Number(result[i - 1].id) > Number(result[i].id));
        }
      }
    });
  });
});
