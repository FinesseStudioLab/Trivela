// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { getRequestId, runWithRequestId } from './requestContext.js';

test('getRequestId returns null outside any tracked context', () => {
  assert.equal(getRequestId(), null);
});

test('runWithRequestId makes the ID readable via getRequestId() inside the callback', () => {
  const observed = runWithRequestId('req-123', () => getRequestId());
  assert.equal(observed, 'req-123');
});

test('context does not leak outside the runWithRequestId callback', () => {
  runWithRequestId('req-123', () => {});
  assert.equal(getRequestId(), null);
});

test('runWithRequestId mints a fresh UUID when given a falsy id', () => {
  const id = runWithRequestId(null, () => getRequestId());
  assert.ok(id, 'a fallback ID should have been minted');
  assert.match(id, /^[0-9a-f-]{36}$/);

  const id2 = runWithRequestId(undefined, () => getRequestId());
  assert.ok(id2);
  assert.notEqual(id, id2, 'each fallback mint should be unique');

  const id3 = runWithRequestId('', () => getRequestId());
  assert.ok(id3);
});

test('the context survives async/await chains within the same run() call', async () => {
  const observed = await runWithRequestId('req-async', async () => {
    await delay(1);
    assert.equal(getRequestId(), 'req-async');
    await Promise.resolve();
    return getRequestId();
  });
  assert.equal(observed, 'req-async');
});

test('the context survives a setTimeout scheduled from within run()', async () => {
  const observed = await runWithRequestId(
    'req-timer',
    () =>
      new Promise((resolve) => {
        setTimeout(() => resolve(getRequestId()), 5);
      }),
  );
  assert.equal(observed, 'req-timer');
});

test('nested runWithRequestId calls scope correctly and restore the outer context on return', () => {
  const results = [];
  runWithRequestId('outer', () => {
    results.push(['before-inner', getRequestId()]);
    runWithRequestId('inner', () => {
      results.push(['inside-inner', getRequestId()]);
    });
    results.push(['after-inner', getRequestId()]);
  });

  assert.deepEqual(results, [
    ['before-inner', 'outer'],
    ['inside-inner', 'inner'],
    ['after-inner', 'outer'],
  ]);
});

test('concurrent runWithRequestId calls do not interfere with each other', async () => {
  const [a, b] = await Promise.all([
    runWithRequestId('req-a', async () => {
      await delay(5);
      return getRequestId();
    }),
    runWithRequestId('req-b', async () => {
      await delay(1);
      return getRequestId();
    }),
  ]);
  assert.equal(a, 'req-a');
  assert.equal(b, 'req-b');
});
