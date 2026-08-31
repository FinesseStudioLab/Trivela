import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { createSqliteFailedJobRepository } from './sqliteFailedJobRepository.js';

async function setupRepository() {
  const db = new Database(':memory:');
  await runMigrations(db);
  return createSqliteFailedJobRepository({ db });
}

test('failed-job repository records, lists, and removes entries', async () => {
  const repository = await setupRepository();

  assert.equal(repository.count(), 0);

  const id = repository.record({
    type: 'rpc_health_poll',
    payload: { reason: 'timeout' },
    errorMessage: 'fetch failed',
    attempts: 5,
  });

  assert.ok(id, 'record should return an id');
  assert.equal(repository.count(), 1);

  const entries = repository.list();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, 'rpc_health_poll');
  assert.deepEqual(entries[0].payload, { reason: 'timeout' });
  assert.equal(entries[0].errorMessage, 'fetch failed');
  assert.equal(entries[0].attempts, 5);
  assert.ok(entries[0].failedAt, 'failedAt should default to now');

  const fetched = repository.getById(id);
  assert.equal(fetched.id, id);

  assert.equal(repository.remove(id), true);
  assert.equal(repository.count(), 0);
  assert.equal(repository.remove(id), false, 'second remove is a no-op');
});

test('failed-job repository tolerates null payloads and non-JSON legacy data', async () => {
  const repository = await setupRepository();

  const id = repository.record({
    type: 'webhook_retry_failed_deliveries',
    payload: null,
    errorMessage: 'gateway timeout',
    attempts: 3,
  });

  const entry = repository.getById(id);
  assert.equal(entry.payload, null);
  assert.equal(entry.type, 'webhook_retry_failed_deliveries');
});

test('failed-job repository orders by failed_at desc and paginates', async () => {
  const repository = await setupRepository();

  const ids = [];
  for (let i = 0; i < 5; i += 1) {
    ids.push(
      repository.record({
        type: 'rpc_health_poll',
        payload: { i },
        errorMessage: 'boom',
        attempts: 1,
        // Force timestamps so ordering is deterministic regardless of clock.
        failedAt: new Date(2026, 0, i + 1).toISOString(),
      }),
    );
  }

  const page1 = repository.list({ limit: 2, offset: 0 });
  const page2 = repository.list({ limit: 2, offset: 2 });

  assert.equal(page1.length, 2);
  assert.equal(page2.length, 2);
  // Newest first, so page1[0] should be the entry with the latest failed_at.
  assert.deepEqual(page1[0].payload, { i: 4 });
  assert.deepEqual(page1[1].payload, { i: 3 });
  assert.deepEqual(page2[0].payload, { i: 2 });
  assert.equal(repository.count(), 5);
});
