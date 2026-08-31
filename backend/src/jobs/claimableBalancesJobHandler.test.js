// @ts-check
/**
 * Tests for the #922 durable-queue handler wrapping
 * createClaimableBalancesForCampaign. Run with:
 *   node --test src/jobs/claimableBalancesJobHandler.test.js
 */

import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import Database from 'better-sqlite3';
import { Keypair } from '@stellar/stellar-sdk';
import { runMigrations } from '../db/migrate.js';
import { createSqliteJobQueueRepository } from '../dal/sqliteJobQueueRepository.js';
import { createDurableJobQueue } from './durableJobQueue.js';
import {
  createClaimableBalancesJobHandler,
  CLAIMABLE_BALANCES_JOB_TYPE,
} from './claimableBalancesJobHandler.js';

function silentLog() {
  return { info: () => {}, warn: () => {}, error: () => {} };
}

async function setupDb() {
  const db = new Database(':memory:');
  await runMigrations(db);
  return db;
}

function insertUnclaimedCredit(db, user, amountStroops = '10000000') {
  db.prepare('INSERT INTO credit_events (user, amount) VALUES (?, ?)').run(user, amountStroops);
}

const STELLAR_CONFIG = {
  networkPassphrase: 'Test SDF Network ; September 2015',
  // Unreachable on purpose — deterministically fails fast (ECONNREFUSED)
  // without any real network access, so submission attempts fail reliably.
  horizonUrl: 'http://127.0.0.1:1',
};

describe('createClaimableBalancesJobHandler', () => {
  test('completes without throwing when there are no unclaimed users', async () => {
    const db = await setupDb();
    const handler = createClaimableBalancesJobHandler({
      dal: { db },
      stellarConfig: STELLAR_CONFIG,
      env: {},
      log: silentLog(),
    });

    await assert.doesNotReject(() =>
      handler({
        jobId: 'job-1',
        campaignId: 'camp-1',
        campaignEndDate: new Date().toISOString(),
      }),
    );
  });

  test('skips without throwing when OPERATOR_SECRET_KEY is not configured', async () => {
    const db = await setupDb();
    insertUnclaimedCredit(db, 'GUSER1111111111111111111111111111111111111111111111111111');

    const handler = createClaimableBalancesJobHandler({
      dal: { db },
      stellarConfig: STELLAR_CONFIG,
      env: {},
      log: silentLog(),
    });

    await assert.doesNotReject(() =>
      handler({
        jobId: 'job-2',
        campaignId: 'camp-2',
        campaignEndDate: new Date().toISOString(),
      }),
    );

    const row = db
      .prepare('SELECT status FROM claimable_balances WHERE campaign_id = ?')
      .get('camp-2');
    assert.equal(row.status, 'pending', 'row left pending when no operator key is configured');
  });

  test('throws when a submission actually fails, so the durable queue retries', async () => {
    const db = await setupDb();
    insertUnclaimedCredit(db, 'GUSER2222222222222222222222222222222222222222222222222222');
    const operatorSecretKey = Keypair.random().secret();

    const handler = createClaimableBalancesJobHandler({
      dal: { db },
      stellarConfig: STELLAR_CONFIG,
      env: { OPERATOR_SECRET_KEY: operatorSecretKey },
      log: silentLog(),
    });

    await assert.rejects(() =>
      handler({
        jobId: 'job-3',
        campaignId: 'camp-3',
        campaignEndDate: new Date().toISOString(),
      }),
    );

    const row = db
      .prepare('SELECT status FROM claimable_balances WHERE campaign_id = ?')
      .get('camp-3');
    assert.equal(row.status, 'failed');
  });
});

function tick(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inMemoryDeadLetter() {
  const entries = [];
  return { entries, record: (e) => entries.push(e) };
}

describe('claimable-balances job wired into a real durableJobQueue', () => {
  test('a consistently failing submission is retried with backoff and lands in the DLQ', async () => {
    const db = await setupDb();
    insertUnclaimedCredit(db, 'GUSER3333333333333333333333333333333333333333333333333333');
    const operatorSecretKey = Keypair.random().secret();

    const handler = createClaimableBalancesJobHandler({
      dal: { db },
      stellarConfig: STELLAR_CONFIG,
      env: { OPERATOR_SECRET_KEY: operatorSecretKey },
      log: silentLog(),
    });

    const store = createSqliteJobQueueRepository({ db });
    const deadLetter = inMemoryDeadLetter();
    const queue = createDurableJobQueue({
      store,
      handlers: { [CLAIMABLE_BALANCES_JOB_TYPE]: handler },
      logger: silentLog(),
      deadLetter,
      pollIntervalMs: 10,
    });

    queue.start();
    queue.enqueue(
      CLAIMABLE_BALANCES_JOB_TYPE,
      {
        jobId: 'job-4',
        campaignId: 'camp-4',
        campaignEndDate: new Date().toISOString(),
      },
      { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 },
    );

    const deadline = Date.now() + 3_000;
    while (deadLetter.entries.length === 0 && Date.now() < deadline) await tick();
    queue.stop();

    assert.equal(deadLetter.entries.length, 1, 'job is dead-lettered after exhausting retries');
    assert.equal(deadLetter.entries[0].type, CLAIMABLE_BALANCES_JOB_TYPE);
    assert.equal(store.countDead(), 1);

    const rows = db
      .prepare("SELECT status FROM claimable_balances WHERE campaign_id = 'camp-4'")
      .all();
    assert.ok(rows.length >= 1, 'at least one submission attempt was recorded');
    assert.ok(
      rows.every((r) => r.status === 'failed'),
      'every attempted row reflects the failed submission',
    );
  });
});
