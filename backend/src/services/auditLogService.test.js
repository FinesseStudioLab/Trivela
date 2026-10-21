import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuditLogService } from './auditLogService.js';

/** In-memory stand-in for the audit log repository. */
function fakeRepository(rows = []) {
  const matches = (row, f) =>
    (!f.orgId || row.orgId === f.orgId) &&
    (!f.actor || row.actor === f.actor) &&
    (!f.action || row.action === f.action) &&
    (!f.entity || row.entity === f.entity) &&
    (!f.startDate || row.timestamp >= f.startDate);
  return {
    created: [],
    create(params) {
      this.created.push(params);
      return { id: String(this.created.length), ...params };
    },
    list(filters) {
      return rows
        .filter((r) => matches(r, filters))
        .slice(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? 100));
    },
    count(filters) {
      return rows.filter((r) => matches(r, filters)).length;
    },
  };
}

const row = (over = {}) => ({
  id: '1',
  actor: 'apiKey:abcd...wxyz',
  action: 'update',
  entity: 'campaign',
  entityId: '7',
  diff: { before: { name: 'a' }, after: { name: 'b', active: false } },
  orgId: 'org-1',
  ipAddress: '203.0.113.9',
  timestamp: '2026-10-18T10:00:00.000Z',
  ...over,
});

test('logAction passes the entry, including the IP address, to the repository', () => {
  const repo = fakeRepository();
  const service = createAuditLogService({ auditLogRepository: repo, orgMemberRepository: {} });
  service.logAction({
    actor: 'alice',
    action: 'create',
    entity: 'campaign',
    ipAddress: '198.51.100.4',
  });
  assert.equal(repo.created[0].ipAddress, '198.51.100.4');
});

test('getOrgAuditLogs paginates, caps the page size at 100 and reports totals', () => {
  const rows = Array.from({ length: 120 }, (_, i) => row({ id: String(i), actor: `a${i}` }));
  const service = createAuditLogService({
    auditLogRepository: fakeRepository(rows),
    orgMemberRepository: {},
  });

  const first = service.getOrgAuditLogs('org-1', { page: 1, pageSize: 500 });
  assert.equal(first.data.length, 100);
  assert.deepEqual(first.pagination, {
    page: 1,
    pageSize: 100,
    totalCount: 120,
    totalPages: 2,
    hasNextPage: true,
    hasPreviousPage: false,
  });

  const second = service.getOrgAuditLogs('org-1', { page: 2, pageSize: 100 });
  assert.equal(second.data.length, 20);
  assert.equal(second.pagination.hasNextPage, false);
  assert.equal(second.pagination.hasPreviousPage, true);
});

test('the activity feed describes each action in plain language and caps the limit at 50', () => {
  const rows = [
    row({ action: 'create', entityId: '1' }),
    row({ action: 'update' }),
    row({ action: 'update', diff: null, entityId: null }),
    row({ action: 'delete' }),
    row({ action: 'approve' }),
    row({ action: 'migrate' }),
  ];
  const service = createAuditLogService({
    auditLogRepository: fakeRepository(rows),
    orgMemberRepository: {},
  });
  const feed = service.getActivityFeed('org-1', { limit: 999 });

  assert.equal(feed.length, 6);
  assert.match(feed[0].description, /created campaign "1"/);
  assert.match(feed[1].description, /updated campaign "7" \(changed: name, active\)/);
  assert.match(feed[2].description, /updated campaign$/);
  assert.match(feed[3].description, /deleted campaign "7"/);
  assert.match(feed[4].description, /approved campaign "7"/);
  assert.match(feed[5].description, /performed "migrate" on campaign "7"/);
});

test('CSV export includes the IP address column and escapes quotes', () => {
  const rows = [
    row({ actor: 'say "hi"', ipAddress: '203.0.113.9' }),
    row({ id: '2', ipAddress: null }),
  ];
  const service = createAuditLogService({
    auditLogRepository: fakeRepository(rows),
    orgMemberRepository: {},
  });
  const { content, filename, mimeType } = service.exportToCsv('org-1');

  const [header, first, second] = content.split('\n');
  assert.equal(
    header,
    '"ID","Actor","Action","Entity","Entity ID","IP Address","Timestamp","Changes"',
  );
  assert.match(first, /"say ""hi"""/);
  assert.match(first, /"203\.0\.113\.9"/);
  assert.match(second, /"7",""/, 'a missing IP exports as an empty cell');
  assert.match(filename, /^audit-log-org-1-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.equal(mimeType, 'text/csv');
});

test('JSON export carries the records, filters and a count', () => {
  const rows = [row(), row({ id: '2' })];
  const service = createAuditLogService({
    auditLogRepository: fakeRepository(rows),
    orgMemberRepository: {},
  });
  const { content, mimeType } = service.exportToJson('org-1', {
    action: 'update',
    page: 3,
    pageSize: 5,
  });
  const parsed = JSON.parse(content);

  assert.equal(parsed.orgId, 'org-1');
  assert.equal(parsed.totalRecords, 2);
  assert.deepEqual(parsed.filters, { action: 'update' });
  assert.equal(parsed.auditLogs[0].ipAddress, '203.0.113.9');
  assert.equal(mimeType, 'application/json');
});

test('stats break actions, entities and actors down and rank the top actors', () => {
  const rows = [
    row({ actor: 'a', action: 'create' }),
    row({ actor: 'a', action: 'update' }),
    row({ actor: 'b', action: 'update', entity: 'webhook' }),
  ];
  const service = createAuditLogService({
    auditLogRepository: fakeRepository(rows),
    orgMemberRepository: {},
  });
  const stats = service.getOrgAuditStats('org-1');

  assert.equal(stats.totalActions, 3);
  assert.deepEqual(stats.actionBreakdown, { create: 1, update: 2 });
  assert.deepEqual(stats.entityBreakdown, { campaign: 2, webhook: 1 });
  assert.deepEqual(stats.topActors, [
    { actor: 'a', count: 2 },
    { actor: 'b', count: 1 },
  ]);
});
