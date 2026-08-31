// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { requestContextMiddleware } from './requestContext.js';
import { getRequestId } from '../lib/requestContext.js';

test('requestContextMiddleware makes res.locals.requestId readable via getRequestId() downstream', () => {
  const res = { locals: { requestId: 'req_xyz' } };
  let observed;

  requestContextMiddleware(/** @type {any} */ ({}), /** @type {any} */ (res), () => {
    observed = getRequestId();
  });

  assert.equal(observed, 'req_xyz');
  assert.equal(getRequestId(), null, 'context must not leak past the middleware call');
});

test('requestContextMiddleware calls next() synchronously exactly once', () => {
  const res = { locals: { requestId: 'req_1' } };
  let calls = 0;

  requestContextMiddleware(/** @type {any} */ ({}), /** @type {any} */ (res), () => {
    calls += 1;
  });

  assert.equal(calls, 1);
});

test('requestContextMiddleware propagates the ID through an async downstream handler', async () => {
  const res = { locals: { requestId: 'req_async' } };
  const seen = [];

  await new Promise((resolve) => {
    requestContextMiddleware(/** @type {any} */ ({}), /** @type {any} */ (res), async () => {
      seen.push(getRequestId());
      await Promise.resolve();
      seen.push(getRequestId());
      resolve(undefined);
    });
  });

  assert.deepEqual(seen, ['req_async', 'req_async']);
});
