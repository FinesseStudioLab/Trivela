import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import { createSqliteJobQueueRepository } from '../dal/sqliteJobQueueRepository.js';
import { createDurableJobQueue } from './durableJobQueue.js';
import { getRequestId, runWithRequestId } from '../lib/requestContext.js';

function silentLogger() {
  return { info: () => {}, warn: () => {}, error: () => {} };
}

function inMemoryDeadLetter() {
  const entries = [];
  return {
    entries,
    record(e) {
      entries.push(e);
    },
  };
}

function tick(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setup(handlerOverrides = {}, deadLetter = null) {
  const db = new Database(':memory:');
  await runMigrations(db);
  const store = createSqliteJobQueueRepository({ db });
  const queue = createDurableJobQueue({
    store,
    handlers: handlerOverrides,
    logger: silentLogger(),
    deadLetter,
    visibilityTimeoutMs: 60_000,
    pollIntervalMs: 10,
  });
  return { db, store, queue };
}

test('durableJobQueue: successful job is acked and not dead-lettered', async () => {
  const dl = inMemoryDeadLetter();
  let ran = 0;
  const { queue, store } = await setup(
    {
      task: async () => {
        ran += 1;
      },
    },
    dl,
  );
  queue.start();
  queue.enqueue('task', { x: 1 }, { maxAttempts: 3 });

  const deadline = Date.now() + 1_000;
  while (ran === 0 && Date.now() < deadline) await tick(20);
  queue.stop();

  assert.equal(ran, 1, 'handler should run once');
  assert.equal(dl.entries.length, 0, 'no dead-letter on success');
  assert.equal(store.countDead(), 0, 'no dead entry in store');
});

test('durableJobQueue: retry exhaustion lands job in DLQ', async () => {
  const dl = inMemoryDeadLetter();
  let attempts = 0;
  const { queue, store } = await setup(
    {
      boom: async () => {
        attempts += 1;
        throw new Error('fail');
      },
    },
    dl,
  );
  queue.start();
  queue.enqueue('boom', null, { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 5 });

  const deadline = Date.now() + 2_000;
  while (dl.entries.length === 0 && Date.now() < deadline) await tick(20);
  queue.stop();

  assert.equal(attempts, 2, 'handler runs maxAttempts times');
  assert.equal(dl.entries.length, 1, 'dead-lettered after exhaustion');
  assert.equal(dl.entries[0].type, 'boom');
  assert.equal(store.countDead(), 1, 'store marks job as dead');
});

test('durableJobQueue: handler succeeds on 2nd attempt — no dead-letter', async () => {
  const dl = inMemoryDeadLetter();
  let attempts = 0;
  const { queue, store } = await setup(
    {
      flaky: async () => {
        attempts += 1;
        if (attempts < 2) throw new Error('transient');
      },
    },
    dl,
  );
  queue.start();
  queue.enqueue('flaky', null, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 });

  const deadline = Date.now() + 2_000;
  while (attempts < 2 && Date.now() < deadline) await tick(20);
  await tick(30); // let it settle
  queue.stop();

  assert.equal(attempts, 2);
  assert.equal(dl.entries.length, 0, 'no dead-letter on eventual success');
  assert.equal(store.countDead(), 0);
});

test('durableJobQueue: stale recovery resets running jobs', async () => {
  const { db, store, queue } = await setup({});
  // Manually insert a job that appears to be stuck running with an expired visible_at
  db.prepare(
    `
    INSERT INTO job_queue (id, type, payload, status, attempts, max_attempts,
      base_delay_ms, max_delay_ms, run_at, visible_at, enqueued_at)
    VALUES ('stuck-1', 'noop', NULL, 'running', 1, 5, 1000, 30000,
      datetime('now', '-10 seconds'),
      datetime('now', '-5 seconds'),
      datetime('now', '-10 seconds'))
  `,
  ).run();

  // recoverStale with 0ms timeout should recover all running jobs immediately
  const recovered = store.recoverStale(0);
  assert.equal(recovered, 1, 'stale job should be recovered');

  const job = store.getById('stuck-1');
  assert.equal(job?.status, 'pending', 'recovered job is pending');
  queue.stop();
});

test('durableJobQueue: unknown handler type drops the job cleanly', async () => {
  const dl = inMemoryDeadLetter();
  let dropped = false;
  const { queue, store } = await setup({}, dl);
  // Override logger to detect the drop
  queue.start();
  store.enqueue({
    type: 'unknown_type',
    payload: null,
    runAt: new Date().toISOString(),
    enqueuedAt: new Date().toISOString(),
  });

  await tick(100);
  queue.stop();

  // Job should be acked (deleted), not dead
  assert.equal(store.countDead(), 0, 'unknown handler should not dead-letter');
  assert.equal(dl.entries.length, 0, 'no dead-letter entry for unknown handler');
});

test('durableJobQueue: listDead and countDead pagination', async () => {
  const { store, queue } = await setup({});
  const now = new Date().toISOString();
  // Insert 3 dead jobs directly
  for (let i = 0; i < 3; i++) {
    store.enqueue({ type: 'job', payload: null, runAt: now, enqueuedAt: now, maxAttempts: 1 });
  }
  const all = store.listDead({ limit: 100 });
  // They are pending at this point; mark them dead via nack
  const pending = store.claimNext(1000);
  if (pending) store.nack(pending.id, { isDead: true, errorMessage: 'test' });
  const pending2 = store.claimNext(1000);
  if (pending2) store.nack(pending2.id, { isDead: true, errorMessage: 'test' });
  const pending3 = store.claimNext(1000);
  if (pending3) store.nack(pending3.id, { isDead: true, errorMessage: 'test' });

  assert.equal(store.countDead(), 3);
  const page1 = store.listDead({ limit: 2, offset: 0 });
  assert.equal(page1.length, 2);
  const page2 = store.listDead({ limit: 2, offset: 2 });
  assert.equal(page2.length, 1);
  queue.stop();
});

