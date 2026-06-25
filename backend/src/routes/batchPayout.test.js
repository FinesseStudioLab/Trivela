// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBatchPayoutRouter } from './batchPayout.js';

// ── Lightweight fake req/res ─────────────────────────────────────────────────

function makeReq({ body = {}, params = {} } = {}) {
  return { body, params };
}

function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    status(code) {
      res._status = code;
      return res;
    },
    json(body) {
      res._body = body;
      return res;
    },
  };
  return res;
}

// ── Mock service ─────────────────────────────────────────────────────────────

function makeMockService({
  enqueuedBatchId = 'batch-1',
  enqueueCreated = true,
  enqueueError = null,
  jobData = null,
  executeResult = null,
  executeError = null,
} = {}) {
  return {
    enqueueBatch(params) {
      if (enqueueError) throw enqueueError;
      return { batchId: enqueuedBatchId, created: enqueueCreated };
    },
    getBatch(batchId) {
      return jobData ?? {
        id: batchId,
        status: 'pending',
        totalRecipients: 1,
        succeeded: 0,
        failed: 0,
        currentChunk: 0,
        totalChunks: 1,
        createdAt: new Date().toISOString(),
      };
    },
    async executeBatch(batchId) {
      if (executeError) throw executeError;
      return executeResult ?? { id: batchId, status: 'completed', succeeded: 1, failed: 0 };
    },
  };
}

const noopMiddleware = (_req, _res, next) => next();

function buildRouter(serviceOpts = {}) {
  return createBatchPayoutRouter({
    batchPayoutService: makeMockService(serviceOpts),
    requireMasterKey: noopMiddleware,
    rateLimiter: noopMiddleware,
  });
}

function getHandler(router, method, path) {
  const layer = router.stack.find(
    (l) => l.route?.path === path && l.route?.methods?.[method.toLowerCase()],
  );
  if (!layer) throw new Error(`No ${method} ${path} handler found in router`);
  const handlers = layer.route.stack.map((s) => s.handle);
  return async (req, res) => {
    for (const h of handlers) {
      await h(req, res, () => {});
    }
  };
}

// ── POST /admin/batch-payout ─────────────────────────────────────────────────

test('POST /admin/batch-payout returns 201 when batch is created', async () => {
  const router = buildRouter({ enqueuedBatchId: 'b123', enqueueCreated: true });
  const handle = getHandler(router, 'POST', '/admin/batch-payout');

  const req = makeReq({ body: { from: 'GXXXX', recipients: [{ address: 'GAAA', amount: 100 }] } });
  const res = makeRes();
  await handle(req, res);

  assert.equal(res._status, 201);
  assert.equal(res._body.batchId, 'b123');
  assert.equal(res._body.created, true);
});

test('POST /admin/batch-payout returns 200 when batch already exists', async () => {
  const router = buildRouter({ enqueuedBatchId: 'existing', enqueueCreated: false });
  const handle = getHandler(router, 'POST', '/admin/batch-payout');

  const req = makeReq({ body: { batchId: 'existing', from: 'GXXXX', recipients: [{ address: 'GAAA', amount: 100 }] } });
  const res = makeRes();
  await handle(req, res);

  assert.equal(res._status, 200);
  assert.equal(res._body.created, false);
});

test('POST /admin/batch-payout returns 400 on VALIDATION_ERROR', async () => {
  const router = buildRouter({
    enqueueError: Object.assign(new Error('bad input'), { code: 'VALIDATION_ERROR' }),
  });
  const handle = getHandler(router, 'POST', '/admin/batch-payout');

  const req = makeReq({ body: { from: '', recipients: [] } });
  const res = makeRes();
  await handle(req, res);

  assert.equal(res._status, 400);
  assert.equal(res._body.code, 'VALIDATION_ERROR');
});

// ── POST /admin/batch-payout/:batchId/execute ─────────────────────────────────

test('POST /admin/batch-payout/:batchId/execute returns completed job', async () => {
  const router = buildRouter({
    executeResult: { id: 'b1', status: 'completed', succeeded: 5, failed: 0 },
  });
  const handle = getHandler(router, 'POST', '/admin/batch-payout/:batchId/execute');

  const req = makeReq({ params: { batchId: 'b1' } });
  const res = makeRes();
  await handle(req, res);

  assert.equal(res._status, 200);
  assert.equal(res._body.job.status, 'completed');
});

test('POST /admin/batch-payout/:batchId/execute returns 404 when NOT_FOUND', async () => {
  const router = buildRouter({
    executeError: Object.assign(new Error('not found'), { code: 'NOT_FOUND' }),
  });
  const handle = getHandler(router, 'POST', '/admin/batch-payout/:batchId/execute');

  const req = makeReq({ params: { batchId: 'missing' } });
  const res = makeRes();
  await handle(req, res);

  assert.equal(res._status, 404);
  assert.equal(res._body.code, 'NOT_FOUND');
});

test('POST /admin/batch-payout/:batchId/execute returns 409 on CONFLICT', async () => {
  const router = buildRouter({
    executeError: Object.assign(new Error('already running'), { code: 'CONFLICT' }),
  });
  const handle = getHandler(router, 'POST', '/admin/batch-payout/:batchId/execute');

  const req = makeReq({ params: { batchId: 'b1' } });
  const res = makeRes();
  await handle(req, res);

  assert.equal(res._status, 409);
  assert.equal(res._body.code, 'CONFLICT');
});

// ── GET /admin/batch-payout/:batchId ────────────────────────────────────────

test('GET /admin/batch-payout/:batchId returns job when found', async () => {
  const router = buildRouter({
    jobData: { id: 'b2', status: 'completed', succeeded: 3, failed: 0 },
  });
  const handle = getHandler(router, 'GET', '/admin/batch-payout/:batchId');

  const req = makeReq({ params: { batchId: 'b2' } });
  const res = makeRes();
  await handle(req, res);

  assert.equal(res._status, 200);
  assert.equal(res._body.job.id, 'b2');
});

test('GET /admin/batch-payout/:batchId returns 404 when not found', async () => {
  const router = buildRouter({ jobData: null });
  const router2 = createBatchPayoutRouter({
    batchPayoutService: {
      enqueueBatch: () => {},
      getBatch: () => undefined,
      executeBatch: async () => {},
    },
    requireMasterKey: noopMiddleware,
    rateLimiter: noopMiddleware,
  });
  const handle = getHandler(router2, 'GET', '/admin/batch-payout/:batchId');

  const req = makeReq({ params: { batchId: 'no-such-id' } });
  const res = makeRes();
  await handle(req, res);

  assert.equal(res._status, 404);
  assert.equal(res._body.code, 'NOT_FOUND');
});
