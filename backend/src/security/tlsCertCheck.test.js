import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEndpoint, daysUntil, classify, checkEndpoints } from './tlsCertCheck.js';

const now = new Date('2026-01-01T00:00:00Z');

test('parseEndpoint handles host, port and url forms', () => {
  assert.deepEqual(parseEndpoint('example.com'), { host: 'example.com', port: 443 });
  assert.deepEqual(parseEndpoint('example.com:8443'), { host: 'example.com', port: 8443 });
  assert.deepEqual(parseEndpoint('https://api.example.com/health'), { host: 'api.example.com', port: 443 });
  assert.throws(() => parseEndpoint(''), TypeError);
  assert.throws(() => parseEndpoint(42), TypeError);
});

test('daysUntil computes whole days and rejects bad dates', () => {
  assert.equal(daysUntil('2026-01-31T00:00:00Z', now), 30);
  assert.equal(daysUntil('2025-12-30T00:00:00Z', now), -2);
  assert.throws(() => daysUntil('garbage', now), TypeError);
});

test('classify boundaries', () => {
  assert.equal(classify(-1), 'expired');
  assert.equal(classify(0), 'warning');
  assert.equal(classify(30), 'warning');
  assert.equal(classify(31), 'ok');
  assert.equal(classify(10, 5), 'ok');
});

test('checkEndpoints reports ok, warning, expired and error', async () => {
  const dates = {
    'ok.example': '2026-06-01T00:00:00Z',
    'soon.example': '2026-01-15T00:00:00Z',
    'old.example': '2025-12-01T00:00:00Z',
  };
  const fetchExpiry = async ({ host }) => {
    if (!dates[host]) throw new Error('boom');
    return { validTo: dates[host] };
  };
  const res = await checkEndpoints(['ok.example', 'soon.example', 'old.example', 'bad.example'], { now, fetchExpiry });
  assert.deepEqual(res.map((r) => r.status), ['ok', 'warning', 'expired', 'error']);
  assert.equal(res[3].error, 'boom');
});
