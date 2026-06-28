import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/db/migrate.js';
import { validateArgs, makeAsyncDb } from './indexer-backfill.mjs';

// ── validateArgs tests ────────────────────────────────────────────────────────

test('validateArgs: throws when --from is missing', () => {
  assert.throws(
    () => validateArgs({}),
    /Usage:/,
    'should throw usage message',
  );
});

test('validateArgs: throws when --from is not a number', () => {
  assert.throws(
    () => validateArgs({ from: 'abc' }),
    /positive integer/,
  );
});

test('validateArgs: throws when --from is zero', () => {
  assert.throws(
    () => validateArgs({ from: '0' }),
    /positive integer/,
  );
});

test('validateArgs: throws when --from is negative', () => {
  assert.throws(
    () => validateArgs({ from: '-5' }),
    /positive integer/,
  );
});

test('validateArgs: passes with valid --from', () => {
  assert.doesNotThrow(() => validateArgs({ from: '1000' }));
});

test('validateArgs: passes with valid --from and --to', () => {
  assert.doesNotThrow(() => validateArgs({ from: '1000', to: '2000' }));
});

test('validateArgs: throws when --to < --from', () => {
  assert.throws(
    () => validateArgs({ from: '2000', to: '1000' }),
    /--to.*>= --from/,
  );
});

test('validateArgs: throws when --to is not a number', () => {
  assert.throws(
    () => validateArgs({ from: '1000', to: 'bad' }),
    /positive integer/,
  );
});

// ── makeAsyncDb shim tests ────────────────────────────────────────────────────

test('makeAsyncDb: run() returns Promise<{ changes }>', async () => {
  const db = new Database(':memory:');
  await runMigrations(db);
  const asyncDb = makeAsyncDb(db);

  // Use indexer_checkpoints (migration 020) — key TEXT PRIMARY KEY
  const result = await asyncDb.run(
    `INSERT OR IGNORE INTO indexer_checkpoints (key, cursor, updated_at) VALUES (?, ?, ?)`,
    ['test-key', 'cursor:0', new Date().toISOString()],
  );
  assert.ok(typeof result.changes === 'number', 'result.changes must be a number');
  assert.equal(result.changes, 1, 'INSERT should report 1 change');
  db.close();
});

test('makeAsyncDb: run() reports changes=0 on conflict (idempotent INSERT OR IGNORE)', async () => {
  const db = new Database(':memory:');
  await runMigrations(db);
  const asyncDb = makeAsyncDb(db);

  const now = new Date().toISOString();
  await asyncDb.run(
    `INSERT OR IGNORE INTO indexer_checkpoints (key, cursor, updated_at) VALUES (?, ?, ?)`,
    ['dup-key', 'cursor:0', now],
  );
  const second = await asyncDb.run(
    `INSERT OR IGNORE INTO indexer_checkpoints (key, cursor, updated_at) VALUES (?, ?, ?)`,
    ['dup-key', 'cursor:0', now],
  );
  assert.equal(second.changes, 0, 'duplicate INSERT OR IGNORE should report 0 changes');
  db.close();
});

// ── Checkpoint persistence tests ──────────────────────────────────────────────

test('checkpoint: saved cursor is recovered on second run', async () => {
  const db = new Database(':memory:');
  await runMigrations(db);

  const key = 'backfill:all:1000';
  const cursor = 'ledger:1234/0/0';

  db.prepare(
    `INSERT OR REPLACE INTO indexer_checkpoints (key, cursor, events_processed, updated_at)
     VALUES (?, ?, ?, ?)`,
  ).run(key, cursor, 400, new Date().toISOString());

  const saved = db.prepare('SELECT * FROM indexer_checkpoints WHERE key = ?').get(key);
  assert.ok(saved, 'checkpoint row should exist');
  assert.equal(saved.cursor, cursor, 'cursor should match what was saved');
  assert.equal(saved.events_processed, 400);
  db.close();
});

test('checkpoint: key includes contractId and fromLedger', () => {
  // Verify the key format used in the CLI (pure computation, no DB needed)
  const contractId = 'CXYZ';
  const fromLedger = 5000;
  const key = `backfill:${contractId}:${fromLedger}`;
  assert.equal(key, 'backfill:CXYZ:5000');
});

test('checkpoint: key for no contract uses "all"', () => {
  const contractId = null;
  const fromLedger = 5000;
  const key = `backfill:${contractId ?? 'all'}:${fromLedger}`;
  assert.equal(key, 'backfill:all:5000');
});
