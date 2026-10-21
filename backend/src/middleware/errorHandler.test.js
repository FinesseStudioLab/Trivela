import assert from 'node:assert/strict';
import test from 'node:test';
import errorHandler from './errorHandler.js';

function makeRes({ headersSent = false } = {}) {
  return {
    headersSent,
    locals: { requestId: 'req-1' },
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('maps a pool saturation error to a typed 503', () => {
  const res = makeRes();
  errorHandler(Object.assign(new Error('no slot'), { code: 'POOL_SATURATED' }), {}, res, () => {});
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    error: 'Service temporarily unavailable',
    code: 'POOL_SATURATED',
  });
});

test('does not write a second response once headers were sent', () => {
  const res = makeRes({ headersSent: true });
  errorHandler(Object.assign(new Error('x'), { code: 'POOL_SATURATED' }), {}, res, () => {});
  assert.equal(res.statusCode, null);
  assert.equal(res.body, null);
});

test('uses the error statusCode and a JSON body with a stable code', () => {
  const res = makeRes();
  errorHandler(Object.assign(new Error('bad input'), { statusCode: 422 }), {}, res, () => {});
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.code, 'INTERNAL_SERVER_ERROR');
  assert.equal(res.body.error, 'bad input');
});

test('defaults to 500 for errors without a status code', () => {
  const res = makeRes();
  errorHandler(new Error('boom'), {}, res, () => {});
  assert.equal(res.statusCode, 500);
});

test('includes the stack outside production only', () => {
  const res = makeRes();
  errorHandler(new Error('boom'), {}, res, () => {});
  assert.equal(typeof res.body.stack, 'string');
});

test('handles non-Error values without throwing', () => {
  for (const thrown of ['a string', { statusCode: 400, secret: 'x' }, null, undefined, 42]) {
    const res = makeRes();
    errorHandler(thrown, {}, res, () => {});
    assert.ok(res.statusCode >= 400, `status for ${String(thrown)}`);
    assert.equal(res.body.code, 'INTERNAL_SERVER_ERROR');
    assert.equal('stack' in res.body, false);
  }
  const res = makeRes();
  errorHandler({ statusCode: 400 }, {}, res, () => {});
  assert.equal(res.statusCode, 400);
});
