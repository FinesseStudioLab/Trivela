import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyntheticBot, resolveConfig } from './syntheticBot.js';

const silent = { warn() {}, error() {} };
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

function makeFetch(routes) {
  const calls = [];
  const fn = async (url, opts) => {
    const path = url.replace('http://x', '');
    calls.push({ path, opts });
    const handler = routes[path];
    if (!handler) return json({}, 404);
    return typeof handler === 'function' ? handler() : handler;
  };
  fn.calls = calls;
  return fn;
}

const happy = {
  '/health': json({ status: 'ok' }),
  '/api/v1/campaigns': json([{ id: 'c1' }]),
  '/api/v1/campaigns/c1': json({ id: 'c1' }),
  '/api/v1/campaigns/c1/stats': json({ participants: 1 }),
};

test('successful cycle walks the full journey', async () => {
  const fetchImpl = makeFetch(happy);
  const bot = createSyntheticBot({ baseUrl: 'http://x', apiKey: 'k', fetchImpl, logger: silent });
  const r = await bot.runCycle();
  assert.equal(r.ok, true);
  assert.deepEqual(r.results.map((s) => s.name), ['health', 'list-campaigns', 'get-campaign', 'campaign-stats']);
  assert.equal(fetchImpl.calls[0].opts.headers['x-api-key'], 'k');
  assert.equal(bot.getStatus().healthy, true);
});

test('accepts { data: [] } list shape and handles empty list', async () => {
  const fetchImpl = makeFetch({ ...happy, '/api/v1/campaigns': json({ data: [] }) });
  const bot = createSyntheticBot({ baseUrl: 'http://x', fetchImpl, logger: silent });
  const r = await bot.runCycle();
  assert.equal(r.ok, true);
  assert.equal(r.results.length, 2);
});

test('failures are recorded and flip health after threshold', async () => {
  const fetchImpl = makeFetch({ ...happy, '/health': json({}, 503) });
  const bot = createSyntheticBot({ baseUrl: 'http://x', fetchImpl, failureThreshold: 2, logger: silent });
  await bot.runCycle();
  assert.equal(bot.getStatus().healthy, true);
  await bot.runCycle();
  const s = bot.getStatus();
  assert.equal(s.healthy, false);
  assert.equal(s.failedCycles, 2);
  assert.match(s.lastError, /503/);
  assert.equal(s.steps.health.failed, 2);
});

test('recovers after a successful cycle', async () => {
  let fail = true;
  const fetchImpl = makeFetch({ ...happy, '/health': () => (fail ? json({}, 500) : json({})) });
  const bot = createSyntheticBot({ baseUrl: 'http://x', fetchImpl, failureThreshold: 1, logger: silent });
  await bot.runCycle();
  assert.equal(bot.getStatus().healthy, false);
  fail = false;
  await bot.runCycle();
  assert.equal(bot.getStatus().healthy, true);
});

test('network errors and bad shapes do not throw', async () => {
  const bot = createSyntheticBot({
    baseUrl: 'http://x',
    fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
    logger: silent,
  });
  const r = await bot.runCycle();
  assert.equal(r.ok, false);
  const bad = createSyntheticBot({
    baseUrl: 'http://x',
    fetchImpl: makeFetch({ ...happy, '/api/v1/campaigns': json({ nope: 1 }) }),
    logger: silent,
  });
  assert.equal((await bad.runCycle()).ok, false);
});

test('request timeout aborts hung requests', async () => {
  const fetchImpl = (_u, { signal }) =>
    new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const bot = createSyntheticBot({ baseUrl: 'http://x', fetchImpl, timeoutMs: 10, logger: silent });
  const r = await bot.runCycle();
  assert.equal(r.ok, false);
  assert.match(r.results[0].error, /aborted/);
});

test('run loops until aborted', async () => {
  const bot = createSyntheticBot({ baseUrl: 'http://x', fetchImpl: makeFetch(happy), logger: silent });
  const ac = new AbortController();
  const p = bot.run({ intervalMs: 5, signal: ac.signal });
  await new Promise((r) => setTimeout(r, 40));
  ac.abort();
  await p;
  assert.ok(bot.getStatus().cycles >= 2);
});

test('resolveConfig applies defaults, clamps and validates', () => {
  const c = resolveConfig({ BOT_INTERVAL_MS: '5', BOT_BASE_URL: 'http://h:1/' });
  assert.equal(c.baseUrl, 'http://h:1');
  assert.equal(c.intervalMs, 60000);
  assert.throws(() => resolveConfig({ BOT_BASE_URL: 'not a url' }), /Invalid BOT_BASE_URL/);
});
