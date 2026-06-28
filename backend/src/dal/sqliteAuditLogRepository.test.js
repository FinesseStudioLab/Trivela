import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { createSqliteAuditLogRepository } from './sqliteAuditLogRepository.js';
import { GENESIS_HASH, computeEntryHash } from '../services/auditChain.js';

async function setup() {
  const db = new Database(':memory:');
  await runMigrations(db);
  return { db, repo: createSqliteAuditLogRepository({ db }) };
}

test('audit log create returns entry with seq and hashes', async () => {
  const { repo } = await setup();
  const entry = repo.create({ actor: 'alice', action: 'create', entity: 'campaign', entityId: '1' });
  assert.equal(entry.seq, 1);
  assert.equal(entry.prevHash, GENESIS_HASH);
  assert.ok(typeof entry.entryHash === 'string' && entry.entryHash.length === 64);
});

test('audit log second entry chains off first', async () => {
  const { repo } = await setup();
  const first = repo.create({ actor: 'alice', action: 'create', entity: 'campaign', entityId: '1' });
  const second = repo.create({ actor: 'bob', action: 'update', entity: 'campaign', entityId: '1' });
  assert.equal(second.seq, 2);
  assert.equal(second.prevHash, first.entryHash);
});

test('verify returns valid on an intact chain', async () => {
  const { repo } = await setup();
  repo.create({ actor: 'alice', action: 'create', entity: 'campaign', entityId: '1' });
  repo.create({ actor: 'alice', action: 'update', entity: 'campaign', entityId: '1' });
  repo.create({ actor: 'bob',   action: 'delete', entity: 'campaign', entityId: '1' });
  const result = repo.verify();
  assert.equal(result.valid, true);
  assert.equal(result.checkedCount, 3);
});

test('verify returns valid with zero entries', async () => {
  const { repo } = await setup();
  const result = repo.verify();
  assert.equal(result.valid, true);
  assert.equal(result.checkedCount, 0);
});

test('verify detects tampered entry_hash', async () => {
  const { db, repo } = await setup();
  repo.create({ actor: 'alice', action: 'create', entity: 'campaign', entityId: '42' });
  repo.create({ actor: 'alice', action: 'update', entity: 'campaign', entityId: '42' });

  db.prepare(`UPDATE audit_logs SET entry_hash = 'deadbeef' WHERE seq = 1`).run();

  const result = repo.verify();
  assert.equal(result.valid, false);
  assert.equal(result.firstBrokenSeq, 1);
});

test('verify detects modified actor field', async () => {
  const { db, repo } = await setup();
  repo.create({ actor: 'alice', action: 'create', entity: 'campaign', entityId: '1' });
  repo.create({ actor: 'bob', action: 'update', entity: 'campaign', entityId: '1' });

  db.prepare(`UPDATE audit_logs SET actor = 'mallory' WHERE seq = 1`).run();

  const result = repo.verify();
  assert.equal(result.valid, false);
  assert.equal(result.firstBrokenSeq, 1);
});

test('verify detects break in the middle of chain', async () => {
  const { db, repo } = await setup();
  repo.create({ actor: 'alice', action: 'create', entity: 'campaign', entityId: '1' });
  repo.create({ actor: 'alice', action: 'update', entity: 'campaign', entityId: '1' });
  repo.create({ actor: 'alice', action: 'delete', entity: 'campaign', entityId: '1' });

  db.prepare(`UPDATE audit_logs SET action = 'hacked' WHERE seq = 2`).run();

  const result = repo.verify();
  assert.equal(result.valid, false);
  assert.equal(result.firstBrokenSeq, 2);
});

test('audit log list returns most recent first', async () => {
  const { repo } = await setup();
  repo.create({ actor: 'a', action: 'create', entity: 'campaign', entityId: '1' });
  repo.create({ actor: 'b', action: 'update', entity: 'campaign', entityId: '1' });
  const items = repo.list();
  assert.equal(items[0].actor, 'b');
  assert.equal(items[1].actor, 'a');
});

test('audit log count returns correct total', async () => {
  const { repo } = await setup();
  repo.create({ actor: 'a', action: 'create', entity: 'campaign' });
  repo.create({ actor: 'b', action: 'update', entity: 'apiKey' });
  assert.equal(repo.count(), 2);
  assert.equal(repo.count({ entity: 'campaign' }), 1);
});

test('entry_hash is deterministic for same input', () => {
  const ts = '2024-01-01T00:00:00.000Z';
  const entry = { actor: 'alice', action: 'create', entity: 'campaign', entityId: '1', diff: null, orgId: null, createdAt: ts };
  const h1 = computeEntryHash(GENESIS_HASH, entry);
  const h2 = computeEntryHash(GENESIS_HASH, entry);
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
});
