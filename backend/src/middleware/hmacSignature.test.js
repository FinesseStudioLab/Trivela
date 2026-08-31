// @ts-check
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { createHmac } from 'node:crypto';
import {
  createHmacSignatureMiddleware,
  nonceStore,
  TIMESTAMP_HEADER,
  NONCE_HEADER,
  SIGNATURE_HEADER,
} from './hmacSignature.js';

const SECRET = 'test-secret-must-be-long-enough-for-hmac';

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function buildSignature(ts, nonce, body, secret = SECRET) {
  const rawBodyHex = Buffer.from(body ?? '').toString('hex');
  const material = `${ts}.${nonce}.${rawBodyHex}`;
  const hex = createHmac('sha256', secret).update(material).digest('hex');
  return `hmac-sha256=${hex}`;
}

function makeReq({ ts, nonce, sig, body, rawBody } = {}) {
  const timestamp = ts ?? String(nowSeconds());
  const n = nonce ?? `nonce-${Math.random()}`;
  const bodyBuf = Buffer.from(body ?? '{"hello":"world"}');
  const signature = sig ?? buildSignature(timestamp, n, bodyBuf, SECRET);

  return {
    headers: {
      [TIMESTAMP_HEADER]: timestamp,
      [NONCE_HEADER]: n,
      [SIGNATURE_HEADER]: signature,
    },
    rawBody: rawBody !== undefined ? rawBody : bodyBuf,
    body: {},
  };
}

function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
  };
  return res;
}

function runMiddleware(req, opts = {}) {
  return new Promise((resolve, reject) => {
    const res = makeRes();
    const middleware = createHmacSignatureMiddleware({ secret: SECRET, ...opts });
    middleware(req, res, (err) => {
      if (err) reject(err);
      else resolve({ passed: true, res });
    });
    // If middleware called res.status(...).json(...) without next(), resolve with failed
    if (res._status !== 200) {
      resolve({ passed: false, res });
    }
  });
}

describe('hmacSignature middleware', () => {
  beforeEach(() => {
    nonceStore.clear();
  });

  it('passes a request with a valid signature', async () => {
    const req = makeReq();
    const { passed } = await runMiddleware(req);
    assert.equal(passed, true);
  });

  it('rejects a request with a stale timestamp (> 5 min old)', async () => {
    const staleTs = String(nowSeconds() - 6 * 60);
    const nonce = `stale-${Math.random()}`;
    const body = Buffer.from('{}');
    const sig = buildSignature(staleTs, nonce, body);
    const req = makeReq({ ts: staleTs, nonce, sig, rawBody: body });
    const { passed, res } = await runMiddleware(req);
    assert.equal(passed, false);
    assert.equal(res._status, 401);
    assert.match(res._body.error, /timestamp/i);
  });

  it('rejects a request with a future timestamp (> 5 min ahead)', async () => {
    const futureTs = String(nowSeconds() + 6 * 60);
    const nonce = `future-${Math.random()}`;
    const body = Buffer.from('{}');
    const sig = buildSignature(futureTs, nonce, body);
    const req = makeReq({ ts: futureTs, nonce, sig, rawBody: body });
    const { passed, res } = await runMiddleware(req);
    assert.equal(passed, false);
    assert.equal(res._status, 401);
    assert.match(res._body.error, /timestamp/i);
  });

  it('rejects a replayed nonce (same nonce used twice)', async () => {
    const nonce = `replay-${Math.random()}`;
    const req1 = makeReq({ nonce });
    const req2 = makeReq({ nonce });

    const { passed: first } = await runMiddleware(req1);
    assert.equal(first, true);

    const { passed: second, res } = await runMiddleware(req2);
    assert.equal(second, false);
    assert.equal(res._status, 401);
    assert.match(res._body.error, /replay/i);
  });

  it('rejects a request with a wrong signature', async () => {
    const req = makeReq({ sig: 'hmac-sha256=deadbeef' });
    const { passed, res } = await runMiddleware(req);
    assert.equal(passed, false);
    assert.equal(res._status, 401);
    assert.match(res._body.error, /signature/i);
  });

  it('rejects when signature header is missing', async () => {
    const req = makeReq();
    delete req.headers[SIGNATURE_HEADER];
    const { passed, res } = await runMiddleware(req);
    assert.equal(passed, false);
    assert.equal(res._status, 401);
    assert.match(res._body.error, /Missing/i);
  });

  it('rejects when timestamp header is missing', async () => {
    const req = makeReq();
    delete req.headers[TIMESTAMP_HEADER];
    const { passed, res } = await runMiddleware(req);
    assert.equal(passed, false);
    assert.equal(res._status, 401);
  });

  it('rejects when nonce header is missing', async () => {
    const req = makeReq();
    delete req.headers[NONCE_HEADER];
    const { passed, res } = await runMiddleware(req);
    assert.equal(passed, false);
    assert.equal(res._status, 401);
  });

  it('allows two requests with different nonces and valid signatures', async () => {
    const req1 = makeReq({ nonce: 'nonce-alpha' });
    const req2 = makeReq({ nonce: 'nonce-beta' });
    const { passed: p1 } = await runMiddleware(req1);
    const { passed: p2 } = await runMiddleware(req2);
    assert.equal(p1, true);
    assert.equal(p2, true);
  });

  it('returns 500 when no HMAC secret is configured', async () => {
    const req = makeReq();
    const middleware = createHmacSignatureMiddleware({ secret: '' });
    const res = makeRes();
    await new Promise((resolve) => middleware(req, res, resolve));
    assert.equal(res._status, 500);
    assert.match(res._body.error, /not configured/i);
  });
});
