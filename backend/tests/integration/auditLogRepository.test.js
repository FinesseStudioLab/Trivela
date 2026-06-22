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
    it('creates an audit log entry', () => {
      const entry = auditLogs.create({
        actor: 'test-actor',
        action: 'create',
        entity: 'campaign',
        entityId: '123',
        diff: { after: { name: 'Test' } },
      });

      assert.ok(entry);
      assert.equal(entry.actor, 'test-actor');
      assert.equal(entry.action, 'create');
      assert.equal(entry.entity, 'campaign');
      assert.equal(entry.entityId, '123');
      assert.deepEqual(entry.diff, { after: { name: 'Test' } });
      assert.ok(entry.timestamp);
    });

    it('creates audit log entry with null diff', () => {
      const entry = auditLogs.create({
        actor: 'system',
        action: 'delete',
        entity: 'campaign',
        entityId: '456',
      });

      assert.ok(entry);
      assert.equal(entry.diff, null);
    });

    it('creates audit log entry without entityId', () => {
      const entry = auditLogs.create({
        actor: 'system',
        action: 'bulk-action',
        entity: 'campaign',
      });

      assert.ok(entry);
      assert.equal(entry.entityId, null);
    });
  });

  describe('query by filters', () => {
    before(() => {
      // Clear existing data and seed
      seedAuditLogs(auditLogs, [
        { actor: 'admin-1', action: 'create', entity: 'campaign', entityId: '1' },
        { actor: 'admin-1', action: 'update', entity: 'campaign', entityId: '1' },
        { actor: 'admin-1', action: 'delete', entity: 'campaign', entityId: '1' },
        { actor: 'admin-2', action: 'create', entity: 'campaign', entityId: '2' },
        { actor: 'admin-1', action: 'create', entity: 'apiKey', entityId: 'k1' },
        { actor: 'admin-2', action: 'update', entity: 'campaign', entityId: '2' },
      ]);
    });

    it('lists all audit logs', () => {
      const result = auditLogs.list();
      assert.ok(result.length >= 6);
    });

    it('filters by campaignId (entity + entityId)', () => {
      const result = auditLogs.list({ entity: 'campaign', entityId: '1' });
      assert.equal(result.length, 3);
      assert.ok(result.every((entry) => entry.entity === 'campaign' && entry.entityId === '1'));
    });

    it('filters by entity only', () => {
      const result = auditLogs.list({ entity: 'campaign' });
      assert.ok(result.length >= 4);
      assert.ok(result.every((entry) => entry.entity === 'campaign'));
    });

    it('filters by action', () => {
      const result = auditLogs.list({ action: 'create' });
      assert.ok(result.length >= 3);
      assert.ok(result.every((entry) => entry.action === 'create'));
    });

    it('filters by actor (via entity filter)', () => {
      const all = auditLogs.list();
      const admin1Entries = all.filter((entry) => entry.actor === 'admin-1');
      assert.equal(admin1Entries.length, 4);
    });

    it('combines entity and action filters', () => {
      const result = auditLogs.list({ entity: 'campaign', action: 'create' });
      assert.equal(result.length, 2);
      assert.ok(result.every((entry) => entry.entity === 'campaign' && entry.action === 'create'));
    });

    it('returns empty array for no matches', () => {
      const result = auditLogs.list({ entity: 'campaign', entityId: 'non-existent' });
      assert.deepEqual(result, []);
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
  });
});
