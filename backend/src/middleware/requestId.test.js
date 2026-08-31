// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import requestId, { REQUEST_ID_HEADER } from './requestId.js';

function makeReqRes(headers = {}) {
  const req = { headers };
  const headersOut = {};
  const res = {
    locals: /** @type {Record<string, unknown>} */ ({}),
    setHeader(name, value) {
      headersOut[name] = value;
    },
  };
  return { req, res, headersOut };
}

test('generates a UUID when no X-Request-Id header is present', () => {
  const { req, res, headersOut } = makeReqRes();
  let nextCalled = false;

  requestId(/** @type {any} */ (req), /** @type {any} */ (res), () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.ok(res.locals.requestId, 'res.locals.requestId should be set');
  assert.match(/** @type {string} */ (res.locals.requestId), /^[0-9a-f-]{36}$/);
  assert.equal(headersOut[REQUEST_ID_HEADER], res.locals.requestId);
});

test('forwards an incoming X-Request-Id header instead of generating a new one', () => {
  const { req, res, headersOut } = makeReqRes({ [REQUEST_ID_HEADER]: 'client-supplied-id' });

  requestId(/** @type {any} */ (req), /** @type {any} */ (res), () => {});

  assert.equal(res.locals.requestId, 'client-supplied-id');
  assert.equal(headersOut[REQUEST_ID_HEADER], 'client-supplied-id');
});

test('trims whitespace from an incoming header value', () => {
  const { req, res } = makeReqRes({ [REQUEST_ID_HEADER]: '  padded-id  ' });

  requestId(/** @type {any} */ (req), /** @type {any} */ (res), () => {});

  assert.equal(res.locals.requestId, 'padded-id');
});

test('falls back to a generated UUID when the incoming header is blank', () => {
  const { req, res } = makeReqRes({ [REQUEST_ID_HEADER]: '   ' });

  requestId(/** @type {any} */ (req), /** @type {any} */ (res), () => {});

  assert.match(/** @type {string} */ (res.locals.requestId), /^[0-9a-f-]{36}$/);
});

test('two requests with no incoming header get distinct generated IDs', () => {
  const first = makeReqRes();
  const second = makeReqRes();

  requestId(/** @type {any} */ (first.req), /** @type {any} */ (first.res), () => {});
  requestId(/** @type {any} */ (second.req), /** @type {any} */ (second.res), () => {});

  assert.notEqual(first.res.locals.requestId, second.res.locals.requestId);
});
