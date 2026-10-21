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

// ── Rate tiers (#924) ────────────────────────────────────────────────────────

test('api key repository defaults new keys to the standard rate tier', async () => {
  const repository = await setupRepository();
  const created = repository.create({ label: 'default-tier' });

  assert.equal(created.key.rateTier, 'standard');
  assert.equal(repository.getById(created.key.id).rateTier, 'standard');
  assert.equal(repository.validate(created.rawKey).rateTier, 'standard');
});

test('api key repository accepts an explicit rate tier at creation', async () => {
  const repository = await setupRepository();
  const created = repository.create({ label: 'pro-tier', rateTier: 'pro' });

  assert.equal(created.key.rateTier, 'pro');
  assert.equal(repository.list()[0].rateTier, 'pro');
  assert.equal(repository.validate(created.rawKey).rateTier, 'pro');
});

test('api key repository setRateTier updates an existing key in place', async () => {
  const repository = await setupRepository();
  const created = repository.create({ label: 'upgrade-me' });
  assert.equal(created.key.rateTier, 'standard');

  const updated = repository.setRateTier(created.key.id, 'enterprise');
  assert.equal(updated.rateTier, 'enterprise');
  assert.equal(repository.getById(created.key.id).rateTier, 'enterprise');
  // The raw key keeps working — this is not a rotation.
  assert.ok(repository.validate(created.rawKey));
});

test('api key repository setRateTier returns null for an unknown id', async () => {
  const repository = await setupRepository();
  assert.equal(repository.setRateTier('does-not-exist', 'pro'), null);
});

test('api key repository rotate inherits the original rate tier', async () => {
  const repository = await setupRepository();
  const created = repository.create({ label: 'rotate-tier', rateTier: 'pro' });

  const rotated = repository.rotate(created.key.id);
  assert.equal(rotated.key.rateTier, 'pro');
});

// ── Monthly usage tracking (#759) ────────────────────────────────────────────

test('api key repository getMonthlyUsage starts at 0 for a fresh key', async () => {
  const repository = await setupRepository();
  const created = repository.create({ label: 'usage-fresh' });
  assert.equal(repository.getMonthlyUsage(created.key.id), 0);
});

test('api key repository incrementMonthlyUsage increments and returns the running total', async () => {
  const repository = await setupRepository();
  const created = repository.create({ label: 'usage-inc' });

  assert.equal(repository.incrementMonthlyUsage(created.key.id), 1);
  assert.equal(repository.incrementMonthlyUsage(created.key.id), 2);
  assert.equal(repository.incrementMonthlyUsage(created.key.id), 3);
  assert.equal(repository.getMonthlyUsage(created.key.id), 3);
});

test('api key repository tracks usage independently per key', async () => {
  const repository = await setupRepository();
  const keyA = repository.create({ label: 'usage-a' });
  const keyB = repository.create({ label: 'usage-b' });

  repository.incrementMonthlyUsage(keyA.key.id);
  repository.incrementMonthlyUsage(keyA.key.id);
  repository.incrementMonthlyUsage(keyB.key.id);

  assert.equal(repository.getMonthlyUsage(keyA.key.id), 2);
  assert.equal(repository.getMonthlyUsage(keyB.key.id), 1);
});

test('api key repository tracks usage independently per calendar month (UTC)', async () => {
  const repository = await setupRepository();
  const created = repository.create({ label: 'usage-monthly' });

  const january = new Date(Date.UTC(2026, 0, 15));
  const february = new Date(Date.UTC(2026, 1, 1));

  repository.incrementMonthlyUsage(created.key.id, january);
  repository.incrementMonthlyUsage(created.key.id, january);
  assert.equal(repository.getMonthlyUsage(created.key.id, january), 2);

  // A new UTC month starts its own bucket at 0, not carrying January's count.
  assert.equal(repository.getMonthlyUsage(created.key.id, february), 0);
  repository.incrementMonthlyUsage(created.key.id, february);
  assert.equal(repository.getMonthlyUsage(created.key.id, february), 1);
  // January's count is untouched by February's activity.
  assert.equal(repository.getMonthlyUsage(created.key.id, january), 2);
});