test('durableJobQueue: getStatus reports pending/running/dead depth (#930)', async () => {
  const { store, queue } = await setup({});
  const now = new Date().toISOString();

  assert.deepEqual(queue.getStatus(), { pending: 0, running: 0, dead: 0 });

  store.enqueue({ type: 'job', payload: null, runAt: now, enqueuedAt: now, maxAttempts: 1 });
  store.enqueue({ type: 'job', payload: null, runAt: now, enqueuedAt: now, maxAttempts: 1 });
  assert.deepEqual(queue.getStatus(), { pending: 2, running: 0, dead: 0 });

  const claimed = store.claimNext(60_000);
  assert.deepEqual(queue.getStatus(), { pending: 1, running: 1, dead: 0 });

  store.nack(claimed.id, { isDead: true, errorMessage: 'boom' });
  assert.deepEqual(queue.getStatus(), { pending: 1, running: 0, dead: 1 });

  queue.stop();
});

test('durableJobQueue: removeById deletes a job', async () => {
  const { store, queue } = await setup({});
  const now = new Date().toISOString();
  const id = store.enqueue({ type: 'x', payload: null, runAt: now, enqueuedAt: now });
  assert.ok(store.getById(id), 'job should exist before removal');
  const removed = store.removeById(id);
  assert.ok(removed, 'removeById should return true');
  assert.equal(store.getById(id), null, 'job should not exist after removal');
  queue.stop();
});

// ── Correlation ID propagation (#925) ───────────────────────────────────────

test('sqliteJobQueueRepository: requestId round-trips through enqueue/getById/claimNext', async () => {
  const { store, queue } = await setup({});
  const now = new Date().toISOString();
  const id = store.enqueue({
    type: 'x',
    payload: null,
    runAt: now,
    enqueuedAt: now,
    requestId: 'req-persisted',
  });

  assert.equal(store.getById(id)?.requestId, 'req-persisted');

  const claimed = store.claimNext(60_000);
  assert.equal(claimed?.id, id);
  assert.equal(claimed?.requestId, 'req-persisted');

  queue.stop();
});

test('sqliteJobQueueRepository: requestId is null when not provided at enqueue', async () => {
  const { store, queue } = await setup({});
  const now = new Date().toISOString();
  const id = store.enqueue({ type: 'x', payload: null, runAt: now, enqueuedAt: now });

  assert.equal(store.getById(id)?.requestId, null);
  queue.stop();
});

test('durableJobQueue: a job enqueued from within a request context runs with that same requestId', async () => {
  let observed;
  const { queue } = await setup({
    correlated: async () => {
      observed = getRequestId();
    },
  });
  queue.start();

  runWithRequestId('req-durable', () => {
    queue.enqueue('correlated', null, { maxAttempts: 1 });
  });

  const deadline = Date.now() + 1_000;
  while (observed === undefined && Date.now() < deadline) await tick(20);
  queue.stop();

  assert.equal(observed, 'req-durable');
});

test('durableJobQueue: a job enqueued outside any request context still gets a correlation ID at run time', async () => {
  let observed;
  const { queue } = await setup({
    uncorrelated: async () => {
      observed = getRequestId();
    },
  });
  queue.start();
  queue.enqueue('uncorrelated', null, { maxAttempts: 1 });

  const deadline = Date.now() + 1_000;
  while (observed === undefined && Date.now() < deadline) await tick(20);
  queue.stop();

  assert.ok(observed, 'a fallback correlation ID should have been minted for the job run');
  assert.match(observed, /^[0-9a-f-]{36}$/);
});

test('durableJobQueue: correlation ID is preserved across a retry', async () => {
  const seen = [];
  const { queue } = await setup({
    flaky: async () => {
      seen.push(getRequestId());
      if (seen.length < 2) throw new Error('transient');
    },
  });
  queue.start();

  runWithRequestId('req-durable-retry', () => {
    queue.enqueue('flaky', null, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 });
  });

  const deadline = Date.now() + 2_000;
  while (seen.length < 2 && Date.now() < deadline) await tick(20);
  queue.stop();

  assert.equal(seen.length, 2);
  assert.equal(seen[0], 'req-durable-retry');
  assert.equal(seen[1], 'req-durable-retry');
});

test('durableJobQueue: correlation ID survives a simulated process restart (persisted on the row)', async () => {
  const { db, store } = await setup({});
  const now = new Date().toISOString();
  store.enqueue({
    type: 'restart-test',
    payload: null,
    runAt: now,
    enqueuedAt: now,
    requestId: 'req-before-restart',
  });

  // Simulate a fresh process: new queue instance over the same DB, with the
  // handler registered only now (as if the app had just booted).
  let observed;
  const restartedQueue = createDurableJobQueue({
    store: createSqliteJobQueueRepository({ db }),
    handlers: {
      'restart-test': async () => {
        observed = getRequestId();
      },
    },
    logger: silentLogger(),
    pollIntervalMs: 10,
  });
  restartedQueue.start();

  const deadline = Date.now() + 1_000;
  while (observed === undefined && Date.now() < deadline) await tick(20);
  restartedQueue.stop();

  assert.equal(observed, 'req-before-restart');
});
