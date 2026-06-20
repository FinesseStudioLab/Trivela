import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { createSqliteApiKeyRepository } from './sqliteApiKeyRepository.js';

async function setupRepository() {
  const db = new Database(':memory:');
  await runMigrations(db);
  return createSqliteApiKeyRepository({ db });
}

test('api key repository creates, validates, and revokes keys', async () => {
  const repository = await setupRepository();

  const created = repository.create({ label: 'ops-key' });
  assert.ok(created.rawKey.startsWith('tk_'));
  assert.equal(created.key.label, 'ops-key');
  assert.equal(created.key.active, true);

  const match = repository.validate(created.rawKey);
  assert.ok(match);
  assert.equal(match.id, created.key.id);

  repository.revoke(created.key.id);
  assert.equal(repository.validate(created.rawKey), null);
});

test('api key repository rejects expired keys', async () => {
  const repository = await setupRepository();
  const expiredAt = new Date(Date.now() - 60_000).toISOString();
  const created = repository.create({ label: 'expired', expiresAt: expiredAt });

  assert.equal(repository.validate(created.rawKey), null);
});

test('api key repository rotates keys', async () => {
  const repository = await setupRepository();
  const created = repository.create({ label: 'rotate-me' });

  const rotated = repository.rotate(created.key.id);
  assert.ok(rotated);
  assert.notEqual(rotated.rawKey, created.rawKey);
  assert.equal(repository.validate(created.rawKey), null);
  assert.ok(repository.validate(rotated.rawKey));
});

test('api key repository updates last_used_at on touch', async () => {
  const repository = await setupRepository();
  const created = repository.create({ label: 'usage' });

  repository.touchLastUsed(created.key.id);
  const listed = repository.list();
  assert.ok(listed[0].lastUsedAt);
});
